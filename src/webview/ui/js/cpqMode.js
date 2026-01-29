/**
 * CPQ Mode - Main Entry Point
 * Thin wrapper that initializes CPQ mode and delegates to specialized modules
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    const State = window.SFDMU.State;

    // Helper to ensure CPQ modules are loaded
    function ensureCpqModules(callback, maxRetries = 20) {
        if (window.SFDMU && window.SFDMU.Cpq) {
            callback();
        } else if (maxRetries > 0) {
            // Retry after a short delay if modules aren't loaded yet
            setTimeout(() => {
                ensureCpqModules(callback, maxRetries - 1);
            }, 100);
        } else {
            console.error('CPQ modules failed to load after retries. Debug info:', {
                hasSFDMU: !!window.SFDMU,
                hasCpq: !!(window.SFDMU && window.SFDMU.Cpq),
                loadedScripts: Array.from(document.querySelectorAll('script[src*="cpq"]')).map(s => s.src)
            });
        }
    }

    // Public API - delegates to specialized modules
    window.SFDMU.CpqMode = {
        init: function() {
            // Setup master selection modal event handlers (defer until modules are loaded)
            ensureCpqModules(() => {
                const modal = document.getElementById('cpq-master-selection-modal');
                const closeBtn = document.getElementById('cpq-master-selection-close');
                const cancelBtn = document.getElementById('master-selection-cancel');
                const saveBtn = document.getElementById('master-selection-save');

                if (closeBtn && window.SFDMU.Cpq.closeMasterSelectionModal) {
                    closeBtn.addEventListener('click', window.SFDMU.Cpq.closeMasterSelectionModal);
                }
                if (cancelBtn && window.SFDMU.Cpq.closeMasterSelectionModal) {
                    cancelBtn.addEventListener('click', window.SFDMU.Cpq.closeMasterSelectionModal);
                }
                if (saveBtn && window.SFDMU.Cpq.saveMasterSelections) {
                    saveBtn.addEventListener('click', () => {
                        window.SFDMU.Cpq.saveMasterSelections(false); // Save without closing
                    });
                }
                
                // Setup children view modal event handlers
                const childrenModal = document.getElementById('cpq-children-view-modal');
                const childrenModalClose = document.getElementById('cpq-children-modal-close');
                const childrenModalCloseBtn = document.getElementById('cpq-children-modal-close-btn');
                
                const closeChildrenModal = () => {
                    if (childrenModal) {
                        childrenModal.classList.remove('show');
                    }
                };
                
                if (childrenModalClose) {
                    childrenModalClose.addEventListener('click', closeChildrenModal);
                }
                if (childrenModalCloseBtn) {
                    childrenModalCloseBtn.addEventListener('click', closeChildrenModal);
                }
                if (childrenModal) {
                    childrenModal.addEventListener('click', (e) => {
                        if (e.target === childrenModal) {
                            closeChildrenModal();
                        }
                    });
                }
                const saveAndCloseBtn = document.getElementById('master-selection-save-close');
                if (saveAndCloseBtn && window.SFDMU.Cpq.saveMasterSelections) {
                    saveAndCloseBtn.addEventListener('click', () => {
                        window.SFDMU.Cpq.saveMasterSelections(true); // Save and close
                    });
                }
                if (modal && window.SFDMU.Cpq.closeMasterSelectionModal) {
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            window.SFDMU.Cpq.closeMasterSelectionModal();
                        }
                    });
                }
            });
        },

        handlePhaseDefinitions: function(phases) {
            ensureCpqModules(() => {
                if (window.SFDMU.Cpq.setPhaseDefinitions) {
                    window.SFDMU.Cpq.setPhaseDefinitions(phases || []);
                }
                if (window.SFDMU.Cpq.renderIndividualPhases) {
                    window.SFDMU.Cpq.renderIndividualPhases();
                }
            });
        },

        setPhaseFilesStatus: function(hasFiles) {
            ensureCpqModules(() => {
                if (window.SFDMU.Cpq.setHasPhaseFiles) {
                    window.SFDMU.Cpq.setHasPhaseFiles(hasFiles);
                }
                if (window.SFDMU.Cpq.renderIndividualPhases) {
                    window.SFDMU.Cpq.renderIndividualPhases();
                }
            });
        },

        // Request phase definitions (called by RcaMode when switching to CPQ)
        requestPhaseDefinitions: function() {
            ensureCpqModules(() => {
                if (window.SFDMU.Cpq.requestPhaseDefinitions) {
                    window.SFDMU.Cpq.requestPhaseDefinitions();
                }
            });
        },

        // Apply the current config's mode to the UI (used when loading/switching configs)
        applyModeFromConfig: function() {
            // Mode switching is now handled by RcaMode.js
            // This function only handles CPQ-specific initialization
            const mode = (State.currentConfig && State.currentConfig.mode) || 'standard';
            if (mode === 'cpq') {
                ensureCpqModules(() => {
                    if (window.SFDMU.Cpq.requestPhaseDefinitions) {
                        window.SFDMU.Cpq.requestPhaseDefinitions();
                    }
                });
            }
        },

        // Legacy function - kept for backward compatibility but delegates to new system
        handleInheritedLineColumns: function(records, lineColumnsBySection, phaseNumber) {
            // This is legacy code - the new hierarchical view system handles this generically
            // For backward compatibility, we'll just log a warning and use the new system
            console.warn('handleInheritedLineColumns is deprecated. Use handleChildRecords instead.');
            // The new system should handle this through handleChildRecords
        },
        
        handleChildRecords: function(parentObjectName, childObjectName, records, childRecordsByParent, phaseNumber) {
            ensureCpqModules(() => {
                if (window.SFDMU.Cpq.handleChildRecords) {
                    window.SFDMU.Cpq.handleChildRecords(parentObjectName, childObjectName, records, childRecordsByParent, phaseNumber);
                }
            });
        },

        // Handle master records response from backend
        handleMasterRecords: function(objectName, records, phaseNumber, isSearch = false, append = false) {
            ensureCpqModules(() => {
                if (window.SFDMU.Cpq.handleMasterRecords) {
                    window.SFDMU.Cpq.handleMasterRecords(objectName, records, phaseNumber, isSearch, append);
                }
            });
        },

        // Reset CPQ mode state
        reset: function() {
            ensureCpqModules(() => {
                // Reset phase definitions and state
                if (window.SFDMU.Cpq.setPhaseDefinitions) {
                    window.SFDMU.Cpq.setPhaseDefinitions([]);
                }
                if (window.SFDMU.Cpq.setHasPhaseFiles) {
                    window.SFDMU.Cpq.setHasPhaseFiles(false);
                }
                if (window.SFDMU.Cpq.setActivePhaseTab) {
                    window.SFDMU.Cpq.setActivePhaseTab(1);
                }
                // Re-render to show empty state
                if (window.SFDMU.Cpq.renderIndividualPhases) {
                    window.SFDMU.Cpq.renderIndividualPhases();
                }
            });
        }
    };
})();
