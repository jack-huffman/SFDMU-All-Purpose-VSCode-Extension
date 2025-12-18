// UI Utilities - Panel visibility, confirmation modals, etc.
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    
    window.SFDMU.UIUtils = {
        showConfigPanel: function() {
            const mainContent = document.getElementById('main-content');
            const gettingStarted = document.getElementById('getting-started');
            const headerActions = document.getElementById('header-actions');
            const configNameHeader = document.getElementById('config-name-header');
            
            if (mainContent) {
                mainContent.style.display = 'flex';
                mainContent.style.visibility = 'visible';
            }
            if (gettingStarted) {
                gettingStarted.style.display = 'none';
                gettingStarted.style.visibility = 'hidden';
            }
            if (headerActions) {
                headerActions.style.display = 'flex';
                headerActions.style.visibility = 'visible';
            }
            if (configNameHeader) {
                configNameHeader.style.display = '';
            }
        },
        
        hideConfigPanel: function() {
            const mainContent = document.getElementById('main-content');
            const gettingStarted = document.getElementById('getting-started');
            const headerActions = document.getElementById('header-actions');
            const configNameHeader = document.getElementById('config-name-header');
            
            if (mainContent) {
                mainContent.style.display = 'none';
                mainContent.style.visibility = 'hidden';
            }
            if (gettingStarted) {
                gettingStarted.style.display = 'flex';
                gettingStarted.style.visibility = 'visible';
            }
            if (headerActions) {
                headerActions.style.display = 'none';
                headerActions.style.visibility = 'hidden';
            }
            if (configNameHeader) {
                configNameHeader.style.display = 'none';
            }
        },
        
        showConfirmation: function(title, message) {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirm-modal');
                const titleEl = document.getElementById('modal-title');
                const messageEl = document.getElementById('modal-message');
                const confirmButton = document.getElementById('modal-confirm');
                const cancelButton = document.getElementById('modal-cancel');
                
                // Clear any pending migration action to avoid conflicts
                if (window.pendingMigrationAction) {
                    delete window.pendingMigrationAction;
                }
                
                // Set up a pending confirmation action
                window.pendingConfirmation = { resolve };
                
                // Set modal content
                titleEl.textContent = title;
                messageEl.textContent = message;
                
                // Show modal
                modal.style.display = 'flex';
                modal.classList.add('show');
            });
        },
        
        hideConfirmModal: function() {
            const modal = document.getElementById('confirm-modal');
            modal.style.display = 'none';
            modal.classList.remove('show');
        },
        
        setupModal: function() {
            const modal = document.getElementById('confirm-modal');
            const cancelButton = document.getElementById('modal-cancel');
            const confirmButton = document.getElementById('modal-confirm');
            
            // Cancel button
            const self = this;
            cancelButton.addEventListener('click', () => {
                // Check for pending confirmation first (for delete operations, etc.)
                if (window.pendingConfirmation) {
                    const { resolve } = window.pendingConfirmation;
                    delete window.pendingConfirmation;
                    self.hideConfirmModal();
                    resolve(false);
                    return;
                }
                
                self.hideConfirmModal();
            });
            
            // Confirm button
            confirmButton.addEventListener('click', () => {
                // Check for pending confirmation first (for delete operations, etc.)
                if (window.pendingConfirmation) {
                    const { resolve } = window.pendingConfirmation;
                    delete window.pendingConfirmation;
                    self.hideConfirmModal();
                    resolve(true);
                    return;
                }
                
                // Check for pending migration action (for run/simulate with unsaved changes)
                if (window.pendingMigrationAction) {
                    const { proceed, simulation } = window.pendingMigrationAction;
                    delete window.pendingMigrationAction;
                    self.hideConfirmModal();
                    if (proceed) {
                        proceed();
                    } else if (simulation !== undefined) {
                        // Direct migration action
                        if (window.SFDMU.MigrationExecution) {
                            window.SFDMU.MigrationExecution.proceedWithMigration(simulation);
                        }
                    }
                    return;
                }
                
                self.hideConfirmModal();
            });
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (window.pendingConfirmation) {
                        const { resolve } = window.pendingConfirmation;
                        delete window.pendingConfirmation;
                        self.hideConfirmModal();
                        resolve(false);
                    } else if (window.pendingMigrationAction) {
                        delete window.pendingMigrationAction;
                        self.hideConfirmModal();
                    } else {
                        self.hideConfirmModal();
                    }
                }
            });
        },
        
        setupCollapsibleSections: function() {
            document.querySelectorAll('.section-header').forEach(header => {
                header.addEventListener('click', () => {
                    const section = header.closest('.section');
                    section.classList.toggle('collapsed');
                    const icon = header.querySelector('.collapse-icon');
                    if (icon) {
                        icon.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
                    }
                });
            });
        }
    };
})();

