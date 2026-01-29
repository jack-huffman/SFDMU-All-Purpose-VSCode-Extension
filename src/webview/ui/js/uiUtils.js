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
            const modeBadge = document.getElementById('mode-badge');
            const headerOrgSelection = document.querySelector('.header-org-selection');
            
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
            if (modeBadge) {
                modeBadge.style.display = 'flex';
            }
            if (headerOrgSelection) {
                headerOrgSelection.style.display = 'flex';
            }
        },
        
        hideConfigPanel: function() {
            const mainContent = document.getElementById('main-content');
            const gettingStarted = document.getElementById('getting-started');
            const headerActions = document.getElementById('header-actions');
            const configNameHeader = document.getElementById('config-name-header');
            const modeBadge = document.getElementById('mode-badge');
            const headerOrgSelection = document.querySelector('.header-org-selection');
            
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
            if (modeBadge) {
                modeBadge.style.display = 'none';
            }
            if (headerOrgSelection) {
                headerOrgSelection.style.display = 'none';
            }
        },
        
        showConfirmation: function(title, message, objects) {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirm-modal');
                const titleEl = document.getElementById('modal-title');
                const messageEl = document.getElementById('modal-message');
                const objectsSection = document.getElementById('modal-objects-section');
                const objectsList = document.getElementById('modal-objects-list');
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
                
                // Show/hide objects section based on whether objects are provided
                if (objects && objects.length > 0) {
                    objectsSection.style.display = 'block';
                    objectsList.innerHTML = '';
                    
                    objects.forEach(obj => {
                        const objItem = document.createElement('div');
                        objItem.style.marginBottom = '10px';
                        objItem.style.paddingBottom = '10px';
                        objItem.style.borderBottom = '1px solid var(--vscode-panel-border)';
                        
                        const objName = document.createElement('div');
                        objName.style.fontWeight = '600';
                        objName.style.fontSize = '13px';
                        objName.style.marginBottom = '4px';
                        objName.style.color = 'var(--vscode-foreground)';
                        objName.textContent = obj.objectName || 'Unknown';
                        
                        const objDetails = document.createElement('div');
                        objDetails.style.fontSize = '11px';
                        objDetails.style.color = 'var(--vscode-descriptionForeground)';
                        objDetails.style.lineHeight = '1.5';
                        objDetails.style.wordBreak = 'break-word';
                        const details = [];
                        if (obj.externalId && obj.externalId !== 'N/A') {
                            details.push(`External ID: ${obj.externalId}`);
                        }
                        if (obj.operation) {
                            details.push(`Operation: ${obj.operation}`);
                        }
                        if (obj.master === false) {
                            details.push('(Child)');
                        }
                        objDetails.textContent = details.join(' • ');
                        
                        objItem.appendChild(objName);
                        objItem.appendChild(objDetails);
                        objectsList.appendChild(objItem);
                    });
                    
                    // Remove border from last item
                    if (objects.length > 0) {
                        const lastItem = objectsList.lastElementChild;
                        if (lastItem) {
                            lastItem.style.borderBottom = 'none';
                            lastItem.style.marginBottom = '0';
                            lastItem.style.paddingBottom = '0';
                        }
                    }
                } else {
                    objectsSection.style.display = 'none';
                }
                
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

