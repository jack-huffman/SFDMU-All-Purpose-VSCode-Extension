import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileSystemItem, getConfigTree, getConfigDir } from '../utils/fileUtils';

export class ConfigTreeItem extends vscode.TreeItem {
  constructor(
    public readonly item: FileSystemItem, 
    public readonly isRootItem: boolean = false,
    public readonly mode?: 'standard' | 'cpq' | 'rca'
  ) {
    super(
      item.name,
      item.type === 'folder'
        ? (isRootItem 
            ? vscode.TreeItemCollapsibleState.Expanded  // Root folders start expanded
            : vscode.TreeItemCollapsibleState.Collapsed) // Nested folders start collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    // Show full relative path on hover
    this.tooltip = item.path;

    // For files, use file-code codicon with color based on mode
    if (item.type === 'file') {
      let iconColor: vscode.ThemeColor;
      switch (mode) {
        case 'cpq':
          iconColor = new vscode.ThemeColor('charts.green');
          break;
        case 'rca':
          iconColor = new vscode.ThemeColor('charts.orange');
          break;
        case 'standard':
        default:
          iconColor = new vscode.ThemeColor('textLink.foreground');
          break;
      }
      this.iconPath = new vscode.ThemeIcon('file-code', iconColor);
    }

    this.contextValue = item.type === 'folder' ? 'sfdmuFolder' : 'sfdmuConfig';
  }
}

export class ConfigTreeProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ConfigTreeItem | undefined | void
  >();

  readonly onDidChangeTreeData: vscode.Event<ConfigTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(private readonly workspaceFolder: vscode.WorkspaceFolder | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConfigTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConfigTreeItem): Promise<ConfigTreeItem[]> {
    if (!this.workspaceFolder) {
      return [];
    }

    // Root items
    if (!element) {
      const tree = await getConfigTree(this.workspaceFolder);
      return Promise.all(tree.map((item) => this.toTreeItem(item, true))); // true = isRootItem
    }

    const children = element.item.children || [];
    return Promise.all(children.map((child) => this.toTreeItem(child, false))); // false = not root item
  }

  private async toTreeItem(item: FileSystemItem, isRootItem: boolean): Promise<ConfigTreeItem> {
    let mode: 'standard' | 'cpq' | 'rca' | undefined = undefined;
    
    // Read the config file to determine its mode
    if (item.type === 'file' && this.workspaceFolder) {
      try {
        const configDir = await getConfigDir(this.workspaceFolder);
        const configPath = path.join(configDir, `${item.path}.json`);
        
        try {
          await fs.access(configPath);
          const configContent = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(configContent);
          mode = config.mode || 'standard';
        } catch {
          // If we can't read the file, default to standard mode
          mode = 'standard';
        }
      } catch (error) {
        // If we can't get config dir, default to standard mode
        mode = 'standard';
      }
    }
    
    const treeItem = new ConfigTreeItem(item, isRootItem, mode);

    // Double-click / Enter on a config opens it in the migration panel
    if (item.type === 'file') {
      treeItem.command = {
        command: 'sfdmu-all-purpose.openConfigFromTree',
        title: 'Open Configuration',
        arguments: [treeItem],
      };
    }

    return treeItem;
  }
}

export class ConfigDragAndDropController implements vscode.TreeDragAndDropController<ConfigTreeItem> {
  dragMimeTypes = ['application/vnd.code.tree.sfdmuMigration'];
  dropMimeTypes = ['application/vnd.code.tree.sfdmuMigration'];

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder | undefined,
    private readonly treeProvider: ConfigTreeProvider
  ) {}

  async handleDrag(
    source: readonly ConfigTreeItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Serialize the dragged items
    const items = source.map((item) => ({
      path: item.item.path,
      type: item.item.type,
      name: item.item.name,
    }));
    dataTransfer.set('application/vnd.code.tree.sfdmuMigration', new vscode.DataTransferItem(items));
  }

  async handleDrop(
    target: ConfigTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!this.workspaceFolder) {
      return;
    }

    const transferItem = dataTransfer.get('application/vnd.code.tree.sfdmuMigration');
    if (!transferItem) {
      return;
    }

    const items: Array<{ path: string; type: string; name: string }> = transferItem.value;
    if (!items || items.length === 0) {
      return;
    }

    // Determine target folder path
    let targetFolderPath = '';
    if (target) {
      if (target.item.type === 'folder') {
        targetFolderPath = target.item.path;
      } else {
        // If dropping on a file, use its parent folder
        const pathParts = target.item.path.split('/');
        pathParts.pop(); // Remove filename
        targetFolderPath = pathParts.join('/');
      }
    }
    // If target is undefined, we're dropping at root (targetFolderPath remains empty)

    // Import moveConfiguration here to avoid circular dependency
    const { moveConfiguration } = await import('../utils/fileUtils');

    // Move each dragged item
    const movePromises: Promise<void>[] = [];
    for (const item of items) {
      if (item.type === 'file') {
        // Calculate new path
        const newPath = targetFolderPath
          ? `${targetFolderPath}/${item.name}`
          : item.name;

        // Only move if the path actually changed
        if (item.path !== newPath) {
          // Prevent moving a file into a folder that contains it (would create a cycle)
          // This check is mainly for folder moves, but we're only handling files here
          // For files, we just need to ensure we're not moving to the same location

          if (!this.workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            continue;
          }
          
          movePromises.push(
            (async () => {
              try {
                const result = await moveConfiguration(item.path, newPath, this.workspaceFolder!);
                
                if (result.conflict) {
                  // Show conflict resolution dialog
                  const configName = item.name;
                  const displayPath = targetFolderPath ? `${targetFolderPath}/${configName}` : configName;
                  const choice = await vscode.window.showWarningMessage(
                    `A configuration named "${configName}" already exists at "${displayPath}". How would you like to proceed?`,
                    'Keep Both',
                    'Replace',
                    'Cancel'
                  );
                  
                  if (choice === 'Cancel') {
                    return;
                  }
                  
                  const resolution = choice === 'Keep Both' ? 'keepBoth' : 'replace';
                  const retryResult = await moveConfiguration(
                    item.path,
                    newPath,
                    this.workspaceFolder!,
                    resolution
                  );
                  
                  if (!retryResult.moved) {
                    throw new Error('Failed to move configuration');
                  }
                  
                  if (retryResult.finalPath && retryResult.finalPath !== newPath) {
                    vscode.window.showInformationMessage(
                      `Configuration moved to "${retryResult.finalPath}" (renamed to avoid conflict)`
                    );
                  }
                } else if (!result.moved) {
                  throw new Error('Failed to move configuration');
                }
              } catch (error: any) {
                vscode.window.showErrorMessage(
                  `Error moving configuration "${item.path}": ${error.message || String(error)}`
                );
              }
            })()
          );
        }
      }
      // Note: We're not handling folder moves here - folders can be moved via context menu if needed
    }

    // Wait for all moves to complete
    await Promise.all(movePromises);

    // Refresh the tree
    this.treeProvider.refresh();
  }
}


