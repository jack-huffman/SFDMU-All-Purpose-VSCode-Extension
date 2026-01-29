import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { OrgConfig, DeploymentResult, MetadataDeploymentConfig } from '../models/migrationConfig';

const execAsync = promisify(exec);

/**
 * Check if metadata object exists in target org
 */
export async function checkMetadataExists(
  metadataType: string,
  externalIdField: string,
  orgAlias: string
): Promise<boolean> {
  try {
    // Query for metadata records using Tooling API via Salesforce CLI
    const soql = `SELECT Id FROM ${metadataType} WHERE ${externalIdField} != null LIMIT 1`;
    
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${soql}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return false;
    }
    
    const result = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];
    
    return records.length > 0;
  } catch (error: any) {
    // If query fails, assume metadata doesn't exist
    console.warn(`Could not check metadata existence for ${metadataType}: ${error.message}`);
    return false;
  }
}

/**
 * Extract metadata records from source org
 * Uses Salesforce CLI to retrieve metadata
 */
export async function extractMetadataFromSource(
  metadataType: string,
  referencedIds: string[],
  sourceOrg: OrgConfig
): Promise<any[]> {
  try {
    // Build SOQL query to get referenced metadata records
    const externalIdField = getExternalIdFieldForMetadataType(metadataType);
    if (!externalIdField) {
      throw new Error(`Unknown external ID field for metadata type: ${metadataType}`);
    }
    
    const idsList = referencedIds.map(id => `'${id}'`).join(', ');
    const soql = `SELECT FIELDS(ALL) FROM ${metadataType} WHERE ${externalIdField} IN (${idsList})`;
    
    const orgIdentifier = sourceOrg.alias || sourceOrg.username;
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${soql}" --target-org "${orgIdentifier}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const result = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];
    
    return records;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    throw new Error(`Failed to extract metadata from source: ${error.message}`);
  }
}

/**
 * Deploy metadata records to target org using Salesforce CLI
 * Uses sf project deploy or sf metadata deploy commands
 */
export async function deployMetadataToTarget(
  metadataType: string,
  metadataRecords: any[],
  targetOrg: OrgConfig
): Promise<DeploymentResult> {
  if (metadataRecords.length === 0) {
    return {
      success: true,
      deployedRecords: 0,
      errors: []
    };
  }
  
  try {
    // For Custom Metadata Types, we need to use Metadata API
    // Create a temporary metadata package
    const tempDir = os.tmpdir();
    const packageDir = path.join(tempDir, `metadata-deploy-${Date.now()}`);
    
    await fs.mkdir(packageDir, { recursive: true });
    
    // Create package.xml
    const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>*</members>
    <name>${metadataType}</name>
  </types>
  <version>60.0</version>
</Package>`;
    
    await fs.writeFile(path.join(packageDir, 'package.xml'), packageXml);
    
    // Create metadata folder structure
    const metadataFolder = path.join(packageDir, metadataType);
    await fs.mkdir(metadataFolder, { recursive: true });
    
    // Write metadata records as XML files
    const externalIdField = getExternalIdFieldForMetadataType(metadataType);
    for (const record of metadataRecords) {
      const fileName = `${record[externalIdField!]}.${metadataType}-meta.xml`;
      const filePath = path.join(metadataFolder, fileName);
      
      // Convert record to metadata XML format
      const xmlContent = convertRecordToMetadataXml(record, metadataType);
      await fs.writeFile(filePath, xmlContent);
    }
    
    // Deploy using sf project deploy
    const orgIdentifier = targetOrg.alias || targetOrg.username;
    const { stdout, stderr } = await execAsync(
      `sf project deploy start --source-dir "${packageDir}" --target-org "${orgIdentifier}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    // Clean up temp directory
    await fs.rm(packageDir, { recursive: true, force: true }).catch(() => {});
    
    const jsonOutput = stdout || stderr;
    const result = JSON.parse(jsonOutput);
    
    if (result.status === 0 && result.result?.status === 'Succeeded') {
      return {
        success: true,
        deployedRecords: metadataRecords.length,
        errors: []
      };
    } else {
      const errors = result.result?.details?.componentFailures || [];
      const errorMessages = errors.map((e: any) => e.problem || e.message || 'Unknown error');
      
      return {
        success: false,
        deployedRecords: 0,
        errors: errorMessages
      };
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    return {
      success: false,
      deployedRecords: 0,
      errors: [error.message || 'Unknown deployment error']
    };
  }
}

/**
 * Deploy metadata prerequisites for RCA migration
 * Checks and deploys DecisionMatrixDefinition and ExpressionSet before Phase 7
 */
export async function deployMetadataPrerequisites(
  sourceOrg: OrgConfig,
  targetOrg: OrgConfig
): Promise<DeploymentResult> {
  const metadataTypes: MetadataDeploymentConfig[] = [
    {
      metadataType: 'DecisionMatrixDefinition',
      externalIdField: 'DeveloperName',
      deployBeforePhase: 7,
      required: true
    },
    {
      metadataType: 'ExpressionSet',
      externalIdField: 'ApiName',
      deployBeforePhase: 7,
      required: true
    }
  ];
  
  const allErrors: string[] = [];
  let totalDeployed = 0;
  
  for (const metadataConfig of metadataTypes) {
    try {
      // Check if already exists in target
      const targetOrgAlias = targetOrg.alias || targetOrg.username;
      const exists = await checkMetadataExists(
        metadataConfig.metadataType,
        metadataConfig.externalIdField,
        targetOrgAlias
      );
      
      if (exists) {
        continue;
      }
      
      // Extract all records from source (for now, get all - in future, can filter by referenced IDs)
      const sourceOrgAlias = sourceOrg.alias || sourceOrg.username;
      const allRecords = await extractAllMetadataFromSource(
        metadataConfig.metadataType,
        metadataConfig.externalIdField,
        sourceOrgAlias
      );
      
      if (allRecords.length === 0) {
        continue;
      }
      
      // Deploy to target
      const result = await deployMetadataToTarget(
        metadataConfig.metadataType,
        allRecords,
        targetOrg
      );
      
      if (result.success) {
        totalDeployed += result.deployedRecords;
      } else {
        allErrors.push(...result.errors.map(e => `${metadataConfig.metadataType}: ${e}`));
      }
    } catch (error: any) {
      allErrors.push(`${metadataConfig.metadataType}: ${error.message}`);
    }
  }
  
  return {
    success: allErrors.length === 0,
    deployedRecords: totalDeployed,
    errors: allErrors
  };
}

/**
 * Extract all metadata records from source org (for initial deployment)
 */
async function extractAllMetadataFromSource(
  metadataType: string,
  externalIdField: string,
  sourceOrgAlias: string
): Promise<any[]> {
  try {
    const soql = `SELECT FIELDS(ALL) FROM ${metadataType} WHERE ${externalIdField} != null`;
    
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${soql}" --target-org "${sourceOrgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const result = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];
    
    return records;
  } catch (error: any) {
    console.warn(`Could not extract all metadata for ${metadataType}: ${error.message}`);
    return [];
  }
}

/**
 * Get external ID field for a metadata type
 */
function getExternalIdFieldForMetadataType(metadataType: string): string | null {
  const mapping: Record<string, string> = {
    'DecisionMatrixDefinition': 'DeveloperName',
    'ExpressionSet': 'ApiName'
  };
  
  return mapping[metadataType] || null;
}

/**
 * Convert a record to metadata XML format
 * This is a simplified version - full implementation would handle all field types
 */
function convertRecordToMetadataXml(record: any, metadataType: string): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<${metadataType} xmlns="http://soap.sforce.com/2006/04/metadata">\n`;
  
  // Add all fields from record
  for (const [key, value] of Object.entries(record)) {
    // Skip system fields
    if (key === 'Id' || key === 'attributes' || key.startsWith('_')) {
      continue;
    }
    
    if (value !== null && value !== undefined) {
      const escapedValue = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      xml += `  <${key}>${escapedValue}</${key}>\n`;
    }
  }
  
  xml += `</${metadataType}>`;
  return xml;
}

