import * as vscode from 'vscode';
import { MigrationPanel } from './webview/migrationPanel';
import { ConfigTreeProvider, ConfigTreeItem, ConfigDragAndDropController } from './services/configTreeProvider';
import {
  createFolder,
  deleteConfiguration,
  deleteFolder,
  renameFolder,
  moveConfiguration,
} from './utils/fileUtils';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Register Tree View provider for the "SFDMU Migration" view contributed in package.json
  const configTreeProvider = new ConfigTreeProvider(workspaceFolder);
  const dragAndDropController = new ConfigDragAndDropController(workspaceFolder, configTreeProvider);
  
  // Create tree view with drag and drop support
  const treeView = vscode.window.createTreeView('sfdmuMigration', {
    treeDataProvider: configTreeProvider,
    dragAndDropController: dragAndDropController,
    showCollapseAll: true,
  });

  // Helper function to expand tree items
  const expandTreeItems = async () => {
    try {
      const rootItems = await configTreeProvider.getChildren(undefined);
      
      if (rootItems.length === 0) {
        // No items to expand
        return;
      }
      
      // Reveal the first item with focus to ensure the section expands
      // This is more likely to expand the tree view section in the Explorer sidebar
      if (rootItems.length > 0) {
        try {
          await treeView.reveal(rootItems[0], { expand: true, focus: true, select: false });
        } catch (error) {
          // If focus fails, try without focus
          try {
            await treeView.reveal(rootItems[0], { expand: true, focus: false, select: false });
          } catch (error2) {
            // Continue with other items
          }
        }
      }
      
      // Expand remaining root items
      for (let i = 1; i < rootItems.length; i++) {
        try {
          await treeView.reveal(rootItems[i], { expand: true, focus: false, select: false });
        } catch (error) {
          // Continue with next item if one fails
        }
      }
    } catch (error) {
      // Silently fail if tree items aren't ready yet
    }
  };

  // Helper function to reveal and expand the tree view
  const revealTreeView = async () => {
    try {
      // Refresh the tree to ensure it's loaded
      configTreeProvider.refresh();
      
      // Focus the explorer sidebar (where the tree view is located)
      await vscode.commands.executeCommand('workbench.view.explorer');
      
      // Wait for the tree to be ready, then expand root items
      // Use a longer delay and retry mechanism
      let retries = 0;
      const maxRetries = 15;
      
      const tryExpand = async () => {
        try {
          // Check if tree view is visible
          if (!treeView.visible) {
            if (retries < maxRetries) {
              retries++;
              setTimeout(tryExpand, 250);
              return;
            }
            // If still not visible after max retries, try expanding anyway
          }

          // Small delay to ensure tree is fully rendered
          await new Promise(resolve => setTimeout(resolve, 100));
          
          await expandTreeItems();
        } catch (error) {
          // Retry if tree items aren't ready yet
          if (retries < maxRetries) {
            retries++;
            setTimeout(tryExpand, 250);
          }
        }
      };
      
      // Also listen for visibility changes
      const visibilityDisposable = treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
          // When tree becomes visible, expand items after a short delay
          setTimeout(() => {
            expandTreeItems();
          }, 150);
        }
      });
      context.subscriptions.push(visibilityDisposable);
      
      // Start trying to expand after initial delay
      setTimeout(tryExpand, 500);
    } catch (error) {
      // Silently fail if view command doesn't exist or view isn't available
    }
  };

  // Watch for changes under .vscode/sfdmu/configs so the tree stays in sync
  if (workspaceFolder) {
    const pattern = new vscode.RelativePattern(
      workspaceFolder,
      '.vscode/sfdmu/configs/**/*.json'
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(() => configTreeProvider.refresh());
    watcher.onDidChange(() => configTreeProvider.refresh());
    watcher.onDidDelete(() => configTreeProvider.refresh());
    context.subscriptions.push(watcher);
  }

  // Command to open the migration panel (existing behavior)
  const openPanelDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.openMigrationPanel',
    () => {
      MigrationPanel.createOrShow(context.extensionUri);
      // Reveal tree view when panel is opened
      revealTreeView();
    }
  );

  // Open a configuration from the tree view in the migration panel
  const openConfigDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.openConfigFromTree',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      const panel = MigrationPanel.createOrShow(context.extensionUri);
      await panel.loadConfigFromTree(item.item.path);
    }
  );

  // Manually refresh the tree (also used by file watcher above)
  const refreshTreeDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.refreshConfigTree',
    () => {
      configTreeProvider.refresh();
    }
  );

  // Create a folder under the selected folder (or root if invoked from title)
  const createFolderDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.createConfigFolder',
    async (item?: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new SFDMU folder',
        placeHolder: 'Folder name',
        validateInput: (value) =>
          value.trim().length === 0 ? 'Folder name cannot be empty' : undefined,
      });

      if (!folderName) {
        return;
      }

      // If called from title button (no item) or from context menu on a file, create at root
      // If called from context menu on a folder, create inside that folder
      let fullPath: string;
      if (item && item.item.type === 'folder') {
        // Create inside the selected folder
        fullPath = `${item.item.path}/${folderName.trim()}`;
      } else {
        // Create at root level
        fullPath = folderName.trim();
      }

      try {
        await createFolder(fullPath, workspaceFolder);
        configTreeProvider.refresh();
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error creating folder "${fullPath}": ${error.message || String(error)}`
        );
      }
    }
  );

  // Delete a folder (and its contents) from the tree
  const deleteFolderDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.deleteConfigFolder',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      if (!item || item.item.type !== 'folder') {
        return;
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Delete folder "${item.item.path}" and all configurations inside it? This action cannot be undone.`,
        { modal: true },
        'Delete'
      );

      if (confirmed !== 'Delete') {
        return;
      }

      try {
        await deleteFolder(item.item.path, workspaceFolder);
        configTreeProvider.refresh();
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error deleting folder "${item.item.path}": ${error.message || String(error)}`
        );
      }
    }
  );

  // Delete a single configuration file from the tree
  const deleteConfigDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.deleteConfigFile',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      if (!item || item.item.type !== 'file') {
        return;
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Delete configuration "${item.item.path}"? This action cannot be undone.`,
        { modal: true },
        'Delete'
      );

      if (confirmed !== 'Delete') {
        return;
      }

      try {
        await deleteConfiguration(item.item.path, workspaceFolder);
        configTreeProvider.refresh();
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error deleting configuration "${item.item.path}": ${error.message || String(error)}`
        );
      }
    }
  );

  // Start a new configuration under the selected folder (using the webview logic)
  const createConfigInFolderDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.createConfigInFolder',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      if (!item || item.item.type !== 'folder') {
        return;
      }

      const panel = MigrationPanel.createOrShow(context.extensionUri);
      panel.startNewConfigInFolder(item.item.path);
    }
  );

  // Rename a configuration file
  const renameConfigFileDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.renameConfigFile',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      if (!item || item.item.type !== 'file') {
        return;
      }

      const currentName = item.item.name;
      const currentPath = item.item.path;
      
      // Extract parent folder path
      const pathParts = currentPath.split('/');
      pathParts.pop(); // Remove filename
      const parentFolder = pathParts.join('/');

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter a new name for the configuration',
        value: currentName,
        placeHolder: 'Configuration name',
        validateInput: (value) => {
          if (value.trim().length === 0) {
            return 'Configuration name cannot be empty';
          }
          // Check for invalid characters
          if (/[<>:"/\\|?*\x00-\x1f]/.test(value)) {
            return 'Configuration name contains invalid characters';
          }
          return undefined;
        },
      });

      if (!newName || newName.trim() === currentName) {
        return;
      }

      const newPath = parentFolder ? `${parentFolder}/${newName.trim()}` : newName.trim();

      try {
        // Check for conflicts
        const result = await moveConfiguration(currentPath, newPath, workspaceFolder);
        
        if (result.conflict) {
          const choice = await vscode.window.showWarningMessage(
            `A configuration named "${newName.trim()}" already exists at "${newPath}". How would you like to proceed?`,
            'Keep Both',
            'Replace',
            'Cancel'
          );
          
          if (choice === 'Cancel') {
            return;
          }
          
          const resolution = choice === 'Keep Both' ? 'keepBoth' : 'replace';
          const retryResult = await moveConfiguration(
            currentPath,
            newPath,
            workspaceFolder,
            resolution
          );
          
          if (retryResult.moved) {
            configTreeProvider.refresh();
            if (retryResult.finalPath && retryResult.finalPath !== newPath) {
              vscode.window.showInformationMessage(
                `Configuration renamed to "${retryResult.finalPath}" (renamed to avoid conflict)`
              );
            } else {
              vscode.window.showInformationMessage(`Configuration renamed to "${newPath}"`);
            }
          }
        } else if (result.moved) {
          configTreeProvider.refresh();
          vscode.window.showInformationMessage(`Configuration renamed to "${newPath}"`);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error renaming configuration: ${error.message || String(error)}`
        );
      }
    }
  );

  // Rename a folder
  const renameConfigFolderDisposable = vscode.commands.registerCommand(
    'sfdmu-all-purpose.renameConfigFolder',
    async (item: ConfigTreeItem) => {
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      if (!item || item.item.type !== 'folder') {
        return;
      }

      const currentName = item.item.name;
      const currentPath = item.item.path;

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter a new name for the folder',
        value: currentName,
        placeHolder: 'Folder name',
        validateInput: (value) => {
          if (value.trim().length === 0) {
            return 'Folder name cannot be empty';
          }
          // Check for invalid characters
          if (/[<>:"/\\|?*\x00-\x1f]/.test(value)) {
            return 'Folder name contains invalid characters';
          }
          return undefined;
        },
      });

      if (!newName || newName.trim() === currentName) {
        return;
      }

      try {
        // Check for conflicts
        const result = await renameFolder(currentPath, newName.trim(), workspaceFolder);
        
        if (result.conflict) {
          const choice = await vscode.window.showWarningMessage(
            `A folder named "${newName.trim()}" already exists. How would you like to proceed?`,
            'Keep Both',
            'Replace',
            'Cancel'
          );
          
          if (choice === 'Cancel') {
            return;
          }
          
          const resolution = choice === 'Keep Both' ? 'keepBoth' : 'replace';
          const retryResult = await renameFolder(
            currentPath,
            newName.trim(),
            workspaceFolder,
            resolution
          );
          
          if (retryResult.renamed) {
            configTreeProvider.refresh();
            const expectedPath = newName.trim();
            if (retryResult.finalPath && retryResult.finalPath !== expectedPath) {
              vscode.window.showInformationMessage(
                `Folder renamed to "${retryResult.finalPath}" (renamed to avoid conflict)`
              );
            } else {
              vscode.window.showInformationMessage(`Folder renamed to "${newName.trim()}"`);
            }
          }
        } else if (result.renamed) {
          configTreeProvider.refresh();
          vscode.window.showInformationMessage(`Folder renamed to "${newName.trim()}"`);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error renaming folder: ${error.message || String(error)}`
        );
      }
    }
  );

  context.subscriptions.push(
    treeView,
    openPanelDisposable,
    openConfigDisposable,
    refreshTreeDisposable,
    createFolderDisposable,
    deleteFolderDisposable,
    deleteConfigDisposable,
    createConfigInFolderDisposable,
    renameConfigFileDisposable,
    renameConfigFolderDisposable
  );

  // Reveal tree view when extension activates (with a delay to ensure tree is ready)
  setTimeout(() => {
    revealTreeView();
  }, 500);
}

export function deactivate() {}


