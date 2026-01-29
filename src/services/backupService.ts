import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MigrationConfig, BackupMetadata, BackupInfo, MigrationObject } from '../models/migrationConfig';
import { generateSOQLQuery } from './queryGenerator';

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

type ProgressCallback = (message: string) => void;

/**
 * Create a pre-migration backup of target org data
 * Automatically called before non-simulation migrations
 */
export async function createPreMigrationBackup(
  config: MigrationConfig,
  phaseNumber?: number,
  progressCallback?: ProgressCallback,
  workspaceRoot?: string
): Promise<string> {
  if (!config.configName) {
    throw new Error('Configuration name is required for backup');
  }

  if (!config.targetOrg.alias) {
    throw new Error('Target org alias is required for backup');
  }

  // Create backup directory with timestamp
  // Backups should be stored in the same directory as export.json, inside a backups folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').substring(0, 19);
  
  // Resolve output directory - this is where export.json is located
  let outputDirPath: string;
  if (config.outputDir) {
    if (path.isAbsolute(config.outputDir)) {
      outputDirPath = config.outputDir;
    } else {
      // Relative path - resolve relative to workspace root
      const root = workspaceRoot || process.cwd();
      outputDirPath = path.join(root, config.outputDir);
    }
  } else {
    // Fallback to default location
    const root = workspaceRoot || process.cwd();
    outputDirPath = path.join(root, 'sfdmu-migration', config.configName || 'migration');
  }
  
  // For phase-based migrations, backups go in the phase directory
  // For standard mode, backups go in the main output directory
  const baseDir = phaseNumber 
    ? path.join(outputDirPath, `Phase ${phaseNumber}`)
    : outputDirPath;
  
  // Create backups folder inside the export.json directory
  const backupsDir = path.join(baseDir, 'backups');
  const backupDir = path.join(backupsDir, timestamp);

  await fs.mkdir(backupDir, { recursive: true });

  if (progressCallback) {
    progressCallback(`Creating backup in: ${backupDir}`);
  }

  const mode = config.mode || 'standard';
  const objects: Array<{ objectName: string; externalId: string; operation: string; originalQuery?: string }> = [];

  // Get objects to backup based on mode
  if (mode === 'cpq' && phaseNumber) {
    // For CPQ, read the export.json file for this phase to get actual objects
    // Resolve outputDir path
    let outputDirPath: string;
    if (config.outputDir) {
      outputDirPath = path.isAbsolute(config.outputDir) 
        ? config.outputDir 
        : path.join(process.cwd(), config.outputDir);
    } else {
      outputDirPath = path.join(process.cwd(), 'sfdmu-migration');
    }
    const phaseDir = path.join(outputDirPath, `Phase ${phaseNumber}`);
    const exportJsonPath = path.join(phaseDir, 'export.json');
    
    try {
      const exportJsonContent = await fs.readFile(exportJsonPath, 'utf8');
      const exportJson = JSON.parse(exportJsonContent);
      
      if (exportJson.objects && Array.isArray(exportJson.objects)) {
        for (const obj of exportJson.objects) {
          // Extract object name from query
          const queryMatch = obj.query.match(/FROM\s+(\w+)/i);
          if (queryMatch) {
            // Store the original query for backup (we'll modify it to get all fields)
            objects.push({
              objectName: queryMatch[1],
              externalId: obj.externalId || 'Name',
              operation: obj.operation || config.operation || 'Upsert',
              originalQuery: obj.query // Store original query for backup
            });
          }
        }
      }
    } catch (error: any) {
      // If export.json doesn't exist yet, we can't create backup
      throw new Error(`Cannot create backup: export.json not found for Phase ${phaseNumber} at ${exportJsonPath}. Please generate migration files first.`);
    }
  } else if (mode === 'rca' && phaseNumber) {
    // For RCA, read the export.json file for this phase
    // Resolve outputDir path
    let outputDirPath: string;
    if (config.outputDir) {
      outputDirPath = path.isAbsolute(config.outputDir) 
        ? config.outputDir 
        : path.join(process.cwd(), config.outputDir);
    } else {
      outputDirPath = path.join(process.cwd(), 'sfdmu-migration');
    }
    const phaseDir = path.join(outputDirPath, `Phase ${phaseNumber}`);
    const exportJsonPath = path.join(phaseDir, 'export.json');
    
    try {
      const exportJsonContent = await fs.readFile(exportJsonPath, 'utf8');
      const exportJson = JSON.parse(exportJsonContent);
      
      if (exportJson.objects && Array.isArray(exportJson.objects)) {
        for (const obj of exportJson.objects) {
          const queryMatch = obj.query.match(/FROM\s+(\w+)/i);
          if (queryMatch) {
            // Store the original query for backup
            objects.push({
              objectName: queryMatch[1],
              externalId: obj.externalId || 'Name',
              operation: obj.operation || config.operation || 'Upsert',
              originalQuery: obj.query // Store original query for backup
            });
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Cannot create backup: export.json not found for Phase ${phaseNumber} at ${exportJsonPath}. Please generate migration files first.`);
    }
  } else {
    // Standard mode - use config.objects
    // Read export.json to get original queries
    const root = workspaceRoot || process.cwd();
    let outputDirPath: string;
    if (config.outputDir) {
      outputDirPath = path.isAbsolute(config.outputDir) 
        ? config.outputDir 
        : path.join(root, config.outputDir);
    } else {
      outputDirPath = path.join(root, 'sfdmu-migration', config.configName || 'migration');
    }
    const exportJsonPath = path.join(outputDirPath, 'export.json');
    
    try {
      const exportJsonContent = await fs.readFile(exportJsonPath, 'utf8');
      const exportJson = JSON.parse(exportJsonContent);
      
      if (exportJson.objects && Array.isArray(exportJson.objects)) {
        // Map export.json objects to our objects array
        for (const exportObj of exportJson.objects) {
          const queryMatch = exportObj.query.match(/FROM\s+(\w+)/i);
          if (queryMatch) {
            const objectName = queryMatch[1];
            // Find matching config object
            const configObj = config.objects.find(o => o.objectName === objectName);
            if (configObj) {
              objects.push({
                objectName: objectName,
                externalId: exportObj.externalId || configObj.externalId,
                operation: exportObj.operation || configObj.operation || config.operation || 'Upsert',
                originalQuery: exportObj.query
              });
            }
          }
        }
      }
    } catch (error: any) {
      // If export.json doesn't exist, use config.objects without original query
      for (const obj of config.objects) {
        objects.push({
          objectName: obj.objectName,
          externalId: obj.externalId,
          operation: obj.operation || config.operation || 'Upsert'
        });
      }
    }
  }

  // If no objects, we can't create backup
  if (objects.length === 0) {
    throw new Error('No objects configured for backup');
  }

  const backupObjects: BackupMetadata['objects'] = [];

  // Backup each object
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (progressCallback) {
      progressCallback(`Backing up ${obj.objectName}... (${i + 1}/${objects.length})`);
    }

    try {
      // Create a minimal MigrationObject for backup query generation
      const migrationObject: MigrationObject = {
        objectName: obj.objectName,
        externalId: obj.externalId,
        phaseNumber: phaseNumber || 1,
        useCustomQuery: false
      };

      // If we have an original query (from export.json), use it for backup
      // Otherwise, generate a backup query
      let backupQuery: string;
      if (obj.originalQuery) {
        // For backup, try to get all fields by modifying the SELECT clause
        // Extract WHERE clause and other parts from original query
        const originalQuery = obj.originalQuery;
        
        // Try to replace SELECT ... with SELECT FIELDS(ALL) placeholder
        // Match: SELECT ... FROM ObjectName
        const selectMatch = originalQuery.match(/SELECT\s+([^F]+?)\s+FROM\s+(\w+)/i);
        if (selectMatch) {
          // Replace with FIELDS(ALL) placeholder (will be replaced with actual fields at query time)
          backupQuery = originalQuery.replace(/SELECT\s+[^F]+?\s+FROM/i, 'SELECT FIELDS(ALL) FROM');
        } else {
          // If pattern doesn't match, use original query
          backupQuery = originalQuery;
        }
      } else {
        backupQuery = generateBackupQuery(migrationObject, config, obj.externalId);
      }

      const backupFile = await exportObjectDataWithQuery(
        config.targetOrg.alias!,
        obj.objectName,
        obj.externalId,
        backupQuery,
        backupDir
      );

      if (backupFile) {
        // Count records in backup file
        const recordCount = await countRecordsInCSV(backupFile);
        
        // Get fields from backup CSV
        const fields = await getFieldsFromCSV(backupFile);

        backupObjects.push({
          objectName: obj.objectName,
          operation: obj.operation as any,
          externalId: obj.externalId,
          backupFile: path.basename(backupFile),
          recordCount,
          fields,
          originalQuery: obj.originalQuery // Store original query for rollback
        });
      } else {
        // No records to backup (will be inserts)
        backupObjects.push({
          objectName: obj.objectName,
          operation: obj.operation as any,
          externalId: obj.externalId,
          backupFile: '', // No backup file (empty)
          recordCount: 0,
          fields: [],
          originalQuery: obj.originalQuery // Store original query even if no backup
        });
      }
    } catch (error: any) {
      // Log error but continue with other objects
      if (progressCallback) {
        progressCallback(`Warning: Failed to backup ${obj.objectName}: ${error.message}`);
      }
      console.error(`Failed to backup ${obj.objectName}:`, error);
    }
  }

  // Create metadata.json
  const phaseLabel = phaseNumber ? ` Phase ${phaseNumber}` : '';
  const metadata: BackupMetadata & { description?: string } = {
    description: `Pre-migration backup of target org${phaseLabel}. Each object's records match the SOQL from export.json (same WHERE, ORDER BY, LIMIT); only the SELECT clause is expanded to all fields. Backup was taken from the target org (the org that will be modified by the migration).`,
    timestamp: new Date().toISOString(),
    configName: config.configName,
    mode: mode,
    phaseNumber: phaseNumber,
    sourceOrg: config.sourceOrg,
    targetOrg: config.targetOrg,
    objects: backupObjects
  };

  const metadataPath = path.join(backupDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  if (progressCallback) {
    progressCallback(`Backup created: ${backupDir}`);
  }

  return backupDir;
}

/**
 * Get all field names for an object using sf sobject describe
 */
async function getAllObjectFields(objectName: string, orgAlias: string): Promise<string[]> {
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
    // Filter out relationship fields (ending with __r) as they can't be directly queried
    // Include system fields (CreatedDate, LastModifiedDate, etc.) as they're useful for backup
    const fieldNames = fields
      .map((field: any) => field.name || field.qualifiedApiName || field.QualifiedApiName)
      .filter((name: string | undefined): name is string => {
        if (!name || typeof name !== 'string') return false;
        // Exclude relationship fields (ending with __r) as they can't be directly queried
        // But include lookup fields (ending with __c or Id)
        if (name.endsWith('__r')) return false;
        return true;
      })
      .sort(); // Sort for consistent ordering

    return fieldNames;
  } catch (error: any) {
    // If describe fails, try fallback using FieldDefinition query
    try {
      // Get all fields (not just customizable) for comprehensive backup
      const query = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;
      const { stdout, stderr } = await execAsync(
        `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
        {
          maxBuffer: 10 * 1024 * 1024
        }
      );

      const jsonOutput = stdout || stderr;
      if (!jsonOutput || jsonOutput.trim() === '') {
        throw new Error('Empty response from FieldDefinition query');
      }

      const result: SFDataQueryResult = JSON.parse(jsonOutput);
      const records = result.result?.records || result.records || [];
      
      return records
        .map((r: any) => r.QualifiedApiName || r.qualifiedApiName)
        .filter((name: string | undefined): name is string => {
          if (!name || typeof name !== 'string') return false;
          // Exclude relationship fields (ending with __r)
          if (name.endsWith('__r')) return false;
          return true;
        })
        .sort();
    } catch (fallbackError: any) {
      console.error(`Failed to get fields for ${objectName}:`, error.message);
      throw new Error(`Failed to get object fields: ${error.message}`);
    }
  }
}

/**
 * Replace FIELDS(ALL) in a query with actual field names
 */
async function replaceFieldsAllInQuery(query: string, objectName: string, orgAlias: string): Promise<string> {
  if (!query.includes('FIELDS(ALL)')) {
    return query;
  }

  // Get all fields for the object
  const allFields = await getAllObjectFields(objectName, orgAlias);
  
  // Replace FIELDS(ALL) with the field list
  // Ensure Id is first if not already in the list
  const fieldsList = allFields.includes('Id') 
    ? allFields.join(', ')
    : ['Id', ...allFields].join(', ');
  
  return query.replace('FIELDS(ALL)', fieldsList);
}

async function exportObjectDataWithQuery(
  orgAlias: string,
  objectName: string,
  externalId: string,
  query: string,
  backupDir: string
): Promise<string | null> {
  try {
    // If query contains FIELDS(ALL), replace it with actual field names
    let finalQuery = query;
    if (query.includes('FIELDS(ALL)')) {
      finalQuery = await replaceFieldsAllInQuery(query, objectName, orgAlias);
    }

    // Execute query
    const records = await executeQuery(finalQuery, orgAlias);

    if (records.length === 0) {
      // No records to backup (will be inserts)
      return null;
    }

    // Get all fields from records
    const fields = records.length > 0 ? Object.keys(records[0]) : [];
    
    // Write to CSV
    const csvPath = path.join(backupDir, `${objectName}_backup.csv`);
    await writeRecordsToCSV(records, fields, csvPath);

    return csvPath;
  } catch (error: any) {
    // If query fails (e.g., object doesn't exist in target), return null
    if (error.message.includes('sObject type') || error.message.includes('does not exist')) {
      return null;
    }
    throw error;
  }
}

/**
 * Export object data from org to CSV file
 */
export async function exportObjectData(
  orgAlias: string,
  objectName: string,
  externalId: string,
  migrationObject: MigrationObject,
  config: MigrationConfig,
  backupDir: string
): Promise<string | null> {
  // Generate query to get records that will be affected
  // For backup, we need to query target org to see what exists
  // The query should match the migration query criteria
  const query = generateBackupQuery(migrationObject, config, externalId);
  return exportObjectDataWithQuery(orgAlias, objectName, externalId, query, backupDir);
}

/**
 * Generate backup query - query target org for records that will be affected
 * For backup, we query ALL records that match the criteria (not just external IDs)
 */
function generateBackupQuery(
  migrationObject: MigrationObject,
  config: MigrationConfig,
  externalId: string
): string {
  const objectName = migrationObject.objectName;
  
  // For backup, we want to get all fields that might be modified
  // Start with Id and external ID fields
  const fields = new Set<string>(['Id']);
  
  // Add external ID field(s)
  if (externalId.includes(';')) {
    // Composite external ID
    externalId.split(';').forEach(field => {
      const trimmed = field.trim();
      if (trimmed.includes('.')) {
        // Relationship field - add the lookup field and the relationship traversal
        const parts = trimmed.split('.');
        const lookupField = parts[0] + 'Id';
        fields.add(lookupField);
        fields.add(trimmed); // Also include the relationship field itself
      } else {
        fields.add(trimmed);
      }
    });
  } else {
    if (externalId.includes('.')) {
      // Relationship field
      const parts = externalId.split('.');
      const lookupField = parts[0] + 'Id';
      fields.add(lookupField);
      fields.add(externalId); // Include the relationship field itself
    } else {
      fields.add(externalId);
    }
  }

  // Add selected fields if specified
  if (migrationObject.selectedFields && migrationObject.selectedFields.length > 0) {
    migrationObject.selectedFields.forEach(field => fields.add(field));
  } else {
    // If no specific fields selected, we'll query all fields using FIELDS(ALL)
    // But for now, let's query common fields + Id and external ID
    // The actual migration will determine which fields are needed
  }

  // Build WHERE clause - for backup, we want to match records that might be affected
  let whereClause = '';

  // Add modifiedSince filter if applicable
  if (config.modifiedSince) {
    whereClause = `LastModifiedDate >= ${config.modifiedSince}`;
  }

  // Add custom WHERE clause if specified
  if (migrationObject.whereClause) {
    if (whereClause) {
      whereClause += ` AND (${migrationObject.whereClause})`;
    } else {
      whereClause = migrationObject.whereClause;
    }
  }

  // For backup, if no WHERE clause, we might want to limit to avoid backing up everything
  // But we'll let the user's filters determine this

  // Build query - for backup, we want comprehensive data
  // Use FIELDS(ALL) placeholder - will be replaced with actual fields at query time
  let query: string;
  const fieldsArray = Array.from(fields);
  
  // Always include Id and external ID fields at minimum
  // For comprehensive backup, use FIELDS(ALL) placeholder (will be replaced with actual fields)
  if (fieldsArray.length <= 2) {
    // Only Id and external ID - use FIELDS(ALL) placeholder for comprehensive backup
    // This will be replaced with actual field names when the query is executed
    query = `SELECT FIELDS(ALL) FROM ${objectName}`;
  } else {
    // Use specific fields but ensure we have comprehensive coverage
    query = `SELECT ${fieldsArray.join(', ')} FROM ${objectName}`;
  }
  
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  // Add LIMIT if specified
  if (migrationObject.limitClause) {
    query += ` ${migrationObject.limitClause}`;
  }

  return query;
}

/**
 * Execute SOQL query and return all records (with pagination)
 */
async function executeQuery(soqlQuery: string, orgAlias: string): Promise<any[]> {
  const allRecords: any[] = [];
  let queryUrl = soqlQuery;
  let hasMore = true;
  let offset = 0;
  const limit = 2000; // Salesforce limit per query

  while (hasMore) {
    try {
      // Add LIMIT and OFFSET if not already present
      let paginatedQuery = queryUrl;
      if (!queryUrl.toUpperCase().includes('LIMIT')) {
        paginatedQuery += ` LIMIT ${limit}`;
      }
      if (offset > 0) {
        // Extract base query without LIMIT
        const baseQuery = queryUrl.split(/LIMIT\s+\d+/i)[0].trim();
        paginatedQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
      }

      const { stdout, stderr } = await execAsync(
        `sf data query --query "${paginatedQuery}" --target-org "${orgAlias}" --json`,
        {
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        }
      );

      const jsonOutput = stdout || stderr;
      if (!jsonOutput || jsonOutput.trim() === '') {
        break;
      }

      const result: SFDataQueryResult = JSON.parse(jsonOutput);

      // Extract records
      let records: any[] = [];
      if (result.result?.records) {
        records = result.result.records;
      } else if (result.records) {
        records = result.records;
      }

      allRecords.push(...records);

      // Check if there are more records
      const done = result.result?.done ?? result.done ?? true;
      const totalSize = result.result?.totalSize ?? allRecords.length;

      if (done || records.length < limit || allRecords.length >= totalSize) {
        hasMore = false;
      } else {
        offset += records.length;
      }
    } catch (error: any) {
      // If query fails, return what we have
      console.error(`Query error at offset ${offset}:`, error.message);
      break;
    }
  }

  return allRecords;
}

/**
 * Write records to CSV file
 */
async function writeRecordsToCSV(records: any[], fields: string[], csvPath: string): Promise<void> {
  if (records.length === 0) {
    // Create empty CSV with headers
    await fs.writeFile(csvPath, fields.join(',') + '\n', 'utf8');
    return;
  }

  // Escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Write headers
  const lines: string[] = [fields.map(escapeCSV).join(',')];

  // Write records
  for (const record of records) {
    const values = fields.map(field => {
      // Handle nested objects (relationship fields)
      if (field.includes('.')) {
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
        return escapeCSV(value);
      }
      return escapeCSV(record[field]);
    });
    lines.push(values.join(','));
  }

  await fs.writeFile(csvPath, lines.join('\n'), 'utf8');
}

/**
 * Count records in CSV file
 */
async function countRecordsInCSV(csvPath: string): Promise<number> {
  try {
    const content = await fs.readFile(csvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    // Subtract 1 for header row
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
  }
}

/**
 * Get field names from CSV header
 */
export async function getFieldsFromCSV(csvPath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(csvPath, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 0) {
      return lines[0].split(',').map(field => field.trim().replace(/^"|"$/g, ''));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Load backup metadata from backup directory
 */
export async function loadBackupMetadata(backupDir: string): Promise<BackupMetadata> {
  const metadataPath = path.join(backupDir, 'metadata.json');
  const content = await fs.readFile(metadataPath, 'utf8');
  return JSON.parse(content) as BackupMetadata;
}

/**
 * List all available backups for a configuration
 * Backups are stored in the same directory as export.json, inside backups folders
 */
export async function listAvailableBackups(configName: string, workspaceRoot?: string, outputDir?: string, phaseNumber?: number): Promise<BackupInfo[]> {
  // Resolve output directory
  let outputDirPath: string;
  if (outputDir) {
    if (path.isAbsolute(outputDir)) {
      outputDirPath = outputDir;
    } else {
      const root = workspaceRoot || process.cwd();
      outputDirPath = path.join(root, outputDir);
    }
  } else {
    // Fallback: try to find backups in the old location for backward compatibility
    const root = workspaceRoot || process.cwd();
    const backupsRoot = path.join(root, 'backups');
    const configBackupDir = path.join(backupsRoot, configName);
    
    try {
      await fs.access(configBackupDir);
      // Old location exists, use it
      return await listBackupsFromDirectory(configBackupDir);
    } catch {
      // Old location doesn't exist, return empty
      return [];
    }
  }
  
  // For phase-based migrations, check the phase directory
  // For standard mode, check the main output directory
  const baseDir = phaseNumber 
    ? path.join(outputDirPath, `Phase ${phaseNumber}`)
    : outputDirPath;
  
  const backupsDir = path.join(baseDir, 'backups');
  
  try {
    await fs.access(backupsDir);
  } catch {
    // Directory doesn't exist, no backups
    return [];
  }

  return await listBackupsFromDirectory(backupsDir);
}

/**
 * Create a post-migration backup for Insert operations
 * This captures the IDs of records that were inserted during migration
 */
export async function createPostMigrationBackup(
  config: MigrationConfig,
  backupLocation: string, // Pre-migration backup location
  phaseNumber?: number,
  progressCallback?: ProgressCallback,
  workspaceRoot?: string,
  migrationStartTime?: Date, // When migration started
  migrationEndTime?: Date    // When user confirmed migration completed
): Promise<void> {
  if (!config.configName) {
    throw new Error('Configuration name is required for backup');
  }

  if (!config.targetOrg.alias) {
    throw new Error('Target org alias is required for backup');
  }

  // Load the pre-migration backup metadata
  const preBackupMetadata = await loadBackupMetadata(backupLocation);
  
  // Find objects that had Insert operations (these need post-migration backup)
  const insertObjects = preBackupMetadata.objects.filter(
    obj => obj.operation === 'Insert' && obj.originalQuery
  );

  if (insertObjects.length === 0) {
    // No Insert operations, nothing to do
    if (progressCallback) {
      progressCallback('No Insert operations found - skipping post-migration backup');
    }
    return;
  }

  if (progressCallback) {
    progressCallback(`Creating post-migration backup for ${insertObjects.length} Insert operation(s)...`);
  }

  // Create post-migration backup file in the same backup directory
  const postBackupDir = backupLocation;
  const postBackupObjects: BackupMetadata['objects'] = [];

  // For each Insert object, query the target org to get the IDs of inserted records
  for (let i = 0; i < insertObjects.length; i++) {
    const obj = insertObjects[i];
    if (progressCallback) {
      progressCallback(`Querying inserted records for ${obj.objectName}... (${i + 1}/${insertObjects.length})`);
    }

    try {
      // Strategy 1: If we have external IDs, query source org to get external ID values,
      // then query target org by those external ID values
      let records: any[] = [];
      
      if (obj.externalId && obj.externalId !== 'Id' && config.sourceOrg.alias) {
        try {
          if (progressCallback) {
            progressCallback(`  Querying source org for external ID values...`);
          }
          
          // Query source org to get external ID values that were inserted
          let sourceQuery = obj.originalQuery!;
          
          // Build query to get external ID values from source
          let externalIdFields: string[] = [];
          if (obj.externalId.includes(';')) {
            externalIdFields = obj.externalId.split(';').map(f => f.trim());
          } else {
            externalIdFields = [obj.externalId];
          }
          
          const sourceIdQuery = `SELECT ${externalIdFields.join(', ')} FROM ${obj.objectName}`;
          
          // Extract WHERE clause from original query
          const whereMatch = sourceQuery.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
          if (whereMatch) {
            const sourceQueryWithWhere = `${sourceIdQuery} WHERE ${whereMatch[1]}`;
            const sourceRecords = await executeQuery(sourceQueryWithWhere, config.sourceOrg.alias);
            
            if (sourceRecords.length > 0) {
              // Extract external ID values
              const externalIdValues: string[] = [];
              sourceRecords.forEach(record => {
                if (obj.externalId.includes(';')) {
                  // Composite external ID - build composite value
                  const compositeFields = obj.externalId.split(';').map(f => f.trim());
                  const compositeValue = compositeFields.map(field => record[field]).filter(v => v != null).join('|');
                  if (compositeValue) {
                    externalIdValues.push(compositeValue);
                  }
                } else {
                  const value = record[obj.externalId];
                  if (value != null) {
                    externalIdValues.push(String(value));
                  }
                }
              });
              
              if (externalIdValues.length > 0) {
                // Query target org by external ID values
                if (progressCallback) {
                  progressCallback(`  Querying target org by external ID values (${externalIdValues.length} values)...`);
                }
                
                let targetQuery = `SELECT Id`;
                if (obj.externalId !== 'Id' && !obj.externalId.includes(';')) {
                  targetQuery += `, ${obj.externalId}`;
                } else if (obj.externalId.includes(';')) {
                  const compositeFields = obj.externalId.split(';').map(f => f.trim());
                  targetQuery += `, ${compositeFields.join(', ')}`;
                }
                targetQuery += ` FROM ${obj.objectName}`;
                
                // Build WHERE clause with external ID values
                if (obj.externalId.includes(';')) {
                  // For composite external IDs, we need to match all fields
                  // Build OR conditions for each composite value
                  const compositeFields = obj.externalId.split(';').map(f => f.trim());
                  const compositeConditions: string[] = [];
                  
                  externalIdValues.forEach(compositeValue => {
                    // Composite value format: "value1|value2|value3"
                    const parts = compositeValue.split('|');
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
                        // All fields matched - combine with AND
                        compositeConditions.push(`(${fieldConditions.join(' AND ')})`);
                      }
                    }
                  });
                  
                  if (compositeConditions.length > 0) {
                    // Combine all composite matches with OR
                    targetQuery += ` WHERE (${compositeConditions.join(' OR ')})`;
                    records = await executeQuery(targetQuery, config.targetOrg.alias!);
                  }
                } else {
                  // Simple external ID - use IN clause
                  const quotedValues = externalIdValues.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
                  targetQuery += ` WHERE ${obj.externalId} IN (${quotedValues})`;
                  records = await executeQuery(targetQuery, config.targetOrg.alias!);
                }
              }
            }
          }
        } catch (error: any) {
          if (progressCallback) {
            progressCallback(`  Warning: Could not query by external ID: ${error.message}`);
          }
          console.warn(`Failed to query by external ID for ${obj.objectName}:`, error);
        }
      }
      
      // Strategy 2: If external ID approach didn't work, use CreatedDate + CreatedById with migration time window
      // Query for records created during the migration window (startTime to endTime) by the current running user
      // This is much more precise than a fixed time window
      if (records.length === 0 && config.targetOrg.alias && migrationStartTime && migrationEndTime) {
        try {
          if (progressCallback) {
            const durationMinutes = Math.round((migrationEndTime.getTime() - migrationStartTime.getTime()) / 60000);
            progressCallback(`  Fallback: Querying target org for records created by current user during migration window (${durationMinutes} minutes)...`);
          }
          
          // Get current user ID from target org
          // Try to get user by username first (most reliable)
          let currentUserId: string | null = null;
          
          if (config.targetOrg.username) {
            try {
              const escapedUsername = config.targetOrg.username.replace(/'/g, "''");
              const userQuery = `SELECT Id FROM User WHERE Username = '${escapedUsername}' LIMIT 1`;
              const userRecords = await executeQuery(userQuery, config.targetOrg.alias);
              if (userRecords.length > 0) {
                currentUserId = userRecords[0].Id;
              }
            } catch (error) {
              // If username query fails, try alternative approach
              console.warn(`Failed to query user by username: ${error}`);
            }
          }
          
          // Fallback: Query for the most recently active user (less precise but better than nothing)
          if (!currentUserId) {
            try {
              const activeUserQuery = `SELECT Id FROM User WHERE IsActive = true ORDER BY LastLoginDate DESC NULLS LAST LIMIT 1`;
              const userRecords = await executeQuery(activeUserQuery, config.targetOrg.alias);
              if (userRecords.length > 0) {
                currentUserId = userRecords[0].Id;
                if (progressCallback) {
                  progressCallback(`  Note: Using most recently active user (may not be exact match)`);
                }
              }
            } catch (error) {
              console.warn(`Failed to query active user: ${error}`);
            }
          }
          
          if (currentUserId) {
            // Use the exact migration time window
            const startIsoString = migrationStartTime.toISOString().replace(/\.\d{3}Z$/, '+0000');
            const endIsoString = migrationEndTime.toISOString().replace(/\.\d{3}Z$/, '+0000');
            
            // Build query for records created by current user during migration window
            let createdByQuery = `SELECT Id`;
            if (obj.externalId && obj.externalId !== 'Id' && !obj.externalId.includes(';')) {
              createdByQuery += `, ${obj.externalId}`;
            } else if (obj.externalId && obj.externalId.includes(';')) {
              const compositeFields = obj.externalId.split(';').map(f => f.trim());
              createdByQuery += `, ${compositeFields.join(', ')}`;
            }
            createdByQuery += ` FROM ${obj.objectName} WHERE CreatedDate >= ${startIsoString} AND CreatedDate <= ${endIsoString} AND CreatedById = '${currentUserId}'`;
            
            // Add original WHERE clause if available and it doesn't conflict
            // This helps narrow down to records that match the migration criteria
            // Note: We're careful here - the WHERE clause is from source org, but we're using it
            // to narrow results combined with CreatedDate/CreatedById which are target-org specific
            if (obj.originalQuery) {
              const whereMatch = obj.originalQuery.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
              if (whereMatch) {
                const whereClause = whereMatch[1];
                // Only add WHERE clause if it doesn't reference time-based fields that conflict
                // and doesn't reference source-specific values that might not exist in target
                // We're more conservative here - only use WHERE clause if it's very generic
                if (!whereClause.includes('CreatedDate') && 
                    !whereClause.includes('LastModifiedDate') &&
                    !whereClause.includes('CreatedById') &&
                    !whereClause.includes('Id =') && // Avoid source-specific IDs
                    !whereClause.match(/Id\s+IN\s*\(/i)) { // Avoid source-specific ID lists
                  // Add the WHERE clause to further narrow results
                  createdByQuery += ` AND (${whereClause})`;
                }
              }
              
              // Add LIMIT from original query if present
              const limitMatch = obj.originalQuery.match(/LIMIT\s+(\d+)/i);
              if (limitMatch) {
                createdByQuery += ` LIMIT ${limitMatch[1]}`;
              }
            }
            
            records = await executeQuery(createdByQuery, config.targetOrg.alias);
            
            if (progressCallback && records.length > 0) {
              const durationMinutes = Math.round((migrationEndTime.getTime() - migrationStartTime.getTime()) / 60000);
              progressCallback(`  Found ${records.length} record(s) created by current user during migration window (${durationMinutes} min)`);
            }
          } else {
            if (progressCallback) {
              progressCallback(`  Warning: Could not identify current user in target org - skipping time window fallback`);
            }
          }
        } catch (error: any) {
          if (progressCallback) {
            progressCallback(`  Warning: CreatedDate/CreatedById fallback failed: ${error.message}`);
          }
          console.warn(`Failed to use CreatedDate/CreatedById fallback for ${obj.objectName}:`, error);
        }
      } else if (records.length === 0 && (!migrationStartTime || !migrationEndTime)) {
        if (progressCallback) {
          progressCallback(`  Note: Migration time window not available - cannot use CreatedDate/CreatedById fallback`);
        }
      }
      
      // If we still have no records, we cannot safely identify inserted records
      // Skip this object rather than risk deleting wrong records
      if (records.length === 0) {
        if (progressCallback) {
          progressCallback(`  ⚠ Cannot safely identify inserted records for ${obj.objectName} - skipping post-migration backup`);
          if (!obj.externalId || obj.externalId === 'Id') {
            progressCallback(`     Reason: No external ID field available for precise record identification`);
          } else {
            progressCallback(`     Reason: External ID query and CreatedDate/CreatedById fallback both failed`);
          }
          progressCallback(`     (This is safer than potentially deleting incorrect records during rollback)`);
        }
        console.warn(`Cannot safely identify inserted records for ${obj.objectName} - skipping post-migration backup. External ID: ${obj.externalId || 'none'}`);
        continue; // Skip this object
      }
      
      if (records.length > 0) {
        // Validation: Check if we found significantly more records than expected
        // This could indicate we're picking up unrelated records
        // Get expected count from source org query if possible
        let expectedCount: number | undefined;
        try {
          if (obj.originalQuery && config.sourceOrg.alias) {
            // Count records in source org that match the query
            const countQuery = obj.originalQuery.replace(/SELECT\s+.+?\s+FROM/i, 'SELECT COUNT() FROM');
            const countResult = await executeQuery(countQuery, config.sourceOrg.alias);
            if (countResult && countResult.length > 0 && countResult[0].expr0 !== undefined) {
              expectedCount = parseInt(String(countResult[0].expr0), 10);
            }
          }
        } catch (error) {
          // If we can't get expected count, that's okay - we'll proceed with validation
        }
        
        // Warn if we found significantly more records than expected (could indicate wrong records)
        if (expectedCount !== undefined && records.length > expectedCount * 1.5) {
          if (progressCallback) {
            progressCallback(`  ⚠ Warning: Found ${records.length} records but expected ~${expectedCount} - may include unrelated records`);
            progressCallback(`     Consider reviewing the post-migration backup before rollback`);
          }
          console.warn(`Found ${records.length} records for ${obj.objectName} but expected ~${expectedCount} - may include unrelated records`);
        }
        
        // Write IDs to CSV file
        const fields = ['Id'];
        if (obj.externalId && obj.externalId !== 'Id') {
          if (obj.externalId.includes(';')) {
            fields.push(...obj.externalId.split(';').map(f => f.trim()));
          } else {
            fields.push(obj.externalId);
          }
        }
        
        const postBackupFileName = `${obj.objectName}_inserted_ids.csv`;
        const postBackupFilePath = path.join(postBackupDir, postBackupFileName);
        
        await writeRecordsToCSV(records, fields, postBackupFilePath);
        
        postBackupObjects.push({
          objectName: obj.objectName,
          operation: obj.operation,
          externalId: obj.externalId,
          backupFile: postBackupFileName,
          recordCount: records.length,
          fields: fields,
          originalQuery: obj.originalQuery,
          isPostMigration: true, // Mark as post-migration backup
          postMigrationBackupFile: postBackupFileName,
          postMigrationRecordCount: records.length
        } as any); // Type assertion needed for post-migration fields
        
        if (progressCallback) {
          progressCallback(`✓ Captured ${records.length} inserted record ID(s) for ${obj.objectName}`);
        }
      } else {
        if (progressCallback) {
          progressCallback(`⚠ No records found for ${obj.objectName} - may not have been inserted`);
        }
      }
    } catch (error: any) {
      if (progressCallback) {
        progressCallback(`Warning: Failed to backup inserted records for ${obj.objectName}: ${error.message}`);
      }
      console.error(`Failed to backup inserted records for ${obj.objectName}:`, error);
    }
  }

  // Update the backup metadata to include post-migration data
  const updatedMetadata: BackupMetadata = {
    ...preBackupMetadata,
    objects: [
      ...preBackupMetadata.objects.map(obj => {
        // Find corresponding post-migration backup if it exists
        const postBackup = postBackupObjects.find(p => p.objectName === obj.objectName);
        if (postBackup && obj.operation === 'Insert') {
          // For Insert operations, add the post-migration backup file
          return {
            ...obj,
            postMigrationBackupFile: postBackup.backupFile,
            postMigrationRecordCount: postBackup.recordCount
          };
        }
        return obj;
      })
    ]
  };

  // Save updated metadata
  const metadataPath = path.join(postBackupDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), 'utf8');

  if (progressCallback) {
    progressCallback(`✓ Post-migration backup completed`);
  }
}

/**
 * List backups from a specific directory
 */
async function listBackupsFromDirectory(backupsDir: string): Promise<BackupInfo[]> {
  const entries = await fs.readdir(backupsDir, { withFileTypes: true });
  const backups: BackupInfo[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const timestamp = entry.name;
      const backupDir = path.join(backupsDir, timestamp);
      
      try {
        const metadata = await loadBackupMetadata(backupDir);
        
        // Format date for display
        const date = new Date(metadata.timestamp);
        const formattedDate = date.toLocaleString();

        // Calculate totals
        const objectCount = metadata.objects.length;
        const totalRecords = metadata.objects.reduce((sum, obj) => sum + obj.recordCount, 0);

        backups.push({
          timestamp,
          path: backupDir,
          metadata,
          formattedDate,
          objectCount,
          totalRecords
        });
      } catch (error) {
        // Skip invalid backups
        console.warn(`Skipping invalid backup: ${backupDir}`, error);
      }
    }
  }

  // Sort by timestamp (newest first)
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return backups;
}
