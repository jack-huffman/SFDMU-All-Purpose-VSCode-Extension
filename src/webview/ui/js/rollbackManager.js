// Rollback Manager - Handles rollback button visibility and backup detection
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    
    window.SFDMU.RollbackManager = {
        rollbackButton: null,
        currentConfigName: null,
        availableBackups: [],

        init: function() {
            this.rollbackButton = document.getElementById('rollback-migration-icon');
            if (!this.rollbackButton) {
                console.warn('Rollback button not found in DOM');
                return;
            }

            // Set up click handler
            this.rollbackButton.addEventListener('click', () => {
                this.handleRollbackClick();
            });

            // Check for backups when config is loaded
            if (State.currentConfig && State.currentConfig.configName) {
                this.checkBackups(State.currentConfig.configName);
            }
        },

        checkBackups: async function(configName) {
            if (!configName) {
                this.hideRollbackButton();
                return;
            }

            this.currentConfigName = configName;

            try {
                // Request backups from extension
                vscode.postMessage({
                    command: 'loadBackups',
                    configName: configName
                });
            } catch (error) {
                console.error('Error checking backups:', error);
                this.hideRollbackButton();
            }
        },

        showRollbackButton: function() {
            if (this.rollbackButton) {
                this.rollbackButton.style.display = 'inline-flex';
            }
        },

        hideRollbackButton: function() {
            if (this.rollbackButton) {
                this.rollbackButton.style.display = 'none';
            }
        },

        handleRollbackClick: function() {
            if (!this.currentConfigName) {
                vscode.postMessage({
                    command: 'showError',
                    message: 'No configuration loaded'
                });
                return;
            }

            // Open rollback modal
            if (window.SFDMU.RollbackModal) {
                window.SFDMU.RollbackModal.show(this.currentConfigName);
            }
        },

        updateBackups: function(backups) {
            this.availableBackups = backups || [];
            const mode = State.currentConfig?.mode || 'standard';
            const isPhaseMode = mode === 'cpq' || mode === 'rca';
            // In CPQ/RCA mode the header rollback button is hidden; rollback is per-phase inside phases
            if (this.availableBackups.length > 0 && !isPhaseMode) {
                this.showRollbackButton();
            } else {
                this.hideRollbackButton();
            }
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.SFDMU.RollbackManager.init();
        });
    } else {
        window.SFDMU.RollbackManager.init();
    }
})();
