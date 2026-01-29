import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { generateMigrationFiles } from '../services/migrationGenerator';
import { generateCpqPhaseFiles, generateCpqPhaseFile, getCpqPhaseDefinitions, CPQ_COMPREHENSIVE_RELATIONSHIPS } from '../services/cpqPhaseGenerator';
import { generateRcaPhaseFiles, generateRcaPhaseFile, getRcaPhaseDefinitions } from '../services/rcaPhaseGenerator';
import { deployMetadataPrerequisites } from '../services/toolingApiService';
import { getOrgList, getOrgDetails } from '../services/orgService';
import {
  detectExternalIdFields,
  validateObjectExists,
  getAvailableObjects,
  getRelationshipFields,
  getAllFieldsWithDataType,
  validateSOQLWhereClause,
  queryMasterRecords,
  getObjectMetadata,
} from '../services/objectService';
import { createPreMigrationBackup, createPostMigrationBackup, listAvailableBackups } from '../services/backupService';
import { saveMigrationHistory } from '../services/migrationHistoryService';
import { generateRollbackConfig } from '../services/rollbackGenerator';
import { executeRollback } from '../services/rollbackRunner';
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

interface PendingMigration {
    config: MigrationConfig;
    backupLocation: string | undefined;
    phaseNumber?: number;
    migrationType: string;
    simulation: boolean;
    startTime: Date; // When migration started
    endTime?: Date; // When user confirmed migration completed
}

export class MigrationPanel {
    public static currentPanel: MigrationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _workspaceFolder: vscode.WorkspaceFolder | undefined;
    private _pendingMigrations: Map<string, PendingMigration> = new Map();

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
                    case 'getObjectMetadata':
                        await this.handleGetObjectMetadata(message.objectName, message.orgAlias);
                        return;
                    case 'validateSOQLWhereClause':
                        await this.handleValidateSOQLWhereClause(
                            message.objectName, 
                            message.whereClause, 
                            message.orgAlias,
                            message.orderByClause,
                            message.limitClause
                        );
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
                    case 'getCpqMasterRecords':
                        await this.handleGetCpqMasterRecords(
                            message.objectName,
                            message.externalIdField,
                            message.orgAlias,
                            message.phaseNumber,
                            message.limit,
                            message.offset,
                            message.searchTerm,
                            message
                        );
                        return;
                    case 'getInheritedLineColumns':
                        await this.handleGetInheritedLineColumns(
                            message.templateSectionIds,
                            message.orgAlias,
                            message.phaseNumber
                        );
                        return;
                    case 'getChildRecords':
                        await this.handleGetChildRecords(
                            message.parentObjectName,
                            message.childObjectName,
                            message.relationshipField,
                            message.parentIds,
                            message.childExternalId,
                            message.orgAlias,
                            message.phaseNumber
                        );
                        return;
                    case 'queryChildrenForParents':
                        await this.handleQueryChildrenForParents(
                            message.parentObjectName,
                            message.parentExternalIds,
                            message.parentExternalIdField,
                            message.childConfigs,
                            message.orgAlias,
                            message.phaseNumber
                        );
                        return;
                    case 'openExternal':
                        await this.handleOpenExternal(message.url);
                        return;
                    case 'openFile':
                        await this.handleOpenFile(message.filePath);
                        return;
                    case 'getRcaPhaseDefinitions':
                        await this.handleGetRcaPhaseDefinitions(message.includeProduct2);
                        return;
                    case 'generateFiles':
                        await this.handleGenerateFiles(message.config);
                        return;
                    case 'exportToExcel':
                        await this.handleExportToExcel(message.config, message.phaseNumber);
                        return;
                    case 'generatePhaseFile':
                        await this.handleGeneratePhaseFile(message.config, message.phaseNumber);
                        return;
                    case 'simulateMigration':
                        await this.handleRunMigration(message.config, true);
                        return;
                    case 'runMigration':
                        await this.handleRunMigration(message.config, false);
                        return;
                    case 'getCpqPhaseObjects':
                        await this.handleGetCpqPhaseObjects(message.config, message.phaseNumber);
                        return;
                    case 'runCpqPhase':
                        await this.handleRunCpqPhase(message.config, message.phaseNumber, message.simulation);
                        return;
                    case 'runRcaPhase':
                        await this.handleRunRcaPhase(message.config, message.phaseNumber, message.simulation);
                        return;
                    case 'deployMetadataPrerequisites':
                        await this.handleDeployMetadataPrerequisites(message.config);
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
                    case 'loadBackups':
                        await this.handleLoadBackups(message.configName);
                        return;
                    case 'checkPhaseBackups':
                        await this.handleCheckPhaseBackups(message.configName, message.mode);
                        return;
                    case 'showRollbackModal':
                        await this.handleShowRollbackModal(message.configName, message.backupDir, message.phaseNumber);
                        return;
                    case 'rollbackSimulation':
                        await this.handleRollbackSimulation(message.backupDir, message.config);
                        return;
                    case 'executeRollback':
                        await this.handleExecuteRollback(message.backupDir, message.config);
                        return;
                    case 'createBackup':
                        await this.handleCreateBackup(message.config, message.phaseNumber);
                        return;
                    case 'confirmMigrationComplete':
                        await this.handleMigrationCompletion(message.migrationKey);
                        return;
                    case 'skipMigrationBackup':
                        if (message.migrationKey) {
                            this._pendingMigrations.delete(message.migrationKey);
                            this.sendOutput('Post-migration backup skipped by user', 'info');
                        }
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
                    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ui')
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
            // CPQ modules (in subdirectory)
            'cpq/constants.js',
            'cpq/state.js',
            'cpq/masterObjects.js',
            'cpq/hierarchicalView.js',
            'cpq/masterSelectionModal.js',
            'cpq/phases.js',
            'cpq/mode.js',
            'cpqMode.js',
            // RCA modules (in subdirectory)
            'rca/constants.js',
            'rca/state.js',
            'rcaMasterObjects.js',
            'rca/masterSelectionModal.js',
            'rca/phases.js',
            'rca/metadata.js',
            'rca/execution.js',
            'rca/mode.js',
            'rcaMode.js',
            'rollbackManager.js',
            'rollbackModal.js',
            'messageHandler.js',
            'main.js'
        ];
        
        const jsModuleUris: { [key: string]: vscode.Uri } = {};
        jsModules.forEach(module => {
            // Split module path to handle subdirectories (e.g., 'cpq/constants.js' -> ['cpq', 'constants.js'])
            const pathParts = module.split('/');
            jsModuleUris[module] = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'ui', 'js', ...pathParts)
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

        // Add codicon CSS for VSCode icons (from bundled location)
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'ui', 'codicons', 'codicon.css')
        );
        
        // Replace resource paths with webview URIs
        html = html.replace(
            /<link rel="stylesheet" href="styles.css">/,
            `<link rel="stylesheet" href="${codiconUri}">
            <link rel="stylesheet" href="${styleUri}">`
        );
        // Replace JS module script tags with webview URIs
        jsModules.forEach(module => {
            // Escape special regex characters in module path (forward slash doesn't need escaping)
            const escapedModule = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Create regex pattern - match script tag with the module path
            // Pattern: <script src="js/cpq/constants.js"></script> or variations with whitespace
            const pattern = `(<script\\s+src=["'])js/${escapedModule}(["']\\s*>\\s*</script>)`;
            const regex = new RegExp(pattern, 'gi');
            
            if (regex.test(html)) {
                html = html.replace(regex, `$1${jsModuleUris[module]}$2`);
            } else {
                // Fallback: try without the closing tag pattern (self-closing or different format)
                const fallbackPattern = `(<script\\s+src=["'])js/${escapedModule}(["']\\s*/?>)`;
                const fallbackRegex = new RegExp(fallbackPattern, 'gi');
                if (fallbackRegex.test(html)) {
                    html = html.replace(fallbackRegex, `$1${jsModuleUris[module]}$2`);
                } else {
                    console.warn(`Failed to replace script tag for module: ${module}`);
                }
            }
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
     * so we just send a message with the target folder path and mode.
     */
    public startNewConfigInFolder(folderPath: string | undefined, mode: 'standard' | 'cpq' | 'rca' = 'standard'): void {
        this._panel.webview.postMessage({
            command: 'startNewConfigInFolder',
            folderPath,
            mode
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

    private async handleGetObjectMetadata(objectName: string, orgAlias: string) {
        try {
            const metadata = await getObjectMetadata(objectName, orgAlias);
            this._panel.webview.postMessage({
                command: 'objectMetadata',
                objectName: objectName,
                orgAlias: orgAlias,
                metadata: metadata
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'objectMetadataError',
                objectName: objectName,
                orgAlias: orgAlias,
                error: error.message,
                metadata: null
            });
        }
    }

    private async handleValidateSOQLWhereClause(
        objectName: string, 
        whereClause: string, 
        orgAlias: string, 
        orderByClause?: string, 
        limitClause?: string
    ) {
        try {
            const result = await validateSOQLWhereClause(objectName, whereClause, orgAlias, orderByClause, limitClause);
            this._panel.webview.postMessage({
                command: 'soqlWhereClauseValidated',
                objectName: objectName,
                whereClause: whereClause,
                orderByClause: orderByClause,
                limitClause: limitClause,
                valid: result.valid,
                error: result.error
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'soqlWhereClauseValidationError',
                objectName: objectName,
                whereClause: whereClause,
                orderByClause: orderByClause,
                limitClause: limitClause,
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

            // CPQ/RCA mode: any "Phase N/export.json" file under the output directory
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

    private async handleGetCpqMasterRecords(
        objectName: string,
        externalIdField: string,
        orgAlias: string,
        phaseNumber: number,
        limit?: number,
        offset?: number,
        searchTerm?: string,
        message?: any
    ) {
        try {
            // Build phase-specific filters
            let whereClause: string | undefined;
            const conditions: string[] = [];
            
            // Apply phase-specific filters
            if (objectName === 'PriceBook2') {
                conditions.push('IsStandard = false');
            }
            
            // Add user-defined filters if provided
            const filters = (message as any)?.filters;
            if (filters && Array.isArray(filters) && filters.length > 0) {
                const filterWhereClause = filters[0]?.whereClause;
                if (filterWhereClause && typeof filterWhereClause === 'string') {
                    conditions.push(filterWhereClause);
                }
            }
            
            // Add search filter if provided
            if (searchTerm) {
                const searchConditions: string[] = [];
                // Build search filter - search across all external ID fields and LastModifiedBy.Name
                const escapedTerm = searchTerm.replace(/'/g, "''");
                
                // Get all fields to search (from searchFields if provided, otherwise extract from externalIdField)
                const searchFields = (message as any).searchFields || [];
                let fieldsToSearch: string[] = [];
                
                if (searchFields.length > 0) {
                    fieldsToSearch = searchFields;
                } else {
                    // Extract from externalIdField
                    if (externalIdField.includes(';')) {
                        fieldsToSearch = externalIdField.split(';').map(f => f.trim());
                    } else {
                        fieldsToSearch = [externalIdField.trim()];
                    }
                }
                
                // Search in each external ID field
                for (const field of fieldsToSearch) {
                    let searchField = field;
                    if (field.includes('__r.')) {
                        // Relationship field - use as is for LIKE
                        searchField = field;
                    }
                    searchConditions.push(`${searchField} LIKE '%${escapedTerm}%'`);
                }
                
                // Also search in LastModifiedBy.Name
                searchConditions.push(`LastModifiedBy.Name LIKE '%${escapedTerm}%'`);
                
                const searchFilter = `(${searchConditions.join(' OR ')})`;
                conditions.push(searchFilter);
            }
            
            // Combine all conditions
            if (conditions.length > 0) {
                whereClause = conditions.join(' AND ');
            }
            
            // Query master records with pagination
            const records = await queryMasterRecords(
                objectName,
                externalIdField,
                orgAlias,
                whereClause ? { whereClause } : undefined,
                limit,
                offset
            );
            
            // Include mode in response if provided in request
            const mode = (message as any).mode || 'cpq';
            this._panel.webview.postMessage({
                command: 'cpqMasterRecords',
                objectName,
                records,
                phaseNumber,
                isSearch: !!searchTerm,
                append: !!offset,
                mode: mode
            });
        } catch (error: any) {
            // Include mode in response if provided in request
            const mode = (message as any).mode || 'cpq';
            this._panel.webview.postMessage({
                command: 'cpqMasterRecordsError',
                objectName,
                error: error.message,
                phaseNumber,
                mode: mode
            });
        }
    }

    private async handleGetInheritedLineColumns(
        templateSectionIds: string[],
        orgAlias: string,
        phaseNumber: number
    ) {
        try {
            if (!templateSectionIds || templateSectionIds.length === 0) {
                this._panel.webview.postMessage({
                    command: 'inheritedLineColumns',
                    records: [],
                    phaseNumber
                });
                return;
            }

            // Query LineColumns where SBQQ__Section__c IN (templateSectionIds)
            const whereClause = `SBQQ__Section__c IN ('${templateSectionIds.join("', '")}')`;
            const externalIdField = 'SBQQ__Template__r.Name;SBQQ__Section__r.Name';
            
            const records = await queryMasterRecords(
                'SBQQ__LineColumn__c',
                externalIdField,
                orgAlias,
                { whereClause },
                1000 // Get all related LineColumns
            );

            // Group LineColumns by TemplateSection ID
            const lineColumnsBySection: { [sectionId: string]: any[] } = {};
            records.forEach(record => {
                const sectionId = record.SBQQ__Section__c;
                if (sectionId) {
                    if (!lineColumnsBySection[sectionId]) {
                        lineColumnsBySection[sectionId] = [];
                    }
                    lineColumnsBySection[sectionId].push(record);
                }
            });

            this._panel.webview.postMessage({
                command: 'inheritedLineColumns',
                records,
                lineColumnsBySection,
                phaseNumber
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'inheritedLineColumnsError',
                phaseNumber,
                error: error.message
            });
        }
    }

    private async handleGeneratePhaseFile(config: MigrationConfig, phaseNumber: number) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Resolve output directory relative to workspace
            const outputDir = path.isAbsolute(config.outputDir)
                ? config.outputDir
                : path.join(this._workspaceFolder.uri.fsPath, config.outputDir);

            config.outputDir = outputDir;

            const mode = config.mode || 'standard';
            const modeLabel = mode === 'rca' ? 'RCA' : 'CPQ';

            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput(`Generating ${modeLabel} Phase ${phaseNumber} file...`, 'info');
            this.sendOutput(`Output directory: ${outputDir}`, 'info');
            this.sendOutput(`DML Operation: ${config.operation}`, 'info');
            if (config.modifiedSince) {
                this.sendOutput(`Modified since: ${config.modifiedSince}`, 'info');
            }
            this.sendOutput('='.repeat(60), 'info');

            if (mode === 'rca') {
                await generateRcaPhaseFile(config, phaseNumber);
            } else {
                await generateCpqPhaseFile(config, phaseNumber);
            }

            this.sendOutput('', 'info');
            this.sendOutput(`✓ Phase ${phaseNumber} file generated successfully in: ${path.join(outputDir, `Phase ${phaseNumber}`)}`, 'success');

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

            // Check if this specific phase file exists
            this._panel.webview.postMessage({
                command: 'checkPhaseFiles'
            });
        } catch (error: any) {
            this.sendOutput(`Error generating Phase ${phaseNumber} file: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'showError',
                message: `Failed to generate Phase ${phaseNumber} file: ${error.message}`
            });
        }
    }

    private async handleGetChildRecords(
        parentObjectName: string,
        childObjectName: string,
        relationshipField: string,
        parentIds: string[],
        childExternalId: string,
        orgAlias: string,
        phaseNumber: number
    ) {
        try {
            if (!parentIds || parentIds.length === 0) {
                this._panel.webview.postMessage({
                    command: 'childRecords',
                    parentObjectName,
                    childObjectName,
                    records: [],
                    childRecordsByParent: {},
                    phaseNumber
                });
                return;
            }

            // Query child records where relationshipField IN (parentIds)
            const whereClause = `${relationshipField} IN ('${parentIds.join("', '")}')`;
            
            const records = await queryMasterRecords(
                childObjectName,
                childExternalId,
                orgAlias,
                { whereClause },
                1000 // Get all related child records
            );

            // Group child records by parent ID
            const childRecordsByParent: { [parentId: string]: any[] } = {};
            records.forEach(record => {
                const parentId = record[relationshipField];
                if (parentId) {
                    if (!childRecordsByParent[parentId]) {
                        childRecordsByParent[parentId] = [];
                    }
                    childRecordsByParent[parentId].push(record);
                }
            });

            this._panel.webview.postMessage({
                command: 'childRecords',
                parentObjectName,
                childObjectName,
                records,
                childRecordsByParent,
                phaseNumber
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'childRecordsError',
                parentObjectName,
                childObjectName,
                phaseNumber,
                error: error.message
            });
        }
    }

    private async handleQueryChildrenForParents(
        parentObjectName: string,
        parentExternalIds: string[],
        parentExternalIdField: string,
        childConfigs: Array<{ childObjectName: string; relationshipField: string; childExternalId: string }> | undefined,
        orgAlias: string,
        phaseNumber: number
    ) {
        try {
            if (!parentExternalIds || parentExternalIds.length === 0) {
                return;
            }

            // Use comprehensive relationships map as the single source of truth
            // This ensures we always query all children based on our comprehensive audit
            const comprehensiveChildren = CPQ_COMPREHENSIVE_RELATIONSHIPS[parentObjectName] || [];
            // Filter to only children in the current phase
            const phaseChildren = comprehensiveChildren.filter(child => child.phaseNumber === phaseNumber);
            
            if (phaseChildren.length === 0) {
                // No children to query for this parent in this phase
                return;
            }

            // Build child configs from comprehensive relationships map
            const effectiveChildConfigs = phaseChildren.map(child => ({
                childObjectName: child.childObjectName,
                relationshipField: child.relationshipField,
                childExternalId: child.externalId
            }));

            // Query parent records to get their Salesforce IDs
            let whereClause = '';
            if (!parentExternalIdField.includes(';')) {
                // Simple external ID - can query directly
                const escapedIds = parentExternalIds.map(id => id.replace(/'/g, "\\'"));
                whereClause = `${parentExternalIdField} IN ('${escapedIds.join("', '")}')`;
            }

            const parentRecords = await queryMasterRecords(
                parentObjectName,
                parentExternalIdField,
                orgAlias,
                whereClause ? { whereClause } : undefined,
                1000
            );

            // Map parent external IDs to Salesforce IDs
            const parentIdMap: { [externalId: string]: string } = {};
            const parentIds: string[] = [];

            parentRecords.forEach(parentRecord => {
                // Build external ID from parent record
                let parentExternalId = '';
                if (parentExternalIdField.includes(';')) {
                    // Composite external ID
                    const fields = parentExternalIdField.split(';').map(f => f.trim());
                    const values = fields.map(field => {
                        if (field.includes('__r.') || field.includes('.')) {
                            const parts = field.split('.');
                            let value: any = parentRecord;
                            for (const part of parts) {
                                if (value && typeof value === 'object') {
                                    value = value[part];
                                } else {
                                    value = null;
                                    break;
                                }
                            }
                            return value || '';
                        } else {
                            return parentRecord[field] || '';
                        }
                    }).filter(v => v !== '');
                    parentExternalId = values.join('|');
                } else {
                    // Simple external ID
                    if (parentExternalIdField.includes('__r.') || parentExternalIdField.includes('.')) {
                        const parts = parentExternalIdField.split('.');
                        let value: any = parentRecord;
                        for (const part of parts) {
                            if (value && typeof value === 'object') {
                                value = value[part];
                            } else {
                                value = null;
                                break;
                            }
                        }
                        parentExternalId = value || '';
                    } else {
                        parentExternalId = parentRecord[parentExternalIdField] || '';
                    }
                }

                if (parentExternalId && parentRecord.Id) {
                    parentIdMap[parentRecord.Id] = parentExternalId;
                    parentIds.push(parentRecord.Id);
                }
            });

            if (parentIds.length === 0) {
                return;
            }

            // Fetch Children: match children by the lookup Id field (e.g. SBQQ__PriceRule2__c) = parent Salesforce Ids.
            // We do NOT use the external ID (e.g. SBQQ__PriceRule2__r.Name) in the WHERE; that is only for export.json.
            // childExternalId is passed to queryMasterRecords only for the SELECT clause (which fields to return).
            for (const childConfig of effectiveChildConfigs) {
                const childLookupIdField = childConfig.relationshipField; // e.g. SBQQ__PriceRule2__c (Id field)
                const whereClause = `${childLookupIdField} IN ('${parentIds.join("', '")}')`;
                
                const childRecords = await queryMasterRecords(
                    childConfig.childObjectName,
                    childConfig.childExternalId, // Used only for SELECT (display); export.json uses this elsewhere
                    orgAlias,
                    { whereClause },
                    1000
                );

                // Group child records by parent external ID (not parent Salesforce ID)
                const childRecordsByParentExternalId: { [parentExternalId: string]: any[] } = {};
                
                childRecords.forEach(childRecord => {
                    const parentSalesforceId = childRecord[childLookupIdField];
                    if (parentSalesforceId && parentIdMap[parentSalesforceId]) {
                        const parentExternalId = parentIdMap[parentSalesforceId];
                        if (!childRecordsByParentExternalId[parentExternalId]) {
                            childRecordsByParentExternalId[parentExternalId] = [];
                        }
                        childRecordsByParentExternalId[parentExternalId].push(childRecord);
                    }
                });

                // Send children grouped by parent external ID
                this._panel.webview.postMessage({
                    command: 'queriedChildRecords',
                    phaseNumber,
                    parentObjectName,
                    childObjectName: childConfig.childObjectName,
                    childRecordsByParentExternalId
                });
            }
        } catch (error: any) {
            console.error(`Error querying children for parents: ${error.message}`);
        }
    }

    private async handleOpenExternal(url: string) {
        try {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (error: any) {
            this.sendOutput(`Error opening URL: ${error.message}`, 'error');
        }
    }

    private async handleOpenFile(filePath: string) {
        try {
            const fileUri = vscode.Uri.file(filePath);
            // Try to open with system default application (for Excel files)
            await vscode.env.openExternal(fileUri);
        } catch (error: any) {
            this.sendOutput(`Error opening file: ${error.message}`, 'error');
        }
    }

    private async handleGetRcaPhaseDefinitions(includeProduct2: boolean) {
        try {
            const phases = await getRcaPhaseDefinitions(includeProduct2);
            this._panel.webview.postMessage({
                command: 'rcaPhaseDefinitions',
                phases
            });
        } catch (error: any) {
            this.sendOutput(`Error getting RCA phase definitions: ${error.message}`, 'error');
        }
    }

    private async handleExportToExcel(config: MigrationConfig, phaseNumber?: number) {
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

            this.sendOutput('='.repeat(60), 'info');
            if (phaseNumber) {
                this.sendOutput(`Exporting to Excel - Phase ${phaseNumber}...`, 'info');
            } else {
                this.sendOutput('Exporting to Excel...', 'info');
            }
            this.sendOutput(`Output directory: ${outputDir}`, 'info');
            this.sendOutput(`Mode: ${mode}`, 'info');
            if (phaseNumber) {
                this.sendOutput(`Phase: ${phaseNumber}`, 'info');
            }
            this.sendOutput('='.repeat(60), 'info');

            // Import the export service
            const { exportToExcel } = await import('../services/excelExportService');

            // Progress callback
            const progressCallback = (message: string, objectName?: string, progress?: number) => {
                if (objectName) {
                    this.sendOutput(`[${objectName}] ${message}`, 'info');
                } else {
                    this.sendOutput(message, 'info');
                }
                
                // Send progress to webview
                this._panel.webview.postMessage({
                    command: 'excelExportProgress',
                    message: message,
                    objectName: objectName,
                    progress: progress
                });
            };

            const filePath = await exportToExcel(config, progressCallback, phaseNumber);

            this.sendOutput('', 'info');
            this.sendOutput(`✓ Excel file generated successfully: ${filePath}`, 'success');

            // Notify webview
            this._panel.webview.postMessage({
                command: 'excelExportComplete',
                filePath: filePath
            });
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error exporting to Excel: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }

            // Notify webview of error
            this._panel.webview.postMessage({
                command: 'excelExportError',
                error: error.message
            });
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
            } else if (mode === 'rca') {
                // RCA mode: generate phase-based export.json files for all phases
                this.sendOutput('='.repeat(60), 'info');
                this.sendOutput('Generating RCA phase files...', 'info');
                this.sendOutput(`Output directory: ${outputDir}`, 'info');
                this.sendOutput('Selected phases: All RCA phases', 'info');
                this.sendOutput(`DML Operation: ${config.operation}`, 'info');
                if (config.modifiedSince) {
                    this.sendOutput(`Modified since: ${config.modifiedSince}`, 'info');
                }
                this.sendOutput('='.repeat(60), 'info');

                await generateRcaPhaseFiles(config);

                this.sendOutput('', 'info');
                this.sendOutput(`✓ RCA phase files generated successfully in: ${outputDir}`, 'success');

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

            // Create backup before migration (only for non-simulation runs)
            let backupLocation: string | undefined;
            if (!simulation) {
                try {
                    this.sendOutput('', 'info');
                    this.sendOutput('Creating backup for rollback...', 'info');
                    backupLocation = await createPreMigrationBackup(
                        config,
                        undefined, // No phase number for standard mode
                        (message) => this.sendOutput(message, 'info'),
                        this._workspaceFolder?.uri.fsPath
                    );
                    config.backupLocation = backupLocation;
                    this.sendOutput(`✓ Backup created: ${backupLocation}`, 'success');
                    
                    // Notify webview that backup was created
                    this._panel.webview.postMessage({
                        command: 'backupCreated',
                        backupLocation: backupLocation
                    });
                } catch (error: any) {
                    this.sendOutput(`✗ Backup creation failed: ${error.message}`, 'error');
                    this.sendOutput('Migration cancelled to prevent data loss without backup.', 'error');
                    // Ask user if they want to proceed without backup
                    const proceed = await vscode.window.showWarningMessage(
                        'Backup creation failed. Do you want to proceed with migration without backup?',
                        { modal: true },
                        'Proceed Without Backup',
                        'Cancel'
                    );
                    if (proceed !== 'Proceed Without Backup') {
                        return;
                    }
                }
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

            // Use runSFDMUInTerminal for interactive terminal execution
            const result = await this.runSFDMUInTerminal(
                outputDir,
                config.sourceOrg.username,
                config.targetOrg.username,
                simulation,
                false // This is not a rollback
            );
            
            // Display results
            this.sendOutput('', 'info');
            this.sendOutput('-'.repeat(60), 'info');
            if (result.success) {
                this.sendOutput('✓ Migration command executed in terminal', 'success');
                this.sendOutput('Check the terminal output above for detailed results.', 'info');
            } else {
                this.sendOutput('✗ Migration command execution failed', 'error');
                if (result.errors) {
                    result.errors.forEach(err => this.sendOutput(`  - ${err}`, 'error'));
                }
            }

            // Request non-blocking confirmation for post-migration backup
            // This shows a notification that doesn't block the terminal
            if (result.success) {
                await this.requestMigrationCompletionConfirmation(
                    config,
                    backupLocation,
                    undefined, // No phase number for standard mode
                    'migration',
                    simulation
                );
            } else {
                this.sendOutput('⚠ Migration did not complete successfully - skipping post-migration backup', 'error');
            }
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error running migration: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }

    private async handleGetCpqPhaseObjects(config: MigrationConfig, phaseNumber: number) {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'cpqPhaseObjects',
                    phaseNumber: phaseNumber,
                    objects: [],
                    error: 'No workspace folder open'
                });
                return;
            }

            const outputDir = path.isAbsolute(config.outputDir)
                ? config.outputDir
                : path.join(this._workspaceFolder.uri.fsPath, config.outputDir);

            const phaseDir = path.resolve(path.join(outputDir, `Phase ${phaseNumber}`));
            const exportJsonPath = path.join(phaseDir, 'export.json');

            try {
                await fs.access(exportJsonPath);
            } catch {
                this._panel.webview.postMessage({
                    command: 'cpqPhaseObjects',
                    phaseNumber: phaseNumber,
                    objects: [],
                    error: `Export.json not found for Phase ${phaseNumber}`
                });
                return;
            }

            // Read and parse export.json
            const exportJsonContent = await fs.readFile(exportJsonPath, 'utf8');
            const exportJson = JSON.parse(exportJsonContent);
            const objects = exportJson.objects || [];

            // Extract object names from queries
            const objectList = objects.map((obj: any) => {
                let objectName = 'Unknown';
                // Try to extract from query
                if (obj.query) {
                    const match = obj.query.match(/FROM\s+(\w+)/i);
                    if (match && match[1]) {
                        objectName = match[1];
                    }
                }
                // Fallback to objectName property if available
                if (!objectName || objectName === 'Unknown') {
                    objectName = obj.objectName || 'Unknown';
                }
                
                return {
                    objectName: objectName,
                    externalId: obj.externalId || 'N/A',
                    operation: obj.operation || 'Upsert',
                    master: obj.master !== undefined ? obj.master : true
                };
            });

            this._panel.webview.postMessage({
                command: 'cpqPhaseObjects',
                phaseNumber: phaseNumber,
                objects: objectList
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'cpqPhaseObjects',
                phaseNumber: phaseNumber,
                objects: [],
                error: error.message || 'Failed to read export.json'
            });
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

            // Create backup before migration (only for non-simulation runs)
            let backupLocation: string | undefined;
            if (!simulation) {
                try {
                    this.sendOutput('', 'info');
                    this.sendOutput(`Creating backup for Phase ${phaseNumber}...`, 'info');
                    backupLocation = await createPreMigrationBackup(
                        config,
                        phaseNumber,
                        (message) => this.sendOutput(message, 'info'),
                        this._workspaceFolder?.uri.fsPath
                    );
                    config.backupLocation = backupLocation;
                    this.sendOutput(`✓ Backup created: ${backupLocation}`, 'success');
                    
                    // Notify webview that backup was created
                    this._panel.webview.postMessage({
                        command: 'backupCreated',
                        backupLocation: backupLocation,
                        phaseNumber: phaseNumber
                    });
                } catch (error: any) {
                    this.sendOutput(`✗ Backup creation failed: ${error.message}`, 'error');
                    this.sendOutput('Migration cancelled to prevent data loss without backup.', 'error');
                    const proceed = await vscode.window.showWarningMessage(
                        'Backup creation failed. Do you want to proceed with migration without backup?',
                        { modal: true },
                        'Proceed Without Backup',
                        'Cancel'
                    );
                    if (proceed !== 'Proceed Without Backup') {
                        return;
                    }
                }
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

            // Use runSFDMUInTerminal for interactive terminal execution
            const result = await this.runSFDMUInTerminal(
                phaseDir,
                config.sourceOrg.username,
                config.targetOrg.username,
                simulation,
                false // This is not a rollback
            );
            
            // Display results
            this.sendOutput('', 'info');
            this.sendOutput('-'.repeat(60), 'info');
            if (result.success) {
                this.sendOutput(`✓ Phase ${phaseNumber} command executed in terminal`, 'success');
                this.sendOutput('Check the terminal output above for detailed results.', 'info');
            } else {
                this.sendOutput(`✗ Phase ${phaseNumber} command execution failed`, 'error');
                if (result.errors) {
                    result.errors.forEach(err => this.sendOutput(`  - ${err}`, 'error'));
                }
            }

            // Request non-blocking confirmation for post-migration backup
            // This shows a notification that doesn't block the terminal
            if (result.success) {
                await this.requestMigrationCompletionConfirmation(
                    config,
                    backupLocation,
                    phaseNumber,
                    'CPQ migration',
                    simulation
                );
            } else {
                this.sendOutput(`⚠ Phase ${phaseNumber} did not complete successfully - skipping post-migration backup`, 'error');
            }
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error running CPQ phase ${phaseNumber}: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }

    private async handleRunRcaPhase(
        config: MigrationConfig,
        phaseNumber: number,
        simulation: boolean
    ) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Check metadata prerequisites before Phase 7
            if (phaseNumber === 7) {
                this.sendOutput('', 'info');
                this.sendOutput('Checking metadata prerequisites for Phase 7...', 'info');
                try {
                    const result = await deployMetadataPrerequisites(config.sourceOrg, config.targetOrg);
                    if (!result.success) {
                        this.sendOutput('Warning: Metadata deployment had errors:', 'error');
                        result.errors.forEach(err => this.sendOutput(`  - ${err}`, 'error'));
                        this.sendOutput('You may need to deploy metadata manually before running Phase 7.', 'error');
                    } else if (result.deployedRecords > 0) {
                        this.sendOutput(`✓ Deployed ${result.deployedRecords} metadata record(s)`, 'success');
                    } else {
                        this.sendOutput('✓ Metadata prerequisites already exist in target org', 'success');
                    }
                } catch (error: any) {
                    this.sendOutput(`Warning: Could not check/deploy metadata: ${error.message}`, 'error');
                    this.sendOutput('You may need to deploy metadata manually before running Phase 7.', 'error');
                }
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
                    'Please generate RCA phase files first using the "Generate" button in the header.',
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
                    'Please generate RCA phase files first using the "Generate" button in the header.',
                    'error'
                );
                return;
            }

            // Create backup before migration (only for non-simulation runs)
            let backupLocation: string | undefined;
            if (!simulation) {
                try {
                    this.sendOutput('', 'info');
                    this.sendOutput(`Creating backup for Phase ${phaseNumber}...`, 'info');
                    backupLocation = await createPreMigrationBackup(
                        config,
                        phaseNumber,
                        (message) => this.sendOutput(message, 'info'),
                        this._workspaceFolder?.uri.fsPath
                    );
                    config.backupLocation = backupLocation;
                    this.sendOutput(`✓ Backup created: ${backupLocation}`, 'success');
                    
                    // Notify webview that backup was created
                    this._panel.webview.postMessage({
                        command: 'backupCreated',
                        backupLocation: backupLocation,
                        phaseNumber: phaseNumber
                    });
                } catch (error: any) {
                    this.sendOutput(`✗ Backup creation failed: ${error.message}`, 'error');
                    this.sendOutput('Migration cancelled to prevent data loss without backup.', 'error');
                    const proceed = await vscode.window.showWarningMessage(
                        'Backup creation failed. Do you want to proceed with migration without backup?',
                        { modal: true },
                        'Proceed Without Backup',
                        'Cancel'
                    );
                    if (proceed !== 'Proceed Without Backup') {
                        return;
                    }
                }
            }

            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput(
                `Running RCA Phase ${phaseNumber}${simulation ? ' (SIMULATION MODE)' : ''}`,
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

            // Use runSFDMUInTerminal for interactive terminal execution
            const result = await this.runSFDMUInTerminal(
                phaseDir,
                config.sourceOrg.username,
                config.targetOrg.username,
                simulation,
                false // This is not a rollback
            );
            
            // Display results
            this.sendOutput('', 'info');
            this.sendOutput('-'.repeat(60), 'info');
            if (result.success) {
                this.sendOutput(`✓ Phase ${phaseNumber} command executed in terminal`, 'success');
                this.sendOutput('Check the terminal output above for detailed results.', 'info');
            } else {
                this.sendOutput(`✗ Phase ${phaseNumber} command execution failed`, 'error');
                if (result.errors) {
                    result.errors.forEach(err => this.sendOutput(`  - ${err}`, 'error'));
                }
            }

            // Request non-blocking confirmation for post-migration backup
            // This shows a notification that doesn't block the terminal
            if (result.success) {
                await this.requestMigrationCompletionConfirmation(
                    config,
                    backupLocation,
                    phaseNumber,
                    'RCA migration',
                    simulation
                );
            } else {
                this.sendOutput(`⚠ Phase ${phaseNumber} did not complete successfully - skipping post-migration backup`, 'error');
            }
        } catch (error: any) {
            this.sendOutput('', 'error');
            this.sendOutput(`✗ Error running RCA phase ${phaseNumber}: ${error.message}`, 'error');
            if (error.stack) {
                this.sendOutput(error.stack, 'error');
            }
        }
    }

    private async handleDeployMetadataPrerequisites(config: MigrationConfig) {
        try {
            if (!config.sourceOrg.username || !config.targetOrg.username) {
                this.sendOutput('Error: Source and target orgs are required', 'error');
                return;
            }

            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput('Deploying Metadata Prerequisites', 'info');
            this.sendOutput('-'.repeat(60), 'info');

            const result = await deployMetadataPrerequisites(config.sourceOrg, config.targetOrg);

            if (result.success) {
                this.sendOutput(`✓ Successfully deployed ${result.deployedRecords} metadata record(s)`, 'success');
                this._panel.webview.postMessage({
                    command: 'metadataDeployed',
                    success: true,
                    deployedRecords: result.deployedRecords
                });
            } else {
                this.sendOutput('✗ Metadata deployment failed:', 'error');
                result.errors.forEach(err => this.sendOutput(`  - ${err}`, 'error'));
                this._panel.webview.postMessage({
                    command: 'metadataDeployed',
                    success: false,
                    errors: result.errors
                });
            }
        } catch (error: any) {
            this.sendOutput(`✗ Error deploying metadata: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'metadataDeployed',
                success: false,
                errors: [error.message]
            });
        }
    }

    private async handleLoadBackups(configName: string) {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'backupsLoaded',
                    backups: [],
                    error: 'No workspace folder open'
                });
                return;
            }

            const workspaceRoot = this._workspaceFolder.uri.fsPath;
            
            // Get current config to determine output directory
            // We need to load the config to get the outputDir
            let outputDir: string | undefined;
            let mode: string = 'standard';
            
            try {
                const config = await loadConfiguration(configName, this._workspaceFolder);
                outputDir = config.outputDir;
                mode = config.mode || 'standard';
            } catch {
                // If we can't load config, try to infer from configName
                outputDir = `sfdmu-migration/${configName}`;
            }
            
            // For phase-based modes, we need to check all phases
            // For now, we'll check the main output directory and Phase 1
            let allBackups: any[] = [];
            
            if (mode === 'cpq' || mode === 'rca') {
                // Check all phases (1-10 for CPQ, 1-7 for RCA)
                const maxPhases = mode === 'cpq' ? 10 : 7;
                for (let phase = 1; phase <= maxPhases; phase++) {
                    try {
                        const phaseBackups = await listAvailableBackups(configName, workspaceRoot, outputDir, phase);
                        allBackups.push(...phaseBackups);
                    } catch {
                        // Phase directory might not exist, continue
                    }
                }
            } else {
                // Standard mode - check main output directory
                allBackups = await listAvailableBackups(configName, workspaceRoot, outputDir);
            }

            this._panel.webview.postMessage({
                command: 'backupsLoaded',
                backups: allBackups
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'backupsLoaded',
                backups: [],
                error: error.message
            });
        }
    }

    private async handleCheckPhaseBackups(configName: string, mode?: string) {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'phaseBackupsStatus',
                    phasesWithBackups: []
                });
                return;
            }
            const workspaceRoot = this._workspaceFolder.uri.fsPath;
            let outputDir: string | undefined;
            let resolvedMode: string = mode || 'standard';
            try {
                const config = await loadConfiguration(configName, this._workspaceFolder);
                outputDir = config.outputDir;
                if (!mode) {
                    resolvedMode = config.mode || 'standard';
                }
            } catch {
                outputDir = `sfdmu-migration/${configName}`;
            }
            const phasesWithBackups: number[] = [];
            if (resolvedMode === 'cpq' || resolvedMode === 'rca') {
                const maxPhases = resolvedMode === 'cpq' ? 10 : 7;
                for (let phase = 1; phase <= maxPhases; phase++) {
                    try {
                        const backups = await listAvailableBackups(configName, workspaceRoot, outputDir, phase);
                        if (backups.length > 0) {
                            phasesWithBackups.push(phase);
                        }
                    } catch {
                        // Phase directory might not exist, continue
                    }
                }
            }
            this._panel.webview.postMessage({
                command: 'phaseBackupsStatus',
                phasesWithBackups
            });
        } catch {
            this._panel.webview.postMessage({
                command: 'phaseBackupsStatus',
                phasesWithBackups: []
            });
        }
    }

    private async handleShowRollbackModal(configName: string, backupDir?: string, phaseNumber?: number) {
        try {
            if (!this._workspaceFolder) {
                this._panel.webview.postMessage({
                    command: 'rollbackModalData',
                    error: 'No workspace folder open'
                });
                return;
            }

            const workspaceRoot = this._workspaceFolder.uri.fsPath;
            
            // Get current config to determine output directory
            let outputDir: string | undefined;
            let mode: string = 'standard';
            
            try {
                const config = await loadConfiguration(configName, this._workspaceFolder);
                outputDir = config.outputDir;
                mode = config.mode || 'standard';
            } catch {
                // If we can't load config, try to infer from configName
                outputDir = `sfdmu-migration/${configName}`;
            }
            
            // Get backups: when phaseNumber is provided (CPQ/RCA phase-scoped), only that phase; otherwise all
            let backups: any[] = [];
            
            if (phaseNumber !== undefined && phaseNumber !== null && (mode === 'cpq' || mode === 'rca')) {
                // Phase-scoped: only backups for this phase
                backups = await listAvailableBackups(configName, workspaceRoot, outputDir, phaseNumber);
            } else if (mode === 'cpq' || mode === 'rca') {
                // CPQ/RCA without phase: check all phases
                const maxPhases = mode === 'cpq' ? 10 : 7;
                for (let phase = 1; phase <= maxPhases; phase++) {
                    try {
                        const phaseBackups = await listAvailableBackups(configName, workspaceRoot, outputDir, phase);
                        backups.push(...phaseBackups);
                    } catch {
                        // Phase directory might not exist, continue
                    }
                }
            } else {
                // Standard mode
                backups = await listAvailableBackups(configName, workspaceRoot, outputDir);
            }

            if (backups.length === 0) {
                this._panel.webview.postMessage({
                    command: 'rollbackModalData',
                    error: 'No backups found for this configuration'
                });
                return;
            }

            // Use provided backupDir or default to newest
            const selectedBackup = backupDir 
                ? backups.find(b => b.path === backupDir) || backups[0]
                : backups[0];

            // Generate rollback config
            const rollbackConfig = await generateRollbackConfig(
                selectedBackup.path,
                selectedBackup.metadata.sourceOrg,
                selectedBackup.metadata.targetOrg
            );

            this._panel.webview.postMessage({
                command: 'rollbackModalData',
                backups: backups,
                selectedBackup: selectedBackup,
                rollbackConfig: rollbackConfig
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'rollbackModalData',
                error: error.message
            });
        }
    }

    private async handleRollbackSimulation(backupDir: string, config: MigrationConfig) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Load backup metadata
            const { loadBackupMetadata } = await import('../services/backupService');
            const metadata = await loadBackupMetadata(backupDir);

            // Generate rollback config
            const rollbackConfig = await generateRollbackConfig(
                backupDir,
                metadata.targetOrg, // Target becomes source for rollback
                metadata.sourceOrg  // Source becomes target for rollback
            );

            // Generate rollback export.json
            const { generateRollbackExportJson } = await import('../services/rollbackRunner');
            const rollbackOutputDir = await generateRollbackExportJson(rollbackConfig);

            // Display rollback simulation information
            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput('Running Rollback Simulation', 'info');
            this.sendOutput(`Backup: ${backupDir}`, 'info');
            this.sendOutput(`Objects: ${rollbackConfig.objects.length}`, 'info');
            this.sendOutput(`Source Org: ${rollbackConfig.sourceOrg.username}`, 'info');
            this.sendOutput(`Target Org: ${rollbackConfig.targetOrg.username}`, 'info');
            this.sendOutput('-'.repeat(60), 'info');

            // Show rollback operations
            this.sendOutput('Rollback Operations (Simulation):', 'info');
            rollbackConfig.objects.forEach((obj, index) => {
                this.sendOutput(`  ${index + 1}. ${obj.objectName}: ${obj.originalOperation} → ${obj.rollbackOperation}`, 'info');
            });
            this.sendOutput('', 'info');

            // Build the command
            const command = `sf sfdmu run --sourceusername "${rollbackConfig.sourceOrg.username}" --targetusername "${rollbackConfig.targetOrg.username}" --simulation`;
            this.sendOutput(`Command: ${command}`, 'info');
            this.sendOutput(`Working directory: ${rollbackOutputDir}`, 'info');
            this.sendOutput(`Export.json location: ${path.join(rollbackOutputDir, 'export.json')}`, 'info');
            this.sendOutput('', 'info');
            this.sendOutput('Opening terminal for rollback simulation...', 'info');
            this.sendOutput('You can respond to prompts (y/n) directly in the terminal.', 'info');
            this.sendOutput('', 'info');

            // Use VSCode Terminal API for interactive execution
            const result = await this.runSFDMUInTerminal(
                rollbackOutputDir,
                rollbackConfig.sourceOrg.username,
                rollbackConfig.targetOrg.username,
                true, // Simulation mode
                true // This is a rollback
            );

            // Display results
            this.sendOutput('', 'info');
            this.sendOutput('-'.repeat(60), 'info');
            if (result.success) {
                this.sendOutput('✓ Rollback simulation command executed in terminal', 'success');
                this.sendOutput('Check the terminal output above for detailed results.', 'info');
            } else {
                this.sendOutput('✗ Rollback simulation may have had issues', 'error');
                this.sendOutput('Check the terminal output above for error details.', 'error');
            }
        } catch (error: any) {
            this.sendOutput(`✗ Error running rollback simulation: ${error.message}`, 'error');
        }
    }

    private async handleExecuteRollback(backupDir: string, config: MigrationConfig) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            // Load backup metadata
            const { loadBackupMetadata } = await import('../services/backupService');
            const metadata = await loadBackupMetadata(backupDir);

            // Generate rollback config
            const rollbackConfig = await generateRollbackConfig(
                backupDir,
                metadata.targetOrg, // Target becomes source for rollback
                metadata.sourceOrg  // Source becomes target for rollback
            );

            // Generate rollback export.json (this creates the rollback directory and export.json)
            const { generateRollbackExportJson } = await import('../services/rollbackRunner');
            const rollbackOutputDir = await generateRollbackExportJson(rollbackConfig);

            // Display rollback information
            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput('Executing Rollback', 'info');
            this.sendOutput(`Backup: ${backupDir}`, 'info');
            this.sendOutput(`Objects: ${rollbackConfig.objects.length}`, 'info');
            this.sendOutput(`Source Org: ${rollbackConfig.sourceOrg.username}`, 'info');
            this.sendOutput(`Target Org: ${rollbackConfig.targetOrg.username}`, 'info');
            this.sendOutput('-'.repeat(60), 'info');

            // Show rollback operations
            this.sendOutput('Rollback Operations:', 'info');
            rollbackConfig.objects.forEach((obj, index) => {
                this.sendOutput(`  ${index + 1}. ${obj.objectName}: ${obj.originalOperation} → ${obj.rollbackOperation}`, 'info');
            });
            this.sendOutput('', 'info');

            // Build the command
            const command = `sf sfdmu run --sourceusername "${rollbackConfig.sourceOrg.username}" --targetusername "${rollbackConfig.targetOrg.username}"`;
            this.sendOutput(`Command: ${command}`, 'info');
            this.sendOutput(`Working directory: ${rollbackOutputDir}`, 'info');
            this.sendOutput(`Export.json location: ${path.join(rollbackOutputDir, 'export.json')}`, 'info');
            this.sendOutput('', 'info');
            this.sendOutput('Opening terminal for rollback execution...', 'info');
            this.sendOutput('You can respond to prompts (y/n) directly in the terminal.', 'info');
            this.sendOutput('', 'info');

            // Use VSCode Terminal API for interactive execution (same as regular migrations)
            const result = await this.runSFDMUInTerminal(
                rollbackOutputDir,
                rollbackConfig.sourceOrg.username,
                rollbackConfig.targetOrg.username,
                false, // Not a simulation
                true // This is a rollback
            );

            // Display results
            this.sendOutput('', 'info');
            this.sendOutput('-'.repeat(60), 'info');
            if (result.success) {
                this.sendOutput('✓ Rollback command executed in terminal', 'success');
                this.sendOutput('Check the terminal output above for detailed results.', 'info');
            } else {
                this.sendOutput('✗ Rollback execution may have had issues', 'error');
                this.sendOutput('Check the terminal output above for error details.', 'error');
            }

            // Notify webview
            this._panel.webview.postMessage({
                command: 'rollbackCompleted',
                success: result.success,
                recordsProcessed: result.recordsProcessed,
                errors: result.errors
            });
        } catch (error: any) {
            this.sendOutput(`✗ Error executing rollback: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'rollbackCompleted',
                success: false,
                errors: [error.message]
            });
        }
    }

    private async handleCreateBackup(config: MigrationConfig, phaseNumber?: number) {
        try {
            if (!this._workspaceFolder) {
                this.sendOutput('Error: No workspace folder open', 'error');
                return;
            }

            if (!config.targetOrg.alias) {
                this.sendOutput('Error: Target org alias is required for backup', 'error');
                return;
            }

            if (!config.configName) {
                this.sendOutput('Error: Configuration name is required for backup', 'error');
                return;
            }

            const mode = config.mode || 'standard';

            const phaseLabel = phaseNumber ? ` for Phase ${phaseNumber}` : '';
            vscode.window.showInformationMessage(`Creating backup${phaseLabel}...`);

            this.sendOutput('', 'info');
            this.sendOutput('='.repeat(60), 'info');
            this.sendOutput('Creating Manual Backup', 'info');
            if (phaseNumber) {
                this.sendOutput(`Phase: ${phaseNumber}`, 'info');
            }
            this.sendOutput(`Mode: ${mode}`, 'info');
            this.sendOutput('-'.repeat(60), 'info');

            const backupLocation = await createPreMigrationBackup(
                config,
                phaseNumber,
                (message) => this.sendOutput(message, 'info'),
                this._workspaceFolder?.uri.fsPath
            );

            config.backupLocation = backupLocation;
            this.sendOutput(`✓ Backup created successfully: ${backupLocation}`, 'success');

            // Notify webview that backup was created
            this._panel.webview.postMessage({
                command: 'backupCreated',
                backupLocation: backupLocation,
                phaseNumber: phaseNumber
            });

            // Notify webview to update rollback button visibility
            this._panel.webview.postMessage({
                command: 'loadBackups',
                configName: config.configName
            });
        } catch (error: any) {
            this.sendOutput(`✗ Error creating backup: ${error.message}`, 'error');
            this._panel.webview.postMessage({
                command: 'showError',
                message: `Failed to create backup: ${error.message}`
            });
        }
    }

    private async requestMigrationCompletionConfirmation(
        config: MigrationConfig,
        backupLocation: string | undefined,
        phaseNumber: number | undefined,
        migrationType: string,
        simulation: boolean
    ): Promise<void> {
        // Only request confirmation for non-simulation migrations with backup location
        if (simulation || !backupLocation) {
            return;
        }

        const phaseText = phaseNumber ? ` Phase ${phaseNumber}` : '';
        const migrationKey = phaseNumber 
            ? `${config.configName || 'migration'}-phase-${phaseNumber}`
            : `${config.configName || 'migration'}-standard`;
        
        // Store pending migration info with start time
        this._pendingMigrations.set(migrationKey, {
            config,
            backupLocation,
            phaseNumber,
            migrationType,
            simulation,
            startTime: new Date() // Capture start time when migration begins
        });

        // Show custom modal in webview (non-blocking, doesn't interfere with terminal)
        this._panel.webview.postMessage({
            command: 'showMigrationCompletionModal',
            migrationKey: migrationKey,
            migrationType: migrationType,
            phaseNumber: phaseNumber
        });
    }

    public async handleMigrationCompletion(migrationKey?: string): Promise<void> {
        // If no key provided, show picker for pending migrations
        if (!migrationKey) {
            const pendingKeys = Array.from(this._pendingMigrations.keys());
            if (pendingKeys.length === 0) {
                vscode.window.showInformationMessage('No pending migrations to complete.');
                return;
            }
            
            if (pendingKeys.length === 1) {
                migrationKey = pendingKeys[0];
            } else {
                const selected = await vscode.window.showQuickPick(
                    pendingKeys.map(key => ({
                        label: key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        value: key
                    })),
                    { placeHolder: 'Select migration to complete' }
                );
                if (!selected) return;
                migrationKey = selected.value;
            }
        }

        const pending = this._pendingMigrations.get(migrationKey!);
        if (!pending) {
            vscode.window.showWarningMessage('Migration not found or already completed.');
            return;
        }

        const { config, backupLocation, phaseNumber, migrationType, startTime } = pending;

        // Capture end time when user confirms migration is complete
        const endTime = new Date();

        try {
            this.sendOutput('', 'info');
            if (phaseNumber) {
                this.sendOutput(`Creating post-migration backup for ${migrationType} Phase ${phaseNumber}...`, 'info');
                await createPostMigrationBackup(
                    config,
                    backupLocation!,
                    phaseNumber,
                    (message) => this.sendOutput(message, 'info'),
                    this._workspaceFolder?.uri.fsPath,
                    startTime, // Pass start time
                    endTime    // Pass end time
                );
                this.sendOutput(`✓ Post-migration backup completed for Phase ${phaseNumber}`, 'success');
            } else {
                this.sendOutput('Creating post-migration backup...', 'info');
                await createPostMigrationBackup(
                    config,
                    backupLocation!,
                    undefined,
                    (message) => this.sendOutput(message, 'info'),
                    this._workspaceFolder?.uri.fsPath,
                    startTime, // Pass start time
                    endTime    // Pass end time
                );
                this.sendOutput('✓ Post-migration backup completed', 'success');
            }

            // Remove from pending
            this._pendingMigrations.delete(migrationKey!);
            
            // Save migration history
            const result = { success: true, output: 'Migration completed in terminal' };
            if (phaseNumber) {
                await saveMigrationHistory(config, result, backupLocation, phaseNumber);
            } else {
                await saveMigrationHistory(config, result, backupLocation);
            }
        } catch (error: any) {
            this.sendOutput(`⚠ Post-migration backup failed: ${error.message}`, 'error');
            console.error('Failed to create post-migration backup:', error);
        }
    }

    private async runSFDMUInTerminal(
        outputDir: string,
        sourceUsername: string,
        targetUsername: string,
        simulation: boolean,
        isRollback: boolean = false
    ): Promise<{ success: boolean; recordsProcessed?: number; errors?: string[]; output: string }> {
        // Create a terminal for interactive execution
        const terminalName = isRollback 
            ? `SFDMU Rollback${simulation ? ' (Simulation)' : ''}`
            : `SFDMU Migration${simulation ? ' (Simulation)' : ''}`;
        
        const terminal = vscode.window.createTerminal({
            name: terminalName,
            cwd: outputDir
        });

        // Build the command
        let command = `sf sfdmu run --sourceusername "${sourceUsername}" --targetusername "${targetUsername}"`;
        if (simulation) {
            command += ' --simulation';
        }

        // Show the terminal (bring it to front)
        terminal.show(true);

        // Send the command to the terminal
        terminal.sendText(command);

        // Return a basic result (terminal execution doesn't capture output)
        // Migration history will be saved with basic info
        return {
            success: true, // Assume success - user will see results in terminal
            output: `${isRollback ? 'Rollback' : 'Migration'} executed in terminal. Check terminal output for results.`
        };
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

