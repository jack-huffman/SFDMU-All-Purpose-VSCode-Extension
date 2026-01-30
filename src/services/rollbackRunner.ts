import * as fs from 'fs/promises';
import * as path from 'path';
import { RollbackConfig, SFDMUResult } from '../models/migrationConfig';
import { runSFDMU } from './sfdmuRunner';
import { getFieldsFromCSV } from './backupService';

/**
 * Clean and validate CSV file to fix common issues that SFDMU complains about
 */
async function cleanCSVFile(csvPath: string): Promise<void> {
  try {
    let content = await fs.readFile(csvPath, 'utf8');
    
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) {
      return; // Empty file, nothing to clean
    }
    
    // Get header row
    const header = lines[0].trim();
    if (!header) {
      return; // No header, skip cleaning
    }
    
    const headerFields = parseCSVLine(header);
    const expectedFieldCount = headerFields.length;
    
    // Clean data rows
    const cleanedLines: string[] = [header];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip completely empty lines
      if (!line) {
        continue;
      }
      
      // Parse the line
      const fields = parseCSVLine(line);
      
      // Ensure we have the correct number of fields
      // If too few, pad with empty strings
      // If too many, truncate (shouldn't happen but handle it)
      while (fields.length < expectedFieldCount) {
        fields.push('');
      }
      if (fields.length > expectedFieldCount) {
        fields.splice(expectedFieldCount);
      }
      
      // Reconstruct the line with proper CSV formatting
      const cleanedLine = fields.map(field => escapeCSVField(field)).join(',');
      cleanedLines.push(cleanedLine);
    }
    
    // Write cleaned content back
    await fs.writeFile(csvPath, cleanedLines.join('\n'), 'utf8');
  } catch (error) {
    // If cleaning fails, log warning but don't fail
    console.warn(`Failed to clean CSV file ${csvPath}:`, error);
  }
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Add last field
  fields.push(currentField.trim());
  
  return fields;
}

/**
 * Escape a field for CSV
 */
function escapeCSVField(field: string): string {
  if (field === null || field === undefined) {
    return '';
  }
  
  const str = String(field);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Execute rollback migration
 */
export async function executeRollback(
  rollbackConfig: RollbackConfig,
  simulation: boolean = false
): Promise<SFDMUResult> {
  // Generate rollback export.json
  const outputDir = await generateRollbackExportJson(rollbackConfig);

  // Execute rollback using SFDMU
  const result = await runSFDMU(
    outputDir,
    rollbackConfig.sourceOrg.username,
    rollbackConfig.targetOrg.username,
    simulation
  );

  return result;
}

/**
 * Generate rollback export.json file
 */
export async function generateRollbackExportJson(
  rollbackConfig: RollbackConfig
): Promise<string> {
  // Create output directory for rollback
  const backupDir = rollbackConfig.backupDir;
  const rollbackDir = path.join(backupDir, 'rollback');
  await fs.mkdir(rollbackDir, { recursive: true });

  // Build export.json
  const exportJson: any = {
    objects: []
  };

  // Track if any CSV files don't have Id column
  let hasCSVWithoutId = false;
  // Track which objects have valid CSV files
  const objectsWithCSV = new Set<string>();

  // First pass: validate and prepare CSV files, identify which objects have CSV files
  const reversedObjects = [...rollbackConfig.objects].reverse();
  
  for (const obj of reversedObjects) {
    // For Insert and Update operations, we MUST have a backup CSV file
    // For Delete operations, we can use either CSV (with IDs) or query (without CSV)
    const requiresCSV = obj.rollbackOperation === 'Insert' || obj.rollbackOperation === 'Update';
    
    if (requiresCSV && !obj.backupFile) {
      // Skip objects that require CSV but don't have one
      console.warn(`Skipping ${obj.objectName} rollback: ${obj.rollbackOperation} operation requires backup CSV file, but none was found.`);
      continue;
    }

    // If backup file is specified, verify it exists and prepare it
    if (obj.backupFile) {
      try {
        await fs.access(obj.backupFile);
        
        // Clean the CSV file to fix common issues before using it
        await cleanCSVFile(obj.backupFile);
      } catch (error) {
        // File doesn't exist
        if (requiresCSV) {
          // For operations that require CSV, skip this object
          console.warn(`Skipping ${obj.objectName} rollback: Required backup file not found: ${obj.backupFile}`);
          continue;
        } else {
          // For Delete operations, we can proceed without CSV (using query instead)
          console.warn(`Backup file not found for ${obj.objectName}: ${obj.backupFile}. Will use query instead.`);
          // Clear backupFile so we don't try to copy it
          obj.backupFile = undefined;
        }
      }
    }

    // If backup CSV file exists and is valid, copy it to rollback directory
    // SFDMU expects CSV files to be named [ObjectName].csv in the same directory as export.json
    // For Delete operations (Insert rollback), we can use post-migration backup with IDs
    // For Insert/Update operations, we use pre-migration backup with original values
    if (obj.backupFile) {
      try {
        // Verify file exists (we already checked above, but double-check)
        await fs.access(obj.backupFile);
        
        // Check if CSV file has Id column
        // According to SFDMU docs: if CSV doesn't have Id column, need excludeIdsFromCSVFiles: true
        const csvFields = await getFieldsFromCSV(obj.backupFile);
        const hasIdColumn = csvFields.includes('Id');
        
        if (!hasIdColumn) {
          hasCSVWithoutId = true;
        }
        
        // Copy CSV file to rollback directory with object name
        // SFDMU expects CSV files named [ObjectName].csv when using csvfile as username
        const csvFileName = `${obj.objectName}.csv`;
        const csvDestPath = path.join(rollbackDir, csvFileName);
        
        // Copy the cleaned CSV file to rollback directory
        await fs.copyFile(obj.backupFile, csvDestPath);
        
        // Mark that we have a valid CSV file for this object
        objectsWithCSV.add(obj.objectName);
        
        // For Delete operations using post-migration backup, the CSV contains Id column
        // SFDMU will use these IDs to delete the records
      } catch {
        // File doesn't exist - already handled above, but handle gracefully here too
        if (requiresCSV) {
          // Shouldn't reach here if we skipped above, but just in case
          continue;
        }
        // For Delete operations, continue without CSV
      }
    }
  }

  // Determine if we should use csvfile (if we have any CSV files)
  const usingCSVFiles = objectsWithCSV.size > 0;

  // Second pass: build export.json, only including objects with CSV files if using csvfile
  for (const obj of reversedObjects) {
    const hasValidCSV = objectsWithCSV.has(obj.objectName);
    
    // Only include object in export.json if:
    // 1. It has a valid CSV file (when using csvfile), OR
    // 2. We're not using csvfile (uses query from org)
    // When using csvfile, SFDMU expects CSV files for all objects, so we only include objects with CSV files
    if (usingCSVFiles && !hasValidCSV) {
      // When using csvfile, skip objects without CSV files
      // These objects would cause SFDMU to error since it expects CSV files for all objects
      continue;
    }

    const scriptObject: any = {
      query: obj.query,
      operation: obj.rollbackOperation,
      externalId: obj.externalId
    };

    exportJson.objects.push(scriptObject);
  }

  // Set org configuration
  // If using CSV files, set sourceOrg.username to "csvfile"
  // According to SFDMU documentation:
  // - Import from CSV: --sourceusername csvfile --targetusername target@name.com
  // - Export to CSV: --sourceusername source@name.com --targetusername csvfile
  // When sourceOrg.username = "csvfile", SFDMU automatically looks for CSV files
  // named [ObjectName].csv in the same directory as export.json
  if (usingCSVFiles) {
    // When using CSV files, set sourceOrg.username to "csvfile"
    // SFDMU will automatically look for CSV files named [ObjectName].csv in the rollback directory
    // Note: Objects without CSV files will be skipped by SFDMU when using csvfile
    // No instanceUrl or accessToken needed when using csvfile
    exportJson.sourceOrg = {
      username: 'csvfile'
    };
  } else if (rollbackConfig.sourceOrg.username && rollbackConfig.sourceOrg.instanceUrl) {
    // Not using CSV files, use actual org configuration
    // This happens when all rollback operations use queries (e.g., Delete operations without CSV)
    exportJson.sourceOrg = {
      username: rollbackConfig.sourceOrg.username,
      instanceUrl: rollbackConfig.sourceOrg.instanceUrl
    };
    if (rollbackConfig.sourceOrg.accessToken) {
      exportJson.sourceOrg.accessToken = rollbackConfig.sourceOrg.accessToken;
    }
  }

  // Target org is always the actual org (never csvfile for rollback)
  if (rollbackConfig.targetOrg.username && rollbackConfig.targetOrg.instanceUrl) {
    exportJson.targetOrg = {
      username: rollbackConfig.targetOrg.username,
      instanceUrl: rollbackConfig.targetOrg.instanceUrl
    };
    if (rollbackConfig.targetOrg.accessToken) {
      exportJson.targetOrg.accessToken = rollbackConfig.targetOrg.accessToken;
    }
  }

  // Set excludeIdsFromCSVFiles if any CSV files don't have Id column
  // According to SFDMU documentation (https://help.sfdmu.com/examples/csv-import-export):
  // "Since you omit Id column in the CSV, you have to set excludeIdsFromCSVFiles: true"
  // 
  // Note: Our backup CSV files are created from queries and typically include Id column.
  // This flag is set only if we detect CSV files without Id column.
  if (hasCSVWithoutId) {
    exportJson.excludeIdsFromCSVFiles = true;
  }
  
  // Note on Composite External IDs in CSV:
  // According to SFDMU docs, composite external IDs in CSV should use format:
  // Column header: Account.$$Key1__c$Key2__c
  // Value: "Key1;Key2"
  // However, our backup CSV files export individual fields from queries, so each
  // composite field is in its own column (Key1__c, Key2__c), which is also valid.

  // Write export.json
  const exportPath = path.join(rollbackDir, 'export.json');
  await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');

  return rollbackDir;
}
