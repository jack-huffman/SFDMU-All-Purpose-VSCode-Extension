// Message Handler Module - Handles VS Code messages
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    const ConfigManager = window.SFDMU.ConfigManager;
    const MigrationObjects = window.SFDMU.MigrationObjects;
    const MigrationExecution = window.SFDMU.MigrationExecution;
    const CpqMode = window.SFDMU.CpqMode;
    const RcaMode = window.SFDMU.RcaMode;
    // Don't capture Explorer at module load - get it dynamically
    const Modals = window.SFDMU.Modals;
    
    window.SFDMU.MessageHandler = {
        setup: function() {
            // Only set up the listener once
            if (this._listenerSetup) {
                return;
            }
            this._listenerSetup = true;
            
            window.addEventListener('message', event => {
                const message = event.data;
                // console.log('MessageHandler received:', message.command, message);
                
                switch (message.command) {
                    case 'externalIdDetected':
                        const objectCards = document.querySelectorAll('.migration-object-card');
                        objectCards.forEach((card) => {
                            const nameInput = card.querySelector('.migration-input[data-field="objectName"]');
                            if (nameInput && nameInput.value === message.objectName) {
                                const externalIdInput = card.querySelector('.migration-input[data-field="externalId"]');
                                if (externalIdInput && message.externalIds && message.externalIds.length > 0) {
                                    externalIdInput.value = message.externalIds.join(';');
                                    MigrationObjects.update();
                                }
                            }
                        });
                        if (message.externalIds && message.externalIds.length > 0) {
                            vscode.postMessage({ command: 'showInfo', message: `External ID detected: ${message.externalIds.join(', ')}` });
                        } else {
                            vscode.postMessage({ command: 'showInfo', message: 'No external ID fields found. Please enter manually.' });
                        }
                        break;
                        
                    case 'externalIdDetectionError':
                        vscode.postMessage({ command: 'showError', message: `Failed to detect external ID: ${message.error}` });
                        break;
                        
                    case 'availableObjects':
                        // Cache the objects for future use
                        if (message.orgAlias && message.objects) {
                            State.objectsCache[message.orgAlias] = {
                                objects: message.objects,
                                timestamp: Date.now()
                            };
                        }
                        
                        if (window.objectModalState && window.objectModalState.setObjects) {
                            if (message.objects && message.objects.length > 0) {
                                window.objectModalState.setObjects(message.objects);
                            } else {
                                window.objectModalState.setObjects([]);
                                vscode.postMessage({ command: 'showInfo', message: 'No objects found' });
                            }
                        } else {
                            if (message.objects && message.objects.length > 0) {
                                message.objects.forEach(objName => {
                                    MigrationObjects.add(objName, '', false, '');
                                });
                            }
                        }
                        break;
                        
                    case 'availableObjectsError':
                        if (window.objectModalState && window.objectModalState.showLoading) {
                            const loadingDiv = document.getElementById('object-list-loading');
                            const objectList = document.getElementById('object-list');
                            loadingDiv.style.display = 'none';
                            objectList.innerHTML = `<p class="error-text">Error: ${message.error}</p>`;
                        } else {
                            vscode.postMessage({ command: 'showError', message: `Failed to load objects: ${message.error}` });
                        }
                        break;
                        
                        
                    case 'allFieldsWithDataType':
                        // Cache the fields for future use (used by all field-related modals)
                        if (message.orgAlias && message.objectName && message.fields) {
                            if (!State.fieldsCache[message.orgAlias]) {
                                State.fieldsCache[message.orgAlias] = {};
                            }
                            State.fieldsCache[message.orgAlias][message.objectName] = {
                                fields: message.fields,
                                timestamp: Date.now()
                            };
                        }
                        
                        // Handle master selection modal filter autocomplete
                        if (window.masterSelectionModalState && message.objectName && message.fields) {
                            if (!window.masterSelectionModalState.fieldMetadata) {
                                window.masterSelectionModalState.fieldMetadata = {};
                            }
                            window.masterSelectionModalState.fieldMetadata[message.objectName] = message.fields;
                            
                            // Re-render filter section if it's visible to update autocomplete
                            const filtersSection = document.getElementById(`master-selection-filters-${message.objectName}`);
                            if (filtersSection && filtersSection.style.display !== 'none') {
                                if (window.SFDMU && window.SFDMU.Cpq && window.SFDMU.Cpq.renderFilterSection) {
                                    window.SFDMU.Cpq.renderFilterSection(message.objectName);
                                }
                            }
                        }
                        
                        // Handle external ID selection modal
                        const loadingDiv = document.getElementById('external-id-list-loading');
                        if (loadingDiv) {
                            loadingDiv.style.display = 'none';
                        }
                        
                        if (message.fields && message.fields.length > 0) {
                            if (window.externalIdModalState) {
                                window.externalIdModalState.allFields = message.fields;
                                window.externalIdModalState.filteredFields = [...message.fields];
                                if (Modals && Modals.renderExternalIdFieldList) {
                                    Modals.renderExternalIdFieldList();
                                }
                            }
                            
                            // Also handle field selection modal if it's open
                            if (window.fieldModalState && window.fieldModalState.setFields) {
                                window.fieldModalState.setFields(message.fields);
                            }
                        } else {
                            if (window.externalIdModalState) {
                                window.externalIdModalState.allFields = [];
                                window.externalIdModalState.filteredFields = [];
                            }
                            const fieldList = document.getElementById('external-id-list');
                            if (fieldList) {
                                fieldList.innerHTML = '<p class="info-text">No fields found for this object.</p>';
                            }
                            vscode.postMessage({ command: 'showInfo', message: 'No fields found. You can enter an external ID manually.' });
                        }
                        break;
                        
                    case 'allFieldsWithDataTypeError':
                        const loadingDivError = document.getElementById('external-id-list-loading');
                        if (loadingDivError) {
                            loadingDivError.style.display = 'none';
                        }
                        const fieldListError = document.getElementById('external-id-list');
                        if (fieldListError) {
                            fieldListError.innerHTML = `<p class="info-text" style="color: var(--vscode-errorForeground);">Error: ${message.error}</p>`;
                        }
                        vscode.postMessage({ command: 'showError', message: `Failed to get fields: ${message.error}` });
                        break;
                        
                        
                    case 'detectExternalIdResult':
                        const manualAutoDetectBtn = document.getElementById('manual-auto-detect');
                        if (manualAutoDetectBtn) {
                            manualAutoDetectBtn.disabled = false;
                            manualAutoDetectBtn.textContent = 'Auto-detect';
                        }
                        
                        if (message.error) {
                            vscode.postMessage({ command: 'showError', message: `Failed to detect external ID: ${message.error}` });
                        } else if (message.externalIds && message.externalIds.length > 0) {
                            const externalIdField = document.getElementById('manual-external-id');
                            if (externalIdField) {
                                externalIdField.value = message.externalIds[0];
                                if (message.externalIds.length > 1) {
                                    vscode.postMessage({ 
                                        command: 'showInfo', 
                                        message: `Found ${message.externalIds.length} external ID fields. Using "${message.externalIds[0]}". Others: ${message.externalIds.slice(1).join(', ')}` 
                                    });
                                }
                            }
                        } else {
                            vscode.postMessage({ command: 'showInfo', message: 'No external ID fields found for this object. Please enter one manually.' });
                        }
                        break;
                        
                    case 'orgList':
                        State.orgList = message.orgs || [];
                        // Show notification if this was a manual refresh
                        if (State.isRefreshingOrgs) {
                            State.isRefreshingOrgs = false;
                            // Remove rotating class to stop animation
                            const refreshOrgsBtn = document.getElementById('refresh-orgs');
                            if (refreshOrgsBtn) {
                                refreshOrgsBtn.classList.remove('rotating');
                            }
                            if (message.error) {
                                vscode.postMessage({ command: 'showError', message: `Failed to refresh orgs: ${message.error}` });
                            } else {
                                vscode.postMessage({ command: 'showInfo', message: `Refreshed ${State.orgList.length} org${State.orgList.length !== 1 ? 's' : ''}` });
                            }
                        }
                        if (message.error) {
                            vscode.postMessage({ command: 'showError', message: message.error });
                        }
                        this.renderOrgList();
                        
                        // Set flag to prevent config checks during org sync
                        State.isSyncingOrgs = true;
                        
                        if (State.currentConfig && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.username) {
                            const sourceOrgSelect = document.getElementById('source-org-select');
                            const matchingOrg = State.orgList.find(org => 
                                org.username === State.currentConfig.sourceOrg.username || 
                                org.alias === State.currentConfig.sourceOrg.username ||
                                (State.currentConfig.sourceOrg.alias && org.alias === State.currentConfig.sourceOrg.alias)
                            );
                            if (matchingOrg && !sourceOrgSelect.value) {
                                sourceOrgSelect.value = matchingOrg.alias;
                                sourceOrgSelect.dispatchEvent(new Event('change'));
                            }
                        }
                        
                        if (State.currentConfig && State.currentConfig.targetOrg && State.currentConfig.targetOrg.username) {
                            const targetOrgSelect = document.getElementById('target-org-select');
                            const matchingOrg = State.orgList.find(org => 
                                org.username === State.currentConfig.targetOrg.username || 
                                org.alias === State.currentConfig.targetOrg.username ||
                                (State.currentConfig.targetOrg.alias && org.alias === State.currentConfig.targetOrg.alias)
                            );
                            if (matchingOrg && !targetOrgSelect.value) {
                                targetOrgSelect.value = matchingOrg.alias;
                                targetOrgSelect.dispatchEvent(new Event('change'));
                            }
                        }
                        
                        // Clear flag after a short delay to allow org sync to complete
                        setTimeout(() => {
                            State.isSyncingOrgs = false;
                        }, 1000);
                        
                        if (State.orgList.length === 0 && !message.error) {
                            vscode.postMessage({ command: 'showInfo', message: 'No orgs found. Make sure you have authorized orgs with "sf org login" or "sf auth login"' });
                        }
                        break;
                        
                    case 'orgDetails':
                        if (message.type === 'source') {
                            document.getElementById('source-org-username').value = message.org.username;
                            document.getElementById('source-org-instance-url').value = message.org.instanceUrl;
                            if (message.org.accessToken) {
                                document.getElementById('source-org-access-token').value = message.org.accessToken;
                            }
                            if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                                window.SFDMU.ConfigManager.updateOrgConfig();
                            }
                            const sourceOrgSelect = document.getElementById('source-org-select');
                            if (sourceOrgSelect && sourceOrgSelect.value) {
                                State.currentConfig.sourceOrg.alias = sourceOrgSelect.value;
                            }
                            // Refresh phase button states so Select Master Records etc. enable immediately
                            if (window.SFDMU.Cpq && window.SFDMU.Cpq.updatePhaseButtonStates) {
                                window.SFDMU.Cpq.updatePhaseButtonStates();
                            }
                            if (window.SFDMU.Rca && window.SFDMU.Rca.updatePhaseButtonStates) {
                                window.SFDMU.Rca.updatePhaseButtonStates();
                            }
                        } else {
                            document.getElementById('target-org-username').value = message.org.username;
                            document.getElementById('target-org-instance-url').value = message.org.instanceUrl;
                            if (message.org.accessToken) {
                                document.getElementById('target-org-access-token').value = message.org.accessToken;
                            }
                            if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                                window.SFDMU.ConfigManager.updateOrgConfig();
                            }
                            const targetOrgSelect = document.getElementById('target-org-select');
                            if (targetOrgSelect.value) {
                                State.currentConfig.targetOrg.alias = targetOrgSelect.value;
                            }
                        }
                        break;
                        
                    case 'configTree':
                        // Config tree is now rendered by VS Code's native Tree View, not the webview.
                        break;

                    case 'startNewConfigInFolder':
                        // Initialize a new configuration in the specified folder path.
                        // This reuses the existing ConfigManager logic that the legacy
                        // in-webview explorer used.
                        if (window.SFDMU.ConfigManager && typeof window.SFDMU.ConfigManager.createNewInFolder === 'function') {
                            const mode = message.mode || 'standard';
                            window.SFDMU.ConfigManager.createNewInFolder(message.folderPath || '', mode);
                        } else {
                            console.error('ConfigManager.createNewInFolder is not available');
                        }
                        break;
                        
                    case 'folderCreated':
                        // Folder operations are now handled via the native Tree View.
                        vscode.postMessage({ command: 'showInfo', message: 'Folder created successfully' });
                        break;
                        
                    case 'folderDeleted':
                        // Folder operations are now handled via the native Tree View.
                        vscode.postMessage({ command: 'showInfo', message: 'Folder deleted successfully' });
                        break;
                        
                    case 'configLoaded':
                        // Use setTimeout to ensure ConfigManager is fully initialized
                        setTimeout(() => {
                            if (window.SFDMU && window.SFDMU.ConfigManager && typeof window.SFDMU.ConfigManager.loadConfig === 'function') {
                                window.SFDMU.ConfigManager.loadConfig(message.config, message.name || message.config.configName);
                                
                                // Check for backups when config is loaded
                                if (window.SFDMU.RollbackManager && message.config && message.config.configName) {
                                    window.SFDMU.RollbackManager.checkBackups(message.config.configName);
                                }
                            } else {
                                console.error('ConfigManager.loadConfig is not available', {
                                    hasSFDMU: !!window.SFDMU,
                                    hasConfigManager: !!(window.SFDMU && window.SFDMU.ConfigManager),
                                    configManagerType: window.SFDMU && window.SFDMU.ConfigManager ? typeof window.SFDMU.ConfigManager : 'undefined',
                                    hasLoadConfig: !!(window.SFDMU && window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.loadConfig),
                                    loadConfigType: window.SFDMU && window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.loadConfig ? typeof window.SFDMU.ConfigManager.loadConfig : 'undefined'
                                });
                            }
                        }, 0);
                        break;
                        
                    case 'configSaved':
                        if (State.currentConfig.configName) {
                            const configNameHeader = document.getElementById('config-name-header');
                            if (configNameHeader) {
                                // Extract just the display name (without folder path)
                                const fullName = State.currentConfig.configName;
                                const lastSlash = fullName.lastIndexOf('/');
                                const displayName = lastSlash >= 0 ? fullName.substring(lastSlash + 1) : fullName;
                                configNameHeader.textContent = displayName;
                            }
                        }
                        break;
                        
                    case 'configDeleted':
                        // Check if the deleted config is the currently open one
                        const deletedConfigName = message.name || '';
                        const currentConfigName = State.currentConfig?.configName || State.selectedConfigPath || '';
                        
                        // Normalize config names for comparison (remove .json extension and normalize slashes)
                        const normalizeConfigName = (name) => {
                            if (!name) return '';
                            // Remove .json extension if present
                            let normalized = name.endsWith('.json') ? name.slice(0, -5) : name;
                            // Normalize path separators (both / and \ should work)
                            normalized = normalized.replace(/\\/g, '/');
                            return normalized;
                        };
                        
                        const normalizedDeleted = normalizeConfigName(deletedConfigName);
                        const normalizedCurrent = normalizeConfigName(currentConfigName);
                        
                        // If the deleted config matches the currently open config, navigate to initialization screen
                        if (normalizedDeleted && normalizedCurrent && normalizedDeleted === normalizedCurrent) {
                            // Clear the current config - reset to default state
                            const defaultConfig = {
                                mode: 'standard',
                                objects: [],
                                selectedPhases: [],
                                completedPhases: [],
                                includeProduct2: false,
                                sourceOrg: { username: '', instanceUrl: '' },
                                targetOrg: { username: '', instanceUrl: '' },
                                operation: 'Upsert',
                                modifiedSince: '',
                                customFilters: [],
                                excludedObjects: [],
                                outputDir: 'sfdmu-migration'
                            };
                            State.currentConfig = defaultConfig;
                            State.selectedConfigPath = null;
                            State.currentFolderPath = null;
                            State.lastGeneratedConfig = null;
                            
                            // Reset config name header
                            const configNameHeader = document.getElementById('config-name-header');
                            if (configNameHeader) {
                                configNameHeader.textContent = 'SFDMU Migration';
                            }
                            
            // Mode selector has been removed - mode is set at config creation time
                            
                            // Navigate to initialization screen
                            if (window.SFDMU.UIUtils) {
                                window.SFDMU.UIUtils.hideConfigPanel();
                            }
                            
                            // Clear any mode-specific state
                            if (window.SFDMU.CpqMode && window.SFDMU.CpqMode.reset) {
                                window.SFDMU.CpqMode.reset();
                            }
                            if (window.SFDMU.RcaMode && window.SFDMU.RcaMode.reset) {
                                window.SFDMU.RcaMode.reset();
                            }
                            
                            // Reset migration execution state
                            if (window.SFDMU.MigrationExecution && window.SFDMU.MigrationExecution.updateGenerateButtonText) {
                                window.SFDMU.MigrationExecution.updateGenerateButtonText(false);
                            }
                            
                            // Clear config change checker badges
                            if (window.SFDMU.ConfigChangeChecker && window.SFDMU.ConfigChangeChecker.removeBadges) {
                                window.SFDMU.ConfigChangeChecker.removeBadges();
                            }
                        } else {
                            // Just clear the selected path if it was the deleted one
                            if (State.selectedConfigPath && normalizeConfigName(State.selectedConfigPath) === normalizedDeleted) {
                                State.selectedConfigPath = null;
                            }
                        }
                        break;
                        
                    case 'configExported':
                        const json = JSON.stringify(message.config, null, 2);
                        navigator.clipboard.writeText(json).then(() => {
                            // Configuration exported - notification handled by backend
                        });
                        break;
                        
                    case 'configImported':
                        // Use setTimeout to ensure ConfigManager is fully initialized
                        setTimeout(() => {
                            if (window.SFDMU && window.SFDMU.ConfigManager && typeof window.SFDMU.ConfigManager.loadConfig === 'function') {
                                window.SFDMU.ConfigManager.loadConfig(message.config);
                            } else {
                                console.error('ConfigManager.loadConfig is not available');
                            }
                        }, 0);
                        break;
                        
                    case 'filesGenerated':
                        ConfigManager.updateOrgConfig();
                        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateExcludedObjects) {
                            window.SFDMU.ConfigManager.updateExcludedObjects();
                        }
                        MigrationObjects.update();
                        State.lastGeneratedConfig = ConfigManager.cloneConfig(State.currentConfig);
                        if (window.SFDMU.ConfigChangeChecker) {
                            window.SFDMU.ConfigChangeChecker.removeBadges();
                        }
                        break;
                        
                    case 'phaseFilesStatus':
                        MigrationExecution.updateGenerateButtonText(message.hasFiles);
                        if (CpqMode && CpqMode.setPhaseFilesStatus) {
                            CpqMode.setPhaseFilesStatus(message.hasFiles);
                        }
                        if (message.hasFiles && !State.lastGeneratedConfig) {
                            setTimeout(() => {
                                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                                window.SFDMU.ConfigManager.updateOrgConfig();
                            }
                                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateExcludedObjects) {
                            window.SFDMU.ConfigManager.updateExcludedObjects();
                        }
                                MigrationObjects.update();
                                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.cloneConfig) {
                                    State.lastGeneratedConfig = window.SFDMU.ConfigManager.cloneConfig(State.currentConfig);
                                }
                                if (window.SFDMU.ConfigChangeChecker) {
                                    window.SFDMU.ConfigChangeChecker.check();
                                }
                            }, 100);
                        }
                        break;

                    case 'cpqPhaseDefinitions':
                        if (CpqMode && CpqMode.handlePhaseDefinitions) {
                            CpqMode.handlePhaseDefinitions(message.phases || []);
                        }
                        break;

                    case 'cpqMasterRecords':
                        // Route to CPQ or RCA based on mode
                        if (message.mode === 'rca') {
                            if (window.SFDMU.Rca && window.SFDMU.Rca.handleMasterRecords) {
                                window.SFDMU.Rca.handleMasterRecords(
                                    message.objectName,
                                    message.records,
                                    message.phaseNumber,
                                    message.isSearch || false,
                                    message.append || false
                                );
                            }
                        } else {
                            if (CpqMode && CpqMode.handleMasterRecords) {
                                CpqMode.handleMasterRecords(
                                    message.objectName,
                                    message.records,
                                    message.phaseNumber,
                                    message.isSearch || false,
                                    message.append || false
                                );
                            }
                        }
                        break;
                        
                    case 'cpqMasterRecordsError':
                        // Route to CPQ or RCA based on mode
                        if (message.mode === 'rca') {
                            if (window.SFDMU.Rca && window.SFDMU.Rca.handleMasterRecords) {
                                window.SFDMU.Rca.handleMasterRecords(
                                    message.objectName,
                                    [],
                                    message.phaseNumber,
                                    false,
                                    false
                                );
                            }
                        } else {
                            if (CpqMode && CpqMode.handleMasterRecords) {
                                // Handle error by passing empty array
                                CpqMode.handleMasterRecords(
                                    message.objectName,
                                    [],
                                    message.phaseNumber,
                                    false,
                                    false
                                );
                            }
                        }
                        vscode.postMessage({ 
                            command: 'showError', 
                            message: `Failed to load records for ${message.objectName}: ${message.error}` 
                        });
                        break;
                        
                    case 'inheritedLineColumns':
                        if (CpqMode && CpqMode.handleInheritedLineColumns) {
                            CpqMode.handleInheritedLineColumns(
                                message.records,
                                message.lineColumnsBySection,
                                message.phaseNumber
                            );
                        }
                        break;
                        
                    case 'inheritedLineColumnsError':
                        vscode.postMessage({ 
                            command: 'showError', 
                            message: `Failed to load inherited Line Columns: ${message.error}` 
                        });
                        break;

                    case 'childRecords':
                        if (CpqMode && CpqMode.handleChildRecords) {
                            CpqMode.handleChildRecords(
                                message.parentObjectName,
                                message.childObjectName,
                                message.records,
                                message.childRecordsByParent,
                                message.phaseNumber
                            );
                        }
                        break;
                        
                    case 'childRecordsError':
                        vscode.postMessage({ 
                            command: 'showError', 
                            message: `Failed to load child records for ${message.parentObjectName}: ${message.error}` 
                        });
                        break;

                    case 'queriedChildRecords':
                        // Handle queried child records for Selected Parent Records section
                        if (CpqMode && window.SFDMU.Cpq && window.SFDMU.Cpq.handleQueriedChildRecords) {
                            const { phaseNumber, parentObjectName, childObjectName, childRecordsByParentExternalId } = message;
                            // childRecordsByParentExternalId is { parentExternalId: [childRecords] }
                            Object.keys(childRecordsByParentExternalId || {}).forEach(parentExternalId => {
                                const childRecords = childRecordsByParentExternalId[parentExternalId] || [];
                                window.SFDMU.Cpq.handleQueriedChildRecords(
                                    phaseNumber,
                                    parentObjectName,
                                    parentExternalId,
                                    childObjectName,
                                    childRecords
                                );
                            });
                        }
                        break;

                    case 'rcaPhaseDefinitions':
                        if (RcaMode && RcaMode.handlePhaseDefinitions) {
                            RcaMode.handlePhaseDefinitions(message.phases || []);
                        }
                        break;

                    case 'metadataDeployed':
                        if (RcaMode && RcaMode.handleMetadataDeployed) {
                            RcaMode.handleMetadataDeployed(message);
                        }
                        break;
                        
                    case 'requestConfigConflictResolution':
                        // Show conflict resolution modal and send back the result
                        if (Modals && Modals.showConfigConflict) {
                            Modals.showConfigConflict(
                                message.configName,
                                message.targetPath,
                                message.operation
                            ).then((result) => {
                                vscode.postMessage({
                                    command: 'configConflictResolution',
                                    messageId: message.messageId,
                                    action: result.action
                                });
                            });
                        }
                        break;
                        
                    case 'excelExportProgress':
                        if (Modals && Modals.updateExcelExportProgress) {
                            Modals.updateExcelExportProgress(message.message, message.objectName, message.progress);
                        }
                        break;
                        
                    case 'excelExportComplete':
                        if (Modals && Modals.showExcelExportComplete) {
                            Modals.showExcelExportComplete(message.filePath);
                        }
                        break;
                        
                    case 'excelExportError':
                        if (Modals && Modals.showExcelExportError) {
                            Modals.showExcelExportError(message.error);
                        }
                        break;
                        
                    case 'cpqPhaseObjects':
                        // Store objects for CPQ phase confirmation modals
                        if (!window.cpqPhaseObjectsCache) {
                            window.cpqPhaseObjectsCache = {};
                        }
                        window.cpqPhaseObjectsCache[message.phaseNumber] = {
                            objects: message.objects || [],
                            error: message.error,
                            timestamp: Date.now()
                        };
                        // Trigger custom event for waiting promises
                        window.dispatchEvent(new CustomEvent('cpqPhaseObjectsReceived', {
                            detail: { phaseNumber: message.phaseNumber, objects: message.objects || [], error: message.error }
                        }));
                        break;

                    case 'phaseBackupsStatus':
                        // Store which phases have backups; show rollback button only for current phase if it has backups
                        if (window.SFDMU.Cpq) {
                            window.SFDMU.Cpq.phasesWithBackups = message.phasesWithBackups || [];
                            const activePhaseTab = window.SFDMU.Cpq.getActivePhaseTab && window.SFDMU.Cpq.getActivePhaseTab();
                            if (activePhaseTab != null) {
                                const rollbackBtn = document.getElementById('rollback-phase-' + activePhaseTab);
                                if (rollbackBtn) {
                                    rollbackBtn.style.display = window.SFDMU.Cpq.phasesWithBackups.includes(activePhaseTab) ? 'inline-flex' : 'none';
                                }
                            }
                        }
                        break;

                    case 'backupCreated':
                        // Backup was created; update rollback button visibility (header in standard mode, phase button in CPQ/RCA)
                        if (message.phaseNumber != null && (State.currentConfig?.mode === 'cpq' || State.currentConfig?.mode === 'rca')) {
                            if (window.SFDMU.Cpq) {
                                if (!window.SFDMU.Cpq.phasesWithBackups) {
                                    window.SFDMU.Cpq.phasesWithBackups = [];
                                }
                                if (!window.SFDMU.Cpq.phasesWithBackups.includes(message.phaseNumber)) {
                                    window.SFDMU.Cpq.phasesWithBackups.push(message.phaseNumber);
                                }
                                const activePhaseTab = window.SFDMU.Cpq.getActivePhaseTab && window.SFDMU.Cpq.getActivePhaseTab();
                                if (activePhaseTab === message.phaseNumber) {
                                    const rollbackBtn = document.getElementById('rollback-phase-' + message.phaseNumber);
                                    if (rollbackBtn) {
                                        rollbackBtn.style.display = 'inline-flex';
                                    }
                                }
                            }
                        } else if (window.SFDMU.RollbackManager) {
                            window.SFDMU.RollbackManager.checkBackups(State.currentConfig?.configName);
                        }
                        break;

                    case 'backupsLoaded':
                        // Update rollback manager with available backups
                        if (window.SFDMU.RollbackManager) {
                            window.SFDMU.RollbackManager.updateBackups(message.backups);
                        }
                        break;

                    case 'rollbackModalData':
                        // Update rollback modal with backup data
                        if (window.SFDMU.RollbackModal) {
                            if (message.error) {
                                vscode.postMessage({
                                    command: 'showError',
                                    message: message.error
                                });
                            } else {
                                window.SFDMU.RollbackModal.updateBackups(
                                    message.backups,
                                    message.selectedBackup,
                                    message.rollbackConfig
                                );
                            }
                        }
                        break;

                    case 'rollbackCompleted':
                        // Rollback execution completed
                        if (message.success) {
                            vscode.postMessage({
                                command: 'showInfo',
                                message: `Rollback completed successfully. Records processed: ${message.recordsProcessed || 0}`
                            });
                        } else {
                            const errorMsg = message.errors && message.errors.length > 0
                                ? message.errors.join('; ')
                                : 'Rollback failed';
                            vscode.postMessage({
                                command: 'showError',
                                message: `Rollback failed: ${errorMsg}`
                            });
                        }
                        // Refresh backup list
                        if (window.SFDMU.RollbackManager && State.currentConfig?.configName) {
                            window.SFDMU.RollbackManager.checkBackups(State.currentConfig.configName);
                        }
                        break;

                    case 'showMigrationCompletionModal':
                        // Show migration completion modal
                        window.SFDMU.MessageHandler.showMigrationCompletionModal(message);
                        break;
                }
            });
        },
        
        renderOrgList: function() {
            const sourceSelect = document.getElementById('source-org-select');
            const targetSelect = document.getElementById('target-org-select');
            
            const updateSelect = (select) => {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select org...</option>' +
                    State.orgList.map(org => 
                        `<option value="${org.alias}" ${org.alias === currentValue ? 'selected' : ''}>${org.alias || org.username}</option>`
                    ).join('');
            };
            
            updateSelect(sourceSelect);
            updateSelect(targetSelect);
        },

        showMigrationCompletionModal: function(message) {
            const modal = document.getElementById('migration-completion-modal');
            const title = document.getElementById('migration-completion-title');
            const messageEl = document.getElementById('migration-completion-message');
            const confirmBtn = document.getElementById('migration-completion-confirm');
            const skipBtn = document.getElementById('migration-completion-skip');

            if (!modal) return;

            // Update modal content
            const phaseText = message.phaseNumber ? ` Phase ${message.phaseNumber}` : '';
            title.textContent = `${message.migrationType || 'Migration'}${phaseText} Running`;
            messageEl.textContent = `The${phaseText} ${message.migrationType || 'migration'} is running in the terminal. You can interact with the terminal freely.`;

            // Store migration key for confirmation
            modal.dataset.migrationKey = message.migrationKey || '';

            // Set up button handlers (remove old listeners first)
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            const newSkipBtn = skipBtn.cloneNode(true);
            skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);

            newConfirmBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'confirmMigrationComplete',
                    migrationKey: modal.dataset.migrationKey
                });
                modal.classList.remove('show');
            });

            newSkipBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'skipMigrationBackup',
                    migrationKey: modal.dataset.migrationKey
                });
                modal.classList.remove('show');
            });

            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });

            // Show modal
            modal.classList.add('show');
        }
    };
})();

