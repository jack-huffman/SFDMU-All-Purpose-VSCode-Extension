// Migration Execution Module
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    const ConfigManager = window.SFDMU.ConfigManager;
    const MigrationObjects = window.SFDMU.MigrationObjects;
    
    window.SFDMU.MigrationExecution = {
        generateFiles: function() {
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            const mode = State.currentConfig.mode || 'standard';
            
            if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
                return;
            }
            
            if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
                return;
            }
            
            if (mode !== 'cpq') {
                // Standard mode requires at least one object
                if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                    vscode.postMessage({ command: 'showError', message: 'Error: At least one object must be added' });
                    return;
                }
            }
            
            vscode.postMessage({
                command: 'generateFiles',
                config: State.currentConfig
            });
        },
        
        exportToExcel: function() {
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            const mode = State.currentConfig.mode || 'standard';
            
            if (!State.currentConfig.sourceOrg.alias && !State.currentConfig.sourceOrg.username) {
                vscode.postMessage({ command: 'showError', message: 'Error: Source org is required for Excel export' });
                return;
            }
            
            if (mode !== 'cpq' && mode !== 'rca') {
                // Standard mode requires at least one object
                if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                    vscode.postMessage({ command: 'showError', message: 'Error: At least one object must be added' });
                    return;
                }
            }
            
            // Show confirmation modal
            if (window.SFDMU.Modals) {
                window.SFDMU.Modals.showExcelExportConfirm();
            }
        },
        
        proceedWithExcelExport: function(phaseNumber) {
            // This is called from the modal after user confirms
            vscode.postMessage({
                command: 'exportToExcel',
                config: State.currentConfig,
                phaseNumber: phaseNumber
            });
        },
        
        simulateMigration: function() {
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
                return;
            }
            
            if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
                return;
            }
            
            if (State.currentConfig.mode === 'cpq') {
                vscode.postMessage({ command: 'showInfo', message: 'In CPQ Mode, use the Run buttons in the Phases section to execute migrations.' });
                return;
            }
            
            if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                vscode.postMessage({ command: 'showError', message: 'Error: At least one object must be added' });
                return;
            }
            
            if (window.SFDMU.ConfigChangeChecker && window.SFDMU.ConfigChangeChecker.check()) {
                if (window.SFDMU.Modals) {
                    window.SFDMU.Modals.showConfigChangeWarning(true);
                }
                return;
            }
            
            if (window.SFDMU.Modals) {
                window.SFDMU.Modals.showMigrationConfirm(true);
            }
        },
        
        runMigration: function() {
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
                return;
            }
            
            if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
                return;
            }
            
            if (State.currentConfig.mode === 'cpq') {
                vscode.postMessage({ command: 'showInfo', message: 'In CPQ Mode, use the Run buttons in the Phases section to execute migrations.' });
                return;
            }
            
            if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                vscode.postMessage({ command: 'showError', message: 'Error: At least one object must be added' });
                return;
            }
            
            if (window.SFDMU.ConfigChangeChecker && window.SFDMU.ConfigChangeChecker.check()) {
                if (window.SFDMU.Modals) {
                    window.SFDMU.Modals.showConfigChangeWarning(false);
                }
                return;
            }
            
            if (window.SFDMU.Modals) {
                window.SFDMU.Modals.showMigrationConfirm(false);
            }
        },
        
        checkPhaseFiles: function() {
            if (State.currentConfig.outputDir) {
                vscode.postMessage({ command: 'checkPhaseFiles', outputDir: State.currentConfig.outputDir });
            }
        },
        
        updateGenerateButtonText: function(hasFiles) {
            const generateIcon = document.getElementById('generate-files-icon');
            // Skip updating tooltip in CPQ mode since the parent-level button is hidden
            // (each phase has its own generate button with per-phase generation)
            if (generateIcon && State.currentConfig.mode !== 'cpq') {
                generateIcon.title = hasFiles ? 'Regenerate Migration File' : 'Generate Migration File';
            }
            
            const simulateIcon = document.getElementById('simulate-migration-icon');
            const runIcon = document.getElementById('run-migration-icon');
            if (simulateIcon) {
                // Global simulate/run are not used in CPQ mode
                simulateIcon.disabled = State.currentConfig.mode === 'cpq' || !hasFiles;
            }
            if (runIcon) {
                runIcon.disabled = State.currentConfig.mode === 'cpq' || !hasFiles;
            }
            
            if (hasFiles) {
                if (window.SFDMU.ConfigChangeChecker) {
                    window.SFDMU.ConfigChangeChecker.check();
                }
            } else {
                if (window.SFDMU.ConfigChangeChecker) {
                    window.SFDMU.ConfigChangeChecker.removeBadges();
                }
                State.lastGeneratedConfig = null;
            }
        },
        
        proceedWithMigration: function(simulation) {
            // Update config before sending
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            vscode.postMessage({
                command: simulation ? 'simulateMigration' : 'runMigration',
                config: State.currentConfig
            });
        },
        
        createBackup: function() {
            ConfigManager.updateOrgConfig();
            ConfigManager.updateExcludedObjects();
            MigrationObjects.update();
            
            if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
                vscode.postMessage({ command: 'showError', message: 'Error: Target org is required for backup' });
                return;
            }
            
            if (!State.currentConfig.configName) {
                vscode.postMessage({ command: 'showError', message: 'Error: Configuration name is required for backup' });
                return;
            }
            
            const mode = State.currentConfig.mode || 'standard';
            
            // For CPQ/RCA modes, backup requires export.json files to exist
            // For now, we'll try to backup Phase 1 if it exists, otherwise show an error
            if (mode === 'cpq' || mode === 'rca') {
                // For phase-based modes, backup Phase 1 by default
                // User should generate phase files first
                vscode.postMessage({
                    command: 'createBackup',
                    config: State.currentConfig,
                    phaseNumber: 1 // Default to Phase 1 for testing
                });
            } else {
                // Standard mode - backup all objects
                if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                    vscode.postMessage({ command: 'showError', message: 'Error: At least one object must be added' });
                    return;
                }
                
                vscode.postMessage({
                    command: 'createBackup',
                    config: State.currentConfig
                });
            }
        }
    };
})();

