import { exec } from 'child_process';
import { promisify } from 'util';
import { ObjectMetadata, FieldMetadata } from '../models/migrationConfig';

const execAsync = promisify(exec);

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
  orgAlias: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // If whereClause is empty, it's valid (no filter)
    if (!whereClause || whereClause.trim() === '') {
      return { valid: true };
    }
    
    // Build test query: SELECT Id FROM ObjectName WHERE whereClause LIMIT 1
    // Escape double quotes and backslashes in whereClause for shell safety
    // SOQL uses single quotes for strings, so we only need to escape double quotes
    const escapedWhereClause = whereClause.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const query = `SELECT Id FROM ${objectName} WHERE ${escapedWhereClause} LIMIT 1`;
    
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

