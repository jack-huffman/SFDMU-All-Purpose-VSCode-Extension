import { exec } from 'child_process';
import { promisify } from 'util';
import { OrgInfo } from '../models/migrationConfig';

const execAsync = promisify(exec);

interface SFOrgListResult {
  status?: number;
  result?: {
    other?: Array<{
      alias?: string;
      username: string;
      instanceUrl?: string;
    }>;
    nonScratchOrgs?: Array<{
      alias?: string;
      username: string;
      instanceUrl?: string;
    }>;
    scratchOrgs?: Array<{
      alias?: string;
      username: string;
      instanceUrl?: string;
    }>;
  };
  nonScratchOrgs?: Array<{
    alias?: string;
    username: string;
    instanceUrl?: string;
  }>;
  scratchOrgs?: Array<{
    alias?: string;
    username: string;
    instanceUrl?: string;
  }>;
}

interface SFOrgDisplayResult {
  result?: {
    alias?: string;
    username: string;
    instanceUrl: string;
    accessToken?: string;
  };
}

export async function getOrgList(): Promise<OrgInfo[]> {
  try {
    const { stdout, stderr } = await execAsync('sf org list --json', {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // SF CLI sometimes outputs JSON to stderr, check both
    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return [];
    }
    
    const parsed = JSON.parse(jsonOutput);
    
    // Handle different response structures
    // SF CLI v2+ wraps results in a 'result' property with status
    let orgData: any;
    if (parsed.result) {
      orgData = parsed.result;
    } else {
      orgData = parsed;
    }
    
    const orgs: OrgInfo[] = [];
    
    // Process 'other' orgs (most common in newer SF CLI versions)
    if (orgData.other && Array.isArray(orgData.other)) {
      for (const org of orgData.other) {
        if (org.username) {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            instanceUrl: org.instanceUrl || 'https://login.salesforce.com'
          });
        }
      }
    }
    
    // Process non-scratch orgs
    if (orgData.nonScratchOrgs && Array.isArray(orgData.nonScratchOrgs)) {
      for (const org of orgData.nonScratchOrgs) {
        if (org.username) {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            instanceUrl: org.instanceUrl || 'https://login.salesforce.com'
          });
        }
      }
    }
    
    // Process scratch orgs
    if (orgData.scratchOrgs && Array.isArray(orgData.scratchOrgs)) {
      for (const org of orgData.scratchOrgs) {
        if (org.username) {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            instanceUrl: org.instanceUrl || 'https://test.salesforce.com'
          });
        }
      }
    }
    
    // Also check for direct array format (some SF CLI versions)
    if (Array.isArray(orgData) && orgData.length > 0) {
      for (const org of orgData) {
        if (org.username) {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            instanceUrl: org.instanceUrl || 'https://login.salesforce.com'
          });
        }
      }
    }
    
    // Sort orgs alphabetically by alias (or username if no alias)
    orgs.sort((a, b) => {
      const aName = (a.alias || a.username).toLowerCase();
      const bName = (b.alias || b.username).toLowerCase();
      return aName.localeCompare(bName);
    });
    
    return orgs;
  } catch (error: any) {
    // If SF CLI is not available or command fails, return empty array
    if (error.code === 'ENOENT' || error.message.includes('not found')) {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    
    // Log the actual error for debugging
    console.error('Error fetching org list:', error.message);
    if (error.stdout) console.error('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    
    throw new Error(`Failed to fetch org list: ${error.message}`);
  }
}

export async function getOrgDetails(alias: string): Promise<OrgInfo> {
  try {
    const { stdout } = await execAsync(`sf org display --target-org "${alias}" --json`);
    const result: SFOrgDisplayResult = JSON.parse(stdout);
    
    if (!result.result) {
      throw new Error(`No org found with alias: ${alias}`);
    }
    
    return {
      alias: result.result.alias || result.result.username,
      username: result.result.username,
      instanceUrl: result.result.instanceUrl,
      accessToken: result.result.accessToken
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Salesforce CLI (sf) is not installed or not in PATH');
    }
    throw new Error(`Failed to fetch org details: ${error.message}`);
  }
}

/**
 * Get the API version from an org
 */
export async function getOrgApiVersion(orgAlias: string): Promise<string | null> {
  try {
    const query = `SELECT ApiVersion FROM Organization LIMIT 1`;
    const { stdout, stderr } = await execAsync(
      `sf data query --query "${query}" --target-org "${orgAlias}" --json`,
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const jsonOutput = stdout || stderr;
    if (!jsonOutput || jsonOutput.trim() === '') {
      return null;
    }

    const result = JSON.parse(jsonOutput);
    const records = result.result?.records || result.records || [];
    
    if (records.length > 0 && records[0].ApiVersion) {
      return records[0].ApiVersion.toString();
    }
    
    return null;
  } catch (error: any) {
    // If we can't get the API version, return null (SFDMU will use default)
    console.warn(`Could not fetch API version for org ${orgAlias}: ${error.message}`);
    return null;
  }
}

