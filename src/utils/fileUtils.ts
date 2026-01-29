import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { MigrationConfig } from '../models/migrationConfig';

const CONFIG_DIR = path.join('.vscode', 'sfdmu', 'configs');

// Helper function to check if path exists
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getConfigDir(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  const workspacePath = workspaceFolder.uri.fsPath;
  const configPath = path.join(workspacePath, CONFIG_DIR);
  await fs.mkdir(configPath, { recursive: true });
  return configPath;
}

export interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileSystemItem[];
}

export async function getConfigTree(workspaceFolder: vscode.WorkspaceFolder): Promise<FileSystemItem[]> {
  const configDir = await getConfigDir(workspaceFolder);
  
  if (!await pathExists(configDir)) {
    return [];
  }

  async function buildTree(dirPath: string, relativePath: string = ''): Promise<FileSystemItem[]> {
    const items: FileSystemItem[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      // Normalize path to use forward slashes for web UI consistency
      const itemPath = relativePath 
        ? path.join(relativePath, entry.name).replace(/\\/g, '/')
        : entry.name;

      if (entry.isDirectory()) {
        const children = await buildTree(fullPath, itemPath);
        items.push({
          name: entry.name,
          type: 'folder',
          path: itemPath,
          children: children
        });
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Remove .json extension from path for consistency
        const pathWithoutExt = itemPath.endsWith('.json') 
          ? itemPath.slice(0, -5) 
          : itemPath;
        items.push({
          name: path.basename(entry.name, '.json'),
          type: 'file',
          path: pathWithoutExt
        });
      }
    }

    // Sort: folders first, then files, both alphabetically
    return items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return buildTree(configDir);
}

export async function createFolder(
  folderPath: string,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  const configDir = await getConfigDir(workspaceFolder);
  // Normalize folderPath to use OS-specific separators for file system operations
  const normalizedPath = folderPath.replace(/\//g, path.sep);
  const fullPath = path.join(configDir, normalizedPath);
  await fs.mkdir(fullPath, { recursive: true });
}

export async function deleteFolder(
  folderPath: string,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  const configDir = await getConfigDir(workspaceFolder);
  // Normalize folderPath to use OS-specific separators for file system operations
  const normalizedPath = folderPath.replace(/\//g, path.sep);
  const fullPath = path.join(configDir, normalizedPath);
  
  if (await pathExists(fullPath)) {
    await fs.rm(fullPath, { recursive: true, force: true });
  }
}

export async function renameFolder(
  oldPath: string,
  newName: string,
  workspaceFolder: vscode.WorkspaceFolder,
  conflictResolution?: 'replace' | 'keepBoth'
): Promise<{ renamed: boolean; finalPath?: string; conflict?: boolean }> {
  const configDir = await getConfigDir(workspaceFolder);
  // Normalize paths to use OS-specific separators for file system operations
  const normalizedOldPath = oldPath.replace(/\//g, path.sep);
  
  // Extract parent directory and construct new path
  const parentDir = path.dirname(normalizedOldPath);
  const oldName = path.basename(normalizedOldPath);
  
  // Sanitize new name
  const safeNewName = newName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  
  if (safeNewName.length === 0) {
    throw new Error('Folder name cannot be empty');
  }
  
  const oldFullPath = path.join(configDir, normalizedOldPath);
  const newFullPath = parentDir === '.' || parentDir === configDir
    ? path.join(configDir, safeNewName)
    : path.join(configDir, parentDir, safeNewName);
  
  // Check if source exists
  if (!await pathExists(oldFullPath)) {
    throw new Error(`Source folder "${oldPath}" not found`);
  }
  
  // If name hasn't changed, no-op
  if (oldFullPath === newFullPath) {
    const relativePath = parentDir === '.' || parentDir === configDir
      ? safeNewName
      : path.join(parentDir, safeNewName).replace(/\\/g, '/');
    return { renamed: true, finalPath: relativePath };
  }
  
  // Check for conflict
  const exists = await pathExists(newFullPath);
  if (exists && !conflictResolution) {
    const relativePath = parentDir === '.' || parentDir === configDir
      ? safeNewName
      : path.join(parentDir, safeNewName).replace(/\\/g, '/');
    return { renamed: false, conflict: true, finalPath: relativePath };
  }
  
  let finalPath = newFullPath;
  let finalRelativePath = parentDir === '.' || parentDir === configDir
    ? safeNewName
    : path.join(parentDir, safeNewName).replace(/\\/g, '/');
  
  // Handle conflict resolution
  if (exists && conflictResolution === 'keepBoth') {
    const directory = parentDir === '.' || parentDir === configDir ? configDir : path.join(configDir, parentDir);
    const uniqueName = await findUniqueName(safeNewName, directory, '');
    finalPath = path.join(directory, uniqueName);
    finalRelativePath = parentDir === '.' || parentDir === configDir
      ? uniqueName
      : path.join(parentDir, uniqueName).replace(/\\/g, '/');
  }
  
  await fs.rename(oldFullPath, finalPath);
  
  return { renamed: true, finalPath: finalRelativePath };
}

// Helper function to find a unique name by appending a number
async function findUniqueName(
  baseName: string,
  directory: string,
  extension: string = '.json'
): Promise<string> {
  // First check if the base name itself is available
  const basePath = extension ? path.join(directory, `${baseName}${extension}`) : path.join(directory, baseName);
  if (!await pathExists(basePath)) {
    return baseName;
  }
  
  // Pattern to match numbered versions: "BaseName (123)"
  const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\((\\d+)\\)$`);
  
  // Read directory to find all existing numbered versions
  let maxNumber = 0;
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() || entry.isDirectory()) {
        const name = entry.name;
        // Remove extension if checking files
        const nameWithoutExt = extension && name.endsWith(extension) 
          ? name.slice(0, -extension.length) 
          : name;
        
        const match = nameWithoutExt.match(pattern);
        if (match) {
          const number = parseInt(match[1], 10);
          if (number > maxNumber) {
            maxNumber = number;
          }
        }
      }
    }
  } catch (error) {
    // If directory read fails, fall back to sequential checking
    let counter = 1;
    while (true) {
      const uniqueName = `${baseName} (${counter})`;
      const checkPath = extension ? path.join(directory, `${uniqueName}${extension}`) : path.join(directory, uniqueName);
      if (!await pathExists(checkPath)) {
        return uniqueName;
      }
      counter++;
    }
  }
  
  // Find the next available number (could be maxNumber + 1, or a gap in the sequence)
  let nextNumber = maxNumber + 1;
  
  // Check if there are any gaps we should fill first (optional - for cleaner numbering)
  // For now, we'll just use the next sequential number after the max
  // This ensures we always get a unique name and handles any number correctly
  
  return `${baseName} (${nextNumber})`;
}

export async function saveConfiguration(
  config: MigrationConfig,
  workspaceFolder: vscode.WorkspaceFolder,
  folderPath?: string,
  conflictResolution?: 'replace' | 'keepBoth'
): Promise<{ saved: boolean; finalName?: string; conflict?: boolean }> {
  const configDir = await getConfigDir(workspaceFolder);
  const configName = config.configName || 'unnamed-config';
  // Allow spaces and common characters, but sanitize problematic file system characters
  // Remove: / \ : * ? " < > | and control characters
  const safeName = configName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  
  let configPath: string;
  if (folderPath) {
    // Normalize folderPath to use OS-specific separators for file system operations
    const normalizedFolderPath = folderPath.replace(/\//g, path.sep);
    const folderFullPath = path.join(configDir, normalizedFolderPath);
    await fs.mkdir(folderFullPath, { recursive: true });
    configPath = path.join(folderFullPath, `${safeName}.json`);
  } else {
    configPath = path.join(configDir, `${safeName}.json`);
  }
  
  // Check for conflict
  const exists = await pathExists(configPath);
  if (exists && !conflictResolution) {
    // Load the existing config to check if it's the same one being saved
    try {
      const existingContent = await fs.readFile(configPath, 'utf8');
      const existingConfig = JSON.parse(existingContent) as MigrationConfig;
      
      // Compare key properties to determine if it's the same config
      // If source/target orgs match, it's likely the same config
      const isSameConfig = 
        existingConfig.sourceOrg?.username === config.sourceOrg?.username &&
        existingConfig.sourceOrg?.instanceUrl === config.sourceOrg?.instanceUrl &&
        existingConfig.targetOrg?.username === config.targetOrg?.username &&
        existingConfig.targetOrg?.instanceUrl === config.targetOrg?.instanceUrl &&
        existingConfig.mode === config.mode;
      
      // If it's the same config, no conflict - allow saving (will overwrite)
      if (!isSameConfig) {
        // Different config with same name - conflict
        return { saved: false, conflict: true };
      }
      // If it's the same config, continue with save (will overwrite the existing file)
    } catch (error) {
      // If we can't load the existing file, treat it as a conflict to be safe
      return { saved: false, conflict: true };
    }
  }
  
  let finalName = safeName;
  let finalPath = configPath;
  
  // Handle conflict resolution
  if (exists && conflictResolution === 'keepBoth') {
    const directory = folderPath 
      ? path.join(configDir, folderPath.replace(/\//g, path.sep))
      : configDir;
    finalName = await findUniqueName(safeName, directory);
    finalPath = path.join(directory, `${finalName}.json`);
  }
  
  // Update config name to match the final saved name (including folder path if present)
  const fullConfigName = folderPath ? `${folderPath}/${finalName}` : finalName;
  if (config.configName !== fullConfigName) {
    config.configName = fullConfigName;
  }
  
  // Sanitize config before saving to ensure valid JSON
  // Remove any circular references, functions, or undefined values
  const sanitizedConfig = sanitizeForJSON(config);
  
  await fs.writeFile(finalPath, JSON.stringify(sanitizedConfig, null, 2), 'utf8');
  
  return { saved: true, finalName: finalName };
}

/**
 * Sanitize an object for JSON serialization
 * Removes circular references, functions, and undefined values
 */
function sanitizeForJSON(obj: any, seen = new WeakSet()): any {
  // Handle null and primitives
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForJSON(item, seen));
  }
  
  // Handle circular references
  if (seen.has(obj)) {
    return null; // Replace circular reference with null
  }
  seen.add(obj);
  
  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  // Handle plain objects
  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      // Skip undefined values
      if (value === undefined) {
        continue;
      }
      
      // Skip functions
      if (typeof value === 'function') {
        continue;
      }
      
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForJSON(value, seen);
    }
  }
  
  seen.delete(obj);
  return sanitized;
}

export async function loadConfiguration(
  configPath: string,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<MigrationConfig> {
  const configDir = await getConfigDir(workspaceFolder);
  // Normalize configPath to use OS-specific separators for file system operations
  const normalizedPath = configPath.replace(/\//g, path.sep);
  const fullPath = path.join(configDir, `${normalizedPath}.json`);
  
  if (!await pathExists(fullPath)) {
    throw new Error(`Configuration "${configPath}" not found`);
  }
  
  const content = await fs.readFile(fullPath, 'utf8');
  
  // Try to parse JSON - if there's trailing content, try to extract just the JSON
  try {
    return JSON.parse(content) as MigrationConfig;
  } catch (error: any) {
    // If parsing fails, try to extract just the first valid JSON object
    // This handles cases where there might be trailing content
    const jsonMatch = content.match(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]) as MigrationConfig;
      } catch (e) {
        // If that also fails, throw the original error
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
    }
    throw new Error(`Invalid JSON in configuration file: ${error.message}`);
  }
}

export async function listConfigurations(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<string[]> {
  const tree = await getConfigTree(workspaceFolder);
  
  function collectConfigPaths(items: FileSystemItem[], prefix: string = ''): string[] {
    const paths: string[] = [];
    for (const item of items) {
      const fullPath = prefix ? path.join(prefix, item.name) : item.name;
      if (item.type === 'file') {
        paths.push(fullPath);
      } else if (item.children) {
        paths.push(...collectConfigPaths(item.children, fullPath));
      }
    }
    return paths;
  }
  
  return collectConfigPaths(tree);
}

export async function deleteConfiguration(
  configPath: string,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  const configDir = await getConfigDir(workspaceFolder);
  
  // The configPath from the UI uses forward slashes (e.g., "ClientName/ConfigName")
  // and should NOT include .json extension (it's removed in getConfigTree)
  // We need to normalize it to OS-specific separators for file system operations
  const normalizedPath = configPath.replace(/\//g, path.sep);
  
  // Ensure .json extension is not included (should already be removed, but be safe)
  const pathWithoutExt = normalizedPath.endsWith('.json') 
    ? normalizedPath.slice(0, -5) 
    : normalizedPath;
  
  const fullPath = path.join(configDir, `${pathWithoutExt}.json`);
  
  if (!await pathExists(fullPath)) {
    // If still not found, throw an error with helpful message
    throw new Error(`Configuration file not found: ${fullPath}`);
  }
  
  await fs.unlink(fullPath);
}

export async function moveConfiguration(
  oldPath: string,
  newPath: string,
  workspaceFolder: vscode.WorkspaceFolder,
  conflictResolution?: 'replace' | 'keepBoth'
): Promise<{ moved: boolean; finalPath?: string; conflict?: boolean }> {
  const configDir = await getConfigDir(workspaceFolder);
  // Normalize paths to use OS-specific separators for file system operations
  const normalizedOldPath = oldPath.replace(/\//g, path.sep);
  const normalizedNewPath = newPath.replace(/\//g, path.sep);
  const oldFullPath = path.join(configDir, `${normalizedOldPath}.json`);
  const newFullPath = path.join(configDir, `${normalizedNewPath}.json`);
  
  // Create parent directory if needed
  const newDir = path.dirname(newFullPath);
  if (newDir !== configDir) {
    await fs.mkdir(newDir, { recursive: true });
  }
  
  // Check if source exists
  if (!await pathExists(oldFullPath)) {
    throw new Error(`Source configuration "${oldPath}" not found`);
  }
  
  // Check for conflict (destination exists and it's not the same file)
  const exists = await pathExists(newFullPath);
  if (exists && oldFullPath !== newFullPath && !conflictResolution) {
    return { moved: false, conflict: true };
  }
  
  let finalPath = newFullPath;
  let finalRelativePath = newPath;
  
  // Handle conflict resolution
  if (exists && oldFullPath !== newFullPath && conflictResolution === 'keepBoth') {
    // Extract base name and directory
    const baseName = path.basename(normalizedNewPath);
    const directory = newDir;
    const uniqueName = await findUniqueName(baseName, directory);
    finalPath = path.join(directory, `${uniqueName}.json`);
    // Reconstruct relative path with unique name
    const relativeDir = path.relative(configDir, directory).replace(/\\/g, '/');
    finalRelativePath = relativeDir ? `${relativeDir}/${uniqueName}` : uniqueName;
  }
  
  if (await pathExists(oldFullPath)) {
    await fs.rename(oldFullPath, finalPath);
  }
  
  return { moved: true, finalPath: finalRelativePath };
}

export async function exportConfiguration(config: MigrationConfig): Promise<string> {
  return JSON.stringify(config, null, 2);
}

export async function importConfiguration(jsonString: string): Promise<MigrationConfig> {
  try {
    return JSON.parse(jsonString) as MigrationConfig;
  } catch (error) {
    throw new Error('Invalid JSON format');
  }
}

