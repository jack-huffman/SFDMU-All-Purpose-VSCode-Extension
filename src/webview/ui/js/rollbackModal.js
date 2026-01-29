// Rollback Modal - Handles rollback confirmation modal
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    
    window.SFDMU.RollbackModal = {
        modal: null,
        backupSelect: null,
        selectedBackup: null,
        rollbackConfig: null,
        backups: [],

        init: function() {
            this.modal = document.getElementById('rollback-modal');
            this.backupSelect = document.getElementById('rollback-backup-select');
            
            if (!this.modal || !this.backupSelect) {
                console.warn('Rollback modal elements not found');
                return;
            }

            // Close button
            const closeBtn = document.getElementById('rollback-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hide());
            }

            // Cancel button
            const cancelBtn = document.getElementById('rollback-modal-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => this.hide());
            }

            // Backup selection change
            this.backupSelect.addEventListener('change', (e) => {
                const backupPath = e.target.value;
                if (backupPath) {
                    this.selectBackup(backupPath);
                }
            });

            // Simulation button
            const simBtn = document.getElementById('rollback-simulation-btn');
            if (simBtn) {
                simBtn.addEventListener('click', () => this.runSimulation());
            }

            // Execute button
            const execBtn = document.getElementById('rollback-execute-btn');
            if (execBtn) {
                execBtn.addEventListener('click', () => this.executeRollback());
            }

            // Close on outside click
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        },

        show: function(configName, phaseNumber) {
            if (!this.modal) {
                this.init();
            }

            // Store config name and optional phase (for CPQ/RCA phase-scoped rollback)
            this.currentConfigName = configName;
            this.currentPhaseNumber = phaseNumber;

            // Update modal title
            const title = document.getElementById('rollback-modal-title');
            if (title) {
                const phaseText = phaseNumber ? ` Phase ${phaseNumber} - ` : ' - ';
                title.textContent = `Rollback Migration${phaseText}${configName || 'Configuration'}`;
            }

            // Load backups (scoped to phase when phaseNumber is provided)
            this.loadBackups(configName, phaseNumber);
            
            // Show modal
            this.modal.style.display = 'flex';
        },

        hide: function() {
            if (this.modal) {
                this.modal.style.display = 'none';
            }
        },

        loadBackups: function(configName, phaseNumber) {
            // Reset UI
            this.backupSelect.innerHTML = '<option value="">Loading backups...</option>';
            this.selectedBackup = null;
            this.rollbackConfig = null;

            // Request backups (phaseNumber scopes to that phase's backups in CPQ/RCA mode)
            vscode.postMessage({
                command: 'showRollbackModal',
                configName: configName,
                phaseNumber: phaseNumber
            });
        },

        updateBackups: function(backups, selectedBackup, rollbackConfig) {
            this.backups = backups || [];
            this.selectedBackup = selectedBackup;
            this.rollbackConfig = rollbackConfig;

            // Populate backup dropdown
            this.backupSelect.innerHTML = '';
            if (this.backups.length === 0) {
                this.backupSelect.innerHTML = '<option value="">No backups available</option>';
                return;
            }

            this.backups.forEach(backup => {
                const option = document.createElement('option');
                option.value = backup.path;
                option.textContent = `${backup.formattedDate} - ${backup.objectCount} objects, ${backup.totalRecords} records`;
                if (selectedBackup && backup.path === selectedBackup.path) {
                    option.selected = true;
                }
                this.backupSelect.appendChild(option);
            });

            // Update UI with selected backup
            if (selectedBackup) {
                this.updateBackupInfo(selectedBackup);
                this.updateRollbackPlan(rollbackConfig);
            }
        },

        selectBackup: function(backupPath) {
            const backup = this.backups.find(b => b.path === backupPath);
            if (!backup) {
                return;
            }

            // Request rollback config for this backup (include phaseNumber when opened from a phase)
            vscode.postMessage({
                command: 'showRollbackModal',
                configName: this.currentConfigName,
                backupDir: backupPath,
                phaseNumber: this.currentPhaseNumber
            });
        },

        updateBackupInfo: function(backup) {
            document.getElementById('rollback-backup-path').textContent = backup.path;
            document.getElementById('rollback-backup-date').textContent = backup.formattedDate;
            document.getElementById('rollback-backup-objects').textContent = backup.objectCount;
            document.getElementById('rollback-backup-records').textContent = backup.totalRecords.toLocaleString();
        },

        updateRollbackPlan: function(rollbackConfig) {
            if (!rollbackConfig || !rollbackConfig.objects) {
                return;
            }

            // Update summary
            const summary = document.getElementById('rollback-summary');
            if (summary) {
                summary.innerHTML = `
                    <p><strong>Migration Date:</strong> ${rollbackConfig.backupDir ? new Date(rollbackConfig.backupDir.split('/').pop().replace(/-/g, ':').replace('T', ' ')).toLocaleString() : 'Unknown'}</p>
                    <p><strong>Objects to Rollback:</strong> ${rollbackConfig.objects.length}</p>
                `;
            }

            // Update operations table
            const tbody = document.getElementById('rollback-operations-tbody');
            if (!tbody) return;

            tbody.innerHTML = '';

            if (rollbackConfig.objects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px;">No operations to rollback</td></tr>';
                return;
            }

            rollbackConfig.objects.forEach((obj, index) => {
                const row = document.createElement('tr');
                
                // Determine status
                let status = 'success';
                let statusText = 'Ready';
                let statusIcon = '✓';
                
                if (obj.rollbackOperation === null) {
                    status = 'error';
                    statusText = 'Cannot Rollback';
                    statusIcon = '✗';
                } else if (!obj.backupFile && (obj.rollbackOperation === 'Update' || obj.rollbackOperation === 'Insert')) {
                    status = 'warning';
                    statusText = 'No Backup';
                    statusIcon = '⚠';
                }

                // Get record count (from backup metadata if available)
                const recordCount = obj.backupFile ? 'See backup' : 'N/A';

                row.innerHTML = `
                    <td>${obj.objectName}</td>
                    <td>${obj.originalOperation}</td>
                    <td>${obj.rollbackOperation || 'N/A'}</td>
                    <td>${recordCount}</td>
                    <td><span class="status-${status}">${statusIcon} ${statusText}</span></td>
                    <td><button class="btn-link details-btn" data-index="${index}">Details</button></td>
                `;

                // Add details button handler
                const detailsBtn = row.querySelector('.details-btn');
                if (detailsBtn) {
                    detailsBtn.addEventListener('click', () => {
                        this.showObjectDetails(obj, index);
                    });
                }

                tbody.appendChild(row);
            });

            // Check for warnings
            this.updateWarnings(rollbackConfig);
        },

        showObjectDetails: function(obj, index) {
            // Create details message
            let details = '';
            
            if (obj.rollbackOperation === 'Delete') {
                details = `Will delete records that were inserted. External ID: ${obj.externalId}`;
            } else if (obj.rollbackOperation === 'Update') {
                details = `Will restore records to their original values from backup. External ID: ${obj.externalId}`;
                if (obj.backupFile) {
                    details += `\nBackup file: ${obj.backupFile}`;
                }
            } else if (obj.rollbackOperation === 'Insert') {
                details = `Will restore deleted records from backup. External ID: ${obj.externalId}`;
                if (obj.backupFile) {
                    details += `\nBackup file: ${obj.backupFile}`;
                }
            } else {
                details = `Cannot rollback ${obj.originalOperation} operations.`;
            }

            vscode.postMessage({
                command: 'showInfo',
                message: `${obj.objectName}:\n${details}`
            });
        },

        updateWarnings: function(rollbackConfig) {
            const warningsDiv = document.getElementById('rollback-warnings');
            const warningsContent = document.getElementById('rollback-warnings-content');
            
            if (!warningsDiv || !warningsContent) return;

            const warnings = [];
            
            // Check for operations that cannot be rolled back
            const cannotRollback = rollbackConfig.objects.filter(obj => obj.rollbackOperation === null);
            if (cannotRollback.length > 0) {
                warnings.push(`<strong>${cannotRollback.length} object(s) cannot be rolled back:</strong><ul>`);
                cannotRollback.forEach(obj => {
                    warnings.push(`<li>${obj.objectName} (${obj.originalOperation} operation)</li>`);
                });
                warnings.push('</ul>');
            }

            // Check for missing backups
            const missingBackup = rollbackConfig.objects.filter(obj => 
                !obj.backupFile && (obj.rollbackOperation === 'Update' || obj.rollbackOperation === 'Insert')
            );
            if (missingBackup.length > 0) {
                warnings.push(`<strong>${missingBackup.length} object(s) missing backup files:</strong><ul>`);
                missingBackup.forEach(obj => {
                    warnings.push(`<li>${obj.objectName} - rollback may be incomplete</li>`);
                });
                warnings.push('</ul>');
            }

            if (warnings.length > 0) {
                warningsContent.innerHTML = warnings.join('');
                warningsDiv.style.display = 'block';
            } else {
                warningsDiv.style.display = 'none';
            }
        },

        runSimulation: function() {
            if (!this.selectedBackup) {
                vscode.postMessage({
                    command: 'showError',
                    message: 'Please select a backup first'
                });
                return;
            }

            // Confirm simulation
            if (window.SFDMU.Modals && window.SFDMU.Modals.showConfirm) {
                window.SFDMU.Modals.showConfirm(
                    'Run Rollback Simulation',
                    'This will preview the rollback without making any changes. Continue?',
                    () => {
                        vscode.postMessage({
                            command: 'rollbackSimulation',
                            backupDir: this.selectedBackup.path,
                            config: window.SFDMU.State.currentConfig
                        });
                        this.hide();
                    }
                );
            } else {
                vscode.postMessage({
                    command: 'rollbackSimulation',
                    backupDir: this.selectedBackup.path,
                    config: window.SFDMU.State.currentConfig
                });
                this.hide();
            }
        },

        executeRollback: function() {
            if (!this.selectedBackup) {
                vscode.postMessage({
                    command: 'showError',
                    message: 'Please select a backup first'
                });
                return;
            }

            // Confirm execution
            if (window.SFDMU.Modals && window.SFDMU.Modals.showConfirm) {
                window.SFDMU.Modals.showConfirm(
                    'Execute Rollback',
                    'This will permanently rollback the migration. This operation cannot be undone. Are you sure you want to proceed?',
                    () => {
                        vscode.postMessage({
                            command: 'executeRollback',
                            backupDir: this.selectedBackup.path,
                            config: window.SFDMU.State.currentConfig
                        });
                        this.hide();
                    }
                );
            } else {
                vscode.postMessage({
                    command: 'executeRollback',
                    backupDir: this.selectedBackup.path,
                    config: window.SFDMU.State.currentConfig
                });
                this.hide();
            }
        },

        currentConfigName: null
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.SFDMU.RollbackModal.init();
        });
    } else {
        window.SFDMU.RollbackModal.init();
    }
})();
