// Config Change Checker Module
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const State = window.SFDMU.State;
    const ConfigManager = window.SFDMU.ConfigManager;
    
    window.SFDMU.ConfigChangeChecker = {
        check: function(skipUpdateMigrationObjects = false) {
            if (State.isCheckingConfigChanges) {
                return false;
            }
            
            // Don't check for changes when orgs are being synced
            if (State.isSyncingOrgs) {
                return false;
            }
            
            if (!State.lastGeneratedConfig) {
                this.removeBadges();
                return false;
            }
            
            State.isCheckingConfigChanges = true;
            
            try {
                // Update current config from UI before comparing
                ConfigManager.updateOrgConfig();
                ConfigManager.updateExcludedObjects();
                if (!skipUpdateMigrationObjects && window.SFDMU.MigrationObjects) {
                    window.SFDMU.MigrationObjects.update();
                }
                
                const hasChanges = ConfigManager.configsAreDifferent(State.currentConfig, State.lastGeneratedConfig);
                
                console.log('Config change check:', {
                    hasChanges,
                    hasLastGenerated: !!State.lastGeneratedConfig,
                    currentObjects: State.currentConfig.objects?.length || 0,
                    lastObjects: State.lastGeneratedConfig?.objects?.length || 0,
                    skipUpdateMigrationObjects
                });
                
                if (hasChanges) {
                    this.addBadges();
                } else {
                    this.removeBadges();
                }
                
                return hasChanges;
            } finally {
                State.isCheckingConfigChanges = false;
            }
        },
        
        addBadges: function() {
            const simulateIcon = document.getElementById('simulate-migration-icon');
            const runIcon = document.getElementById('run-migration-icon');
            
            this.removeBadges();
            
            if (simulateIcon) {
                const existingBadge = simulateIcon.querySelector('.config-change-badge');
                if (!existingBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'config-change-badge';
                    badge.textContent = '!';
                    badge.title = 'Configuration has changed - regenerate migration file';
                    simulateIcon.appendChild(badge);
                }
            }
            
            if (runIcon) {
                const existingBadge = runIcon.querySelector('.config-change-badge');
                if (!existingBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'config-change-badge';
                    badge.textContent = '!';
                    badge.title = 'Configuration has changed - regenerate migration file';
                    runIcon.appendChild(badge);
                }
            }
        },
        
        removeBadges: function() {
            const simulateIcon = document.getElementById('simulate-migration-icon');
            const runIcon = document.getElementById('run-migration-icon');
            
            if (simulateIcon) {
                const badge = simulateIcon.querySelector('.config-change-badge');
                if (badge) badge.remove();
            }
            
            if (runIcon) {
                const badge = runIcon.querySelector('.config-change-badge');
                if (badge) badge.remove();
            }
        }
    };
})();

