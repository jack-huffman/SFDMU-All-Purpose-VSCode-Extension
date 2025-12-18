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
            if (generateIcon) {
                if (State.currentConfig.mode === 'cpq') {
                    generateIcon.title = hasFiles ? 'Regenerate CPQ Phase Files' : 'Generate CPQ Phase Files';
                } else {
                    generateIcon.title = hasFiles ? 'Regenerate Migration File' : 'Generate Migration File';
                }
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
        }
    };
})();

