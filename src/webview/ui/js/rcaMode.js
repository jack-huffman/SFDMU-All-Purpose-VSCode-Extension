/**
 * RCA Mode - Main Entry Point
 * Thin wrapper that initializes RCA mode and delegates to specialized modules
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    const State = window.SFDMU.State;
    const vscode = window.SFDMU.vscode;

    // Helper to ensure RCA modules are loaded
    function ensureRcaModules(callback, maxRetries = 20) {
        if (window.SFDMU && window.SFDMU.Rca) {
            callback();
        } else if (maxRetries > 0) {
            // Retry after a short delay if modules aren't loaded yet
        setTimeout(() => {
                ensureRcaModules(callback, maxRetries - 1);
        }, 100);
                } else {
            console.error('RCA modules failed to load after retries. Debug info:', {
                hasSFDMU: !!window.SFDMU,
                hasRca: !!(window.SFDMU && window.SFDMU.Rca),
                loadedScripts: Array.from(document.querySelectorAll('script[src*="rca"]')).map(s => s.src)
            });
        }
    }

    // Public API - delegates to specialized modules
    window.SFDMU.RcaMode = {
        init: function() {
            // Try to initialize immediately
            this._initModeSelector();
            
            // Also try after DOM is ready (in case elements aren't loaded yet)
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this._initModeSelector();
                });
            }
            
            // Initialize other elements
            this._initOtherElements();
        },
        
        _initModeSelector: function() {
            // Mode selector has been removed - modes are now set at config creation time
            // Just apply the current mode from config
            const currentMode = (State.currentConfig && State.currentConfig.mode) || 'standard';
            ensureRcaModules(() => {
                if (window.SFDMU.Rca && window.SFDMU.Rca.setMode) {
                    window.SFDMU.Rca.setMode(currentMode);
                }
            });
            
            // Initialize mode-specific features if needed
            if (currentMode === 'rca') {
                ensureRcaModules(() => {
                    if (window.SFDMU.Rca && window.SFDMU.Rca.requestPhaseDefinitions) {
                        window.SFDMU.Rca.requestPhaseDefinitions();
                    }
                    if (window.SFDMU.Rca && window.SFDMU.Rca.checkMetadataStatus) {
                        window.SFDMU.Rca.checkMetadataStatus();
                    }
                });
            } else if (currentMode === 'cpq') {
                // Request CPQ phase definitions
                if (window.SFDMU.CpqMode && window.SFDMU.CpqMode.requestPhaseDefinitions) {
                    window.SFDMU.CpqMode.requestPhaseDefinitions();
                } else {
                    // Fallback: use vscode message
                    vscode.postMessage({
                        command: 'getCpqPhaseDefinitions',
                        includeProduct2: false
                    });
                }
            }
        },
        
        _initOtherElements: function() {
            const deployAllBtn = document.getElementById('deploy-all-metadata');
            const deployFromConfigBtn = document.getElementById('deploy-metadata-from-config');

            if (deployAllBtn) {
                deployAllBtn.addEventListener('click', () => {
                    ensureRcaModules(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                            window.SFDMU.Rca.deployMetadata('all');
                        }
                    });
                });
            }

            if (deployFromConfigBtn) {
                deployFromConfigBtn.addEventListener('click', () => {
                    ensureRcaModules(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                            window.SFDMU.Rca.deployMetadata('all');
                        }
                    });
                });
            }

            // Individual metadata deploy buttons
            const deployDecisionMatrixBtn = document.getElementById('deploy-decisionmatrix');
            const deployExpressionSetBtn = document.getElementById('deploy-expressionset');
            
            if (deployDecisionMatrixBtn) {
                deployDecisionMatrixBtn.addEventListener('click', () => {
                    ensureRcaModules(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                            window.SFDMU.Rca.deployMetadata('DecisionMatrixDefinition');
                        }
                    });
                });
            }
            
            if (deployExpressionSetBtn) {
                deployExpressionSetBtn.addEventListener('click', () => {
                    ensureRcaModules(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                            window.SFDMU.Rca.deployMetadata('ExpressionSet');
                        }
                    });
                });
            }
        },

        handlePhaseDefinitions: function(phases) {
            ensureRcaModules(() => {
                if (window.SFDMU.Rca && window.SFDMU.Rca.setPhaseDefinitions) {
                    window.SFDMU.Rca.setPhaseDefinitions(phases || []);
                }
                if (window.SFDMU.Rca && window.SFDMU.Rca.renderIndividualPhases) {
                    window.SFDMU.Rca.renderIndividualPhases();
                }
            
            // If modal was waiting for phase definitions, reopen it
            // Check if there's a pending modal open request
            if (window.SFDMU.Rca && window.SFDMU.Rca._pendingModalPhase) {
                const phaseNumber = window.SFDMU.Rca._pendingModalPhase;
                console.log('[RCA Master Selection] Phase definitions loaded, reopening modal for phase', phaseNumber);
                delete window.SFDMU.Rca._pendingModalPhase;
                // Small delay to ensure phase definitions are set
                setTimeout(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.openMasterSelectionModal) {
                        window.SFDMU.Rca.openMasterSelectionModal(phaseNumber);
                    }
                }, 100);
            }
            });
        },

        setPhaseFilesStatus: function(hasFiles) {
            ensureRcaModules(() => {
                if (window.SFDMU.Rca && window.SFDMU.Rca.setHasPhaseFiles) {
                    window.SFDMU.Rca.setHasPhaseFiles(hasFiles);
                }
            // Re-render to update button states
            const activePhaseTab = window.SFDMU.Rca.getActivePhaseTab();
                if (window.SFDMU.Rca && window.SFDMU.Rca.renderIndividualPhases) {
                    window.SFDMU.Rca.renderIndividualPhases();
                }
            // Re-render the active phase content to update button states
                if (window.SFDMU.Rca && window.SFDMU.Rca.renderPhaseContent) {
            window.SFDMU.Rca.renderPhaseContent(activePhaseTab);
                }
            });
        },

        handleMetadataDeployed: function(result) {
            if (result.success) {
                const decisionMatrixBadge = document.getElementById('metadata-status-decisionmatrix');
                const expressionSetBadge = document.getElementById('metadata-status-expressionset');
                
                if (decisionMatrixBadge) {
                    decisionMatrixBadge.textContent = 'Deployed';
                    decisionMatrixBadge.className = 'metadata-status-badge metadata-status-deployed';
                }
                if (expressionSetBadge) {
                    expressionSetBadge.textContent = 'Deployed';
                    expressionSetBadge.className = 'metadata-status-badge metadata-status-deployed';
                }
            }
        },

        // Apply the current config's mode to the UI (used when loading/switching configs)
        applyModeFromConfig: function() {
            const mode = (State.currentConfig && State.currentConfig.mode) || 'standard';
            
            console.log('[RcaMode] applyModeFromConfig called with mode:', mode);
            
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
            
            // Call setMode directly - it has its own retry logic if containers aren't ready
            ensureRcaModules(() => {
                if (window.SFDMU.Rca && window.SFDMU.Rca.setMode) {
                    window.SFDMU.Rca.setMode(mode);
                }
            });
                
            // Use setTimeout to ensure DOM is ready for phase-specific initialization
            setTimeout(() => {
                // Double-check that the correct container is visible
                const objectsContainer = document.getElementById('objects-mode-container');
                const cpqContainer = document.getElementById('cpq-mode-container');
                const rcaContainer = document.getElementById('rca-mode-container');
                
                console.log('[RcaMode] After setMode, container visibility:', {
                    mode: mode,
                    objects: objectsContainer ? objectsContainer.style.display : 'not found',
                    cpq: cpqContainer ? cpqContainer.style.display : 'not found',
                    rca: rcaContainer ? rcaContainer.style.display : 'not found'
                });
                
                if (mode === 'rca') {
                    ensureRcaModules(() => {
                        if (window.SFDMU.Rca && window.SFDMU.Rca.requestPhaseDefinitions) {
                            window.SFDMU.Rca.requestPhaseDefinitions();
                        }
                        if (window.SFDMU.Rca && window.SFDMU.Rca.checkMetadataStatus) {
                            window.SFDMU.Rca.checkMetadataStatus();
                        }
                    });
                } else if (mode === 'cpq') {
                    // Request CPQ phase definitions
                    if (window.SFDMU.CpqMode && window.SFDMU.CpqMode.requestPhaseDefinitions) {
                        window.SFDMU.CpqMode.requestPhaseDefinitions();
                    } else {
                        vscode.postMessage({
                            command: 'getCpqPhaseDefinitions',
                            includeProduct2: false
                        });
                    }
                }
            }, 100);
        },

        // Expose setMode so other modules can call it
        setMode: function(mode) {
            ensureRcaModules(() => {
                if (window.SFDMU.Rca && window.SFDMU.Rca.setMode) {
                    window.SFDMU.Rca.setMode(mode);
                }
            });
        },

        // Reset RCA mode state
        reset: function() {
            ensureRcaModules(() => {
                // Reset phase definitions and state
                if (window.SFDMU.Rca && window.SFDMU.Rca.setPhaseDefinitions) {
                    window.SFDMU.Rca.setPhaseDefinitions([]);
                }
                if (window.SFDMU.Rca && window.SFDMU.Rca.setHasPhaseFiles) {
                    window.SFDMU.Rca.setHasPhaseFiles(false);
                }
                if (window.SFDMU.Rca && window.SFDMU.Rca.setActivePhaseTab) {
                    window.SFDMU.Rca.setActivePhaseTab('metadata');
                }
                // Re-render to show empty state
                if (window.SFDMU.Rca && window.SFDMU.Rca.renderIndividualPhases) {
                    window.SFDMU.Rca.renderIndividualPhases();
                }
            });
        }
    };
})();
