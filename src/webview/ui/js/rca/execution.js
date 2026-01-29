/**
 * RCA Phase Execution
 * Functions for running phases, generating files, and exporting to Excel
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;

    /**
     * Run a phase (simulation or actual execution)
     */
    window.SFDMU.Rca.runPhase = function(phaseNumber, simulation) {
        // Ensure org config is up-to-date
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }

        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
            return;
        }

        if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
            vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
            return;
        }

        vscode.postMessage({
            command: 'runRcaPhase',
            config: State.currentConfig,
            phaseNumber: phaseNumber,
            simulation: simulation
        });
    };

    /**
     * Generate phase files
     */
    window.SFDMU.Rca.generatePhaseFiles = function(phaseNumber) {
        // Ensure org config is up-to-date
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }

        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
            return;
        }

        if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
            vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
            return;
        }

        // Send message to generate files for this specific phase
        vscode.postMessage({
            command: 'generatePhaseFile',
            config: State.currentConfig,
            phaseNumber: phaseNumber
        });
    };
    
    /**
     * Export phase to Excel
     */
    window.SFDMU.Rca.exportPhaseToExcel = function(phaseNumber) {
        if (!State.currentConfig.sourceOrg.alias && !State.currentConfig.sourceOrg.username) {
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required for Excel export' });
            return;
        }
        
        // Show confirmation modal with phase number
        if (window.SFDMU.Modals) {
            window.SFDMU.Modals.showExcelExportConfirm(phaseNumber);
        }
    };
})();
