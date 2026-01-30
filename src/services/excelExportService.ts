import * as path from 'path';
import * as fs from 'fs/promises';
import * as ExcelJS from 'exceljs';
import { MigrationConfig, MigrationObject, CPQ_DEFAULT_EXCLUDED_OBJECTS } from '../models/migrationConfig';
import { generateSOQLQuery, extractRelationshipFields } from './queryGenerator';
import { 
  getCpqPhaseDefinitions, 
  getMasterObjectsForPhase, 
  getPhaseAndExternalId,
  CPQ_COMPREHENSIVE_RELATIONSHIPS,
  isSlaveObject,
  isLookupQuerySlave
} from './cpqPhaseGenerator';
import { getRcaPhaseDefinitions } from './rcaPhaseGenerator';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SFDataQueryResult {
  status?: number;
  result?: {
    records?: any[];
    totalSize?: number;
    done?: boolean;
    nextRecordsUrl?: string;
  };
  records?: any[];
  done?: boolean;
  nextRecordsUrl?: string;
}

interface RelationshipMapping {
  sourceObject: string;
  sourceExternalId: string;
  targetObject: string;
  targetExternalId: string;
  relationshipField: string;
  lookupValue: string;
}

// Cache for object field lists to avoid repeated describe calls
const objectFieldsCache = new Map<string, string[]>();

interface ObjectData {
  objectName: string;
  records: any[];
  externalId: string;
  fields: Set<string>;
}

type ProgressCallback = (message: string, objectName?: string, progress?: number) => void;

/**
 * Execute a SOQL query and return all records (with pagination)
 */
async function executeQuery(
  soqlQuery: string,
  orgAlias: string,
  progressCallback?: ProgressCallback
): Promise<any[]> {
  const allRecords: any[] = [];
  let queryUrl = soqlQuery;
  let hasMore = true;
  let batchNumber = 0;

  while (hasMore) {
    try {
      const { stdout, stderr } = await execAsync(
        `sf data query --query "${queryUrl}" --target-org "${orgAlias}" --json`,
        {
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large queries
        }
      );

      const jsonOutput = stdout || stderr;
      if (!jsonOutput || jsonOutput.trim() === '') {
        break;
      }

      const result: SFDataQueryResult = JSON.parse(jsonOutput);

      // Extract records from response
      let records: any[] = [];
      if (result.result?.records) {
        records = result.result.records;
      } else if (result.records) {
        records = result.records;
      } else if (Array.isArray(result.result)) {
        records = result.result;
      }

      allRecords.push(...records);

      // Check if there are more records
      const done = result.result?.done ?? result.done ?? true;
      const nextRecordsUrl = result.result?.nextRecordsUrl ?? result.nextRecordsUrl;

      if (done || !nextRecordsUrl) {
        hasMore = false;
      } else {
        // For pagination, we'll use OFFSET
        // Note: Salesforce SOQL supports OFFSET, but we need to ensure the query has proper ORDER BY
        batchNumber++;
        const offset = allRecords.length;
        
        // Extract base query (remove existing LIMIT and OFFSET if present)
        let baseQuery = queryUrl.replace(/\s+LIMIT\s+\d+/gi, '').replace(/\s+OFFSET\s+\d+/gi, '');
        
        // Ensure ORDER BY exists for stable pagination
        if (!/\bORDER\s+BY\b/i.test(baseQuery)) {
          // Try to add ORDER BY Id as fallback
          baseQuery += ' ORDER BY Id';
        }
        
        // Add LIMIT and OFFSET
        // Use 200 for FIELDS(ALL) queries (Salesforce requirement), 2000 for regular queries
        // First check if there's already a LIMIT in the base query and remove it
        let cleanBaseQuery = baseQuery.replace(/\s+LIMIT\s+\d+/gi, '');
        const limit = cleanBaseQuery.includes('FIELDS(ALL)') ? 200 : 2000;
        queryUrl = `${cleanBaseQuery} LIMIT ${limit} OFFSET ${offset}`;

        if (progressCallback) {
          progressCallback(`Fetched ${allRecords.length} records...`, undefined, allRecords.length);
        }
      }
    } catch (error: any) {
      // If it's a query error, log and return what we have
      if (error.stdout) {
        try {
          const errorData = JSON.parse(error.stdout);
          if (errorData.result?.errors && errorData.result.errors.length > 0) {
            const errorMsg = errorData.result.errors[0].message || errorData.result.errors[0].errorCode;
            throw new Error(`Query failed: ${errorMsg}`);
          }
        } catch (e) {
          // If parsing fails, use original error
        }
      }
      throw error;
    }
  }

  return allRecords;
}

/**
 * Build external ID value from a record based on external ID definition
 */
function buildExternalIdValue(record: any, externalId: string): string {
  if (!record || !externalId) return '';

  if (externalId.includes(';')) {
    // Composite external ID
    const fields = externalId.split(';').map(f => f.trim());
    const values = fields.map(field => {
      if (field.includes('__r.') || field.includes('.')) {
        // Relationship field - traverse the path
        const parts = field.split('.');
        let value = record;
        for (const part of parts) {
          if (value && typeof value === 'object') {
            value = value[part];
          } else {
            value = null;
            break;
          }
        }
        return value || '';
      } else {
        return record[field] || '';
      }
    }).filter(v => v !== '');
    return values.join('|');
  } else {
    // Simple external ID
    if (externalId.includes('__r.') || externalId.includes('.')) {
      const parts = externalId.split('.');
      let value = record;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          value = null;
          break;
        }
      }
      return value || '';
    } else {
      return record[externalId] || record.Id || '';
    }
  }
}

/**
 * Extract lookup field name from relationship field
 * e.g., SBQQ__Product__r.Name -> SBQQ__Product__c
 * e.g., Account.Name -> AccountId
 */
function getLookupFieldFromRelationship(relationshipField: string): string | null {
  if (relationshipField.includes('__r.')) {
    const match = relationshipField.match(/^([A-Za-z0-9_]+)__r\./);
    if (match) {
      return `${match[1]}__c`;
    }
  } else if (relationshipField.includes('.')) {
    const match = relationshipField.match(/^([A-Za-z0-9_]+)\./);
    if (match) {
      return `${match[1]}Id`;
    }
  }
  return null;
}

/**
 * Flatten a record for Excel export (handle nested relationship objects)
 */
function flattenRecord(record: any, prefix: string = ''): any {
  const flattened: any = {};

  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      const value = record[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
        // Nested object (relationship) - flatten recursively
        const nested = flattenRecord(value, newKey);
        Object.assign(flattened, nested);
      } else if (Array.isArray(value)) {
        // Array - convert to comma-separated string
        flattened[newKey] = value.map(v => 
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        ).join(', ');
      } else {
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
}

/**
 * Build relationship mappings from records
 */
function buildRelationshipMappings(
  objectData: ObjectData[],
  progressCallback?: ProgressCallback
): RelationshipMapping[] {
  const relationships: RelationshipMapping[] = [];

  for (const objData of objectData) {
    if (progressCallback) {
      progressCallback(`Analyzing relationships for ${objData.objectName}...`, objData.objectName);
    }

    // Extract relationship fields from external ID
    const externalId = objData.externalId;
    const relationshipFields: string[] = [];

    if (externalId.includes(';')) {
      const fields = externalId.split(';').map(f => f.trim());
      fields.forEach(field => {
        if (field.includes('__r.') || field.includes('.')) {
          relationshipFields.push(field);
        }
      });
    } else if (externalId.includes('__r.') || externalId.includes('.')) {
      relationshipFields.push(externalId);
    }

    // Also look for lookup fields in the records
    const lookupFields = new Set<string>();
    if (objData.records && Array.isArray(objData.records)) {
      objData.records.forEach(record => {
        for (const key in record) {
          if (key.endsWith('__c') || key.endsWith('Id')) {
            // Potential lookup field
            if (record[key] && typeof record[key] === 'string' && record[key].length === 18) {
              // Looks like a Salesforce ID
              lookupFields.add(key);
            }
          }
        }
      });
    }

    // Build relationships from records
    if (objData.records && Array.isArray(objData.records)) {
      for (const record of objData.records) {
        const sourceExternalId = buildExternalIdValue(record, externalId);

        // Check relationship fields (from external ID definitions)
        for (const relField of relationshipFields) {
          const lookupField = getLookupFieldFromRelationship(relField);
          if (lookupField && record[lookupField]) {
            // Try to find the target record by matching the lookup value (Salesforce ID)
            let foundTarget = false;
            for (const targetObj of objectData) {
              if (targetObj.objectName !== objData.objectName && targetObj.records && Array.isArray(targetObj.records)) {
                const targetRecord = targetObj.records.find(r => r.Id === record[lookupField]);
                if (targetRecord) {
                  const targetExternalId = buildExternalIdValue(targetRecord, targetObj.externalId);
                  relationships.push({
                    sourceObject: objData.objectName,
                    sourceExternalId: sourceExternalId,
                    targetObject: targetObj.objectName,
                    targetExternalId: targetExternalId,
                    relationshipField: relField,
                    lookupValue: record[lookupField]
                  });
                  foundTarget = true;
                  break; // Found the target, no need to check other objects
                }
              }
            }
            // Only add "Unknown" if we couldn't find the target in our exported data
            // (it might exist in Salesforce but wasn't included in the export)
            if (!foundTarget) {
              relationships.push({
                sourceObject: objData.objectName,
                sourceExternalId: sourceExternalId,
                targetObject: 'Unknown (not in export)',
                targetExternalId: '',
                relationshipField: relField,
                lookupValue: record[lookupField]
              });
            }
          }
        }

        // Check lookup fields
        for (const lookupField of lookupFields) {
          if (record[lookupField]) {
            // Try to find target record
            for (const targetObj of objectData) {
              if (targetObj.objectName !== objData.objectName) {
                // Check if any target record has this ID
                if (targetObj.records && Array.isArray(targetObj.records)) {
                  const targetRecord = targetObj.records.find(r => r.Id === record[lookupField]);
                  if (targetRecord) {
                    const targetExternalId = buildExternalIdValue(targetRecord, targetObj.externalId);
                    relationships.push({
                      sourceObject: objData.objectName,
                      sourceExternalId: sourceExternalId,
                      targetObject: targetObj.objectName,
                      targetExternalId: targetExternalId,
                      relationshipField: lookupField,
                      lookupValue: record[lookupField]
                    });
                  } else {
                    // Target record not found in exported data (might exist in Salesforce but wasn't included)
                    relationships.push({
                      sourceObject: objData.objectName,
                      sourceExternalId: sourceExternalId,
                      targetObject: 'Unknown (not in export)',
                      targetExternalId: '',
                      relationshipField: lookupField,
                      lookupValue: record[lookupField]
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return relationships;
}

/**
 * Get CPQ external ID for an object using the same logic as cpqPhaseGenerator
 */
function getCpqExternalId(objectName: string, includeProduct2: boolean): string {
  // Product2
  if (objectName === 'Product2' && includeProduct2) {
    return 'ProductCode';
  }

  // Phase 1 objects
  if (['PriceBook2', 'SBQQ__DiscountCategory__c', 'SBQQ__SolutionGroup__c', 
       'SBQQ__Theme__c', 'SBQQ__CustomScript__c', 'SBQQ__LookupData__c', 
       'SBQQ__DiscountSchedule__C', 'SBQQ__ProductFeature__c'].includes(objectName)) {
    return 'Name';
  }
  if (objectName === 'SBQQ__ProductOption__c') return 'SBQQ__ProductCode__c';
  if (objectName === 'SBQQ__ConfigurationAttribute__c') return 'SBQQ__Feature__r.Name';
  if (objectName === 'SBQQ__Dimension__c') return 'SBQQ__PriceBook__r.Name;SBQQ__Product__r.ProductCode;SBQQ__Type__c';
  if (objectName === 'SBQQ__Cost__c') return 'SBQQ__Product__r.ProductCode';

  // Phase 2
  if (objectName === 'SBQQ__ProductRule__c') return 'Name';
  if (objectName === 'SBQQ__ErrorCondition__c') return 'SBQQ__Rule__r.Name';
  if (objectName === 'SBQQ__LookupQuery__c') return 'Name';
  if (objectName === 'SBQQ__ProductAction__c') return 'SBQQ__Rule__r.Name;SBQQ__Product__r.ProductCode';

  // Phase 3
  if (objectName === 'SBQQ__ConfigurationRule__c') return 'SBQQ__Product__r.ProductCode;SBQQ__ProductFeature__r.Name;SBQQ__ProductRule__r.Name';
  if (objectName === 'SBQQ__PriceRule__c') return 'Name';
  if (objectName === 'SBQQ__PriceCondition__c') return 'SBQQ__Rule__r.Name;SBQQ__Index__c';
  if (objectName === 'SBQQ__PriceAction__c') return 'SBQQ__Rule__r.Name';

  // Phase 4
  if (objectName === 'SBQQ__TemplateContent__c' || objectName === 'SBQQ__QuoteTemplate__c') return 'Name';
  if (objectName === 'SBQQ__LineColumn__c') return 'SBQQ__Template__r.Name;SBQQ__Section__r.Name';
  if (objectName === 'SBQQ__TemplateSection__c') return 'SBQQ__Template__r.Name;SBQQ__Content__r.Name';

  // Phase 5
  if (objectName === 'SBQQ__OptionConstraint__c') return 'SBQQ__ConstrainedOption__r.SBQQ__ProductCode__c;SBQQ__ConfiguredSKU__r.ProductCode';
  if (objectName === 'SBQQ__UpgradeSource__c') return 'SBQQ__SourceProduct__r.ProductCode;SBQQ__UpgradeProduct__r.ProductCode';
  if (objectName === 'SBQQ__SummaryVariable__c') return 'Name';

  // Phase 6
  if (objectName === 'SBQQ__DiscountTier__c') return 'SBQQ__Schedule__r.Name;SBQQ__Number__c';
  if (objectName === 'SBQQ__BlockPrice__c') return 'SBQQ__PriceBook2__r.Name;SBQQ__Product__r.ProductCode;SBQQ__LowerBound__c';

  // Phase 7
  if (objectName === 'SBQQ__QuoteProcess__c') return 'Name';
  if (objectName === 'SBQQ__ProcessInput__c') return 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name';
  if (objectName === 'SBQQ__ProcessInputCondition__c') return 'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name';

  // Phase 8
  if (objectName === 'SBQQ__CustomAction__c') return 'Name';
  if (objectName === 'SBQQ__CustomActionCondition__c') return 'SBQQ__CustomAction__r.Name;SBQQ__Field__c';
  if (objectName === 'SBQQ__SearchFilter__c') return 'SBQQ__Action__r.Name';

  // Phase 9
  if (objectName === 'SBQQ__ImportFormat__c') return 'Name';
  if (objectName === 'SBQQ__ImportColumn__c') return 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c';

  // Phase 10
  if (objectName === 'SBQQ__Localization__c') return 'Name';

  return 'Id'; // Fallback
}

/**
 * Get RCA external ID for an object - this requires loading the RCA config
 * For now, return a simplified version
 */
async function getRcaExternalId(objectName: string, configIndex: number = 0): Promise<string> {
  // Try to load RCA config to get actual external IDs
  try {
    const rcaPhaseGenerator = require('./rcaPhaseGenerator');
    // The RCA generator loads config from a JSON file
    // For Excel export, we'll use a simplified approach
    // In a full implementation, we'd need to await the config loading
    
    // Common RCA external IDs
    if (objectName === 'Product2') return 'StockKeepingUnit';
    if (objectName === 'PricebookEntry') return 'ProductSellingModel.Name;Product2.StockKeepingUnit;Pricebook2.Name';
    
    return 'Id'; // Fallback
  } catch (error) {
    return 'Id';
  }
}

/**
 * Get all field names for an object using sf sobject describe
 * Results are cached to avoid repeated API calls
 */
async function getAllObjectFields(objectName: string, orgAlias: string): Promise<string[]> {
  const cacheKey = `${orgAlias}:${objectName}`;
  
  // Check cache first
  if (objectFieldsCache.has(cacheKey)) {
    return objectFieldsCache.get(cacheKey)!;
  }

  try {
    const { stdout, stderr } = await execAsync(
      `sf sobject describe --sobject "${objectName}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }
    );

    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      throw new Error('Empty response from sobject describe');
    }

    const result = JSON.parse(jsonOutput);
    
    // Extract fields from the describe result
    // Structure: { status: 0, result: { fields: [...] } }
    const fields = result.result?.fields || result.fields || [];
    
    // Get all field names (qualified API names)
    const fieldNames = fields
      .map((field: any) => field.name || field.qualifiedApiName || field.QualifiedApiName)
      .filter((name: string | undefined): name is string => !!name && typeof name === 'string')
      .sort(); // Sort for consistent ordering

    // Cache the result
    objectFieldsCache.set(cacheKey, fieldNames);
    
    return fieldNames;
  } catch (error: any) {
    // If describe fails, try fallback using FieldDefinition query
    try {
      const query = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsAccessible = true`;
      const { stdout, stderr } = await execAsync(
        `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
        {
          maxBuffer: 10 * 1024 * 1024
        }
      );

      const jsonOutput = stdout || stderr;
      if (jsonOutput && jsonOutput.trim() !== '') {
        const queryResult: SFDataQueryResult = JSON.parse(jsonOutput);
        const records = queryResult.result?.records || queryResult.records || [];
        const fieldNames = records
          .map((r: any) => r.QualifiedApiName || r.qualifiedApiName)
          .filter((name: string | undefined): name is string => !!name)
          .sort();

        if (fieldNames.length > 0) {
          objectFieldsCache.set(cacheKey, fieldNames);
          return fieldNames;
        }
      }
    } catch (fallbackError: any) {
      // Fallback also failed
      console.warn(`Failed to get fields for ${objectName}: ${error.message}. Fallback also failed: ${fallbackError.message}`);
    }

    // If both methods fail, throw the original error
    throw new Error(`Failed to describe object ${objectName}: ${error.message}`);
  }
}

/**
 * Generate CPQ SOQL query (simplified version)
 * Uses FIELDS(ALL) when possible, or explicit field list when relationship fields are needed
 */
async function generateCpqSOQLQuery(
  objectName: string,
  externalId: string,
  orgAlias: string,
  modifiedSince?: string,
  customFilters?: { objectName: string; whereClause: string }[],
  includeProduct2: boolean = false,
  phaseNumber?: number,
  selectedMasterRecords?: { 
    [objectName: string]: string[] | Array<{ externalId: string; id: string }> 
  }
): Promise<string> {
  const relFields = extractRelationshipFields(externalId);

  // Build SELECT clause
  // If we have relationship traversal fields, we need to use an explicit field list
  // that includes ALL object fields + the relationship traversal fields
  // Otherwise, we can use FIELDS(ALL) for simplicity
  let selectClause: string;
  let useFieldsAll = false;
  
  if (relFields.length > 0) {
    // Check if any relationship fields are traversal fields (contain __r. or relationship traversal)
    const hasTraversalFields = relFields.some(f => f.includes('__r.') || (f.includes('.') && !f.endsWith('Id')));
    
    if (hasTraversalFields) {
      // We have relationship traversal fields (e.g., SBQQ__ProductFeature__r.Name)
      // Get all object fields and combine with relationship fields
      try {
        const allObjectFields = await getAllObjectFields(objectName, orgAlias);
        
        // Combine all object fields with relationship fields
        // Remove duplicates and ensure Id is first
        const allFields = new Set<string>();
        allFields.add('Id'); // Always include Id first
        allObjectFields.forEach(field => allFields.add(field));
        relFields.forEach(field => allFields.add(field));
        
        selectClause = Array.from(allFields).join(', ');
        useFieldsAll = false;
      } catch (error: any) {
        // If we can't get all fields, fall back to common fields + relationship fields
        console.warn(`Failed to get all fields for ${objectName}, using fallback: ${error.message}`);
        const commonFields = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById'];
        const allFields = [...commonFields, ...relFields];
        const uniqueFields = Array.from(new Set(allFields));
        selectClause = uniqueFields.join(', ');
        useFieldsAll = false;
      }
    } else {
      // Only base lookup fields, no traversal - can use FIELDS(ALL)
      // (base lookup fields are already included in FIELDS(ALL))
      selectClause = 'FIELDS(ALL)';
      useFieldsAll = true;
    }
  } else {
    // No relationship fields, so we can use FIELDS(ALL) to get all fields
    selectClause = 'FIELDS(ALL)';
    useFieldsAll = true;
  }

  let query = `SELECT ${selectClause} FROM ${objectName}`;

  const conditions: string[] = [];

  // Object-specific filters
  if (objectName === 'PriceBook2') {
    conditions.push('IsStandard = false');
  }

  // LastModifiedDate filter
  if (modifiedSince) {
    const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
    conditions.push(`LastModifiedDate >= ${datetimeValue}`);
  }

  // Custom filters
  if (customFilters) {
    const objectFilter = customFilters.find((f) => f.objectName === objectName);
    if (objectFilter && objectFilter.whereClause) {
      const filterConditions = objectFilter.whereClause
        .split(/\s+AND\s+/i)
        .map((c) => c.trim());
      conditions.push(...filterConditions);
    }
  }

  // Check if this is a slave object (needed for filtering logic below)
  const isSlave = phaseNumber !== undefined && (isSlaveObject(objectName, phaseNumber) || isLookupQuerySlave(objectName, phaseNumber));

  // Filter by selected master records if provided (same logic as cpqPhaseGenerator)
  // Skip this for slave objects - they should only be filtered by parent IDs (handled below)
  if (!isSlave && selectedMasterRecords && selectedMasterRecords[objectName] && selectedMasterRecords[objectName].length > 0) {
    const selectedItems = selectedMasterRecords[objectName];
    
    // Normalize to new format: always work with { externalId, id } objects
    const normalizedSelections: Array<{ externalId: string; id: string }> = selectedItems
      .map((item: any) => {
        if (typeof item === 'object' && item !== null && 'externalId' in item && 'id' in item) {
          return { externalId: item.externalId || '', id: item.id || '' };
        } else if (typeof item === 'string') {
          return { externalId: item, id: '' };
        } else {
          return null;
        }
      })
      .filter((item): item is { externalId: string; id: string } => 
        item !== null && item.externalId && item.externalId.trim() !== ''
      );
    
    if (normalizedSelections.length > 0) {
      // Check if we have Ids available (preferred method)
      const selectionsWithIds = normalizedSelections.filter(item => item.id && item.id.trim() !== '');
      
      if (selectionsWithIds.length > 0) {
        // Use Id IN (...) for maximum efficiency
        const ids = selectionsWithIds.map(item => item.id);
        const escapedIds = ids.map((id: string) => {
          const escaped = id.replace(/'/g, "''");
          return `'${escaped}'`;
        });
        conditions.push(`Id IN (${escapedIds.join(', ')})`);
      } else {
        // Fallback: use external ID field (for backward compatibility)
        const externalIdValues = normalizedSelections.map(item => item.externalId);
        
        if (externalId.includes(';')) {
          // Composite external ID - build conditions for each composite value
          const compositeFields = externalId.split(';').map(f => f.trim());
          const compositeConditions: string[] = [];
          
          externalIdValues.forEach(externalIdValue => {
            const parts = externalIdValue.split('|');
            if (parts.length === compositeFields.length) {
              const fieldConditions: string[] = [];
              compositeFields.forEach((field, index) => {
                const partValue = parts[index]?.trim();
                if (partValue) {
                  const escaped = partValue.replace(/'/g, "''");
                  fieldConditions.push(`${field} = '${escaped}'`);
                }
              });
              if (fieldConditions.length === compositeFields.length) {
                compositeConditions.push(`(${fieldConditions.join(' AND ')})`);
              }
            }
          });
          
          if (compositeConditions.length > 0) {
            conditions.push(`(${compositeConditions.join(' OR ')})`);
          }
        } else {
          // Simple external ID - use IN clause
          let filterField = externalId;
          if (externalId.includes('__r.') || externalId.includes('.')) {
            filterField = externalId;
          }
          
          const escapedValues = externalIdValues.map(val => {
            const escaped = val.replace(/'/g, "''");
            return `'${escaped}'`;
          });
          
          conditions.push(`${filterField} IN (${escapedValues.join(', ')})`);
        }
      }
    }
  }

  // Filter slave objects by their parent master record IDs
  // This ensures child records are included in export.json for selected parent records
  // Note: isSlave was already calculated above, so we reuse it here
  if (isSlave && selectedMasterRecords && phaseNumber !== undefined) {
    // Find the parent object for this slave object
    let parentObjectName: string | null = null;
    let relationshipField: string | null = null;
    
    // Search CPQ_COMPREHENSIVE_RELATIONSHIPS for the parent
    for (const [parentName, children] of Object.entries(CPQ_COMPREHENSIVE_RELATIONSHIPS)) {
      const childConfig = children.find(c => c.childObjectName === objectName && c.phaseNumber === phaseNumber);
      if (childConfig) {
        parentObjectName = parentName;
        relationshipField = childConfig.relationshipField;
        break;
      }
    }
    
    // If we found a parent, filter by parent IDs
    if (parentObjectName && relationshipField && selectedMasterRecords[parentObjectName]) {
      const parentSelections = selectedMasterRecords[parentObjectName];
      
      // Normalize parent selections to get IDs
      const normalizedParentSelections: Array<{ externalId: string; id: string }> = parentSelections
        .map((item: any) => {
          if (typeof item === 'object' && item !== null && 'externalId' in item && 'id' in item) {
            return { externalId: item.externalId || '', id: item.id || '' };
          } else if (typeof item === 'string') {
            return { externalId: item, id: '' };
          } else {
            return null;
          }
        })
        .filter((item): item is { externalId: string; id: string } => 
          item !== null && item.externalId && item.externalId.trim() !== ''
        );
      
      // Get parent IDs (preferred) or use external IDs as fallback
      const parentIds = normalizedParentSelections
        .filter(item => item.id && item.id.trim() !== '')
        .map(item => item.id);
      
      if (parentIds.length > 0) {
        // Filter slave object by parent relationship field
        const escapedIds = parentIds.map((id: string) => {
          const escaped = id.replace(/'/g, "''");
          return `'${escaped}'`;
        });
        conditions.push(`${relationshipField} IN (${escapedIds.join(', ')})`);
      }
    }
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Add LIMIT
  // FIELDS(ALL) queries require LIMIT 200, but regular queries can use higher limits
  if (useFieldsAll) {
    query += ' LIMIT 200';
  } else {
    query += ' LIMIT 2000';
  }

  return query;
}

/**
 * Generate RCA SOQL query (simplified version)
 */
async function generateRcaSOQLQuery(
  objectName: string,
  configIndex: number,
  modifiedSince?: string,
  customFilters?: { objectName: string; whereClause: string }[],
  includeProduct2: boolean = false
): Promise<string> {
  // Use FIELDS(ALL) for Salesforce CLI compatibility
  let query = 'SELECT FIELDS(ALL) FROM ' + objectName;

  const conditions: string[] = [];

  // LastModifiedDate filter
  if (modifiedSince) {
    const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
    conditions.push(`LastModifiedDate >= ${datetimeValue}`);
  }

  // Custom filters
  if (customFilters) {
    const objectFilter = customFilters.find((f) => f.objectName === objectName);
    if (objectFilter && objectFilter.whereClause) {
      const filterConditions = objectFilter.whereClause
        .split(/\s+AND\s+/i)
        .map((c) => c.trim());
      conditions.push(...filterConditions);
    }
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Add LIMIT for FIELDS(ALL) queries (required by Salesforce)
  query += ' LIMIT 200';

  return query;
}

/**
 * Get all objects and their queries for a migration config
 * @param config Migration configuration
 * @param orgAlias Salesforce org alias for describe operations
 * @param phaseNumber Optional phase number for CPQ/RCA mode - if provided, only export objects from that phase
 */
async function getObjectsAndQueries(config: MigrationConfig, orgAlias: string, phaseNumber?: number): Promise<Array<{ objectName: string; externalId: string; query: string }>> {
  const objects: Array<{ objectName: string; externalId: string; query: string }> = [];
  const mode = config.mode || 'standard';

  if (mode === 'standard') {
    // Standard mode - use objects from config
    for (const obj of config.objects || []) {
      let query = generateSOQLQuery(obj, config.modifiedSince);
      
      // Convert SFDMU "all" syntax to Salesforce FIELDS(ALL) syntax
      // Replace "SELECT all" or "SELECT all, ..." with "SELECT FIELDS(ALL), ..."
      query = query.replace(/SELECT\s+all(\s*,)?/i, (match, comma) => {
        if (comma) {
          return 'SELECT FIELDS(ALL),';
        } else {
          return 'SELECT FIELDS(ALL)';
        }
      });
      
      // If using FIELDS(ALL), ensure LIMIT is exactly 200 (Salesforce requirement)
      if (query.includes('FIELDS(ALL)')) {
        // Remove any existing LIMIT clause (even if user specified a different limit)
        query = query.replace(/\s+LIMIT\s+\d+/gi, '');
        // Add LIMIT 200 (required for FIELDS(ALL) - max is 200)
        query += ' LIMIT 200';
      }
      
      objects.push({
        objectName: obj.objectName,
        externalId: obj.externalId,
        query: query
      });
    }
  } else if (mode === 'cpq') {
    // CPQ mode - get objects from specified phase or all phases
    const includeProduct2 = !!config.includeProduct2;
    const phases = getCpqPhaseDefinitions(includeProduct2);
    
    // Filter to only the specified phase if provided
    const phasesToProcess = phaseNumber 
      ? phases.filter(p => p.phaseNumber === phaseNumber)
      : phases;

    // Use imported functions and constants for filtering

    for (const phase of phasesToProcess) {
      const phaseNum = phase.phaseNumber;
      
      // Get default excluded objects (system-level exclusions)
      const defaultExcludedObjects =
        config.excludedObjects && config.excludedObjects.length > 0
          ? [...config.excludedObjects]
          : [...CPQ_DEFAULT_EXCLUDED_OBJECTS];

      // Adjust Product2 exclusion based on includeProduct2 flag
      if (includeProduct2) {
        const idx = defaultExcludedObjects.indexOf('Product2');
        if (idx > -1) {
          defaultExcludedObjects.splice(idx, 1);
        }
      } else if (!defaultExcludedObjects.includes('Product2')) {
        defaultExcludedObjects.push('Product2');
      }

      // Get user-selected excluded objects for this phase
      const userExcludedObjects = config.excludedObjectsByPhase?.[phaseNum] || [];
      
      // Get master objects for this phase
      const masterObjects = getMasterObjectsForPhase(phaseNum);
      
      // Get selected master records for this phase
      const phaseSelections = config.selectedMasterRecords?.[phaseNum] || {};

      // Build list of objects to process (same logic as generateCpqPhaseFile)
      const excludedTransactionalObjects = [
        'Product2',
        'Order',
        'OrderItem',
        'Account',
        'Opportunity',
        'Quote',
        'SBQQ__Quote__c',
        'SBQQ__QuoteLine__c',
        'Contract',
        'SBQQ__Subscription__c',
        'Asset'
      ];

      for (const objectName of phase.objects) {
        // Skip transactional objects (unless Product2 and includeProduct2 is true)
        if (excludedTransactionalObjects.includes(objectName)) {
          if (objectName === 'Product2' && includeProduct2) {
            // allowed
          } else {
            continue;
          }
        }

        // Skip objects in default excluded list
        if (defaultExcludedObjects.includes(objectName)) {
          continue;
        }

        // Skip user-selected excluded objects
        if (userExcludedObjects.includes(objectName)) {
          continue;
        }

        // Skip master objects that have no selected records
        if (masterObjects.includes(objectName)) {
          const selected = phaseSelections[objectName] || [];
          if (selected.length === 0) {
            continue;
          }
        }

        // Get phase info and external ID
        const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2, phaseNum);
        if (!phaseInfo || phaseInfo.phaseNumber !== phaseNum) {
          continue;
        }

        const externalId = phaseInfo.externalId;
        const query = await generateCpqSOQLQuery(
          objectName,
          externalId,
          orgAlias,
          config.modifiedSince,
          config.customFilters,
          includeProduct2,
          phaseNum,
          phaseSelections
        );
        objects.push({
          objectName: objectName,
          externalId: externalId,
          query: query
        });
      }
    }
  } else if (mode === 'rca') {
    // RCA mode - get objects from specified phase or all phases
    const includeProduct2 = !!config.rcaIncludeProduct2;
    const phases = await getRcaPhaseDefinitions(includeProduct2);
    
    // Filter to only the specified phase if provided
    const phasesToProcess = phaseNumber 
      ? phases.filter(p => p.phaseNumber === phaseNumber)
      : phases;

    // Track object occurrences for config index
    const objectOccurrences = new Map<string, number>();

    for (const phase of phasesToProcess) {
      for (const objectName of phase.objects) {
        const occurrence = objectOccurrences.get(objectName) || 0;
        objectOccurrences.set(objectName, occurrence + 1);
        
        const externalId = await getRcaExternalId(objectName, occurrence);
        const query = await generateRcaSOQLQuery(
          objectName,
          occurrence, // configIndex
          config.modifiedSince,
          config.customFilters,
          includeProduct2
        );
        objects.push({
          objectName: objectName,
          externalId: externalId,
          query: query
        });
      }
    }
  }

  return objects;
}

/**
 * Main export function
 * @param phaseNumber Optional phase number for CPQ/RCA mode - if provided, only export objects from that phase
 */
export async function exportToExcel(
  config: MigrationConfig,
  progressCallback?: ProgressCallback,
  phaseNumber?: number
): Promise<string> {
  if (!config.sourceOrg.alias && !config.sourceOrg.username) {
    throw new Error('Source org is required for Excel export');
  }

  const orgAlias = config.sourceOrg.alias || config.sourceOrg.username;

  // Get all objects and their queries
  if (progressCallback) {
    if (phaseNumber) {
      progressCallback(`Preparing objects and queries for Phase ${phaseNumber}...`);
    } else {
      progressCallback('Preparing objects and queries...');
    }
  }
  const objectsAndQueries = await getObjectsAndQueries(config, orgAlias, phaseNumber);

  if (objectsAndQueries.length === 0) {
    throw new Error('No objects found to export');
  }

  // Execute queries and fetch data
  const objectData: ObjectData[] = [];
  const errors: string[] = [];

  for (let i = 0; i < objectsAndQueries.length; i++) {
    const { objectName, externalId, query } = objectsAndQueries[i];
    
    if (progressCallback) {
      progressCallback(
        `Querying ${objectName} (${i + 1}/${objectsAndQueries.length})...`,
        objectName,
        ((i + 1) / objectsAndQueries.length) * 50 // First 50% for querying
      );
    }

    try {
      const records = await executeQuery(query, orgAlias, (msg) => {
        if (progressCallback) {
          progressCallback(msg, objectName);
        }
      });

      // Collect all field names
      const fields = new Set<string>();
      if (records && Array.isArray(records)) {
        records.forEach(record => {
          const flattened = flattenRecord(record);
          Object.keys(flattened).forEach(key => fields.add(key));
        });
      }

      objectData.push({
        objectName,
        records,
        externalId,
        fields
      });

      if (progressCallback) {
        progressCallback(
          `Fetched ${records.length} records from ${objectName}`,
          objectName
        );
      }
    } catch (error: any) {
      const errorMsg = `Failed to query ${objectName}: ${error.message}`;
      errors.push(errorMsg);
      if (progressCallback) {
        progressCallback(errorMsg, objectName);
      }
      // Continue with other objects
    }
  }

  if (objectData.length === 0) {
    throw new Error('No data was successfully fetched. ' + (errors.length > 0 ? errors.join('; ') : ''));
  }

  // Build relationship mappings
  if (progressCallback) {
    progressCallback('Building relationship mappings...', undefined, 60);
  }
  const relationships = buildRelationshipMappings(objectData, progressCallback);

  // Generate Excel file
  if (progressCallback) {
    progressCallback('Generating Excel file...', undefined, 80);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SFDMU All-Purpose Extension';
  workbook.created = new Date();

  // Add sheet for each object
  for (const objData of objectData) {
    const sheetName = objData.objectName.length > 31 
      ? objData.objectName.substring(0, 31) 
      : objData.objectName;
    
    const worksheet = workbook.addWorksheet(sheetName);

    // Get all field names and ensure Id is first, Name is second
    const allFieldsSet = new Set(objData.fields);
    const allFields = Array.from(allFieldsSet);
    
    // Sort fields: Id first, Name second, then everything else alphabetically
    allFields.sort((a, b) => {
      // Id always comes first
      if (a === 'Id') return -1;
      if (b === 'Id') return 1;
      // Name comes second (only if not Id)
      if (a === 'Name') return -1;
      if (b === 'Name') return 1;
      // Everything else alphabetically
      return a.localeCompare(b);
    });
    
    // Manually reorder to ensure Id is first and Name is second
    const idIndex = allFields.indexOf('Id');
    const nameIndex = allFields.indexOf('Name');
    
    if (idIndex > 0) {
      // Move Id to first position
      allFields.splice(idIndex, 1);
      allFields.unshift('Id');
    }
    
    if (nameIndex > 1 || (nameIndex > 0 && idIndex === -1)) {
      // Move Name to second position (after Id if it exists)
      const currentNameIndex = allFields.indexOf('Name');
      if (currentNameIndex > 1) {
        allFields.splice(currentNameIndex, 1);
        allFields.splice(1, 0, 'Name');
      }
    }

    // Add header row
    worksheet.addRow(allFields);

    // Style header row with better formatting
    const headerRow = worksheet.getRow(1);
    headerRow.font = { 
      bold: true, 
      size: 11,
      color: { argb: 'FFFFFFFF' } // White text on blue background
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // Blue header
    };
    headerRow.alignment = { 
      vertical: 'middle', 
      horizontal: 'left', // Left-justified headers
      wrapText: false // Don't wrap header text - make columns wide enough instead
    };
    headerRow.height = 20; // Set fixed height for header row
    
    // Add borders to header
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
    
    // Freeze header row
    worksheet.views = [{
      state: 'frozen',
      ySplit: 1
    }];

    // Add data rows with formatting
    if (objData.records && Array.isArray(objData.records)) {
      for (let i = 0; i < objData.records.length; i++) {
        const record = objData.records[i];
        const flattened = flattenRecord(record);
        const row: any[] = [];
        for (const field of allFields) {
          let value = flattened[field] || '';
          // Format dates and numbers
          if (value && typeof value === 'string') {
            // Try to detect and format dates
            const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            if (dateMatch) {
              value = new Date(value);
            }
          }
          row.push(value);
        }
        const addedRow = worksheet.addRow(row);
        
        // Alternate row colors for better readability
        if (i % 2 === 1) {
          addedRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' } // Light gray for alternating rows
          };
        }
        
        // Add borders to data rows
        addedRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
          };
          cell.alignment = {
            vertical: 'top',
            wrapText: false // Don't wrap - make columns wider instead
          };
        });
      }
    }

    // Auto-fit columns with better width calculation
    // Calculate widths BEFORE adding data to ensure headers fit properly
    if (worksheet.columns && worksheet.columns.length > 0) {
      worksheet.columns.forEach((column, index) => {
        if (column && column.header) {
          const headerText = String(column.header || '');
          let headerLength = headerText.length;
          
          // Calculate max content length from actual data
          let maxContentLength = 0;
          if (objData.records && Array.isArray(objData.records) && column.eachCell) {
            column.eachCell({ includeEmpty: false }, (cell) => {
              let cellValue = '';
              if (cell.value !== null && cell.value !== undefined) {
                if (cell.value instanceof Date) {
                  cellValue = cell.value.toLocaleString();
                } else {
                  cellValue = String(cell.value);
                  // For HTML content, use a reasonable estimate
                  if (cellValue.includes('<a') || cellValue.includes('</a>')) {
                    // Extract text from HTML links for length estimation
                    const textMatch = cellValue.match(/>([^<]+)</);
                    if (textMatch) {
                      cellValue = textMatch[1];
                    }
                  }
                }
              }
              // For very long values, cap the length used for width calculation
              const effectiveLength = Math.min(cellValue.length, 100);
              if (effectiveLength > maxContentLength) {
                maxContentLength = effectiveLength;
              }
            });
          }
          
          // Use the larger of header or content length, with padding
          // Excel column width is in character units (approximately)
          const baseWidth = Math.max(headerLength, maxContentLength);
          
          // Set column width with reasonable bounds
          // Add more padding to ensure text fits comfortably
          if (column.header === 'Id') {
            column.width = Math.max(18, Math.min(baseWidth + 4, 25));
          } else if (column.header === 'Name') {
            column.width = Math.max(20, Math.min(baseWidth + 4, 50));
          } else {
            // For other columns, ensure header fits + some padding for content
            column.width = Math.max(headerLength + 4, Math.min(baseWidth + 4, 60));
          }
        }
      });
    }
  }

  // Add Relationships sheet
  if (relationships.length > 0) {
    const relWorksheet = workbook.addWorksheet('Relationships');
    
    // Add a description row to explain what this sheet shows
    relWorksheet.addRow(['This sheet shows relationships between records across different objects.']);
    relWorksheet.addRow(['Each row represents a lookup relationship from a source record to a target record.']);
    relWorksheet.addRow(['']);
    
    const relHeaders = [
      'From Object',
      'From Record (External ID)',
      'To Object',
      'To Record (External ID)',
      'Relationship Field',
      'Lookup ID'
    ];
    
    relWorksheet.addRow(relHeaders);
    
    // Style header with better formatting (row 4 is the header, rows 1-3 are description)
    const relHeaderRow = relWorksheet.getRow(4);
    relHeaderRow.font = { 
      bold: true, 
      size: 11,
      color: { argb: 'FF000000' }
    };
    relHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // Blue header
    };
    relHeaderRow.alignment = { 
      vertical: 'middle', 
      horizontal: 'left', // Left-justified headers
      wrapText: false // Don't wrap header text
    };
    relHeaderRow.height = 20; // Set fixed height for header row
    
    // Add borders to header
    relHeaderRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
    
    // Freeze header row (row 4)
    relWorksheet.views = [{
      state: 'frozen',
      ySplit: 4
    }];
    
    // Style the description rows
    const descRow1 = relWorksheet.getRow(1);
    const descRow2 = relWorksheet.getRow(2);
    descRow1.font = { italic: true, color: { argb: 'FF666666' } };
    descRow2.font = { italic: true, color: { argb: 'FF666666' } };
    
    // Merge description cells for better appearance
    relWorksheet.mergeCells('A1:F1');
    relWorksheet.mergeCells('A2:F2');

    // Add relationship rows with formatting
    if (relationships && Array.isArray(relationships)) {
      for (let i = 0; i < relationships.length; i++) {
        const rel = relationships[i];
        const addedRow = relWorksheet.addRow([
          rel.sourceObject,
          rel.sourceExternalId,
          rel.targetObject,
          rel.targetExternalId,
          rel.relationshipField,
          rel.lookupValue
        ]);
        
        // Alternate row colors for better readability
        if (i % 2 === 1) {
          addedRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' } // Light gray for alternating rows
          };
        }
        
        // Add borders to data rows
        addedRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
          };
          cell.alignment = {
            vertical: 'top',
            wrapText: false // Don't wrap - make columns wider instead
          };
        });
      }
    }

    // Auto-fit columns with better width calculation for Relationships sheet
    if (relWorksheet.columns && relWorksheet.columns.length > 0) {
      relWorksheet.columns.forEach((column) => {
        if (column && column.header) {
          const headerText = String(column.header || '');
          let headerLength = headerText.length;
          let maxContentLength = 0;
          
          if (column.eachCell) {
            column.eachCell({ includeEmpty: false }, (cell) => {
              const cellValue = cell.value ? String(cell.value) : '';
              const effectiveLength = Math.min(cellValue.length, 100);
              if (effectiveLength > maxContentLength) {
                maxContentLength = effectiveLength;
              }
            });
          }
          
          // Ensure header fits + padding for content
          const baseWidth = Math.max(headerLength, maxContentLength);
          column.width = Math.max(headerLength + 4, Math.min(baseWidth + 4, 60));
        }
      });
    }
  }

  // Save file
  // The outputDir should already be resolved by handleExportToExcel, but normalize it just in case
  const outputDir = path.normalize(config.outputDir);
  
  // When exporting a specific phase (CPQ or RCA), write to the phase folder (e.g. Phase 3/)
  const effectiveOutputDir = phaseNumber !== undefined
    ? path.join(outputDir, `Phase ${phaseNumber}`)
    : outputDir;
  
  // Ensure the directory exists
  await fs.mkdir(effectiveOutputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  
  // Sanitize config name - extract just the filename part if it contains path separators
  let configName = config.configName || 'migration';
  
  // If configName contains path separators, extract just the last part (filename)
  if (configName.includes('/') || configName.includes('\\')) {
    configName = path.basename(configName);
  }
  
  // Sanitize: remove any remaining path separators, dots, and other invalid filename characters
  configName = configName
    .replace(/[/\\]/g, '_')           // Replace path separators
    .replace(/\.\./g, '')             // Remove parent directory references
    .replace(/[<>:"|?*]/g, '_')       // Replace invalid filename characters
    .trim()                           // Remove leading/trailing spaces
    .replace(/^\.+|\.+$/g, '')        // Remove leading/trailing dots
    || 'migration';                    // Fallback if empty after sanitization
  
  // Filename: when in phase folder no need for phase suffix in name
  const fileName = `${configName}_export_${timestamp}.xlsx`;
  const filePath = path.join(effectiveOutputDir, fileName);
  
  // Normalize the final path to resolve any issues
  const normalizedFilePath = path.normalize(filePath);

  await workbook.xlsx.writeFile(normalizedFilePath);

  if (progressCallback) {
    const displayPath = phaseNumber !== undefined ? `Phase ${phaseNumber}/${fileName}` : fileName;
    progressCallback(`Excel file generated: ${displayPath}`, undefined, 100);
  }

  // Log any errors
  if (errors.length > 0 && progressCallback) {
    progressCallback(`Warnings: ${errors.length} object(s) failed to export`, undefined);
  }

  return normalizedFilePath;
}
