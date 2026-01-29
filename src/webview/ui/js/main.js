// Main Module - Initialization and Event Listeners
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    // Don't capture modules at load time - access dynamically
    const ConfigManager = window.SFDMU.ConfigManager;
    const MigrationObjects = window.SFDMU.MigrationObjects;
    const MigrationExecution = window.SFDMU.MigrationExecution;
    const Modals = window.SFDMU.Modals;
    const MessageHandler = window.SFDMU.MessageHandler;
    const CpqMode = window.SFDMU.CpqMode;
    const RcaMode = window.SFDMU.RcaMode;
    
    function isCpqMode() {
        return (State.currentConfig.mode || 'standard') === 'cpq';
    }

    window.SFDMU.Main = {
        init: function() {
            // Set up message handler FIRST so it can receive messages
            MessageHandler.setup();
            
            this.setupEventListeners();
            // Access UIUtils dynamically to ensure it's loaded
            if (window.SFDMU.UIUtils) {
                window.SFDMU.UIUtils.setupCollapsibleSections();
                window.SFDMU.UIUtils.setupModal();
            } else {
                console.error('UIUtils not available');
            }
            Modals.setupObjectSelection();
            Modals.setupFieldSelection();
            Modals.setupExternalIdSelection();
            // Initialize mode handlers - RcaMode must be initialized first since it handles all mode switching
            if (RcaMode && RcaMode.init) {
                RcaMode.init();
            }
            if (CpqMode && CpqMode.init) {
                CpqMode.init();
            }
            
            // Note: applyModeFromConfig is called by ConfigManager when loading configs
            // Don't call it here to avoid overriding the mode selector initialization
            
            this.requestOrgList();
            this.requestSavedConfigs();
            if (window.SFDMU.UIUtils) {
                window.SFDMU.UIUtils.hideConfigPanel();
            }
            
            MigrationExecution.updateGenerateButtonText(false);
            
            setTimeout(() => {
                MigrationExecution.checkPhaseFiles();
            }, 500);
        },
        
        setupEventListeners: function() {
            // Add object button
            const addObjectBtn = document.getElementById('add-object');
            if (addObjectBtn) {
                addObjectBtn.addEventListener('click', () => {
                    this.loadObjectsFromOrg();
                });
            }
            
            // Org selection
            const sourceOrgSelect = document.getElementById('source-org-select');
            if (sourceOrgSelect) {
                sourceOrgSelect.addEventListener('change', async (e) => {
                    const alias = e.target.value;
                    
                    // Skip warning if orgs are being synced (initial load)
                    // This prevents false warnings when orgs are initially populated
                    if (State.isSyncingOrgs) {
                        // Just update org details without showing warning
                        if (alias) {
                            vscode.postMessage({ command: 'getOrgDetails', alias, type: 'source' });
                            // Prefetch objects for the selected org
                            this.prefetchObjects(alias);
                        }
                        return;
                    }
                    
                    if (alias) {
                        vscode.postMessage({ command: 'getOrgDetails', alias, type: 'source' });
                        // Prefetch objects for the selected org
                        this.prefetchObjects(alias);
                    }
                });
            }
            
            const targetOrgSelect = document.getElementById('target-org-select');
            if (targetOrgSelect) {
                targetOrgSelect.addEventListener('change', (e) => {
                    const alias = e.target.value;
                    if (alias) {
                        vscode.postMessage({ command: 'getOrgDetails', alias, type: 'target' });
                    }
                });
            }
            
            const refreshOrgsBtn = document.getElementById('refresh-orgs');
            if (refreshOrgsBtn) {
                refreshOrgsBtn.addEventListener('click', () => {
                    // Set a flag to show notification when refresh completes
                    State.isRefreshingOrgs = true;
                    // Add rotating class to show animation
                    refreshOrgsBtn.classList.add('rotating');
                    this.requestOrgList();
                });
            }
            
            // Manual org entry
            ['source', 'target'].forEach(type => {
                const usernameInput = document.getElementById(`${type}-org-username`);
                const instanceUrlInput = document.getElementById(`${type}-org-instance-url`);
                const accessTokenInput = document.getElementById(`${type}-org-access-token`);
                
                if (usernameInput) {
                    usernameInput.addEventListener('input', () => ConfigManager.updateOrgConfig());
                }
                if (instanceUrlInput) {
                    instanceUrlInput.addEventListener('input', () => ConfigManager.updateOrgConfig());
                }
                if (accessTokenInput) {
                    accessTokenInput.addEventListener('input', () => ConfigManager.updateOrgConfig());
                }
            });
            
            // DML operation
            const dmlOperationSelect = document.getElementById('dml-operation');
            if (dmlOperationSelect) {
                dmlOperationSelect.addEventListener('change', (e) => {
                    State.currentConfig.operation = e.target.value;
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                });
            }
            
            // Excluded objects
            const excludedObjectsTextarea = document.getElementById('excluded-objects');
            if (excludedObjectsTextarea) {
                excludedObjectsTextarea.addEventListener('input', () => {
                    ConfigManager.updateExcludedObjects();
                });
            }
            
            // Action Icons
            const generateIcon = document.getElementById('generate-files-icon');
            if (generateIcon) {
                generateIcon.addEventListener('click', () => {
                    MigrationExecution.generateFiles();
                });
            }
            
            const exportExcelIcon = document.getElementById('export-excel-icon');
            if (exportExcelIcon) {
                exportExcelIcon.addEventListener('click', () => {
                    MigrationExecution.exportToExcel();
                });
            }
            
            const simulateIcon = document.getElementById('simulate-migration-icon');
            if (simulateIcon) {
                simulateIcon.addEventListener('click', () => {
                    MigrationExecution.simulateMigration();
                });
            }
            
            const runIcon = document.getElementById('run-migration-icon');
            if (runIcon) {
                runIcon.addEventListener('click', () => {
                    MigrationExecution.runMigration();
                });
            }
            
            const createBackupIcon = document.getElementById('create-backup-icon');
            if (createBackupIcon) {
                createBackupIcon.addEventListener('click', () => {
                    MigrationExecution.createBackup();
                });
            }
            
            // Configuration management
            const saveConfigBtn = document.getElementById('save-config');
            if (saveConfigBtn) {
                saveConfigBtn.addEventListener('click', () => {
                    const configNameHeader = document.getElementById('config-name-header');
                    const name = configNameHeader ? configNameHeader.textContent.trim() : '';
                    if (name) {
                        const fullConfigName = State.currentFolderPath ? `${State.currentFolderPath}/${name}` : name;
                        State.currentConfig.configName = fullConfigName;
                        State.currentConfig.outputDir = `sfdmu-migration/${fullConfigName}`;
                        vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
                    } else {
                        vscode.postMessage({ command: 'showError', message: 'Please enter a configuration name' });
                    }
                });
            }
            
            // Handle editable config name header
            const configNameHeader = document.getElementById('config-name-header');
            if (configNameHeader) {
                // Handle blur (when user finishes editing)
                configNameHeader.addEventListener('blur', () => {
                    const name = configNameHeader.textContent.trim();
                    if (!name) {
                        // Restore previous name if empty
                        const currentName = State.currentConfig.configName || '';
                        const lastSlash = currentName.lastIndexOf('/');
                        const displayName = lastSlash >= 0 ? currentName.substring(lastSlash + 1) : currentName;
                        configNameHeader.textContent = displayName || 'SFDMU Migration';
                    }
                });
                
                // Handle Enter key to save
                configNameHeader.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        configNameHeader.blur();
                        // Trigger save
                        if (saveConfigBtn) {
                            saveConfigBtn.click();
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        // Restore original name
                        const currentName = State.currentConfig.configName || '';
                        const lastSlash = currentName.lastIndexOf('/');
                        const displayName = lastSlash >= 0 ? currentName.substring(lastSlash + 1) : currentName;
                        configNameHeader.textContent = displayName || 'SFDMU Migration';
                        configNameHeader.blur();
                    }
                });
            }
            
            
            // Configuration modal state management
            let configModalOriginalState = null;
            
            // Save original state when modal opens
            function saveConfigModalState() {
                const excludedObjectsTextarea = document.getElementById('excluded-objects');
                configModalOriginalState = {
                    excludedObjects: excludedObjectsTextarea ? excludedObjectsTextarea.value : ''
                };
            }
            
            // Restore original state
            function restoreConfigModalState() {
                if (!configModalOriginalState) return;
                const excludedObjectsTextarea = document.getElementById('excluded-objects');
                if (excludedObjectsTextarea) {
                    excludedObjectsTextarea.value = configModalOriginalState.excludedObjects;
                }
            }
            
            // Migration config button to open configuration modal
            const migrationConfigButton = document.getElementById('migration-config-button');
            if (migrationConfigButton) {
                migrationConfigButton.addEventListener('click', () => {
                    // Save current state before opening modal
                    saveConfigModalState();
                    
                    const configModal = document.getElementById('configuration-modal');
                    if (configModal) {
                        configModal.style.display = 'flex';
                        // Update tab visibility and disclaimer based on mode
                        const excludedTab = document.getElementById('config-tab-excluded-objects');
                        const excludedTabContent = document.getElementById('config-tab-content-excluded-objects');
                        const cpqDisclaimer = document.getElementById('excluded-objects-cpq-disclaimer');
                        const mode = (State.currentConfig.mode || 'standard');
                        const isCpqMode = mode === 'cpq';
                        const isRcaMode = mode === 'rca';
                        const isPhaseMode = isCpqMode || isRcaMode;
                        const metadataTab = document.getElementById('config-tab-metadata-prerequisites');
                        const rcaDisclaimer = document.getElementById('excluded-objects-rca-disclaimer');
                        
                        if (isPhaseMode) {
                            if (isRcaMode && metadataTab) {
                                metadataTab.style.display = 'block';
                            } else if (metadataTab) {
                                metadataTab.style.display = 'none';
                            }
                            if (isCpqMode && cpqDisclaimer) {
                                cpqDisclaimer.style.display = 'block';
                            } else if (cpqDisclaimer) {
                                cpqDisclaimer.style.display = 'none';
                            }
                            if (isRcaMode && rcaDisclaimer) {
                                rcaDisclaimer.style.display = 'block';
                            } else if (rcaDisclaimer) {
                                rcaDisclaimer.style.display = 'none';
                            }
                        } else {
                            if (metadataTab) {
                                metadataTab.style.display = 'none';
                                metadataTab.classList.remove('active');
                            }
                            if (cpqDisclaimer) {
                                cpqDisclaimer.style.display = 'none';
                            }
                            if (rcaDisclaimer) {
                                rcaDisclaimer.style.display = 'none';
                            }
                            const metadataContent = document.getElementById('config-tab-content-metadata-prerequisites');
                            if (metadataTab && metadataTab.classList.contains('active')) {
                                if (metadataTab) {
                                    metadataTab.classList.remove('active');
                                }
                                if (metadataContent) {
                                    metadataContent.classList.remove('active');
                                }
                                if (excludedTab) {
                                    excludedTab.classList.add('active');
                                }
                                if (excludedTabContent) {
                                    excludedTabContent.classList.add('active');
                                }
                            }
                        }
                    }
                });
            }
            
            // Configuration modal tab switching
            const configExcludedTab = document.getElementById('config-tab-excluded-objects');
            const configMetadataTab = document.getElementById('config-tab-metadata-prerequisites');
            const configExcludedContent = document.getElementById('config-tab-content-excluded-objects');
            const configMetadataContent = document.getElementById('config-tab-content-metadata-prerequisites');
            
            function switchConfigTab(activeTab, activeContent) {
                if (configExcludedTab) configExcludedTab.classList.remove('active');
                if (configMetadataTab) configMetadataTab.classList.remove('active');
                if (configExcludedContent) configExcludedContent.classList.remove('active');
                if (configMetadataContent) configMetadataContent.classList.remove('active');
                if (activeTab) activeTab.classList.add('active');
                if (activeContent) activeContent.classList.add('active');
            }
            
            if (configExcludedTab) {
                configExcludedTab.addEventListener('click', () => {
                    switchConfigTab(configExcludedTab, configExcludedContent);
                });
            }
            
            if (configMetadataTab) {
                configMetadataTab.addEventListener('click', () => {
                    switchConfigTab(configMetadataTab, configMetadataContent);
                });
            }
            
            // Configuration modal Cancel button
            const configModalCancel = document.getElementById('configuration-modal-cancel');
            const configModal = document.getElementById('configuration-modal');
            if (configModalCancel && configModal) {
                configModalCancel.addEventListener('click', () => {
                    restoreConfigModalState();
                    configModal.style.display = 'none';
                });
            }
            
            // Configuration modal Save button
            const configModalSave = document.getElementById('configuration-modal-save');
            if (configModalSave && configModal) {
                configModalSave.addEventListener('click', () => {
                    // Update excluded objects
                    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateExcludedObjects) {
                        window.SFDMU.ConfigManager.updateExcludedObjects();
                    }
                    
                    // Save the configuration
                    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                        window.SFDMU.ConfigManager.updateOrgConfig();
                    }
                    vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
                    
                    configModal.style.display = 'none';
                });
            }
            
            // Close modal when clicking outside (cancel behavior)
            if (configModal) {
                configModal.addEventListener('click', (e) => {
                    if (e.target === configModal) {
                        restoreConfigModalState();
                        configModal.style.display = 'none';
                    }
                });
            }

            // Getting started: Create Configuration CTA
            // Set up create config buttons for each mode
            const createStandardBtn = document.getElementById('create-standard-config');
            const createCpqBtn = document.getElementById('create-cpq-config');
            const createRcaBtn = document.getElementById('create-rca-config');
            
            if (createStandardBtn && window.SFDMU.ConfigManager) {
                createStandardBtn.addEventListener('click', () => {
                    window.SFDMU.ConfigManager.createNewInFolder('', 'standard');
                });
            }
            if (createCpqBtn && window.SFDMU.ConfigManager) {
                createCpqBtn.addEventListener('click', () => {
                    window.SFDMU.ConfigManager.createNewInFolder('', 'cpq');
                });
            }
            if (createRcaBtn && window.SFDMU.ConfigManager) {
                createRcaBtn.addEventListener('click', () => {
                    window.SFDMU.ConfigManager.createNewInFolder('', 'rca');
                });
            }
            
        },
        
        requestOrgList: function() {
            vscode.postMessage({ command: 'getOrgList' });
        },
        
        requestSavedConfigs: function() {
            vscode.postMessage({ command: 'listConfigs' });
        },
        
        loadObjectsFromOrg: function() {
            const sourceOrgSelect = document.getElementById('source-org-select');
            let orgAlias = sourceOrgSelect ? sourceOrgSelect.value : '';
            
            if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                orgAlias = State.currentConfig.sourceOrg.alias;
            }
            
            if (!orgAlias) {
                vscode.postMessage({ command: 'showError', message: 'Please select a source org first' });
                return;
            }
            
            // Check cache first
            const cached = State.objectsCache[orgAlias];
            if (cached && cached.objects && cached.objects.length > 0) {
                // Use cached objects immediately
                Modals.showObjectSelection('select');
                if (window.objectModalState && window.objectModalState.setObjects) {
                    window.objectModalState.setObjects(cached.objects);
                }
                // Still fetch in background to refresh cache
                this.prefetchObjects(orgAlias);
            } else {
                // No cache, fetch normally
            Modals.showObjectSelection('select');
            vscode.postMessage({ 
                command: 'getAvailableObjects', 
                orgAlias: orgAlias,
                includeStandard: true
            });
            }
        },
        
        prefetchObjects: function(orgAlias) {
            if (!orgAlias) {
                return;
            }
            
            // Only prefetch in standard (Objects) mode, not CPQ mode
            const mode = State.currentConfig?.mode || 'standard';
            if (mode !== 'standard') {
                return;
            }
            
            // Check if we already have cached objects (avoid duplicate requests)
            const cached = State.objectsCache[orgAlias];
            const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
            const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
            
            // Only prefetch if we don't have cache or cache is stale
            if (!cached || cacheAge > CACHE_MAX_AGE) {
                // Fetch in background (don't show modal)
                vscode.postMessage({ 
                    command: 'getAvailableObjects', 
                    orgAlias: orgAlias,
                    includeStandard: true
                });
            }
        },
        
        prefetchFields: function(orgAlias, objectName) {
            if (!orgAlias || !objectName) {
                return;
            }
            
            // Only prefetch in standard (Objects) mode, not CPQ mode
            const mode = State.currentConfig?.mode || 'standard';
            if (mode !== 'standard') {
                return;
            }
            
            // Initialize cache structure if needed
            if (!State.fieldsCache[orgAlias]) {
                State.fieldsCache[orgAlias] = {};
            }
            
            // Check if we already have cached fields (avoid duplicate requests)
            const cached = State.fieldsCache[orgAlias][objectName];
            const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
            const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
            
            // Only prefetch if we don't have cache or cache is stale
            if (!cached || cacheAge > CACHE_MAX_AGE) {
                // Fetch in background using getAllFieldsWithDataType (don't show modal)
                vscode.postMessage({ 
                    command: 'getAllFieldsWithDataType', 
                    objectName: objectName,
                    orgAlias: orgAlias
                });
            }
        }
    };
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        window.SFDMU.Main.init();
    });
})();

