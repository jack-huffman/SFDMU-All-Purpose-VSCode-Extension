import * as path from 'path';
import * as fs from 'fs/promises';
import { BackupMetadata, RollbackConfig, RollbackObject, DMLOperation, OrgConfig } from '../models/migrationConfig';
import { loadBackupMetadata, getFieldsFromCSV } from './backupService';

/**
 * Generate rollback configuration from backup directory
 */
export async function generateRollbackConfig(
  backupDir: string,
  sourceOrg: OrgConfig,
  targetOrg: OrgConfig
): Promise<RollbackConfig> {
  // Load backup metadata
  const metadata = await loadBackupMetadata(backupDir);

  // Generate rollback objects
  const rollbackObjects: RollbackObject[] = [];

  for (const obj of metadata.objects) {
    const hasBackup = !!(obj.backupFile && obj.backupFile.length > 0 && obj.recordCount > 0);
    const rollbackOperation = determineRollbackOperation(
      obj.operation,
      hasBackup
    );

    if (rollbackOperation === null) {
      // Cannot rollback (e.g., DeleteSource)
      continue;
    }

    // For Insert rollback (Delete operation), prefer post-migration backup if available
    let backupFileForRollback = rollbackOperation === 'Delete' && (obj as any).postMigrationBackupFile
      ? path.join(backupDir, (obj as any).postMigrationBackupFile) // Use post-migration backup with IDs
      : obj.backupFile ? path.join(backupDir, obj.backupFile) : undefined; // Use pre-migration backup
    
    // Verify backup file exists if specified
    if (backupFileForRollback) {
      try {
        await fs.access(backupFileForRollback);
      } catch {
        // File doesn't exist
        if (rollbackOperation === 'Insert' || rollbackOperation === 'Update') {
          // For Insert/Update operations, we MUST have a valid backup file
          console.warn(`Skipping ${obj.objectName} rollback: ${rollbackOperation} operation requires backup file, but file not found: ${backupFileForRollback}`);
          continue;
        } else {
          // For Delete operations, we can proceed without CSV (using query instead)
          console.warn(`Backup file not found for ${obj.objectName}: ${backupFileForRollback}. Will use query for Delete operation.`);
          backupFileForRollback = undefined; // Clear invalid path
        }
      }
    }
    
    // For Insert and Update rollback operations, we MUST have a backup file
    // For Delete rollback (Insert operation), we can proceed without CSV if we have a query
    if ((rollbackOperation === 'Insert' || rollbackOperation === 'Update') && !backupFileForRollback) {
      // Skip objects that require backup but don't have one
      console.warn(`Skipping ${obj.objectName} rollback: ${rollbackOperation} operation requires backup file, but none was found.`);
      continue;
    }
    
    const query = await generateRollbackQuery(
      obj.objectName,
      obj.externalId,
      rollbackOperation,
      backupFileForRollback,
      (obj as any).originalQuery // Pass original query for Delete rollback
    );

    rollbackObjects.push({
      objectName: obj.objectName,
      originalOperation: obj.operation,
      rollbackOperation,
      externalId: obj.externalId,
      query,
      backupFile: backupFileForRollback // Use the appropriate backup file (pre or post-migration)
    });
  }

  return {
    backupDir,
    mode: metadata.mode,
    phaseNumber: metadata.phaseNumber,
    objects: rollbackObjects,
    sourceOrg: targetOrg, // Target org becomes source for rollback
    targetOrg: sourceOrg  // Source org becomes target (for restore operations)
  };
}

/**
 * Determine rollback operation based on original operation
 */
export function determineRollbackOperation(
  originalOperation: DMLOperation,
  hasBackup: boolean,
  wasInserted?: boolean
): DMLOperation | null {
  switch (originalOperation) {
    case 'Insert':
      // Insert → Delete
      return 'Delete';

    case 'Update':
      // Update → Update (restore original values)
      if (hasBackup) {
        return 'Update';
      }
      return null; // Cannot rollback without backup

    case 'Upsert':
      // Upsert → Delete or Update
      if (!hasBackup) {
        // No backup means we can't determine if records were inserted or updated
        // Default to Delete (safer - removes records)
        return 'Delete';
      }
      if (wasInserted === true) {
        return 'Delete';
      } else if (wasInserted === false) {
        return 'Update';
      }
      // Unknown - use Delete as safe default
      return 'Delete';

    case 'Delete':
      // Delete → Insert (restore deleted records)
      if (hasBackup) {
        return 'Insert';
      }
      return null; // Cannot rollback without backup

    case 'DeleteHierarchy':
      // DeleteHierarchy → Insert (restore deleted records and children)
      if (hasBackup) {
        return 'Insert';
      }
      return null; // Cannot rollback without backup

    case 'DeleteSource':
      // DeleteSource → Cannot rollback
      return null;

    default:
      // Unknown operation or Readonly - no rollback
      return null;
  }
}

/**
 * Generate rollback query based on operation type
 */
export async function generateRollbackQuery(
  objectName: string,
  externalId: string,
  operation: DMLOperation,
  backupFile?: string,
  originalQuery?: string
): Promise<string> {
  switch (operation) {
    case 'Delete':
      // For Delete operations (Insert rollback), we need to find records to delete
      // 
      // BEST CASE: If we have a post-migration backup file with IDs, use it directly
      // This file contains the IDs of records that were inserted during migration
      if (backupFile) {
        // Check if this is a post-migration backup (contains IDs of inserted records)
        // We can use useSourceCSVFile with the backup CSV that contains Id column
        // The query is still needed for SFDMU structure, but the CSV will provide the IDs
        return `SELECT Id FROM ${objectName}`;
      }
      
      // FALLBACK: If no post-migration backup, try to identify records using original query
      // This is less reliable but better than nothing
      
      // Strategy 1: Use original query WHERE clause (most reliable if applicable)
      if (originalQuery) {
        // Extract WHERE clause from original query
        const whereMatch = originalQuery.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1];
          // Use the same WHERE clause to find records to delete
          // This works if the WHERE clause identifies records in the target org
          // (e.g., WHERE AccountId = 'xxx' or WHERE Name = 'Test')
          return `SELECT Id FROM ${objectName} WHERE ${whereClause}`;
        }
        
        // If no WHERE clause, check for LIMIT
        const limitMatch = originalQuery.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
          // LIMIT alone is risky - only use if no WHERE clause available
          // This assumes the records were inserted in a specific order
          return `SELECT Id FROM ${objectName} ORDER BY CreatedDate DESC LIMIT ${limitMatch[1]}`;
        }
      }
      
      // Strategy 2: Use external ID if available
      // Note: This requires that external ID values were preserved during insert
      // SFDMU will preserve external ID values if the field is included in the query
      if (externalId && externalId !== 'Id') {
        if (externalId.includes(';')) {
          // Composite external ID - query by all composite fields
          const compositeFields = externalId.split(';').map(f => f.trim());
          // We need at least one field to be non-null to identify records
          // This is a best-effort approach - ideally we'd have the actual values
          const whereParts = compositeFields.map(field => `${field} != null`).join(' AND ');
          return `SELECT Id FROM ${objectName} WHERE ${whereParts}`;
        } else {
          // Simple external ID - query by external ID field
          // This assumes external ID values were set during insert
          // Without the actual values, we can only query for non-null external IDs
          // This may match more records than intended if other records have external IDs
          return `SELECT Id FROM ${objectName} WHERE ${externalId} != null`;
        }
      }
      
      // Strategy 3: Fallback - query all records (NOT SAFE)
      // This is a last resort and should be avoided
      // The user should add a WHERE clause to their original Insert query
      // or use external IDs to properly identify inserted records
      console.warn(
        `WARNING: Cannot safely identify inserted records for ${objectName} rollback. ` +
        `No post-migration backup, WHERE clause, or external ID available. ` +
        `This will delete ALL records. Please ensure your Insert migration uses external IDs or a WHERE clause.`
      );
      return `SELECT Id FROM ${objectName}`;

    case 'Update':
      // For Update operations, we use the backup CSV file
      // The query is used to match records, but values come from CSV
      // We need to include all fields that will be updated
      if (backupFile) {
        // Read backup CSV to get field list
        const fields = await getFieldsFromCSV(backupFile);
        if (fields.length > 0) {
          return `SELECT ${fields.join(', ')} FROM ${objectName}`;
        }
      }
      // Fallback: query with Id and external ID
      return `SELECT Id, ${externalId.includes(';') ? externalId.split(';').join(', ') : externalId} FROM ${objectName}`;

    case 'Insert':
      // For Insert operations, we use the backup CSV file directly
      // The query is used to structure the data, but all values come from CSV
      if (backupFile) {
        const fields = await getFieldsFromCSV(backupFile);
        if (fields.length > 0) {
          return `SELECT ${fields.join(', ')} FROM ${objectName}`;
        }
      }
      // Fallback: basic query
      return `SELECT Id FROM ${objectName}`;

    default:
      return `SELECT Id FROM ${objectName}`;
  }
}
