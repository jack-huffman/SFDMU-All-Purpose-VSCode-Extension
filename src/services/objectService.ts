import { exec } from 'child_process';
import { promisify } from 'util';
import { ObjectMetadata, FieldMetadata } from '../models/migrationConfig';

const execAsync = promisify(exec);

/**
 * Product2 lookup metadata for CPQ objects
 * Maps object names to their Product2 lookup field information
 * Updated based on audit results from ButterflyMX FullQA org
 * This allows automatic inclusion of Product2 fields in SOQL queries
 */
const CPQ_PRODUCT2_LOOKUPS: { [objectName: string]: { lookupField: string; relationshipName: string } } = {
  // Objects with standard SBQQ__Product__c lookup
  'SBQQ__ConfigurationAttribute__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__Dimension__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__Cost__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__LookupData__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__DiscountSchedule__C': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__ProductAction__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__ConfigurationRule__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__PriceRule__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__BlockPrice__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  'SBQQ__Localization__c': {
    lookupField: 'SBQQ__Product__c',
    relationshipName: 'SBQQ__Product__r'
  },
  // Objects with ConfiguredSKU lookup (also Product2)
  'SBQQ__ProductFeature__c': {
    lookupField: 'SBQQ__ConfiguredSKU__c',
    relationshipName: 'SBQQ__ConfiguredSKU__r'
  },
  'SBQQ__ProductOption__c': {
    lookupField: 'SBQQ__ConfiguredSKU__c', // Primary lookup (also has SBQQ__OptionalSKU__c)
    relationshipName: 'SBQQ__ConfiguredSKU__r'
  },
  'SBQQ__OptionConstraint__c': {
    lookupField: 'SBQQ__ConfiguredSKU__c',
    relationshipName: 'SBQQ__ConfiguredSKU__r'
  },
  // Objects with multiple Product2 lookups
  'SBQQ__UpgradeSource__c': {
    lookupField: 'SBQQ__SourceProduct__c', // Primary lookup (also has SBQQ__UpgradeProduct__c)
    relationshipName: 'SBQQ__SourceProduct__r'
  }
};

interface SFDataQueryResult {
  status?: number;
  result?: {
    records?: any[];
    totalSize?: number;
  };
  records?: any[];
}

/**
 * Detect external ID fields for a given object using Salesforce Tooling API
 */
export async function detectExternalIdFields(
  objectName: string,
  orgAlias: string
): Promise<string[]> {
  try {
    // Query FieldDefinition to find external ID fields
    const soql = `SELECT QualifiedApiName, IsExternalId FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsExternalId = true`;
    
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${soql}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const result: SFDataQueryResult = JSON.parse(jsonOutput);
    
    // Handle different response structures
    let records: any[] = [];
    if (result.result?.records) {
      records = result.result.records;
    } else if (result.records) {
      records = result.records;
    } else if (Array.isArray(result.result)) {
      records = result.result;
    }
    
    const externalIdFields: string[] = [];
    for (const record of records) {
      if (record.QualifiedApiName || record.qualifiedApiName || record.Name || record.name) {
        const fieldName = record.QualifiedApiName || record.qualifiedApiName || record.Name || record.name;
        if (fieldName) {
          externalIdFields.push(fieldName);
        }
      }
    }
    
    return externalIdFields;
  } catch (error: any) {
    // If query fails, try alternative approach using describe
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    // Try using describe command as fallback
    try {
      return await detectExternalIdFieldsViaDescribe(objectName, orgAlias);
    } catch (describeError: any) {
      console.error('Error detecting external ID fields:', error.message);
      throw new Error(`Failed to detect external ID fields: ${error.message}`);
    }
  }
}

/**
 * Alternative method: Use describe command to get object metadata
 */
async function detectExternalIdFieldsViaDescribe(
  objectName: string,
  orgAlias: string
): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `sf data query --query "SELECT QualifiedApiName, IsExternalId FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsExternalId = true" --target-org "${orgAlias}" --json`
    );
    
    const result: SFDataQueryResult = JSON.parse(stdout);
    const records = result.result?.records || result.records || [];
    
    return records
      .map((r: any) => r.QualifiedApiName || r.qualifiedApiName || r.Name || r.name)
      .filter((name: string) => name);
  } catch (error: any) {
    throw new Error(`Failed to describe object: ${error.message}`);
  }
}

/**
 * Get all fields with DataType for a given object
 * Used for external ID selection where we want to show all fields grouped by relationship type
 */
export async function getAllFieldsWithDataType(
  objectName: string,
  orgAlias: string
): Promise<FieldMetadata[]> {
  try {
    const query = `SELECT MasterLabel, QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' ORDER BY MasterLabel ASC`;
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }

    const result: SFDataQueryResult = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];

    // Filter out system fields
    const systemFields = ['CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 'SystemModstamp', 'OwnerId'];

    return records
      .filter((r: any) => {
        const fieldName = r.QualifiedApiName;
        // Exclude system fields and relationship fields (ending with __r)
        return fieldName && !systemFields.includes(fieldName) && !fieldName.endsWith('__r');
      })
      .map((r: any) => ({
        name: r.QualifiedApiName,
        label: r.MasterLabel || r.QualifiedApiName,
        type: r.DataType || 'Unknown',
        isExternalId: false,
        isUnique: false,
        referenceTo: []
      }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    let errorMessage = error.message;
    if (error.stdout) {
      try {
        const errorData = JSON.parse(error.stdout);
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // If parsing fails, use the original message
      }
    }
    
    throw new Error(`Failed to get fields: ${errorMessage}`);
  }
}

/**
 * Get relationship fields (Lookup, Master-Detail, Hierarchy) for a given object
 * These can be used as external IDs for composite keys
 */
export async function getRelationshipFields(
  objectName: string,
  orgAlias: string
): Promise<FieldMetadata[]> {
  try {
    const allFields = await getAllFieldsWithDataType(objectName, orgAlias);
    
    // Filter for relationship fields: Lookup, Master-Detail, or Hierarchy
    return allFields.filter((field: FieldMetadata) => {
      const dataType = field.type || '';
      return (
        dataType.includes('Lookup') ||
        dataType === 'Hierarchy' ||
        dataType.includes('Master-Detail')
      );
    });
  } catch (error: any) {
    throw new Error(`Failed to get relationship fields: ${error.message}`);
  }
}

/**
 * Get full object metadata including all fields
 */
export async function getObjectMetadata(
  objectName: string,
  orgAlias: string
): Promise<ObjectMetadata> {
  try {
    // Query EntityDefinition and FieldDefinition
    const entityQuery = `SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = '${objectName}'`;
    const fieldsQuery = `SELECT QualifiedApiName, Label, DataType, IsExternalId, IsUnique, ReferenceTo FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsCustomizable = true`;
    
    const [entityResult, fieldsResult] = await Promise.all([
      execAsync(`sf data query --query "${entityQuery}" --target-org "${orgAlias}" --json`),
      execAsync(`sf data query --query "${fieldsQuery}" --target-org "${orgAlias}" --json`)
    ]);
    
    const entityData: SFDataQueryResult = JSON.parse(entityResult.stdout || entityResult.stderr || '{}');
    const fieldsData: SFDataQueryResult = JSON.parse(fieldsResult.stdout || fieldsResult.stderr || '{}');
    
    const entityRecords = entityData.result?.records || entityData.records || [];
    const fieldRecords = fieldsData.result?.records || fieldsData.records || [];
    
    const entity = entityRecords[0] || {};
    const fields: FieldMetadata[] = fieldRecords.map((field: any) => ({
      name: field.QualifiedApiName || field.qualifiedApiName || field.Name || field.name,
      label: field.Label || field.label || field.QualifiedApiName || field.qualifiedApiName,
      type: field.DataType || field.dataType || 'String',
      isExternalId: field.IsExternalId || field.isExternalId || false,
      isUnique: field.IsUnique || field.isUnique || false,
      referenceTo: field.ReferenceTo || field.referenceTo || []
    }));
    
    return {
      name: entity.QualifiedApiName || entity.qualifiedApiName || objectName,
      label: entity.Label || entity.label || objectName,
      fields
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    throw new Error(`Failed to get object metadata: ${error.message}`);
  }
}

/**
 * Validate that an object exists in the org
 */
export async function validateObjectExists(
  objectName: string,
  orgAlias: string
): Promise<boolean> {
  try {
    const query = `SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName = '${objectName}'`;
    const { stdout } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`
    );
    
    const result: SFDataQueryResult = JSON.parse(stdout);
    const count = result.result?.totalSize || 0;
    return count > 0;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    // If query fails, assume object doesn't exist
    return false;
  }
}

/**
 * Validate a SOQL WHERE clause by running a test query
 * Returns validation result with error message if invalid
 */
export async function validateSOQLWhereClause(
  objectName: string,
  whereClause: string,
  orgAlias: string,
  orderByClause?: string,
  limitClause?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Build test query with all provided clauses
    let query = `SELECT Id FROM ${objectName}`;
    
    // Add WHERE clause if provided
    if (whereClause && whereClause.trim() !== '') {
      // Escape double quotes and backslashes in whereClause for shell safety
      // SOQL uses single quotes for strings, so we only need to escape double quotes
      const escapedWhereClause = whereClause.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query += ` WHERE ${escapedWhereClause}`;
    }
    
    // Add ORDER BY clause if provided
    if (orderByClause && orderByClause.trim() !== '') {
      const escapedOrderBy = orderByClause.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query += ` ORDER BY ${escapedOrderBy}`;
    }
    
    // Add LIMIT clause if provided, otherwise use LIMIT 1 for validation
    if (limitClause && limitClause.trim() !== '') {
      const escapedLimit = limitClause.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query += ` LIMIT ${escapedLimit}`;
    } else {
      query += ' LIMIT 1';
    }
    
    // Execute the query - if it succeeds, the WHERE clause is valid
    // Use double quotes around the query (SOQL string literals use single quotes)
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    // If we get here, the query executed successfully (even if it returned 0 rows)
    // That means the WHERE clause syntax is valid
    return { valid: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    // Extract error message from Salesforce response
    let errorMessage = error.message;
    if (error.stdout) {
      try {
        const errorData = JSON.parse(error.stdout);
        // Salesforce errors are typically in result.errors array
        if (errorData.result?.errors && errorData.result.errors.length > 0) {
          errorMessage = errorData.result.errors[0].message || errorData.result.errors[0].errorCode || errorMessage;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // If parsing fails, try to extract from stderr
        if (error.stderr) {
          try {
            const stderrData = JSON.parse(error.stderr);
            if (stderrData.result?.errors && stderrData.result.errors.length > 0) {
              errorMessage = stderrData.result.errors[0].message || stderrData.result.errors[0].errorCode || errorMessage;
            } else if (stderrData.message) {
              errorMessage = stderrData.message;
            }
          } catch (e2) {
            // If all parsing fails, use original message
          }
        }
      }
    } else if (error.stderr) {
      try {
        const stderrData = JSON.parse(error.stderr);
        if (stderrData.result?.errors && stderrData.result.errors.length > 0) {
          errorMessage = stderrData.result.errors[0].message || stderrData.result.errors[0].errorCode || errorMessage;
        } else if (stderrData.message) {
          errorMessage = stderrData.message;
        }
      } catch (e) {
        // If parsing fails, use original message
      }
    }
    
    // Clean up error message: extract only the part after "Row:#:Column:#"
    // Pattern: "Row:1:Column:30 message here" -> "message here"
    // Handles cases like "SELECT ... ^ ERROR at Row:1:Column:30 message here"
    const rowColumnMatch = /Row:\d+:Column:\d+\s+(.+)/i.exec(errorMessage);
    if (rowColumnMatch && rowColumnMatch[1]) {
      errorMessage = rowColumnMatch[1].trim();
      // Capitalize first letter
      if (errorMessage.length > 0) {
        errorMessage = errorMessage.charAt(0).toUpperCase() + errorMessage.slice(1);
      }
    }
    
    return { valid: false, error: errorMessage };
  }
}

/**
 * Get list of all available objects in the org using sf sobject list
 */
export async function getAvailableObjects(
  orgAlias: string,
  includeStandard: boolean = true
): Promise<string[]> {
  try {
    const { stdout, stderr } = await execAsync(
      `sf sobject list --sobject all --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const result = JSON.parse(jsonOutput);
    
    // Handle different response structures
    // SF CLI can return:
    // 1. { status: 0, result: { sobjects: [...] } } - object metadata
    // 2. { status: 0, result: [...] } - array of strings
    // 3. [...] - direct array of strings
    let objectNames: string[] = [];
    
    // Check if result is already an array of strings
    if (Array.isArray(result)) {
      objectNames = result.filter((item: any) => typeof item === 'string' && item.length > 0);
    }
    // Check result.result as array of strings
    else if (result.result && Array.isArray(result.result)) {
      const firstItem = result.result[0];
      if (typeof firstItem === 'string') {
        // Array of strings
        objectNames = result.result.filter((item: string) => item && item.length > 0);
      } else {
        // Array of objects - extract names
        objectNames = result.result
          .map((obj: any) => obj.name || obj.qualifiedApiName || obj.apiName || obj.fullName || obj.label || obj)
          .filter((name: any) => name && typeof name === 'string' && name.length > 0);
      }
    }
    // Check result.result.sobjects (object metadata)
    else if (result.result?.sobjects && Array.isArray(result.result.sobjects)) {
      objectNames = result.result.sobjects
        .map((obj: any) => obj.name || obj.qualifiedApiName || obj.apiName || obj.fullName || obj.label)
        .filter((name: any) => name && typeof name === 'string' && name.length > 0);
    }
    // Try result.sobjects
    else if (result.sobjects && Array.isArray(result.sobjects)) {
      objectNames = result.sobjects
        .map((obj: any) => obj.name || obj.qualifiedApiName || obj.apiName || obj.fullName || obj.label)
        .filter((name: any) => name && typeof name === 'string' && name.length > 0);
    }
    
    // Remove duplicates
    const uniqueNames = Array.from(new Set(objectNames));
    
    // Filter out standard objects if needed
    let filtered = uniqueNames;
    if (!includeStandard) {
      // Custom objects typically end with __c, __mdt, __e, __b, __x, etc.
      filtered = uniqueNames.filter((name: string) => 
        name.endsWith('__c') || 
        name.endsWith('__mdt') || 
        name.endsWith('__e') ||
        name.endsWith('__b') ||
        name.endsWith('__x')
      );
    }
    
    return filtered.sort();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    // Log the error for debugging
    console.error('Error fetching objects:', error);
    if (error.stdout) console.error('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    
    throw new Error(`Failed to get available objects: ${error.message}`);
  }
}

/**
 * Query master records from source org for CPQ master selection
 * Returns records with Id and external ID field value
 */
/**
 * Get Product2 lookup fields for an object by querying metadata
 * Returns array of relationship field names (e.g., ['SBQQ__Product__r'])
 */
async function getProduct2LookupFields(
  objectName: string,
  orgAlias: string
): Promise<string[]> {
  try {
    // Query FieldDefinition to find lookup fields that reference Product2
    const query = `SELECT QualifiedApiName, RelationshipName, ReferenceTo FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND DataType = 'Reference'`;
    
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const result: SFDataQueryResult = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];
    
    const product2Fields: string[] = [];
    for (const record of records) {
      const referenceTo = record.ReferenceTo || record.referenceTo || [];
      // Check if this field references Product2
      if (Array.isArray(referenceTo) && referenceTo.includes('Product2')) {
        const relationshipName = record.RelationshipName || record.relationshipName;
        if (relationshipName) {
          product2Fields.push(relationshipName);
        }
      }
    }
    
    return product2Fields;
  } catch (error: any) {
    // If metadata query fails, return empty array (we'll fall back to pattern matching)
    console.warn(`[getProduct2LookupFields] Failed to query metadata for ${objectName}:`, error.message);
    return [];
  }
}

export async function queryMasterRecords(
  objectName: string,
  externalIdField: string,
  orgAlias: string,
  filters?: { whereClause?: string },
  limit?: number,
  offset?: number
): Promise<Array<{ Id: string; [key: string]: any }>> {
  try {
    // Extract the actual field name from relationship fields
    // For composite external IDs, use the first field
    let actualField = externalIdField;
    if (externalIdField.includes(';')) {
      // Composite external ID - extract first field
      actualField = externalIdField.split(';')[0].trim();
    }
    
    // Handle relationship fields (e.g., SBQQ__Rule__r.Name)
    // For SELECT, we can use the relationship field directly
    // For WHERE filtering later, we'll need the lookup field
    let selectField = actualField;
    if (actualField.includes('__r.')) {
      // Relationship field - use as is for SELECT (e.g., SBQQ__Rule__r.Name)
      selectField = actualField;
    } else if (actualField.includes('.')) {
      // Standard relationship (e.g., Account.Name) - use as is
      selectField = actualField;
    }
    
    // Build SOQL query - include LastModifiedDate and LastModifiedBy.Name
    // For composite external IDs or relationship fields, we need to include all relationship fields
    let selectFields = [selectField];
    
    // If external ID is composite, include all fields
    if (externalIdField.includes(';')) {
        const allFields = externalIdField.split(';').map(f => f.trim());
        selectFields = [...new Set([...selectFields, ...allFields])]; // Remove duplicates
    }
    
    // For composite external IDs, also include the lookup fields themselves (not just the relationship)
    // This helps with display when relationships are null
    const lookupFields: string[] = [];
    
    // Check for Product2 lookups using two methods:
    // 1. Check CPQ_PRODUCT2_LOOKUPS metadata for objects with Product2 lookups (highest priority)
    // 2. Check if external ID contains Product2 relationship (e.g., SBQQ__Product__r)
    const product2LookupInfo = CPQ_PRODUCT2_LOOKUPS[objectName];
    const hasProduct2InExternalId = externalIdField.includes('SBQQ__Product__r') || 
                                     externalIdField.includes('SBQQ__ConfiguredSKU__r') ||
                                     externalIdField.includes('SBQQ__OptionalSKU__r') ||
                                     externalIdField.includes('SBQQ__SourceProduct__r') ||
                                     externalIdField.includes('SBQQ__UpgradeProduct__r');
    
    const hasProduct2Lookup = !!product2LookupInfo || hasProduct2InExternalId;
    
    if (hasProduct2Lookup) {
        // Determine which Product2 relationship to use
        // Priority: 1) Metadata, 2) External ID detection, 3) Default to SBQQ__Product__r
        let product2RelationshipName = 'SBQQ__Product__r';
        let product2LookupField = 'SBQQ__Product__c';
        
        if (product2LookupInfo) {
          // Use the relationship from metadata (highest priority)
          product2RelationshipName = product2LookupInfo.relationshipName;
          product2LookupField = product2LookupInfo.lookupField;
        } else if (externalIdField.includes('SBQQ__ConfiguredSKU__r')) {
          product2RelationshipName = 'SBQQ__ConfiguredSKU__r';
          product2LookupField = 'SBQQ__ConfiguredSKU__c';
        } else if (externalIdField.includes('SBQQ__OptionalSKU__r')) {
          product2RelationshipName = 'SBQQ__OptionalSKU__r';
          product2LookupField = 'SBQQ__OptionalSKU__c';
        } else if (externalIdField.includes('SBQQ__SourceProduct__r')) {
          product2RelationshipName = 'SBQQ__SourceProduct__r';
          product2LookupField = 'SBQQ__SourceProduct__c';
        } else if (externalIdField.includes('SBQQ__UpgradeProduct__r')) {
          product2RelationshipName = 'SBQQ__UpgradeProduct__r';
          product2LookupField = 'SBQQ__UpgradeProduct__c';
        } else if (externalIdField.includes('SBQQ__Product__r')) {
          // Standard Product2 lookup detected in external ID
          product2RelationshipName = 'SBQQ__Product__r';
          product2LookupField = 'SBQQ__Product__c';
        }
        
        // Add Product2 Name and ProductCode if not already in selectFields
        if (!selectFields.includes(`${product2RelationshipName}.Name`)) {
            selectFields.push(`${product2RelationshipName}.Name`);
        }
        if (!selectFields.includes(`${product2RelationshipName}.ProductCode`)) {
            selectFields.push(`${product2RelationshipName}.ProductCode`);
        }
        // Also add the lookup field
        if (!lookupFields.includes(product2LookupField)) {
            lookupFields.push(product2LookupField);
        }
    }
    
    if (externalIdField.includes(';')) {
        const allFields = externalIdField.split(';').map(f => f.trim());
        allFields.forEach(field => {
            if (field.includes('__r.')) {
                const relationshipName = field.split('__r.')[0];
                // Extract lookup field (e.g., SBQQ__PriceBook__r.Name -> SBQQ__PriceBook__c)
                const lookupField = relationshipName + '__c';
                if (!selectFields.includes(lookupField) && !lookupFields.includes(lookupField)) {
                    lookupFields.push(lookupField);
                }
            }
        });
    } else if (externalIdField.includes('__r.')) {
        const relationshipName = externalIdField.split('__r.')[0];
        // Single relationship field - also include the lookup field
        const lookupField = relationshipName + '__c';
        if (!selectFields.includes(lookupField)) {
            lookupFields.push(lookupField);
        }
    }
    
    // Also try to include Name field if it exists (for better display)
    // Note: We'll include it and let SOQL fail gracefully if it doesn't exist
    // Check if 'Name' (the object's own Name field) is already in selectFields
    // We want to add it if it's not already there (don't check externalIdField for 'Name' 
    // because that might be a relationship field like SBQQ__PriceBook__r.Name)
    const allSelectFields = [...selectFields, ...lookupFields];
    const hasObjectNameField = allSelectFields.some(f => f === 'Name' || f.trim() === 'Name');
    if (!hasObjectNameField) {
        allSelectFields.push('Name');
    }
    
    // Build SELECT clause with all needed fields
    // Remove duplicates and ensure proper ordering
    const uniqueSelectFields = [...new Set(allSelectFields)];
    // Ensure Id is always first in the SELECT clause (required for deduplication and record identification)
    const selectFieldsList = uniqueSelectFields.filter(f => f !== 'Id' && f.trim() !== 'Id');
    const selectClause = `Id, ${selectFieldsList.join(', ')}, LastModifiedDate, LastModifiedBy.Name`;
    let query = `SELECT ${selectClause} FROM ${objectName}`;
    
    // Add WHERE clause if provided
    const conditions: string[] = [];
    if (filters?.whereClause) {
      conditions.push(filters.whereClause);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Add ORDER BY LastModifiedDate DESC, Id ASC for stable pagination
    // Using Id as secondary sort ensures consistent ordering when LastModifiedDate values are the same
    query += ' ORDER BY LastModifiedDate DESC, Id ASC';
    
    // Add LIMIT and OFFSET for pagination
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    if (offset && offset > 0) {
      query += ` OFFSET ${offset}`;
    }
    
    // Execute query
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
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
    
    return records;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    // Extract error message from Salesforce response
    let errorMessage = error.message;
    if (error.stdout) {
      try {
        const errorData = JSON.parse(error.stdout);
        if (errorData.result?.errors && errorData.result.errors.length > 0) {
          errorMessage = errorData.result.errors[0].message || errorData.result.errors[0].errorCode || errorMessage;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // If parsing fails, use original message
      }
    }
    
    throw new Error(`Failed to query master records: ${errorMessage}`);
  }
}

