/**
 * RCA Mode Management
 * Handles mode switching and UI updates for RCA mode
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const State = window.SFDMU.State;
    const RCA_DEFAULT_EXCLUDED_OBJECTS = window.SFDMU.Rca.RCA_DEFAULT_EXCLUDED_OBJECTS || [];
    const CPQ_DEFAULT_EXCLUDED_OBJECTS = window.SFDMU.Rca.CPQ_DEFAULT_EXCLUDED_OBJECTS || [];

    /**
     * Check if current mode is RCA
     */
    window.SFDMU.Rca.isRcaMode = function() {
        return (State.currentConfig.mode || 'standard') === 'rca';
    };

    /**
     * Set the migration mode and update UI accordingly
     */
    window.SFDMU.Rca.setMode = function(mode) {
        if (!mode) {
            mode = 'standard';
        }
        State.currentConfig.mode = mode;
        const objectsContainer = document.getElementById('objects-mode-container');
        const cpqContainer = document.getElementById('cpq-mode-container');
        const rcaContainer = document.getElementById('rca-mode-container');
        const titleEl = document.getElementById('migration-objects-title');
        const metadataTab = document.getElementById('config-tab-metadata-prerequisites');
        const cpqDisclaimer = document.getElementById('excluded-objects-cpq-disclaimer');
        const rcaDisclaimer = document.getElementById('excluded-objects-rca-disclaimer');

        // Ensure containers exist before manipulating them
        if (!objectsContainer || !cpqContainer || !rcaContainer) {
            console.warn('[RcaMode] Mode containers not found, retrying in 100ms', {
                objects: !!objectsContainer,
                cpq: !!cpqContainer,
                rca: !!rcaContainer
            });
            setTimeout(() => window.SFDMU.Rca.setMode(mode), 100);
            return;
        }
        
        console.log('[RcaMode] setMode called with mode:', mode, {
            objectsDisplay: objectsContainer.style.display,
            cpqDisplay: cpqContainer.style.display,
            rcaDisplay: rcaContainer.style.display
        });
        
        const mainContent = document.getElementById('main-content');
        
        // Hide all containers first
        objectsContainer.style.display = 'none';
        cpqContainer.style.display = 'none';
        rcaContainer.style.display = 'none';
        
        // Remove all mode classes
        if (mainContent) {
            mainContent.classList.remove('cpq-mode', 'rca-mode');
        }
        
        // Process the mode-specific logic
        if (mode === 'rca') {
            rcaContainer.style.display = 'block';
            if (titleEl) {
                titleEl.textContent = 'RCA Migrations';
            }
            // Add rca-mode class to main content to hide standard-mode-only buttons
            if (mainContent) {
                mainContent.classList.add('rca-mode');
            }
            // Hide header rollback button (rollback is per-phase inside phases)
            if (window.SFDMU.RollbackManager && window.SFDMU.RollbackManager.hideRollbackButton) {
                window.SFDMU.RollbackManager.hideRollbackButton();
            }
            if (metadataTab) {
                metadataTab.style.display = 'block';
            }
            // Show RCA disclaimer
            if (rcaDisclaimer) {
                rcaDisclaimer.style.display = 'block';
            }
            // Hide CPQ disclaimer
            if (cpqDisclaimer) {
                cpqDisclaimer.style.display = 'none';
            }

            // When switching into RCA mode, set excluded objects to RCA defaults (including Product2)
            State.currentConfig.excludedObjects = [...RCA_DEFAULT_EXCLUDED_OBJECTS];
            // Ensure Product2 is in excluded objects if not already there
            if (!State.currentConfig.excludedObjects.includes('Product2')) {
                State.currentConfig.excludedObjects.push('Product2');
            }
            if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.renderExcludedObjects) {
                window.SFDMU.ConfigManager.renderExcludedObjects();
            }
        } else if (mode === 'cpq') {
            cpqContainer.style.display = 'block';
            if (titleEl) {
                titleEl.textContent = 'CPQ Migrations';
            }
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
            if (metadataTab) {
                metadataTab.style.display = 'none';
            }
            if (cpqDisclaimer) {
                cpqDisclaimer.style.display = 'block';
            }
            if (rcaDisclaimer) {
                rcaDisclaimer.style.display = 'none';
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
            // Standard mode
            objectsContainer.style.display = 'block';
            if (titleEl) {
                titleEl.textContent = 'Migration Objects';
            }
            if (mainContent) {
                mainContent.classList.remove('cpq-mode');
                mainContent.classList.remove('rca-mode');
            }
            // Show parent-level DML Operation dropdown, Configuration button, and Generate button when not in CPQ mode
            const dmlOperationControl = document.querySelector('.dml-operation-control');
            if (dmlOperationControl) {
                dmlOperationControl.style.display = '';
            }
            const configButtonWrapper = document.querySelector('.config-button-wrapper');
            if (configButtonWrapper) {
                configButtonWrapper.style.display = '';
            }
            const generateFilesIcon = document.getElementById('generate-files-icon');
            if (generateFilesIcon) {
                generateFilesIcon.style.display = '';
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
            // If metadata tab was active, switch to Excluded Objects
            const excludedTab = document.getElementById('config-tab-excluded-objects');
            const excludedTabContent = document.getElementById('config-tab-content-excluded-objects');
            if (metadataTab && metadataTab.classList.contains('active')) {
                if (metadataTab) {
                    metadataTab.classList.remove('active');
                }
                const metadataContent = document.getElementById('config-tab-content-metadata-prerequisites');
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

        // Recompute generate button titles / enabled state
        if (window.SFDMU.MigrationExecution && window.SFDMU.MigrationExecution.checkPhaseFiles) {
            setTimeout(() => window.SFDMU.MigrationExecution.checkPhaseFiles(), 50);
        }
    };
})();
