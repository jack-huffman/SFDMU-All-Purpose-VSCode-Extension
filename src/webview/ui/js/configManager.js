// Config Manager Module - Handles config loading, saving, and updates
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    // Access State dynamically to ensure it's initialized
    const getState = () => {
        if (window.SFDMU && window.SFDMU.State) {
            return window.SFDMU.State;
        }
        return null;
    };
    const UIUtils = window.SFDMU.UIUtils;
    const DEFAULT_EXCLUDED_OBJECTS = [];
    
    window.SFDMU.ConfigManager = {
        loadConfig: function(config, configPath, retryCount = 0) {
            const State = getState();
            if (!State) {
                // Retry up to 5 times with increasing delays if State is still initializing
                if (retryCount < 5) {
                    setTimeout(() => {
                        this.loadConfig(config, configPath, retryCount + 1);
                    }, 50 * (retryCount + 1)); // 50ms, 100ms, 150ms, 200ms, 250ms
                    return;
                } else {
                    console.error('State is not initialized after retries');
                    return;
                }
            }
            
            // Extract folder path and display name FIRST, before setting currentConfig
            if (configPath) {
                const lastSlash = configPath.lastIndexOf('/');
                if (lastSlash >= 0) {
                    State.currentFolderPath = configPath.substring(0, lastSlash);
                } else {
                    State.currentFolderPath = null;
                }
            } else {
                const configName = config.configName || '';
                const lastSlash = configName.lastIndexOf('/');
                if (lastSlash >= 0) {
                    State.currentFolderPath = configName.substring(0, lastSlash);
                } else {
                    State.currentFolderPath = null;
                }
            }
            
            // Extract just the config name (without folder path) for display
            const configName = config.configName || '';
            const lastSlash = configName.lastIndexOf('/');
            const displayName = lastSlash >= 0 ? configName.substring(lastSlash + 1) : configName;
            
            // Update UI FIRST with the display name to prevent flash
            const configNameHeader = document.getElementById('config-name-header');
            if (configNameHeader) {
                configNameHeader.textContent = displayName || 'SFDMU Migration';
            }
            
            // Now set currentConfig (after UI is updated)
            State.currentConfig = config;
            
            // Initialize mode if not present
            if (!State.currentConfig.mode) {
                State.currentConfig.mode = 'standard';
            }
            
            // Initialize objects if not present
            if (!State.currentConfig.objects) {
                State.currentConfig.objects = [];
            }
            
            // Initialize CPQ-related fields if not present
            if (!State.currentConfig.selectedPhases) {
                State.currentConfig.selectedPhases = [];
            }
            
            // Initialize completedPhases if not present
            if (!State.currentConfig.completedPhases) {
                State.currentConfig.completedPhases = [];
            }
            
            if (typeof State.currentConfig.includeProduct2 !== 'boolean') {
                State.currentConfig.includeProduct2 = false;
            }
            
            // Initialize selectedMasterRecords if not present
            if (!State.currentConfig.selectedMasterRecords) {
                // Don't clear selectedMasterRecords when loading config - preserve them
                // State.currentConfig.selectedMasterRecords = {};
            }
            
            // Initialize queriedChildRecords if not present
            if (!State.currentConfig.queriedChildRecords) {
                State.currentConfig.queriedChildRecords = {};
            }
            
            // Initialize excludedObjects if not present
            if (!State.currentConfig.excludedObjects) {
                State.currentConfig.excludedObjects = [];
            }
            
            // Determine output directory based on config path
            let outputDir = config.outputDir || 'sfdmu-migration';
            const fullConfigPath = configPath || config.configName || '';
            if (fullConfigPath) {
                outputDir = `sfdmu-migration/${fullConfigPath}`;
            } else if (displayName) {
                outputDir = `sfdmu-migration/${displayName}`;
            } else {
                outputDir = 'sfdmu-migration';
            }
            
            State.currentConfig.outputDir = outputDir;
            
            // Update UI
            const dmlSelect = document.getElementById('dml-operation');
            if (dmlSelect) {
                // In CPQ/RCA mode, show the operation for the active phase if available
                const mode = config.mode || 'standard';
                if (mode === 'cpq' && config.cpqPhaseOperations) {
                    // Get active phase tab if available
                    const activePhase = window.SFDMU?.Cpq?.getActivePhaseTab?.() || 1;
                    const phaseOperation = config.cpqPhaseOperations[activePhase] || config.operation || 'Upsert';
                    dmlSelect.value = phaseOperation;
                } else if (mode === 'rca' && config.rcaPhaseOperations) {
                    // For RCA, default to phase 1 or first phase with operation
                    const firstPhaseWithOp = Object.keys(config.rcaPhaseOperations).length > 0 
                        ? parseInt(Object.keys(config.rcaPhaseOperations)[0])
                        : 1;
                    const phaseOperation = config.rcaPhaseOperations[firstPhaseWithOp] || config.operation || 'Upsert';
                    dmlSelect.value = phaseOperation;
                } else {
                    dmlSelect.value = config.operation || 'Upsert';
                }
            }
            
            // Update mode badge
            const modeBadge = document.getElementById('mode-badge');
            const modeBadgeLabel = document.getElementById('mode-badge-label');
            if (modeBadge && modeBadgeLabel) {
                const mode = State.currentConfig.mode || 'standard';
                const modeLabels = {
                    'standard': 'Standard',
                    'cpq': 'CPQ',
                    'rca': 'RCA'
                };
                modeBadgeLabel.textContent = modeLabels[mode] || 'Standard';
            }
            
            // Show the config panel
            UIUtils.showConfigPanel();
            
            // Update excluded objects UI
            if (window.SFDMU.MigrationObjects) {
                window.SFDMU.MigrationObjects.renderExcludedObjects();
            }
            
            // Update org fields
            if (config.sourceOrg) {
                document.getElementById('source-org-username').value = config.sourceOrg.username || '';
                document.getElementById('source-org-instance-url').value = config.sourceOrg.instanceUrl || '';
                document.getElementById('source-org-access-token').value = config.sourceOrg.accessToken || '';
                
                const sourceOrgSelect = document.getElementById('source-org-select');
                if (config.sourceOrg.username && State.orgList && State.orgList.length > 0) {
                    const matchingOrg = State.orgList.find(org => 
                        org.username === config.sourceOrg.username || 
                        org.alias === config.sourceOrg.username ||
                        (config.sourceOrg.alias && org.alias === config.sourceOrg.alias)
                    );
                    if (matchingOrg) {
                        sourceOrgSelect.value = matchingOrg.alias;
                        sourceOrgSelect.dispatchEvent(new Event('change'));
                        // Prefetch objects for the source org
                        if (window.SFDMU.Main && window.SFDMU.Main.prefetchObjects) {
                            window.SFDMU.Main.prefetchObjects(matchingOrg.alias);
                        }
                    } else if (config.sourceOrg.alias) {
                        // If we have an alias but no matching org in list, still try to prefetch
                        if (window.SFDMU.Main && window.SFDMU.Main.prefetchObjects) {
                            window.SFDMU.Main.prefetchObjects(config.sourceOrg.alias);
                        }
                    }
                } else if (config.sourceOrg.alias) {
                    // If org list not loaded yet, still try to prefetch with alias
                    if (window.SFDMU.Main && window.SFDMU.Main.prefetchObjects) {
                        window.SFDMU.Main.prefetchObjects(config.sourceOrg.alias);
                    }
                }
            }
            
            if (config.targetOrg) {
                document.getElementById('target-org-username').value = config.targetOrg.username || '';
                document.getElementById('target-org-instance-url').value = config.targetOrg.instanceUrl || '';
                document.getElementById('target-org-access-token').value = config.targetOrg.accessToken || '';
                
                const targetOrgSelect = document.getElementById('target-org-select');
                if (config.targetOrg.username && State.orgList && State.orgList.length > 0) {
                    const matchingOrg = State.orgList.find(org => 
                        org.username === config.targetOrg.username || 
                        org.alias === config.targetOrg.username ||
                        (config.targetOrg.alias && org.alias === config.targetOrg.alias)
                    );
                    if (matchingOrg) {
                        targetOrgSelect.value = matchingOrg.alias;
                        targetOrgSelect.dispatchEvent(new Event('change'));
                    }
                }
            }
            
            // Re-render objects
            if (window.SFDMU.MigrationObjects) {
                window.SFDMU.MigrationObjects.render();
            }
            
            // Prefetch fields for all objects in the config
            if (config.objects && config.objects.length > 0 && config.mode === 'standard') {
                const sourceOrgSelect = document.getElementById('source-org-select');
                let orgAlias = sourceOrgSelect ? sourceOrgSelect.value : '';
                if (!orgAlias && config.sourceOrg && config.sourceOrg.alias) {
                    orgAlias = config.sourceOrg.alias;
                }
                if (orgAlias && window.SFDMU.Main && window.SFDMU.Main.prefetchFields) {
                    // Prefetch fields for all objects
                    config.objects.forEach(obj => {
                        if (obj.objectName) {
                            window.SFDMU.Main.prefetchFields(orgAlias, obj.objectName);
                        }
                    });
                }
            }
            
            // Check for existing phase files
            if (window.SFDMU.MigrationExecution) {
                window.SFDMU.MigrationExecution.checkPhaseFiles();
            }

            // Apply mode-specific UI (Objects/CPQ/RCA) based on the loaded config
            // RcaMode handles all mode switching, so call it first
            if (window.SFDMU.RcaMode && window.SFDMU.RcaMode.applyModeFromConfig) {
                window.SFDMU.RcaMode.applyModeFromConfig();
            }
            // Then call CPQ-specific initialization if needed
            if (window.SFDMU.CpqMode && window.SFDMU.CpqMode.applyModeFromConfig) {
                window.SFDMU.CpqMode.applyModeFromConfig();
            }

            // Check for backups when config is loaded
            if (window.SFDMU.RollbackManager && config.configName) {
                window.SFDMU.RollbackManager.checkBackups(config.configName);
            }
        },
        
        createNewInFolder: function(folderPath, mode = 'standard') {
            const State = getState();
            if (!State) {
                console.error('State is not initialized');
                return;
            }
            
            // Store the folder path separately
            State.currentFolderPath = folderPath || null;
            
            // Reset to default config with specified mode
            State.currentConfig = {
                mode: mode,
                objects: [],
                selectedPhases: [],
                completedPhases: [],
                includeProduct2: false,
                selectedMasterRecords: {},
                sourceOrg: { username: '', instanceUrl: '' },
                targetOrg: { username: '', instanceUrl: '' },
                operation: 'Upsert',
                modifiedSince: '',
                customFilters: [],
                excludedObjects: DEFAULT_EXCLUDED_OBJECTS,
                outputDir: folderPath ? `sfdmu-migration/${folderPath}` : 'sfdmu-migration',
                configName: 'New Configuration'
            };
            
            // Update UI - only show the config name, not the folder path
            const configNameHeader = document.getElementById('config-name-header');
            if (configNameHeader) {
                configNameHeader.textContent = 'New Configuration';
            }
            document.getElementById('dml-operation').value = 'Upsert';
            
            // Clear org fields
            document.getElementById('source-org-select').value = '';
            document.getElementById('target-org-select').value = '';
            document.getElementById('source-org-username').value = '';
            document.getElementById('source-org-instance-url').value = '';
            document.getElementById('source-org-access-token').value = '';
            document.getElementById('target-org-username').value = '';
            document.getElementById('target-org-instance-url').value = '';
            document.getElementById('target-org-access-token').value = '';
            
            // Clear objects and excluded objects
            if (window.SFDMU.MigrationObjects) {
                window.SFDMU.MigrationObjects.render();
                window.SFDMU.MigrationObjects.renderExcludedObjects();
            }
            
            // Update mode badge
            const modeBadge = document.getElementById('mode-badge');
            const modeBadgeLabel = document.getElementById('mode-badge-label');
            if (modeBadge && modeBadgeLabel) {
                const modeLabels = {
                    'standard': 'Standard',
                    'cpq': 'CPQ',
                    'rca': 'RCA'
                };
                modeBadgeLabel.textContent = modeLabels[mode] || 'Standard';
            }
            
            // Show the config panel
            UIUtils.showConfigPanel();
            
            // Focus on config name header
            const configNameHeaderEl = document.getElementById('config-name-header');
            if (configNameHeaderEl) {
                configNameHeaderEl.focus();
                // Select all text for easy editing
                setTimeout(() => {
                    const range = document.createRange();
                    range.selectNodeContents(configNameHeaderEl);
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        selection.removeAllRanges();
                    }
                    selection.addRange(range);
                }, 0);
            }

            // Ensure UI reflects the default mode for a new configuration
            // RcaMode handles all mode switching, so call it first
            if (window.SFDMU.RcaMode && window.SFDMU.RcaMode.applyModeFromConfig) {
                window.SFDMU.RcaMode.applyModeFromConfig();
            }
            // Then call CPQ-specific initialization if needed
            if (window.SFDMU.CpqMode && window.SFDMU.CpqMode.applyModeFromConfig) {
                window.SFDMU.CpqMode.applyModeFromConfig();
            }
        },
        
        updateOrgConfig: function() {
            const State = getState();
            if (!State) {
                console.error('State is not initialized');
                return;
            }
            
            ['source', 'target'].forEach(type => {
                const orgSelect = document.getElementById(`${type}-org-select`);
                const alias = orgSelect ? orgSelect.value : undefined;
                
                State.currentConfig[`${type}Org`] = {
                    username: document.getElementById(`${type}-org-username`).value,
                    instanceUrl: document.getElementById(`${type}-org-instance-url`).value,
                    accessToken: document.getElementById(`${type}-org-access-token`).value || undefined,
                    alias: alias || State.currentConfig[`${type}Org`]?.alias
                };
            });
            
            // Update CPQ phase button states if in CPQ mode
            if (State.currentConfig.mode === 'cpq' && window.SFDMU.Cpq && window.SFDMU.Cpq.updatePhaseButtonStates) {
                window.SFDMU.Cpq.updatePhaseButtonStates();
            }
            
            // Check for config changes after updating orgs
            if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                window.SFDMU.ConfigChangeChecker.check();
            }
        },
        
        updateExcludedObjects: function() {
            const State = getState();
            if (!State) {
                console.error('State is not initialized');
                return;
            }
            
            const textarea = document.getElementById('excluded-objects');
            const text = textarea.value.trim();
            const isCpqMode = (State.currentConfig.mode || 'standard') === 'cpq';
            
            if (text) {
                State.currentConfig.excludedObjects = text.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                
                // In CPQ mode, ensure Product2 is in excluded objects
                if (isCpqMode && !State.currentConfig.excludedObjects.includes('Product2')) {
                    State.currentConfig.excludedObjects.push('Product2');
                    // Update the textarea to reflect the change
                    textarea.value = State.currentConfig.excludedObjects.join('\n');
                }
            } else {
                // If textarea is empty, set defaults based on mode
                if (isCpqMode) {
                    // CPQ default excluded objects
                    const CPQ_DEFAULT_EXCLUDED_OBJECTS = [
                        'Account',
                        'Order',
                        'OrderItem',
                        'Opportunity',
                        'Quote',
                        'SBQQ__Quote__c',
                        'SBQQ__QuoteLine__c',
                        'Contract',
                        'SBQQ__Subscription__c',
                        'Asset'
                    ];
                    State.currentConfig.excludedObjects = [...CPQ_DEFAULT_EXCLUDED_OBJECTS];
                    // Ensure Product2 is in excluded objects
                    if (!State.currentConfig.excludedObjects.includes('Product2')) {
                        State.currentConfig.excludedObjects.push('Product2');
                    }
                } else {
                    // Standard mode: empty array
                    State.currentConfig.excludedObjects = [];
                }
            }
            
            // Check for config changes
            if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                window.SFDMU.ConfigChangeChecker.check();
            }
        },
        
        renderExcludedObjects: function() {
            const State = getState();
            if (!State) {
                console.error('State is not initialized');
                return;
            }
            
            const textarea = document.getElementById('excluded-objects');
            if (State.currentConfig.excludedObjects && State.currentConfig.excludedObjects.length > 0) {
                textarea.value = State.currentConfig.excludedObjects.join('\n');
            } else {
                textarea.value = '';
                State.currentConfig.excludedObjects = [];
            }
        },
        
        
        cloneConfig: function(config) {
            return JSON.parse(JSON.stringify(config));
        },
        
        normalizeConfigForComparison: function(config) {
            const normalized = {
                mode: config.mode || 'standard',
                objects: (config.objects || []).map(obj => ({
                    objectName: obj.objectName || '',
                    externalId: obj.externalId || '',
                    soqlQuery: obj.soqlQuery || '',
                    useCustomQuery: obj.useCustomQuery || false,
                    selectedFields: (obj.selectedFields || []).sort(),
                    whereClause: obj.whereClause || '',
                    orderByClause: obj.orderByClause || '',
                    limitClause: obj.limitClause || ''
                })),
                selectedPhases: (config.selectedPhases || []).slice().sort(),
                includeProduct2: !!config.includeProduct2,
                selectedMasterRecords: config.selectedMasterRecords || {},
                operation: config.operation || 'Upsert',
                modifiedSince: config.modifiedSince || '',
                customFilters: (config.customFilters || []).map(f => ({
                    objectName: f.objectName || '',
                    whereClause: f.whereClause || ''
                })).sort((a, b) => a.objectName.localeCompare(b.objectName)),
                excludedObjects: (config.excludedObjects || []).sort(),
                outputDir: config.outputDir || '',
                sourceOrg: {
                    username: config.sourceOrg?.username || '',
                    instanceUrl: config.sourceOrg?.instanceUrl || '',
                    alias: config.sourceOrg?.alias || ''
                },
                targetOrg: {
                    username: config.targetOrg?.username || '',
                    instanceUrl: config.targetOrg?.instanceUrl || '',
                    alias: config.targetOrg?.alias || ''
                }
            };
            return normalized;
        },
        
        configsAreDifferent: function(config1, config2) {
            if (!config1 || !config2) return true;
            const normalized1 = this.normalizeConfigForComparison(config1);
            const normalized2 = this.normalizeConfigForComparison(config2);
            return JSON.stringify(normalized1) !== JSON.stringify(normalized2);
        }
    };
})();

