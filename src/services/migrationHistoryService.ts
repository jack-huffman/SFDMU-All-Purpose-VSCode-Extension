import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationConfig, MigrationHistory, MigrationHistoryObject, SFDMUResult } from '../models/migrationConfig';
import * as vscode from 'vscode';

/**
 * Save migration execution history
 */
export async function saveMigrationHistory(
  config: MigrationConfig,
  result: SFDMUResult,
  backupLocation?: string,
  phaseNumber?: number
): Promise<MigrationHistory> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }

  const historyDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'sfdmu', 'history');
  // Ensure directory exists (including parent directories)
  await fs.mkdir(historyDir, { recursive: true });

  // Generate unique ID
  // Sanitize config name to remove path separators and invalid filename characters
  const sanitizeConfigName = (name: string): string => {
    return name
      .replace(/\//g, '_')  // Replace slashes with underscores
      .replace(/\\/g, '_')   // Replace backslashes with underscores
      .replace(/[<>:"|?*\x00-\x1f]/g, '_') // Replace invalid filename characters
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .substring(0, 100);    // Limit length
  };
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedConfigName = config.configName ? sanitizeConfigName(config.configName) : 'migration';
  const id = `${timestamp}_${sanitizedConfigName}${phaseNumber ? `_phase${phaseNumber}` : ''}`;

  // Parse SFDMU output to extract per-object record counts
  const objects = parseSFDMUOutput(result.output, config);

  const history: MigrationHistory = {
    id,
    configName: config.configName || 'unnamed',
    mode: config.mode || 'standard',
    sourceOrg: config.sourceOrg,
    targetOrg: config.targetOrg,
    timestamp: new Date().toISOString(),
    operation: config.operation,
    phaseNumber: phaseNumber,
    objects: objects,
    backupLocation: backupLocation,
    status: result.success ? 'completed' : (result.errors && result.errors.length > 0 ? 'partial' : 'failed'),
    recordsProcessed: result.recordsProcessed,
    errors: result.errors
  };

  // Save to file
  const historyPath = path.join(historyDir, `${id}.json`);
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');

  return history;
}

/**
 * Parse SFDMU output to extract per-object record counts
 */
function parseSFDMUOutput(output: string, config: MigrationConfig): MigrationHistoryObject[] {
  const objects: MigrationHistoryObject[] = [];
  const mode = config.mode || 'standard';

  // Get objects from config
  const configObjects = mode === 'standard' 
    ? config.objects 
    : []; // For CPQ/RCA, we'd need to read from export.json

  // Try to parse SFDMU output for record counts
  // SFDMU output format varies, so we'll try multiple patterns
  const lines = output.split('\n');

  for (const obj of configObjects) {
    const objectName = obj.objectName;
    const operation = obj.operation || config.operation || 'Upsert';
    const externalId = obj.externalId;

    // Look for patterns like:
    // "Account: 10 records inserted, 5 records updated"
    // "Account: 15 records processed"
    // "[Account] Inserted: 10, Updated: 5"
    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    let failed = 0;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes(objectName.toLowerCase())) {
        // Try to extract numbers
        const insertedMatch = line.match(/(\d+)\s+records?\s+inserted/i) || 
                            line.match(/inserted[:\s]+(\d+)/i);
        if (insertedMatch) {
          inserted = parseInt(insertedMatch[1], 10);
        }

        const updatedMatch = line.match(/(\d+)\s+records?\s+updated/i) ||
                           line.match(/updated[:\s]+(\d+)/i);
        if (updatedMatch) {
          updated = parseInt(updatedMatch[1], 10);
        }

        const deletedMatch = line.match(/(\d+)\s+records?\s+deleted/i) ||
                           line.match(/deleted[:\s]+(\d+)/i);
        if (deletedMatch) {
          deleted = parseInt(deletedMatch[1], 10);
        }

        const failedMatch = line.match(/(\d+)\s+records?\s+failed/i) ||
                           line.match(/failed[:\s]+(\d+)/i) ||
                           line.match(/errors?[:\s]+(\d+)/i);
        if (failedMatch) {
          failed = parseInt(failedMatch[1], 10);
        }
      }
    }

    objects.push({
      objectName,
      operation: operation as any,
      externalId,
      recordsAffected: {
        inserted: inserted > 0 ? inserted : undefined,
        updated: updated > 0 ? updated : undefined,
        deleted: deleted > 0 ? deleted : undefined,
        failed: failed > 0 ? failed : undefined
      }
    });
  }

  return objects;
}

/**
 * Get migration history for a configuration
 */
export async function getMigrationHistory(configName?: string): Promise<MigrationHistory[]> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return [];
  }

  const historyDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'sfdmu', 'history');
  
  try {
    await fs.access(historyDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(historyDir);
  const histories: MigrationHistory[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const filePath = path.join(historyDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const history = JSON.parse(content) as MigrationHistory;

        if (!configName || history.configName === configName) {
          histories.push(history);
        }
      } catch (error) {
        // Skip invalid files
        console.warn(`Failed to load history file ${file}:`, error);
      }
    }
  }

  // Sort by timestamp (newest first)
  histories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return histories;
}

/**
 * Get migration history by ID
 */
export async function getMigrationHistoryById(id: string): Promise<MigrationHistory | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }

  const historyDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'sfdmu', 'history');
  const historyPath = path.join(historyDir, `${id}.json`);

  try {
    const content = await fs.readFile(historyPath, 'utf8');
    return JSON.parse(content) as MigrationHistory;
  } catch {
    return null;
  }
}
