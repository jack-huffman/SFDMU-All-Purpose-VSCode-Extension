import { MigrationObject, ObjectFilter } from '../models/migrationConfig';

/**
 * Extract relationship fields from composite external ID
 * For SOQL, we need to include the relationship traversal paths
 * Example: SBQQ__Product__r.ProductCode -> we need SBQQ__Product__r.ProductCode in SELECT
 * Also need to include the base lookup field (SBQQ__Product__c) for the relationship to work
 * IMPORTANT: Base lookup fields must be included BEFORE relationship traversal fields
 */
export function extractRelationshipFields(externalId: string): string[] {
  const fields: string[] = [];
  const parts = externalId.split(';');
  const baseLookupFields = new Set<string>(); // Track base lookup fields to avoid duplicates
  const relationshipFields: string[] = []; // Track relationship traversal fields separately
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('__r.') || trimmed.includes('.')) {
      // This is a relationship field path (e.g., SBQQ__Product__r.ProductCode or Account.Name)
      // Include the full path in the SELECT clause
      relationshipFields.push(trimmed);
      
      // Extract the base lookup field name
      // For custom fields: SBQQ__Product__r -> SBQQ__Product__c
      // For standard fields: Account.Name -> AccountId
      const relationshipMatch = trimmed.match(/^([A-Za-z0-9_]+)__r\./);
      if (relationshipMatch) {
        // Custom relationship field
        const relationshipName = relationshipMatch[1];
        const lookupField = `${relationshipName}__c`;
        baseLookupFields.add(lookupField);
      } else {
        // Standard relationship field (e.g., Account.Name -> AccountId)
        const standardMatch = trimmed.match(/^([A-Za-z0-9_]+)\./);
        if (standardMatch) {
          const relationshipName = standardMatch[1];
          const lookupField = `${relationshipName}Id`;
          baseLookupFields.add(lookupField);
        }
      }
    }
  }
  
  // Add base lookup fields FIRST to ensure relationships are accessible
  for (const lookupField of baseLookupFields) {
    if (!fields.includes(lookupField)) {
      fields.push(lookupField);
    }
  }
  
  // Then add relationship traversal fields
  for (const relField of relationshipFields) {
    if (!fields.includes(relField)) {
      fields.push(relField);
    }
  }
  
  return fields;
}

/**
 * Generate SOQL query for an object
 * Supports both auto-generated and custom queries
 */
export function generateSOQLQuery(
  migrationObject: MigrationObject,
  modifiedSince?: string
): string {
  // If custom query is provided, use it (but still apply filters if possible)
  if (migrationObject.useCustomQuery && migrationObject.soqlQuery) {
    let query = migrationObject.soqlQuery.trim();
    
    // Try to append filters to custom query if it doesn't already have WHERE clause
    // This is a best-effort approach - user should handle complex cases manually
    if (modifiedSince || migrationObject.whereClause) {
      const hasWhere = /\bWHERE\b/i.test(query);
      if (!hasWhere) {
        const conditions: string[] = [];
        
        if (modifiedSince) {
          const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
          conditions.push(`LastModifiedDate >= ${datetimeValue}`);
        }
        
        if (migrationObject.whereClause) {
          const filterConditions = migrationObject.whereClause.split(/\s+AND\s+/i).map(c => c.trim());
          conditions.push(...filterConditions);
        }
        
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
      }
    }
    
    // For custom queries, append ORDER BY and LIMIT if not already present
    // Only append if they don't already exist in the query
    if (migrationObject.orderByClause && !/\bORDER\s+BY\b/i.test(query)) {
      query += ' ORDER BY ' + migrationObject.orderByClause;
    }
    
    if (migrationObject.limitClause && !/\bLIMIT\b/i.test(query)) {
      query += ' LIMIT ' + migrationObject.limitClause;
    }
    
    return query;
  }
  
  // Auto-generate query
  const objectName = migrationObject.objectName;
  const externalId = migrationObject.externalId;
  
  // Extract relationship fields needed for composite external IDs FIRST
  const relFields = extractRelationshipFields(externalId);
  
  // Determine SELECT fields
  let selectClause: string;
  
  if (migrationObject.selectedFields && migrationObject.selectedFields.length > 0) {
    // Use selected fields
    const selectFields: string[] = [...migrationObject.selectedFields];
    // Always include Id and external ID fields
    if (!selectFields.includes('Id')) {
      selectFields.unshift('Id');
    }
    // Add relationship fields if not already included
    for (const relField of relFields) {
      if (!selectFields.includes(relField)) {
        selectFields.push(relField);
      }
    }
    selectClause = selectFields.join(', ');
  } else {
    // Use SELECT all (default behavior)
    if (relFields.length > 0) {
      selectClause = 'all, ' + relFields.join(', ');
    } else {
      selectClause = 'all';
    }
  }
  
  let query = `SELECT ${selectClause} FROM ${objectName}`;
  
  // Build WHERE clause
  const conditions: string[] = [];
  
  // LastModifiedDate filter
  if (modifiedSince) {
    const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
    conditions.push(`LastModifiedDate >= ${datetimeValue}`);
  }
  
  // Object-specific WHERE clause
  if (migrationObject.whereClause) {
    // Parse the where clause and add conditions
    // For now, assume it's a simple condition or multiple conditions separated by AND
    const filterConditions = migrationObject.whereClause.split(/\s+AND\s+/i).map(c => c.trim());
    conditions.push(...filterConditions);
  }
  
  // Add WHERE clause if we have conditions
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  // Add ORDER BY clause if provided
  if (migrationObject.orderByClause) {
    query += ' ORDER BY ' + migrationObject.orderByClause;
  }
  
  // Add LIMIT clause if provided
  if (migrationObject.limitClause) {
    query += ' LIMIT ' + migrationObject.limitClause;
  }
  
  return query;
}

