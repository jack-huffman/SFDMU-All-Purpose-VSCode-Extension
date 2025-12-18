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
            if (CpqMode && CpqMode.init) {
                CpqMode.init();
            }
            
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
                sourceOrgSelect.addEventListener('change', (e) => {
                    const alias = e.target.value;
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
            
            // Modified since
            const modifiedSinceInput = document.getElementById('modified-since');
            if (modifiedSinceInput) {
                modifiedSinceInput.addEventListener('change', (e) => {
                    State.currentConfig.modifiedSince = e.target.value;
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
                const lastModifiedDateInput = document.getElementById('cpq-advanced-last-modified-date');
                
                configModalOriginalState = {
                    excludedObjects: excludedObjectsTextarea ? excludedObjectsTextarea.value : '',
                    modifiedSince: lastModifiedDateInput ? lastModifiedDateInput.value : ''
                };
            }
            
            // Restore original state
            function restoreConfigModalState() {
                if (!configModalOriginalState) return;
                
                const excludedObjectsTextarea = document.getElementById('excluded-objects');
                const lastModifiedDateInput = document.getElementById('cpq-advanced-last-modified-date');
                
                if (excludedObjectsTextarea) {
                    excludedObjectsTextarea.value = configModalOriginalState.excludedObjects;
                }
                if (lastModifiedDateInput) {
                    lastModifiedDateInput.value = configModalOriginalState.modifiedSince;
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
                        const lastModifiedTab = document.getElementById('config-tab-last-modified-date');
                        const excludedTab = document.getElementById('config-tab-excluded-objects');
                        const excludedTabContent = document.getElementById('config-tab-content-excluded-objects');
                        const cpqDisclaimer = document.getElementById('excluded-objects-cpq-disclaimer');
                        
                        const isCpqMode = (State.currentConfig.mode || 'standard') === 'cpq';
                        
                        if (isCpqMode) {
                            // Show CPQ-specific tab
                            if (lastModifiedTab) {
                                lastModifiedTab.style.display = 'block';
                            }
                            // Show CPQ disclaimer
                            if (cpqDisclaimer) {
                                cpqDisclaimer.style.display = 'block';
                            }
                        } else {
                            // Hide CPQ-specific tab
                            if (lastModifiedTab) {
                                lastModifiedTab.style.display = 'none';
                                lastModifiedTab.classList.remove('active');
                            }
                            // Hide CPQ disclaimer
                            if (cpqDisclaimer) {
                                cpqDisclaimer.style.display = 'none';
                            }
                            // Ensure Excluded Objects is active if Last Modified Date tab was active
                            const lastModifiedContent = document.getElementById('config-tab-content-last-modified-date');
                            if (lastModifiedTab && lastModifiedTab.classList.contains('active')) {
                                lastModifiedTab.classList.remove('active');
                                if (lastModifiedContent) {
                                    lastModifiedContent.classList.remove('active');
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
            const configLastModifiedTab = document.getElementById('config-tab-last-modified-date');
            const configExcludedContent = document.getElementById('config-tab-content-excluded-objects');
            const configLastModifiedContent = document.getElementById('config-tab-content-last-modified-date');
            
            function switchConfigTab(activeTab, activeContent) {
                // Remove active from all tabs
                if (configExcludedTab) configExcludedTab.classList.remove('active');
                if (configLastModifiedTab) configLastModifiedTab.classList.remove('active');
                if (configExcludedContent) configExcludedContent.classList.remove('active');
                if (configLastModifiedContent) configLastModifiedContent.classList.remove('active');
                
                // Add active to selected tab
                if (activeTab) activeTab.classList.add('active');
                if (activeContent) activeContent.classList.add('active');
            }
            
            if (configExcludedTab) {
                configExcludedTab.addEventListener('click', () => {
                    switchConfigTab(configExcludedTab, configExcludedContent);
                });
            }
            
            if (configLastModifiedTab) {
                configLastModifiedTab.addEventListener('click', () => {
                    switchConfigTab(configLastModifiedTab, configLastModifiedContent);
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
                    
                    // Update last modified date
                    const lastModifiedDateInput = document.getElementById('cpq-advanced-last-modified-date');
                    if (lastModifiedDateInput) {
                        State.currentConfig.modifiedSince = lastModifiedDateInput.value || '';
                    }
                    
                    // Save the configuration
                    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                        window.SFDMU.ConfigManager.updateOrgConfig();
                    }
                    vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
                    
                    configModal.style.display = 'none';
                });
            }
            
            // Clear last modified date button
            const clearLastModifiedDate = document.getElementById('clear-last-modified-date');
            if (clearLastModifiedDate) {
                clearLastModifiedDate.addEventListener('click', () => {
                    const lastModifiedDateInput = document.getElementById('cpq-advanced-last-modified-date');
                    if (lastModifiedDateInput) {
                        lastModifiedDateInput.value = '';
                    }
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
            const gettingStartedCreateBtn = document.getElementById('getting-started-create-config');
            if (gettingStartedCreateBtn && window.SFDMU.ConfigManager) {
                gettingStartedCreateBtn.addEventListener('click', () => {
                    // Start a new configuration at the root (no folder path)
                    window.SFDMU.ConfigManager.createNewInFolder('');
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

