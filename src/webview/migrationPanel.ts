import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { generateMigrationFiles } from '../services/migrationGenerator';
import { generateCpqPhaseFiles, getCpqPhaseDefinitions } from '../services/cpqPhaseGenerator';
import { getOrgList, getOrgDetails } from '../services/orgService';
import {
  detectExternalIdFields,
  validateObjectExists,
  getAvailableObjects,
  getRelationshipFields,
  getAllFieldsWithDataType,
  validateSOQLWhereClause,
} from '../services/objectService';
import { runSFDMU } from '../services/sfdmuRunner';
import {
  saveConfiguration,
  loadConfiguration,
  listConfigurations,
  deleteConfiguration,
  exportConfiguration,
  importConfiguration,
  getConfigTree,
  createFolder,
  deleteFolder,
  moveConfiguration,
} from '../utils/fileUtils';
import { MigrationConfig, OrgInfo, MigrationObject } from '../models/migrationConfig';

export class MigrationPanel {
    public static currentPanel: MigrationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _workspaceFolder: vscode.WorkspaceFolder | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.command) {
                    case 'detectExternalId':
                        await this.handleDetectExternalId(message.objectName, message.orgAlias);
                        return;
                    case 'validateObject':
                        await this.handleValidateObject(message.objectName, message.orgAlias);
                        return;
                    case 'getAvailableObjects':
                        await this.handleGetAvailableObjects(message.orgAlias, message.includeStandard);
                        return;
                    case 'getRelationshipFields':
                        await this.handleGetRelationshipFields(message.objectName, message.orgAlias);
                        return;
                    case 'getAllFieldsWithDataType':
                        await this.handleGetAllFieldsWithDataType(message.objectName, message.orgAlias);
                        return;
                    case 'validateSOQLWhereClause':
                        await this.handleValidateSOQLWhereClause(message.objectName, message.whereClause, message.orgAlias);
                        return;
                    case 'getOrgList':
                        await this.handleGetOrgList();
                        return;
                    case 'getOrgDetails':
                        await this.handleGetOrgDetails(message.alias, message.type);
                        return;
                    case 'getCpqPhaseDefinitions':
                        await this.handleGetCpqPhaseDefinitions(message.includeProduct2);
                        return;
                    case 'generateFiles':
                        await this.handleGenerateFiles(message.config);
                        return;
                    case 'simulateMigration':
                        await this.handleRunMigration(message.config, true);
                        return;
                    case 'runMigration':
                        await this.handleRunMigration(message.config, false);
                        return;
                    case 'runCpqPhase':
                        await this.handleRunCpqPhase(message.config, message.phaseNumber, message.simulation);
                        return;
                    case 'saveConfig':
                        await this.handleSaveConfig(message.config);
                        return;
                    case 'loadConfig':
                        await this.handleLoadConfig(message.name);
                        return;
                    case 'deleteConfig':
                        await this.handleDeleteConfig(message.name);
                        return;
                    case 'listConfigs':
                        await this.handleListConfigs();
                        return;
                    case 'checkPhaseFiles':
                        await this.handleCheckPhaseFiles(message.outputDir);
                        return;
                    case 'exportConfig':
                        await this.handleExportConfig(message.config);
                        return;
                    case 'importConfig':
                        await this.handleImportConfig(message.json);
                        return;
                    case 'getConfigTree':
                        await this.handleGetConfigTree();
                        return;
                    case 'createFolder':
                        await this.handleCreateFolder(message.path);
                        return;
                    case 'deleteFolder':
                        await this.handleDeleteFolder(message.path);
                        return;
                    case 'moveConfig':
                        await this.handleMoveConfig(message.oldPath, message.newPath);
                        return;
                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        return;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.message);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri): MigrationPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (MigrationPanel.currentPanel) {
            MigrationPanel.currentPanel._panel.reveal(column);
            return MigrationPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'sfdmuMigration',
            'SFDMU Migration',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ui'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons')
                ],
                retainContextWhenHidden: true
            }
        );

        MigrationPanel.currentPanel = new MigrationPanel(panel, extensionUri);
        return MigrationPanel.currentPanel;
    }

    public dispose() {
        MigrationPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get paths to resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'ui', 'script.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'ui', 'styles.css')
        );

        // Get paths to JS module files
        const jsModules = [
            'state.js',
            'uiUtils.js',
            'configManager.js',
            'configChangeChecker.js',
            'migrationObjects.js',
            'migrationExecution.js',
            'modals.js',
            'cpqMode.js',
            'messageHandler.js',
            'main.js'
        ];
        
        const jsModuleUris: { [key: string]: vscode.Uri } = {};
        jsModules.forEach(module => {
            jsModuleUris[module] = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'ui', 'js', module)
            );
        });

        // Read the HTML file
        const htmlPath = path.join(
            this._extensionUri.fsPath,
            'out',
            'webview',
            'ui',
            'index.html'
        );

        let html = fsSync.readFileSync(htmlPath, 'utf8');

        // Add codicon CSS for VSCode icons
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );
        
        // Replace resource paths with webview URIs
        html = html.replace(
            /<link rel="stylesheet" href="styles.css">/,
            `<link rel="stylesheet" href="${codiconUri}">
            <link rel="stylesheet" href="${styleUri}">`
        );
        // Replace JS module script tags with webview URIs
        jsModules.forEach(module => {
            const regex = new RegExp(`<script src="js/${module}"><\/script>`, 'g');
            html = html.replace(regex, `<script src="${jsModuleUris[module]}"></script>`);
        });
        
        html = html.replace(
            /<script src="script.js"><\/script>/,
            `<script src="${scriptUri}"></script>`
        );

        return html;
    }

    /**
     * Load a configuration into the existing webview from the native Tree View.
     * This wraps the existing private handleLoadConfig logic so tree commands
     * don't need to know about webview message protocols.
     */
    public async loadConfigFromTree(name: string): Promise<void> {
        await this.handleLoadConfig(name);
    }

    /**
     * Start a brand new configuration in the specified folder (used by the Tree View).
     * The actual config initialization is handled by the webview's ConfigManager
     * so we just send a message with the target folder path.
     */
    public startNewConfigInFolder(folderPath: string | undefined): void {
        this._panel.webview.postMessage({
            command: 'startNewConfigInFolder',
            folderPath
        });
    }

    private async handleDetectExternalId(objectName: string, orgAlias: string) {
        try {
            const externalIds = await detectExternalIdFields(objectName, orgAlias);
            this._panel.webview.postMessage({
                command: 'externalIdDetected',
                objectName: objectName,
                externalIds: externalIds
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'externalIdDetectionError',
                objectName: objectName,
                error: error.message
            });
        }
    }

    private async handleValidateObject(objectName: string, orgAlias: string) {
        try {
            const exists = await validateObjectExists(objectName, orgAlias);
            this._panel.webview.postMessage({
                command: 'objectValidated',
                objectName: objectName,
                exists: exists
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'objectValidationError',
                objectName: objectName,
                error: error.message
            });
        }
    }

    private async handleGetAvailableObjects(orgAlias: string, includeStandard: boolean = true) {
        try {
            const objects = await getAvailableObjects(orgAlias, includeStandard);
            this._panel.webview.postMessage({
                command: 'availableObjects',
                objects: objects,
                orgAlias: orgAlias
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'availableObjectsError',
                error: error.message,
                objects: [],
                orgAlias: orgAlias
            });
        }
    }


    private async handleGetRelationshipFields(objectName: string, orgAlias: string) {
        try {
            const fields = await getRelationshipFields(objectName, orgAlias);
            this._panel.webview.postMessage({
                command: 'relationshipFields',
                fields: fields
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'relationshipFieldsError',
                error: error.message,
                fields: []
            });
        }
    }

    private async handleGetAllFieldsWithDataType(objectName: string, orgAlias: string) {
        try {
            const fields = await getAllFieldsWithDataType(objectName, orgAlias);
            this._panel.webview.postMessage({
                command: 'allFieldsWithDataType',
                objectName: objectName,
                orgAlias: orgAlias,
                fields: fields
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'allFieldsWithDataTypeError',
                objectName: objectName,
                orgAlias: orgAlias,
                error: error.message,
                fields: []
            });
        }
    }

    private async handleValidateSOQLWhereClause(objectName: string, whereClause: string, orgAlias: string) {
        try {
            const result = await validateSOQLWhereClause(objectName, whereClause, orgAlias);
            this._panel.webview.postMessage({
                command: 'soqlWhereClauseValidated',
                objectName: objectName,
                whereClause: whereClause,
                valid: result.valid,
                error: result.error
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'soqlWhereClauseValidationError',
                objectName: objectName,
                whereClause: whereClause,
                valid: false,
                error: error.message
            });
        }
    }

    private async handleGetOrgList() {
        try {
            const orgs = await getOrgList();
            this.sendOutput(`Found ${orgs.length} org(s)`, 'info');
            this._panel.webview.postMessage({
                command: 'orgList',
                orgs: orgs
            });
        } catch (error: any) {
            // If the webview has been disposed, silently ignore - this is a normal race
            // that can happen when the panel is closed while a request is in flight.
            if (error?.message?.includes('Webview is disposed')) {
                return;
            }

            const errorMsg = `Error fetching org list: ${error.message}`;
            this.sendOutput(errorMsg, 'error');
            console.error('getOrgList error:', error);
            // Send empty list on error but still notify the UI
            this._panel.webview.postMessage({
                command: 'orgList',
                orgs: [],
                error: errorMsg
            });
        }
    }

    private async handleCheckPhaseFiles(outputDir: string) {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'phaseFilesStatus',
                    hasFiles: false
                });
                return;
            }

            const resolvedOutputDir = path.resolve(this._workspaceFolder.uri.fsPath, outputDir);
            let hasFiles = false;

            // Standard mode: single export.json in the root output directory
            try {
                const exportJsonPath = path.join(resolvedOutputDir, 'export.json');
                await fs.access(exportJsonPath);
                hasFiles = true;
            } catch {
                // File doesn't exist - fall through to CPQ phase check
            }

            // CPQ mode: any "Phase N/export.json" file under the output directory
            if (!hasFiles) {
                try {
                    const entries = await fs.readdir(resolvedOutputDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && entry.name.startsWith('Phase ')) {
                            const phaseDir = path.join(resolvedOutputDir, entry.name);
                            const phaseExport = path.join(phaseDir, 'export.json');
                            try {
                                await fs.access(phaseExport);
                                hasFiles = true;
                                break;
                            } catch {
                                // This phase directory doesn't have export.json; keep looking
                            }
                        }
                    }
                } catch {
                    // Directory doesn't exist or can't be read
                }
            }

            this._panel.webview.postMessage({
                command: 'phaseFilesStatus',
                hasFiles: hasFiles
            });
        } catch (error: any) {
            // If there's an error, assume no files exist
            this._panel.webview.postMessage({
                command: 'phaseFilesStatus',
                hasFiles: false
            });
        }
    }

    private async handleGetOrgDetails(alias: string, type: 'source' | 'target') {
        try {
            const org = await getOrgDetails(alias);
            this._panel.webview.postMessage({
                command: 'orgDetails',
                org: org,
                type: type
            });
        } catch (error: any) {
            this.sendOutput(`Error fetching org details: ${error.message}`, 'error');
        }
    }

    private async handleGetCpqPhaseDefinitions(includeProduct2: boolean) {
        try {
            const phases = getCpqPhaseDefinitions(includeProduct2);
            this._panel.webview.postMessage({
                command: 'cpqPhaseDefinitions',
                phases
            });
        } catch (error: any) {
            this.sendOutput(`Error getting CPQ phase definitions: ${error.message}`, 'error');
        }
    }

    private async handleGenerateFiles(config: MigrationConfig) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }
            
            const mode = config.mode || 'standard';

            // Resolve output directory relative to workspace
            const outputDir = path.isAbsolute(config.outputDir)
                ? config.outputDir
                : path.join(this._workspaceFolder.uri.fsPath, config.outputDir);

            config.outputDir = outputDir;

            if (mode === 'cpq') {
                // CPQ mode: generate phase-based export.json files for all phases
                this.sendOutput('='.repeat(60), 'info');
                this.sendOutput('Generating CPQ phase files...', 'info');
                this.sendOutput(`Output directory: ${outputDir}`, 'info');
                this.sendOutput('Selected phases: All CPQ phases', 'info');
                this.sendOutput(`DML Operation: ${config.operation}`, 'info');
                if (config.modifiedSince) {
                    this.sendOutput(`Modified since: ${config.modifiedSince}`, 'info');
                }
                this.sendOutput('='.repeat(60), 'info');

                await generateCpqPhaseFiles(config);

                this.sendOutput('', 'info');
                this.sendOutput(`✓ CPQ phase files generated successfully in: ${outputDir}`, 'success');

                // Notify webview that files were generated so it can save config snapshot
                this._panel.webview.postMessage({
                    command: 'filesGenerated',
                    config: config
                });

                // Notify UI that phase files now exist (for button states)
                this._panel.webview.postMessage({
                    command: 'phaseFilesStatus',
                    hasFiles: true
                });
            } else {
                // Standard object-based generation (existing behavior)
                if (!config.objects || config.objects.length === 0) {
                    this.sendOutput('Error: No objects configured for migration', 'error');
                    return;
                }

                this.sendOutput('='.repeat(60), 'info');
                this.sendOutput('Generating migration file...', 'info');
                this.sendOutput(`Output directory: ${outputDir}`, 'info');
                this.sendOutput(`Objects: ${config.objects.length}`, 'info');
                this.sendOutput(`DML Operation: ${config.operation}`, 'info');
                if (config.modifiedSince) {
                    this.sendOutput(`Modified since: ${config.modifiedSince}`, 'info');
                }
                this.sendOutput('='.repeat(60), 'info');

                await generateMigrationFiles(config);

                this.sendOutput('', 'info');
                this.sendOutput(
                    `✓ Migration file generated successfully: ${path.join(outputDir, 'export.json')}`,
                    'success'
                );
                this._panel.webview.postMessage({
                    command: 'filesGenerated',
                    config: config
                });

                this._panel.webview.postMessage({
                    command: 'phaseFilesStatus',
                    hasFiles: true
                });
            }
        } catch (error: any) {
            this.sendOutput('', 'error'); // Empty line for spacing
            this.sendOutput(`✗ Error generating files: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }


    private async handleSaveConfig(config: MigrationConfig) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Extract folder path from config name if it contains a path separator
            const configName = config.configName || 'unnamed-config';
            const lastSlash = configName.lastIndexOf('/');
            let folderPath: string | undefined;
            let actualConfigName = configName;
            
            if (lastSlash >= 0) {
                folderPath = configName.substring(0, lastSlash);
                actualConfigName = configName.substring(lastSlash + 1);
                config.configName = actualConfigName;
            }

            // Check for conflicts
            const result = await saveConfiguration(config, this._workspaceFolder, folderPath);
            
            if (result.conflict) {
                // Request conflict resolution from webview
                const resolution = await this.requestConflictResolution(
                    actualConfigName,
                    folderPath || '',
                    'save'
                );
                
                if (resolution.action === 'cancel') {
                    return;
                }
                
                // Retry with conflict resolution
                const retryResult = await saveConfiguration(
                    config,
                    this._workspaceFolder,
                    folderPath,
                    resolution.action === 'keepBoth' ? 'keepBoth' : 'replace'
                );
                
                if (retryResult.saved) {
                    const finalName = retryResult.finalName || actualConfigName;
                    const displayName = folderPath ? `${folderPath}/${finalName}` : finalName;
                    
                    // Notify webview so it can refresh state
                    this._panel.webview.postMessage({
                        command: 'configSaved',
                        name: displayName
                    });

                    // Show VS Code notification
                    vscode.window.showInformationMessage(
                        `SFDMU configuration "${displayName}" saved${retryResult.finalName !== actualConfigName ? ` as "${finalName}"` : ''}.`
                    );
                    
                    // Refresh the tree
                    await this.handleGetConfigTree();
                }
            } else if (result.saved) {
                const displayName = folderPath ? `${folderPath}/${actualConfigName}` : actualConfigName;
                
                // Notify webview so it can refresh state
                this._panel.webview.postMessage({
                    command: 'configSaved',
                    name: displayName
                });

                // Show VS Code notification
                vscode.window.showInformationMessage(`SFDMU configuration "${displayName}" saved.`);
                
                // Refresh the tree
                await this.handleGetConfigTree();
            }
        } catch (error: any) {
            this.sendOutput(`Error saving configuration: ${error.message}`, 'error');
        }
    }
    
    private async requestConflictResolution(
        configName: string,
        targetPath: string,
        operation: 'save' | 'move'
    ): Promise<{ action: 'cancel' | 'keepBoth' | 'replace' }> {
        return new Promise((resolve) => {
            const messageId = `conflict-${Date.now()}-${Math.random()}`;
            
            const messageListener = this._panel.webview.onDidReceiveMessage(
                (message) => {
                    if (message.command === 'configConflictResolution' && message.messageId === messageId) {
                        messageListener.dispose();
                        resolve({ action: message.action });
                    }
                }
            );
            
            this._panel.webview.postMessage({
                command: 'requestConfigConflictResolution',
                messageId: messageId,
                configName: configName,
                targetPath: targetPath,
                operation: operation
            });
        });
    }

    private async handleLoadConfig(name: string) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            const config = await loadConfiguration(name, this._workspaceFolder);
            
            // Update configName to match the actual filename (in case it was renamed with "Keep Both")
            // Extract the actual filename from the path (handles both "Test" and "Test (1)" cases)
            const actualFileName = name.split('/').pop() || name;
            config.configName = name; // Use full path as configName so it includes folder path if any
            
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: config,
                name: name
            });
        } catch (error: any) {
            this.sendOutput(`Error loading configuration: ${error.message}`, 'error');
        }
    }

    private async handleDeleteConfig(name: string) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            await deleteConfiguration(name, this._workspaceFolder);
            
            // Refresh the tree after deletion (before sending message to UI)
            await this.handleGetConfigTree();
            
            this.sendOutput(`Configuration "${name}" deleted successfully`, 'success');
            this._panel.webview.postMessage({
                command: 'configDeleted',
                name: name
            });
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            this.sendOutput(`Error deleting configuration: ${errorMsg}`, 'error');
            // Still refresh the tree even on error to ensure UI is in sync
            await this.handleGetConfigTree();
        }
    }

    private async handleMoveConfig(oldPath: string, newPath: string) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Check for conflicts
            const result = await moveConfiguration(oldPath, newPath, this._workspaceFolder);
            
            if (result.conflict) {
                // Extract config name from newPath
                const configName = newPath.split('/').pop() || newPath;
                const targetFolder = newPath.includes('/') 
                    ? newPath.substring(0, newPath.lastIndexOf('/'))
                    : '';
                
                // Request conflict resolution from webview
                const resolution = await this.requestConflictResolution(
                    configName,
                    targetFolder,
                    'move'
                );
                
                if (resolution.action === 'cancel') {
                    return;
                }
                
                // Retry with conflict resolution
                const retryResult = await moveConfiguration(
                    oldPath,
                    newPath,
                    this._workspaceFolder,
                    resolution.action === 'keepBoth' ? 'keepBoth' : 'replace'
                );
                
                if (retryResult.moved) {
                    const finalPath = retryResult.finalPath || newPath;
                    
                    // Refresh the tree after moving
                    await this.handleGetConfigTree();

                    this.sendOutput(
                        `Configuration moved to "${finalPath}"${retryResult.finalPath !== newPath ? ` (renamed to avoid conflict)` : ''}`,
                        'success'
                    );
                }
            } else if (result.moved) {
                const finalPath = result.finalPath || newPath;
                
                // Refresh the tree after moving
                await this.handleGetConfigTree();

                this.sendOutput(`Configuration moved to "${finalPath}"`, 'success');
            }
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            this.sendOutput(`Error moving configuration: ${errorMsg}`, 'error');
            // Keep tree in sync even on error
            await this.handleGetConfigTree();
        }
    }

    private async handleListConfigs() {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'configList',
                    configs: []
                });
                return;
            }

            // Instead of listing configs, send the tree structure
            await this.handleGetConfigTree();
        } catch (error: any) {
            this.sendOutput(`Error listing configurations: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'configTree',
                tree: []
            });
        }
    }

    private async handleExportConfig(config: MigrationConfig) {
        try {
            const json = await exportConfiguration(config);
            this._panel.webview.postMessage({
                command: 'configExported',
                config: config
            });
        } catch (error: any) {
            this.sendOutput(`Error exporting configuration: ${error.message}`, 'error');
        }
    }

    private async handleImportConfig(json: string) {
        try {
            const config = await importConfiguration(json);
            this._panel.webview.postMessage({
                command: 'configImported',
                config: config
            });
        } catch (error: any) {
            this.sendOutput(`Error importing configuration: ${error.message}`, 'error');
        }
    }

    private async handleGetConfigTree() {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'configTree',
                    tree: []
                });
                return;
            }

            const tree = await getConfigTree(this._workspaceFolder);
            this._panel.webview.postMessage({
                command: 'configTree',
                tree: tree
            });
        } catch (error: any) {
            this.sendOutput(`Error loading config tree: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'configTree',
                tree: []
            });
        }
    }

    private async handleCreateFolder(folderPath: string) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            await createFolder(folderPath, this._workspaceFolder);
            this._panel.webview.postMessage({
                command: 'folderCreated',
                path: folderPath
            });
            
            // Refresh the tree
            await this.handleGetConfigTree();
        } catch (error: any) {
            this.sendOutput(`Error creating folder: ${error.message}`, 'error');
        }
    }

    private async handleDeleteFolder(folderPath: string) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            await deleteFolder(folderPath, this._workspaceFolder);
            this.sendOutput(`Folder "${folderPath}" deleted successfully`, 'success');
            this._panel.webview.postMessage({
                command: 'folderDeleted',
                path: folderPath
            });
            
            // Refresh the tree
            await this.handleGetConfigTree();
        } catch (error: any) {
            this.sendOutput(`Error deleting folder: ${error.message}`, 'error');
            // Still refresh the tree even on error to ensure UI is in sync
            await this.handleGetConfigTree();
        }
    }


    private async handleRunMigration(config: MigrationConfig, simulation: boolean) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Resolve output directory relative to workspace
            const outputDir = path.isAbsolute(config.outputDir)
                ? config.outputDir
                : path.join(this._workspaceFolder.uri.fsPath, config.outputDir);

            // Check if export.json exists (standard mode) - CPQ mode uses per-phase files
            const exportJsonPath = path.join(outputDir, 'export.json');
            try {
                await fs.access(exportJsonPath);
            } catch {
                this.sendOutput(`Export.json not found at: ${exportJsonPath}`, 'error');
                this.sendOutput(
                    `Please generate the migration file first using the "Generate Migration File" button.`,
                    'error'
                );
                return;
            }

            // Validate orgs
            if (!config.sourceOrg.username || !config.sourceOrg.instanceUrl) {
                this.sendOutput('Error: Source org is required', 'error');
                return;
            }

            if (!config.targetOrg.username || !config.targetOrg.instanceUrl) {
                this.sendOutput('Error: Target org is required', 'error');
                return;
            }

            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput(`Running Migration${simulation ? ' (SIMULATION MODE)' : ''}`, 'info');
            this.sendOutput(`Objects: ${config.objects?.length || 0}`, 'info');
            this.sendOutput(`DML Operation: ${config.operation}`, 'info');
            this.sendOutput('-'.repeat(60), 'info');

            const command = `sf sfdmu run --sourceusername "${config.sourceOrg.username}" --targetusername "${config.targetOrg.username}"${simulation ? ' --simulation' : ''}`;
            this.sendOutput(`Command: ${command}`, 'info');
            this.sendOutput(`Working directory: ${outputDir}`, 'info');
            this.sendOutput(`Export.json location: ${exportJsonPath}`, 'info');
            this.sendOutput('', 'info');
            this.sendOutput('Opening terminal for interactive execution...', 'info');
            this.sendOutput('You can respond to prompts (y/n) directly in the terminal.', 'info');
            this.sendOutput('', 'info');

            // Use VSCode Terminal API for interactive execution
            await this.runSFDMUInTerminal(
                outputDir,
                config.sourceOrg.username,
                config.targetOrg.username,
                simulation
            );
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error running migration: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }

    private async handleRunCpqPhase(
        config: MigrationConfig,
        phaseNumber: number,
        simulation: boolean
    ) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            const outputDir = path.isAbsolute(config.outputDir)
                ? config.outputDir
                : path.join(this._workspaceFolder.uri.fsPath, config.outputDir);

            const phaseDir = path.resolve(path.join(outputDir, `Phase ${phaseNumber}`));

            try {
                await fs.access(phaseDir);
            } catch {
                this.sendOutput(`Phase ${phaseNumber} directory not found: ${phaseDir}`, 'error');
                this.sendOutput(
                    'Please generate CPQ phase files first using the "Generate" button in the header.',
                    'error'
                );
                return;
            }

            const exportJsonPath = path.join(phaseDir, 'export.json');
            try {
                await fs.access(exportJsonPath);
            } catch {
                this.sendOutput(`Phase ${phaseNumber} export.json not found at: ${exportJsonPath}`, 'error');
                this.sendOutput(
                    'Please generate CPQ phase files first using the "Generate" button in the header.',
                    'error'
                );
                return;
            }

            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput(
                `Running CPQ Phase ${phaseNumber}${simulation ? ' (SIMULATION MODE)' : ''}`,
                'info'
            );
            this.sendOutput('-'.repeat(60), 'info');

            const command = `sf sfdmu run --sourceusername "${config.sourceOrg.username}" --targetusername "${config.targetOrg.username}"${simulation ? ' --simulation' : ''}`;
            this.sendOutput(`Command: ${command}`, 'info');
            this.sendOutput(`Working directory: ${phaseDir}`, 'info');
            this.sendOutput(`Export.json location: ${exportJsonPath}`, 'info');
            this.sendOutput('', 'info');
            this.sendOutput('Opening terminal for interactive execution...', 'info');
            this.sendOutput('You can respond to prompts (y/n) directly in the terminal.', 'info');
            this.sendOutput('', 'info');

            await this.runSFDMUInTerminal(
                phaseDir,
                config.sourceOrg.username,
                config.targetOrg.username,
                simulation
            );
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error running CPQ phase ${phaseNumber}: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }

    private async runSFDMUInTerminal(
        outputDir: string,
        sourceUsername: string,
        targetUsername: string,
        simulation: boolean
    ): Promise<void> {
        // Create a terminal for interactive execution
        const terminal = vscode.window.createTerminal({
            name: `SFDMU Migration${simulation ? ' (Simulation)' : ''}`,
            cwd: outputDir
        });

        // Build the command
        let command = `sf sfdmu run --sourceusername "${sourceUsername}" --targetusername "${targetUsername}"`;
        if (simulation) {
            command += ' --simulation';
        }

        // Show the terminal
        terminal.show(true);

        // Send the command to the terminal
        terminal.sendText(command);
    }

    private sendOutput(text: string, type: 'info' | 'success' | 'error' = 'info') {
        // Use VSCode notifications instead of webview output panel
        const trimmedText = text.trim();
        if (!trimmedText) {
            return; // Skip empty messages
        }
        
        // Skip notifications for migration run messages (simulation or real)
        if (trimmedText.includes('Running Migration') || 
            trimmedText.includes('Opening terminal') ||
            trimmedText.includes('Migration command sent')) {
            return; // Don't show notifications for migration runs
        }
        
        // Show notifications for important messages
        if (type === 'error') {
            vscode.window.showErrorMessage(trimmedText);
        } else if (type === 'success') {
            vscode.window.showInformationMessage(trimmedText);
        } else {
            // For info messages, only show important ones (not every line)
            // Show notifications for key events like completion, errors, etc.
            if (trimmedText.includes('✓') || trimmedText.includes('✗') || 
                trimmedText.includes('Error:') || trimmedText.includes('successfully')) {
                vscode.window.showInformationMessage(trimmedText);
            }
        }
    }
}

