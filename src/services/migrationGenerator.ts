import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationConfig, MigrationObject, DEFAULT_EXCLUDED_OBJECTS } from '../models/migrationConfig';
import { generateSOQLQuery } from './queryGenerator';
import { getOrgApiVersion } from './orgService';

/**
 * Generate migration file based on user-defined objects
 */
export async function generateMigrationFiles(config: MigrationConfig): Promise<void> {
  const outputDir = path.resolve(config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  
  if (!config.objects || config.objects.length === 0) {
    throw new Error('No objects configured for migration. Please add at least one object.');
  }
  
  // Sort objects by name for consistency
  const sortedObjects = [...config.objects].sort((a, b) => a.objectName.localeCompare(b.objectName));
  
  // Define excluded objects
  // Use config.excludedObjects if provided, otherwise use defaults
  const excludedObjects = config.excludedObjects ? [...config.excludedObjects] : [...DEFAULT_EXCLUDED_OBJECTS];
  
  const exportJson: any = {
    objects: [],
    excludedObjects: excludedObjects
  };
  
  // Try to get API version from source org (use target org as fallback)
  let apiVersion: string | null = null;
  if (config.sourceOrg.alias) {
    try {
      apiVersion = await getOrgApiVersion(config.sourceOrg.alias);
    } catch (error) {
      // If source org fails, try target org
      if (config.targetOrg.alias) {
        try {
          apiVersion = await getOrgApiVersion(config.targetOrg.alias);
        } catch (error2) {
          // If both fail, we'll skip adding org-api-version
        }
      }
    }
  } else if (config.targetOrg.alias) {
    try {
      apiVersion = await getOrgApiVersion(config.targetOrg.alias);
    } catch (error) {
      // If we can't get API version, we'll skip adding it
    }
  }
  
  // Add org-api-version if we successfully retrieved it
  // Note: We use 'org-api-version' (not 'apiVersion') to avoid deprecation warnings
  if (apiVersion) {
    exportJson['org-api-version'] = apiVersion;
    // Explicitly remove any old apiVersion field if it exists (shouldn't happen, but just in case)
    delete exportJson['apiVersion'];
  }
  
  // Add ScriptOrg objects if provided
  if (config.sourceOrg.username && config.sourceOrg.instanceUrl) {
    exportJson.sourceOrg = {
      username: config.sourceOrg.username,
      instanceUrl: config.sourceOrg.instanceUrl
    };
    if (config.sourceOrg.accessToken) {
      exportJson.sourceOrg.accessToken = config.sourceOrg.accessToken;
    }
  }
  
  if (config.targetOrg.username && config.targetOrg.instanceUrl) {
    exportJson.targetOrg = {
      username: config.targetOrg.username,
      instanceUrl: config.targetOrg.instanceUrl
    };
    if (config.targetOrg.accessToken) {
      exportJson.targetOrg.accessToken = config.targetOrg.accessToken;
    }
  }
  
  // Add objects
  for (const obj of sortedObjects) {
    const soqlQuery = generateSOQLQuery(
      obj,
      config.modifiedSince
    );
    
    const scriptObject: any = {
      query: soqlQuery,
      operation: config.operation,
      externalId: obj.externalId
    };
    
    exportJson.objects.push(scriptObject);
  }
  
  // Write export.json to output directory (single file, not in phase folders)
  const exportPath = path.join(outputDir, 'export.json');
  await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
}

