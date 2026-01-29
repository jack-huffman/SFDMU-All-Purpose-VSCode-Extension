/**
 * RCA Phases
 * Functions for rendering and managing RCA phases
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;

    /**
     * Request phase definitions from backend
     */
    window.SFDMU.Rca.requestPhaseDefinitions = function() {
        const includeProduct2 = State.currentConfig.rcaIncludeProduct2 || false;
        vscode.postMessage({
            command: 'getRcaPhaseDefinitions',
            includeProduct2: includeProduct2
        });
    };

    /**
     * Render individual phase tabs and content
     */
    window.SFDMU.Rca.renderIndividualPhases = function() {
        const tabsContainer = document.getElementById('rca-phase-tabs');
        const contentContainer = document.getElementById('rca-individual-phases');
        if (!tabsContainer || !contentContainer) return;

        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        const activePhaseTab = window.SFDMU.Rca.getActivePhaseTab();
        const completedPhases = State.currentConfig.rcaCompletedPhases || [];
        const phaseDefinitions = window.SFDMU.Rca.getPhaseDefinitions();

        // Render Metadata Prerequisites tab first (always show this tab)
        const metadataTab = document.createElement('button');
        metadataTab.className = 'rca-phase-tab';
        metadataTab.dataset.phaseNumber = 'metadata';
        if (activePhaseTab === 'metadata') {
            metadataTab.classList.add('active');
        }

        const metadataTabLabel = document.createElement('span');
        metadataTabLabel.className = 'rca-phase-tab-label';
        metadataTabLabel.textContent = 'Metadata Prerequisites';
        metadataTab.appendChild(metadataTabLabel);

        metadataTab.addEventListener('click', () => {
            window.SFDMU.Rca.switchPhaseTab('metadata');
        });

        tabsContainer.appendChild(metadataTab);

        // If no phase definitions, just render metadata content and return
        if (!phaseDefinitions || phaseDefinitions.length === 0) {
            if (activePhaseTab === 'metadata') {
                window.SFDMU.Rca.renderPhaseContent('metadata');
            } else {
                contentContainer.innerHTML = '<p class="info-text">No RCA phases defined.</p>';
            }
            return;
        }

        // In RCA mode we include all phases by default
        const selected = phaseDefinitions;
        
        // Render phase tabs
        selected.forEach(phase => {
            const isCompleted = completedPhases.includes(phase.phaseNumber);
            const tab = document.createElement('button');
            tab.className = 'rca-phase-tab';
            tab.dataset.phaseNumber = phase.phaseNumber;
            if (phase.phaseNumber === activePhaseTab) {
                tab.classList.add('active');
            }
            if (isCompleted) {
                tab.classList.add('completed');
            }
            
            // Tab label
            const tabLabel = document.createElement('span');
            tabLabel.className = 'rca-phase-tab-label';
            tabLabel.textContent = `Phase ${phase.phaseNumber}`;
            tab.appendChild(tabLabel);
            
            // Completion indicator
            if (isCompleted) {
                const checkIcon = document.createElement('span');
                checkIcon.className = 'codicon codicon-check rca-phase-tab-check';
                tab.appendChild(checkIcon);
            }
            
            // Selection count badge
            const phaseSelections = State.currentConfig.selectedMasterRecords?.[phase.phaseNumber] || {};
            let totalSelected = 0;
            Object.values(phaseSelections).forEach(arr => {
                // Handle both old format (string[]) and new format ({ externalId, id }[])
                if (Array.isArray(arr)) {
                    totalSelected += arr.length;
                }
            });
            if (totalSelected > 0) {
                const badge = document.createElement('span');
                badge.className = 'rca-phase-tab-badge';
                badge.textContent = totalSelected;
                tab.appendChild(badge);
            }
            
            tab.addEventListener('click', () => {
                window.SFDMU.Rca.switchPhaseTab(phase.phaseNumber);
            });
            
            tabsContainer.appendChild(tab);
        });
        
        // Render content for active tab (default to metadata if no active tab)
        const tabToRender = activePhaseTab || 'metadata';
        window.SFDMU.Rca.renderPhaseContent(tabToRender);
        
        // Update main DML dropdown to show active phase's operation
        const mainDmlSelect = document.getElementById('dml-operation');
        if (mainDmlSelect && State.currentConfig.rcaPhaseOperations) {
            const phaseOperation = State.currentConfig.rcaPhaseOperations[activePhaseTab] || State.currentConfig.operation || 'Upsert';
            if (mainDmlSelect.value !== phaseOperation) {
                mainDmlSelect.value = phaseOperation;
            }
        }
    };
    
    /**
     * Switch to a different phase tab
     */
    window.SFDMU.Rca.switchPhaseTab = function(phaseNumber) {
        window.SFDMU.Rca.setActivePhaseTab(phaseNumber);
    
        // Update tab active states
        const tabs = document.querySelectorAll('.rca-phase-tab');
        tabs.forEach(tab => {
            const tabPhaseNumber = tab.dataset.phaseNumber;
            if (tabPhaseNumber === 'metadata' && phaseNumber === 'metadata') {
                tab.classList.add('active');
            } else if (tabPhaseNumber !== 'metadata' && parseInt(tabPhaseNumber) === phaseNumber) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Only update DML dropdown for phase tabs, not metadata tab
        if (phaseNumber !== 'metadata') {
            // Update main DML operation dropdown to show current phase's operation
            const mainDmlSelect = document.getElementById('dml-operation');
            if (mainDmlSelect) {
                // Initialize per-phase operations if needed
                if (!State.currentConfig.rcaPhaseOperations) {
                    State.currentConfig.rcaPhaseOperations = {};
                }
                const phaseOperation = State.currentConfig.rcaPhaseOperations[phaseNumber] || State.currentConfig.operation || 'Upsert';
                if (mainDmlSelect.value !== phaseOperation) {
                    mainDmlSelect.value = phaseOperation;
                    // Don't trigger change event to avoid saving to global operation
                }
            }
        }
        
        // Render content for selected phase or metadata
        window.SFDMU.Rca.renderPhaseContent(phaseNumber);
    };
    
    /**
     * Render content for a specific phase or metadata prerequisites
     */
    window.SFDMU.Rca.renderPhaseContent = function(phaseNumber) {
        const contentContainer = document.getElementById('rca-individual-phases');
        if (!contentContainer) return;
        
        // Handle metadata prerequisites tab
        if (phaseNumber === 'metadata') {
            contentContainer.innerHTML = '';
            
            const metadataSection = document.createElement('div');
            metadataSection.className = 'rca-metadata-section';
            metadataSection.id = 'rca-metadata-prerequisites';
            
            const title = document.createElement('h3');
            title.textContent = 'Metadata Prerequisites';
            metadataSection.appendChild(title);
            
            const helpText = document.createElement('p');
            helpText.className = 'help-text-small';
            helpText.textContent = 'These metadata objects must be deployed to the target org before Phase 7:';
            metadataSection.appendChild(helpText);
            
            const statusList = document.createElement('div');
            statusList.className = 'metadata-status-list';
            
            // DecisionMatrixDefinition
            const decisionMatrixItem = document.createElement('div');
            decisionMatrixItem.className = 'metadata-status-item';
            const decisionMatrixName = document.createElement('span');
            decisionMatrixName.className = 'metadata-name';
            decisionMatrixName.textContent = 'DecisionMatrixDefinition';
            const decisionMatrixStatus = document.createElement('span');
            decisionMatrixStatus.className = 'metadata-status-badge';
            decisionMatrixStatus.id = 'metadata-status-decisionmatrix';
            decisionMatrixStatus.textContent = 'Checking...';
            const decisionMatrixBtn = document.createElement('button');
            decisionMatrixBtn.id = 'deploy-decisionmatrix';
            decisionMatrixBtn.className = 'btn-secondary btn-small';
            decisionMatrixBtn.textContent = 'Deploy';
            decisionMatrixItem.appendChild(decisionMatrixName);
            decisionMatrixItem.appendChild(decisionMatrixStatus);
            decisionMatrixItem.appendChild(decisionMatrixBtn);
            statusList.appendChild(decisionMatrixItem);
            
            // ExpressionSet
            const expressionSetItem = document.createElement('div');
            expressionSetItem.className = 'metadata-status-item';
            const expressionSetName = document.createElement('span');
            expressionSetName.className = 'metadata-name';
            expressionSetName.textContent = 'ExpressionSet';
            const expressionSetStatus = document.createElement('span');
            expressionSetStatus.className = 'metadata-status-badge';
            expressionSetStatus.id = 'metadata-status-expressionset';
            expressionSetStatus.textContent = 'Checking...';
            const expressionSetBtn = document.createElement('button');
            expressionSetBtn.id = 'deploy-expressionset';
            expressionSetBtn.className = 'btn-secondary btn-small';
            expressionSetBtn.textContent = 'Deploy';
            expressionSetItem.appendChild(expressionSetName);
            expressionSetItem.appendChild(expressionSetStatus);
            expressionSetItem.appendChild(expressionSetBtn);
            statusList.appendChild(expressionSetItem);
            
            metadataSection.appendChild(statusList);
            
            const deployAllBtn = document.createElement('button');
            deployAllBtn.id = 'deploy-all-metadata';
            deployAllBtn.className = 'btn-secondary';
            deployAllBtn.style.marginTop = '12px';
            deployAllBtn.textContent = 'Deploy All Metadata Prerequisites';
            metadataSection.appendChild(deployAllBtn);
            
            contentContainer.appendChild(metadataSection);
            
            // Initialize event listeners for metadata deployment buttons
            const deployDecisionMatrixBtn = document.getElementById('deploy-decisionmatrix');
            const deployExpressionSetBtn = document.getElementById('deploy-expressionset');
            const deployAllBtnEl = document.getElementById('deploy-all-metadata');
            
            if (deployDecisionMatrixBtn) {
                deployDecisionMatrixBtn.addEventListener('click', () => {
                    if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                        window.SFDMU.Rca.deployMetadata('DecisionMatrixDefinition');
                    }
                });
            }
            
            if (deployExpressionSetBtn) {
                deployExpressionSetBtn.addEventListener('click', () => {
                    if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                        window.SFDMU.Rca.deployMetadata('ExpressionSet');
                    }
                });
            }
            
            if (deployAllBtnEl) {
                deployAllBtnEl.addEventListener('click', () => {
                    if (window.SFDMU.Rca && window.SFDMU.Rca.deployMetadata) {
                        window.SFDMU.Rca.deployMetadata('All');
                    }
                });
            }
            
            // Check metadata status
            if (window.SFDMU.Rca && window.SFDMU.Rca.checkMetadataStatus) {
                window.SFDMU.Rca.checkMetadataStatus();
            }
            
            return;
        }
        
        const phaseDefinitions = window.SFDMU.Rca.getPhaseDefinitions();
        const phase = phaseDefinitions.find(p => p.phaseNumber === phaseNumber);
        if (!phase) {
            contentContainer.innerHTML = '<p class="info-text">Phase not found.</p>';
            return;
        }
        
        const completedPhases = State.currentConfig.rcaCompletedPhases || [];
        const isCompleted = completedPhases.includes(phase.phaseNumber);
        const hasPhaseFiles = window.SFDMU.Rca.getHasPhaseFiles();
        
        contentContainer.innerHTML = '';
        
        // Phase Header with Objects and Action Buttons
        const header = document.createElement('div');
        header.className = 'rca-phase-header';
        
        // Left side: Title and Objects
        const headerLeft = document.createElement('div');
        headerLeft.className = 'rca-phase-header-left';
        
        // Title row with Phase number and Mark as Complete button
        const titleRow = document.createElement('div');
        titleRow.className = 'rca-phase-title-row';
        
        const title = document.createElement('h3');
        title.className = 'rca-phase-title';
        title.textContent = `Phase ${phase.phaseNumber}`;
        
        // Warning badge for Phase 7 (metadata prerequisites)
        if (phase.phaseNumber === 7) {
            const warningBadge = document.createElement('span');
            warningBadge.className = 'phase-warning-badge';
            warningBadge.textContent = '⚠ Requires Metadata';
            warningBadge.title = 'This phase requires DecisionMatrixDefinition and ExpressionSet metadata objects to be deployed first';
            title.appendChild(warningBadge);
        }
        
        titleRow.appendChild(title);
        
        // Mark as Complete/Incomplete button - next to the title
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = `btn-secondary rca-phase-header-btn icon-button ${isCompleted ? 'phase-completed-btn' : ''}`;
        doneBtn.innerHTML = isCompleted 
            ? '<span class="codicon codicon-discard"></span>'
            : '<span class="codicon codicon-check"></span>';
        doneBtn.title = isCompleted ? 'Mark as Incomplete' : 'Mark as Complete';
        doneBtn.addEventListener('click', () => {
            window.SFDMU.Rca.togglePhaseComplete(phase.phaseNumber, !isCompleted);
        });
        titleRow.appendChild(doneBtn);
        
        headerLeft.appendChild(titleRow);
        
        // Objects list directly under the title
        const objectsList = document.createElement('div');
        objectsList.className = 'rca-phase-objects-list';
        
        if (Array.isArray(phase.objects) && phase.objects.length > 0) {
            phase.objects.forEach(objName => {
                const pill = document.createElement('span');
                pill.className = 'phase-object-pill';
                pill.textContent = objName;
                objectsList.appendChild(pill);
            });
        } else {
            objectsList.innerHTML = '<p class="info-text">No objects in this phase.</p>';
        }

        headerLeft.appendChild(objectsList);
        header.appendChild(headerLeft);

        // Right side: DML Operation and Action Buttons (Generate, Simulate, Run)
        const headerRight = document.createElement('div');
        headerRight.className = 'rca-phase-header-right';

        // DML Operation dropdown - per-phase operation
        const dmlOperationSelect = document.getElementById('dml-operation');
        if (dmlOperationSelect) {
            const dmlWrapper = document.createElement('div');
            dmlWrapper.className = 'rca-phase-dml-operation';
            
            // Clone the select element
            const dmlClone = dmlOperationSelect.cloneNode(true);
            dmlClone.id = `dml-operation-rca-phase-${phase.phaseNumber}`;
            dmlClone.className = 'select-input rca-phase-dml-select';
            
            // Initialize per-phase operations if needed
            if (!State.currentConfig.rcaPhaseOperations) {
                State.currentConfig.rcaPhaseOperations = {};
            }
            
            // Load phase-specific operation, or default to global operation
            const phaseOperation = State.currentConfig.rcaPhaseOperations[phase.phaseNumber] || State.currentConfig.operation || 'Upsert';
            dmlClone.value = phaseOperation;
            
            // Save changes to phase-specific operation
            dmlClone.addEventListener('change', (e) => {
                const newOperation = e.target.value;
                State.currentConfig.rcaPhaseOperations[phase.phaseNumber] = newOperation;
                
                // Save config
                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
                    window.SFDMU.ConfigManager.updateOrgConfig();
                }
                vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
            });
            
            dmlWrapper.appendChild(dmlClone);
            headerRight.appendChild(dmlWrapper);
        }
        
        // Configuration button - clone from main UI
        const mainConfigButton = document.getElementById('migration-config-button');
        if (mainConfigButton) {
            // Clone the button directly (no wrapper needed for phase header)
            const configButtonClone = mainConfigButton.cloneNode(true);
            configButtonClone.id = `migration-config-button-rca-phase-${phase.phaseNumber}`;
            configButtonClone.className = 'icon-button rca-phase-header-btn'; // Use same styling as other phase header buttons
            
            // Copy the click event handler from the original button
            configButtonClone.addEventListener('click', () => {
                // Trigger click on the original button to maintain functionality
                mainConfigButton.click();
            });
            
            headerRight.appendChild(configButtonClone);
        }
        
        // Generate Phase Files button (icon only with tooltip)
        const generateBtn = document.createElement('button');
        generateBtn.type = 'button';
        generateBtn.className = 'btn-secondary rca-phase-header-btn icon-button';
        generateBtn.innerHTML = '<span class="codicon codicon-file-add"></span>';
        generateBtn.title = 'Generate Phase File';
        generateBtn.disabled = isCompleted || !State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl;
        generateBtn.addEventListener('click', () => {
            if (window.SFDMU.Rca && window.SFDMU.Rca.generatePhaseFiles) {
                window.SFDMU.Rca.generatePhaseFiles(phase.phaseNumber);
            }
        });
        headerRight.appendChild(generateBtn);
        
        // Export to Excel button (icon only with tooltip)
        const exportExcelBtn = document.createElement('button');
        exportExcelBtn.type = 'button';
        exportExcelBtn.className = 'btn-secondary rca-phase-header-btn icon-button';
        exportExcelBtn.innerHTML = '<span class="codicon codicon-table"></span>';
        exportExcelBtn.title = 'Export to Excel';
        exportExcelBtn.disabled = !State.currentConfig.sourceOrg.alias && !State.currentConfig.sourceOrg.username;
        exportExcelBtn.addEventListener('click', () => {
            if (window.SFDMU.Rca && window.SFDMU.Rca.exportPhaseToExcel) {
                window.SFDMU.Rca.exportPhaseToExcel(phase.phaseNumber);
            }
        });
        headerRight.appendChild(exportExcelBtn);
        
        // Simulation button (icon only with tooltip)
        const simBtn = document.createElement('button');
        simBtn.type = 'button';
        simBtn.className = 'btn-secondary rca-phase-header-btn icon-button';
        simBtn.innerHTML = '<span class="codicon codicon-debug-alt"></span>';
        simBtn.title = 'Run Simulation';
        simBtn.disabled = !hasPhaseFiles || isCompleted;
        simBtn.addEventListener('click', async () => {
            const UIUtils = window.SFDMU && window.SFDMU.UIUtils;
            if (UIUtils && UIUtils.showConfirmation) {
                const prefix = `Phase ${phase.phaseNumber}:`;
                const rawDescription = (phase.description || '').trim();
                const hasPrefix = rawDescription.toLowerCase().startsWith(prefix.toLowerCase());
                const descriptionText = hasPrefix ? rawDescription : `${prefix} ${rawDescription}`;
                
                const confirmed = await UIUtils.showConfirmation(
                    'Confirm RCA Phase Simulation',
                    `Run a simulation for ${descriptionText}?`
                );
                if (!confirmed) {
                    return;
                }
            }
            if (window.SFDMU.Rca && window.SFDMU.Rca.runPhase) {
                window.SFDMU.Rca.runPhase(phase.phaseNumber, true);
            }
        });
        headerRight.appendChild(simBtn);

        // Run button (icon only with tooltip)
        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'btn-primary rca-phase-header-btn icon-button';
        runBtn.innerHTML = '<span class="codicon codicon-run"></span>';
        runBtn.title = 'Run';
        runBtn.disabled = !hasPhaseFiles || isCompleted;
        runBtn.addEventListener('click', async () => {
            const UIUtils = window.SFDMU && window.SFDMU.UIUtils;
            if (UIUtils && UIUtils.showConfirmation) {
                const prefix = `Phase ${phase.phaseNumber}:`;
                const rawDescription = (phase.description || '').trim();
                const hasPrefix = rawDescription.toLowerCase().startsWith(prefix.toLowerCase());
                const descriptionText = hasPrefix ? rawDescription : `${prefix} ${rawDescription}`;
                
                const confirmed = await UIUtils.showConfirmation(
                    'Confirm RCA Phase Run',
                    `Run ${descriptionText}? This will execute the migration and make changes to the target org.`
                );
                if (!confirmed) {
                    return;
                }
            }
            if (window.SFDMU.Rca && window.SFDMU.Rca.runPhase) {
                window.SFDMU.Rca.runPhase(phase.phaseNumber, false);
            }
        });
        headerRight.appendChild(runBtn);
        
        header.appendChild(headerRight);
        contentContainer.appendChild(header);
        
        // Selected Records Section (without children fetching/viewing)
        const selectedRecordsSection = document.createElement('div');
        selectedRecordsSection.className = 'rca-phase-selected-records-section';
        
        const selectedRecordsTitleRow = document.createElement('div');
        selectedRecordsTitleRow.className = 'rca-phase-selected-records-title-row';
        
        const selectedRecordsTitle = document.createElement('h4');
        selectedRecordsTitle.className = 'rca-phase-section-title';
        selectedRecordsTitle.textContent = 'Selected Records';
        selectedRecordsTitleRow.appendChild(selectedRecordsTitle);
        
        // Select Master Records button (moved to title row)
        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'btn-secondary rca-phase-action-btn';
        const masterObjects = window.SFDMU.Rca.getMasterObjectsForPhase ? window.SFDMU.Rca.getMasterObjectsForPhase(phase.phaseNumber) : [];
        selectBtn.innerHTML = `<span class="codicon codicon-search"></span> ${masterObjects.length > 0 ? 'Select Master Records' : 'Select Records'}`;
        selectBtn.addEventListener('click', () => {
            if (selectBtn.disabled) {
                return;
            }
            if (window.SFDMU.Rca && window.SFDMU.Rca.openMasterSelectionModal) {
                window.SFDMU.Rca.openMasterSelectionModal(phase.phaseNumber);
            }
        });
        
        // Disable if source org not configured OR if phase is marked complete
        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl || isCompleted) {
            selectBtn.disabled = true;
        }
        
        // Show selection count badge if records are selected
        const phaseSelectionsForBadge = State.currentConfig.selectedMasterRecords?.[phase.phaseNumber] || {};
        let totalSelected = 0;
        Object.values(phaseSelectionsForBadge).forEach(arr => {
            // Handle both old format (string[]) and new format ({ externalId, id }[])
            if (Array.isArray(arr)) {
                totalSelected += arr.length;
            }
        });
        if (totalSelected > 0) {
            const badge = document.createElement('span');
            badge.className = 'rca-phase-action-badge';
            badge.textContent = `${totalSelected} selected`;
            selectBtn.appendChild(badge);
        }
        
        selectedRecordsTitleRow.appendChild(selectBtn);
        selectedRecordsSection.appendChild(selectedRecordsTitleRow);
        
        const selectedRecordsContainer = document.createElement('div');
        selectedRecordsContainer.className = 'rca-phase-selected-records-container';
        
        // Get selected records for this phase
        const phaseSelections = State.currentConfig.selectedMasterRecords?.[phase.phaseNumber] || {};
        // Handle both old format (string[]) and new format ({ externalId, id }[])
        const hasSelections = Object.keys(phaseSelections).length > 0 && 
                            Object.values(phaseSelections).some(arr => Array.isArray(arr) && arr.length > 0);
        
        if (hasSelections) {
            Object.keys(phaseSelections).forEach(objectName => {
                // Handle both old format (string[]) and new format ({ externalId, id }[])
                const selected = phaseSelections[objectName] || [];
                const selectedIds = selected.map(item => 
                    typeof item === 'object' && item.externalId ? item.externalId : item
                );
                if (selectedIds && selectedIds.length > 0) {
                    const objectGroup = document.createElement('div');
                    objectGroup.className = 'rca-selected-records-group';
                    
                    const objectHeader = document.createElement('div');
                    objectHeader.className = 'rca-selected-records-object-header';
                    const objectLabel = document.createElement('span');
                    objectLabel.className = 'rca-selected-records-object-label';
                    objectLabel.textContent = objectName;
                    const countBadge = document.createElement('span');
                    countBadge.className = 'rca-selected-records-count';
                    countBadge.textContent = `${selectedIds.length} record${selectedIds.length !== 1 ? 's' : ''}`;
                    objectHeader.appendChild(objectLabel);
                    objectHeader.appendChild(countBadge);
                    objectGroup.appendChild(objectHeader);
                    
                    // Create scrollable container for records list
                    const recordsListContainer = document.createElement('div');
                    recordsListContainer.className = 'rca-selected-records-list-container';
                    
                    const recordsList = document.createElement('div');
                    recordsList.className = 'rca-selected-records-list';
                    
                    selectedIds.forEach(externalIdValue => {
                        const recordItem = document.createElement('div');
                        recordItem.className = 'rca-selected-record-item';
                        
                        const recordContent = document.createElement('div');
                        recordContent.style.display = 'flex';
                        recordContent.style.alignItems = 'center';
                        recordContent.style.gap = '8px';
                        
                        const recordName = document.createElement('span');
                        // Handle both old format (string) and new format (object with externalId)
                        const displayValue = typeof externalIdValue === 'object' && externalIdValue.externalId 
                            ? externalIdValue.externalId 
                            : externalIdValue;
                        recordName.textContent = displayValue;
                        
                        // Add object API name pill
                        const objectPill = document.createElement('span');
                        objectPill.className = 'rca-record-object-pill';
                        objectPill.textContent = objectName;
                        
                        recordContent.appendChild(recordName);
                        recordContent.appendChild(objectPill);
                        recordItem.appendChild(recordContent);
                        recordsList.appendChild(recordItem);
                    });
                    
                    recordsListContainer.appendChild(recordsList);
                    objectGroup.appendChild(recordsListContainer);
                    selectedRecordsContainer.appendChild(objectGroup);
                }
            });
        } else {
            const emptyState = document.createElement('p');
            emptyState.className = 'info-text';
            emptyState.textContent = 'No records selected. Click "Select Master Records" to choose records for this phase.';
            selectedRecordsContainer.appendChild(emptyState);
        }
        
        selectedRecordsSection.appendChild(selectedRecordsContainer);
        contentContainer.appendChild(selectedRecordsSection);
    };

    /**
     * Toggle phase completion status
     */
    window.SFDMU.Rca.togglePhaseComplete = function(phaseNumber, isComplete) {
        // Initialize completedPhases array if it doesn't exist
        if (!State.currentConfig.rcaCompletedPhases) {
            State.currentConfig.rcaCompletedPhases = [];
        }

        if (isComplete) {
            if (!State.currentConfig.rcaCompletedPhases.includes(phaseNumber)) {
                State.currentConfig.rcaCompletedPhases.push(phaseNumber);
            }
        } else {
            State.currentConfig.rcaCompletedPhases = State.currentConfig.rcaCompletedPhases.filter(
                p => p !== phaseNumber
            );
        }

        // Re-render phases to update UI (tabs and content)
        window.SFDMU.Rca.renderIndividualPhases();

        // Auto-save the configuration
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }
        vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
    };
})();
