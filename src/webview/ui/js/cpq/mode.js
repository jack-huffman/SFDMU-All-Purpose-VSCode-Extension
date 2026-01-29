/**
 * CPQ Mode Management
 * Handles mode switching and UI updates for CPQ mode
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const State = window.SFDMU.State;
    const CPQ_DEFAULT_EXCLUDED_OBJECTS = window.SFDMU.Cpq.CPQ_DEFAULT_EXCLUDED_OBJECTS || [];

    /**
     * Check if current mode is CPQ
     */
    window.SFDMU.Cpq.isCpqMode = function() {
        return (State.currentConfig.mode || 'standard') === 'cpq';
    };

    /**
     * Set the migration mode and update UI accordingly
     */
    window.SFDMU.Cpq.setMode = function(mode) {
        State.currentConfig.mode = mode;
        const modeToggle = document.getElementById('mode-toggle-switch');
        const objectsContainer = document.getElementById('objects-mode-container');
        const cpqContainer = document.getElementById('cpq-mode-container');
        const titleEl = document.getElementById('migration-objects-title');
        const cpqDisclaimer = document.getElementById('excluded-objects-cpq-disclaimer');

        // Update toggle switch state
        if (modeToggle) {
            modeToggle.checked = (mode === 'cpq');
        }

        if (objectsContainer && cpqContainer) {
            const mainContent = document.getElementById('main-content');
            
            if (mode === 'cpq') {
                objectsContainer.style.display = 'none';
                cpqContainer.style.display = 'block';
                if (titleEl) {
                    titleEl.textContent = 'CPQ Migrations';
                }
                // Add cpq-mode class to main content to hide standard-mode-only buttons
                if (mainContent) {
                    mainContent.classList.add('cpq-mode');
                }
                // Hide header rollback button (rollback is per-phase inside phases)
                if (window.SFDMU.RollbackManager && window.SFDMU.RollbackManager.hideRollbackButton) {
                    window.SFDMU.RollbackManager.hideRollbackButton();
                }
                // Hide parent-level DML Operation dropdown, Configuration button, and Generate button in CPQ mode
                const dmlOperationControl = document.querySelector('.dml-operation-control');
                if (dmlOperationControl) {
                    dmlOperationControl.style.display = 'none';
                }
                const configButtonWrapper = document.querySelector('.config-button-wrapper');
                if (configButtonWrapper) {
                    configButtonWrapper.style.display = 'none';
                }
                const generateFilesIcon = document.getElementById('generate-files-icon');
                if (generateFilesIcon) {
                    generateFilesIcon.style.display = 'none';
                }
                // Hide the org-selection-header div since all its contents are hidden in CPQ mode
                const orgSelectionHeader = document.querySelector('.org-selection-header');
                if (orgSelectionHeader) {
                    orgSelectionHeader.style.display = 'none';
                }
                // Show CPQ disclaimer
                if (cpqDisclaimer) {
                    cpqDisclaimer.style.display = 'block';
                }

                // When switching into CPQ mode, set excluded objects to CPQ defaults (including Product2)
                State.currentConfig.excludedObjects = [...CPQ_DEFAULT_EXCLUDED_OBJECTS];
                // Ensure Product2 is in excluded objects if not already there
                if (!State.currentConfig.excludedObjects.includes('Product2')) {
                    State.currentConfig.excludedObjects.push('Product2');
                }
                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.renderExcludedObjects) {
                    window.SFDMU.ConfigManager.renderExcludedObjects();
                }
            } else {
                objectsContainer.style.display = 'block';
                cpqContainer.style.display = 'none';
                if (titleEl) {
                    titleEl.textContent = 'Migration Objects';
                }
                // Remove cpq-mode class to show standard-mode-only buttons
                if (mainContent) {
                    mainContent.classList.remove('cpq-mode');
                }
                // Show parent-level DML Operation dropdown, Configuration button, and Generate button
                const dmlOperationControl = document.querySelector('.dml-operation-control');
                if (dmlOperationControl) {
                    dmlOperationControl.style.display = ''; // Revert to default display
                }
                const configButtonWrapper = document.querySelector('.config-button-wrapper');
                if (configButtonWrapper) {
                    configButtonWrapper.style.display = ''; // Revert to default display
                }
                const generateFilesIcon = document.getElementById('generate-files-icon');
                if (generateFilesIcon) {
                    generateFilesIcon.style.display = ''; // Revert to default display
                }
                // Show the org-selection-header div when not in CPQ mode
                const orgSelectionHeader = document.querySelector('.org-selection-header');
                if (orgSelectionHeader) {
                    orgSelectionHeader.style.display = ''; // Revert to default display
                }
                // When switching to standard mode, clear excluded objects
                State.currentConfig.excludedObjects = [];
                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.renderExcludedObjects) {
                    window.SFDMU.ConfigManager.renderExcludedObjects();
                }
                // Hide CPQ disclaimer
                if (cpqDisclaimer) {
                    cpqDisclaimer.style.display = 'none';
                }
            }
        }

        // Recompute generate button titles / enabled state
        if (window.SFDMU.MigrationExecution && window.SFDMU.MigrationExecution.checkPhaseFiles) {
            setTimeout(() => window.SFDMU.MigrationExecution.checkPhaseFiles(), 50);
        }
    };
})();

