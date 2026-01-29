/**
 * CPQ Phases
 * Functions for rendering and managing CPQ phases
 */

(function() {
    'use strict';

    console.log('[CPQ Phases] Module loading...');
    
    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    
    console.log('[CPQ Phases] Module loaded. Checking for openMasterSelectionModal:', {
        exists: !!(window.SFDMU.Cpq && window.SFDMU.Cpq.openMasterSelectionModal),
        type: typeof (window.SFDMU.Cpq && window.SFDMU.Cpq.openMasterSelectionModal)
    });

    const HIERARCHICAL_RELATIONSHIPS = window.SFDMU.Cpq.HIERARCHICAL_RELATIONSHIPS || {};
    const COMPREHENSIVE_RELATIONSHIPS = window.SFDMU.Cpq.COMPREHENSIVE_RELATIONSHIPS || {};

    // State to store queried child records by parent external ID
    // Format: { phaseNumber: { parentObjectName: { parentExternalId: { childObjectName: [childRecords] } } } }
    const queriedChildRecords = {};

    /**
     * Build external ID from a child record based on the external ID field definition
     */
    function buildExternalIdFromRecord(record, externalIdField) {
        if (!record || !externalIdField) return '';
        
        if (externalIdField.includes(';')) {
            // Composite external ID
            const fields = externalIdField.split(';').map(f => f.trim());
            const values = fields.map(field => {
                if (field.includes('__r.') || field.includes('.')) {
                    const parts = field.split('.');
                    let value = record;
                    for (const part of parts) {
                        if (value && typeof value === 'object') {
                            value = value[part];
                        } else {
                            value = null;
                            break;
                        }
                    }
                    return value || '';
                } else {
                    return record[field] || '';
                }
            }).filter(v => v !== '');
            return values.join('|');
        } else {
            // Simple external ID
            if (externalIdField.includes('__r.') || externalIdField.includes('.')) {
                const parts = externalIdField.split('.');
                let value = record;
                for (const part of parts) {
                    if (value && typeof value === 'object') {
                        value = value[part];
                    } else {
                        value = null;
                        break;
                    }
                }
                return value || '';
            } else {
                return record[externalIdField] || record.Id || '';
            }
        }
    }

    /**
     * Handle queried child records for display in Selected Parent Records section
     */
    window.SFDMU.Cpq.handleQueriedChildRecords = function(phaseNumber, parentObjectName, parentExternalId, childObjectName, childRecords) {
        if (!queriedChildRecords[phaseNumber]) {
            queriedChildRecords[phaseNumber] = {};
        }
        if (!queriedChildRecords[phaseNumber][parentObjectName]) {
            queriedChildRecords[phaseNumber][parentObjectName] = {};
        }
        if (!queriedChildRecords[phaseNumber][parentObjectName][parentExternalId]) {
            queriedChildRecords[phaseNumber][parentObjectName][parentExternalId] = {};
        }
        queriedChildRecords[phaseNumber][parentObjectName][parentExternalId][childObjectName] = childRecords || [];
        
        // Save queried child records to config
        if (!State.currentConfig.queriedChildRecords) {
            State.currentConfig.queriedChildRecords = {};
        }
        if (!State.currentConfig.queriedChildRecords[phaseNumber]) {
            State.currentConfig.queriedChildRecords[phaseNumber] = {};
        }
        if (!State.currentConfig.queriedChildRecords[phaseNumber][parentObjectName]) {
            State.currentConfig.queriedChildRecords[phaseNumber][parentObjectName] = {};
        }
        if (!State.currentConfig.queriedChildRecords[phaseNumber][parentObjectName][parentExternalId]) {
            State.currentConfig.queriedChildRecords[phaseNumber][parentObjectName][parentExternalId] = {};
        }
        State.currentConfig.queriedChildRecords[phaseNumber][parentObjectName][parentExternalId][childObjectName] = childRecords || [];
        
        // Auto-select all fetched children (they cannot be deselected)
        if (childRecords && childRecords.length > 0) {
            // Get child config to determine external ID field from COMPREHENSIVE_RELATIONSHIPS
            const comprehensiveChildren = (COMPREHENSIVE_RELATIONSHIPS[parentObjectName] || [])
                .filter(child => child.phaseNumber === phaseNumber && child.childObjectName === childObjectName);
            
            // Also check hierarchical config for backward compatibility
            const hierarchicalConfig = HIERARCHICAL_RELATIONSHIPS[phaseNumber] || {};
            const hierarchicalConfigForParent = hierarchicalConfig[parentObjectName];
            let hierarchicalChildren = [];
            if (hierarchicalConfigForParent) {
                if (hierarchicalConfigForParent.childObjects) {
                    hierarchicalChildren = hierarchicalConfigForParent.childObjects.filter(c => 
                        (c.objectName || c.childObjectName) === childObjectName
                    );
                } else if (hierarchicalConfigForParent.childObject === childObjectName) {
                    hierarchicalChildren = [{
                        objectName: hierarchicalConfigForParent.childObject,
                        externalId: hierarchicalConfigForParent.childExternalId
                    }];
                }
            }
            
            const allChildConfigs = [...comprehensiveChildren, ...hierarchicalChildren];
            const childConfig = allChildConfigs.find(c => 
                (c.childObjectName || c.objectName) === childObjectName
            );
            const childExternalId = childConfig ? (childConfig.externalId || childConfig.childExternalId) : '';
            
            if (childExternalId) {
                // Initialize selectedMasterRecords if needed
                if (!State.currentConfig.selectedMasterRecords) {
                    State.currentConfig.selectedMasterRecords = {};
                }
                if (!State.currentConfig.selectedMasterRecords[phaseNumber]) {
                    State.currentConfig.selectedMasterRecords[phaseNumber] = {};
                }
                if (!State.currentConfig.selectedMasterRecords[phaseNumber][childObjectName]) {
                    State.currentConfig.selectedMasterRecords[phaseNumber][childObjectName] = [];
                }
                
                // Add all child records to selectedMasterRecords
                const childArray = State.currentConfig.selectedMasterRecords[phaseNumber][childObjectName];
                childRecords.forEach(childRecord => {
                    const childExternalIdValue = buildExternalIdFromRecord(childRecord, childExternalId);
                    if (childExternalIdValue && !childArray.includes(childExternalIdValue)) {
                        childArray.push(childExternalIdValue);
                    }
                });
            }
        }
        
        // Save config
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }
        vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
        
        // Update View children button for this parent (re-render will show correct count)
        const parentHeader = document.querySelector(`[data-phase-number="${phaseNumber}"][data-parent-object-name="${parentObjectName}"][data-parent-external-id="${parentExternalId}"]`);
        if (parentHeader) {
            const viewBtn = parentHeader.querySelector('.cpq-view-children-btn');
            const children = queriedChildRecords[phaseNumber]?.[parentObjectName]?.[parentExternalId] || {};
            let totalCount = 0;
            Object.values(children).forEach(childArray => {
                totalCount += childArray.length;
            });
            if (viewBtn) {
                if (totalCount > 0) {
                    const textNode = viewBtn.lastChild;
                    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                        textNode.textContent = `View ${totalCount} child${totalCount !== 1 ? 'ren' : ''}`;
                    }
                    viewBtn.style.display = '';
                } else {
                    viewBtn.style.display = 'none';
                }
            }
        }
        
        window.SFDMU.Cpq.renderIndividualPhases();
    };

    /**
     * Fetch children for a single parent record
     */
    window.SFDMU.Cpq.fetchChildrenForParent = function(phaseNumber, parentObjectName, parentExternalId) {
        // Get child configurations
        const comprehensiveChildren = (COMPREHENSIVE_RELATIONSHIPS[parentObjectName] || [])
            .filter(child => child.phaseNumber === phaseNumber);
        
        const hierarchicalConfig = HIERARCHICAL_RELATIONSHIPS[phaseNumber] || {};
        const hierarchicalConfigForParent = hierarchicalConfig[parentObjectName];
        const hierarchicalChildren = hierarchicalConfigForParent ? 
            (hierarchicalConfigForParent.childObjects || (hierarchicalConfigForParent.childObject ? [{
                objectName: hierarchicalConfigForParent.childObject,
                relationshipField: hierarchicalConfigForParent.relationshipField,
                externalId: hierarchicalConfigForParent.childExternalId
            }] : [])) : [];
        
        const allChildConfigs = [...comprehensiveChildren, ...hierarchicalChildren];
        
        if (allChildConfigs.length === 0) {
            return; // No children to fetch
        }
        
        // Get parent external ID field
        const parentPhaseAndExternalId = window.SFDMU.Cpq.getPhaseAndExternalId(parentObjectName);
        if (!parentPhaseAndExternalId) {
            return;
        }
        
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        // Fetch Children: backend resolves parent Id(s) then queries children by lookup Id field (e.g. SBQQ__PriceRule2__c), not by external ID (e.g. __r.Name).
        vscode.postMessage({
            command: 'queryChildrenForParents',
            parentObjectName: parentObjectName,
            parentExternalIds: [parentExternalId],
            parentExternalIdField: parentPhaseAndExternalId.externalId,
            childConfigs: allChildConfigs.map(child => ({
                childObjectName: child.childObjectName || child.objectName,
                relationshipField: child.relationshipField,
                childExternalId: child.externalId || child.childExternalId
            })),
            orgAlias: sourceOrgAlias,
            phaseNumber: phaseNumber
        });
    };

    // No longer need a reference - call directly from namespace

    /**
     * Request phase definitions from backend
     */
    window.SFDMU.Cpq.requestPhaseDefinitions = function() {
        vscode.postMessage({
            command: 'getCpqPhaseDefinitions',
            includeProduct2: false // Product2 is always excluded in CPQ mode
        });
    };

    /**
     * Open children modal for a parent record.
     * Shows the same list as the row: queried children + manually selected that match this parent.
     */
    window.SFDMU.Cpq.openChildrenModal = function(phaseNumber, parentObjectName, parentExternalId) {
        const modal = document.getElementById('cpq-children-view-modal');
        const modalContent = document.getElementById('cpq-children-modal-content');
        const parentNameSpan = document.getElementById('children-modal-parent-name');
        
        if (!modal || !modalContent || !parentNameSpan) return;
        
        parentNameSpan.textContent = parentExternalId;
        
        const comprehensiveChildren = (COMPREHENSIVE_RELATIONSHIPS[parentObjectName] || [])
            .filter(child => child.phaseNumber === phaseNumber);
        const hierarchicalConfig = HIERARCHICAL_RELATIONSHIPS[phaseNumber] || {};
        const hierarchicalConfigForParent = hierarchicalConfig[parentObjectName];
        const hierarchicalChildren = hierarchicalConfigForParent ? 
            (hierarchicalConfigForParent.childObjects || (hierarchicalConfigForParent.childObject ? [{
                objectName: hierarchicalConfigForParent.childObject,
                relationshipField: hierarchicalConfigForParent.relationshipField,
                externalId: hierarchicalConfigForParent.childExternalId
            }] : [])) : [];
        const allChildConfigs = [...comprehensiveChildren, ...hierarchicalChildren];
        
        const phaseSelections = State.currentConfig?.selectedMasterRecords?.[phaseNumber] || {};
        const queriedForParent = queriedChildRecords[phaseNumber]?.[parentObjectName]?.[parentExternalId] || {};
        
        // Build same list as row: queried + manually selected that match this parent (so modal count matches row).
        // Accumulate per childObjectName and dedupe by externalId (allChildConfigs can have same child type twice: comprehensive + hierarchical).
        const children = {};
        allChildConfigs.forEach(childConfig => {
            const childObjectName = childConfig.childObjectName || childConfig.objectName;
            const childExternalId = childConfig.externalId || childConfig.childExternalId;
            const queriedChildren = queriedForParent[childObjectName] || [];
            const childSelected = phaseSelections[childObjectName] || [];
            const childSelectedIds = childSelected.map(item =>
                typeof item === 'object' && item.externalId ? item.externalId : item
            );
            const childRecords = [];
            const addedKeys = new Set();
            queriedChildren.forEach(childRecord => {
                const displayId = buildExternalIdFromRecord(childRecord, childExternalId);
                const uniqueKey = childRecord.Id ?? displayId;
                if (uniqueKey && !addedKeys.has(uniqueKey)) {
                    addedKeys.add(uniqueKey);
                    childRecords.push({ record: childRecord, externalId: displayId, isQueried: true });
                }
            });
            childSelectedIds.forEach(childExternalIdValue => {
                if (addedKeys.has(childExternalIdValue)) return;
                let isMatch = false;
                if (phaseNumber === 3 && parentObjectName === 'SBQQ__PriceRule__c' && childObjectName === 'SBQQ__LookupQuery__c') {
                    isMatch = (parentExternalId || '').trim().toLowerCase() === (childExternalIdValue || '').trim().toLowerCase();
                } else if (phaseNumber === 4 && parentObjectName === 'SBQQ__TemplateSection__c' && childObjectName === 'SBQQ__LineColumn__c') {
                    const templateName = (parentExternalId.split('|')[0] || parentExternalId).trim().toLowerCase();
                    const childTemplateName = (childExternalIdValue.split('|')[0] || childExternalIdValue).trim().toLowerCase();
                    isMatch = templateName === childTemplateName;
                } else {
                    const parentParts = parentExternalId.split('|');
                    const childParts = childExternalIdValue.split('|');
                    if (parentParts.length > 1 && childParts.length > 1) {
                        isMatch = parentParts[0] === childParts[0] || childExternalIdValue.includes(parentParts[0]) || parentExternalId.includes(childParts[0]);
                    } else {
                        isMatch = childExternalIdValue.includes(parentExternalId) || parentExternalId.includes(childExternalIdValue);
                    }
                }
                if (isMatch) {
                    addedKeys.add(childExternalIdValue);
                    childRecords.push({ externalId: childExternalIdValue, isQueried: false });
                }
            });
            if (childRecords.length > 0) {
                if (!children[childObjectName]) {
                    children[childObjectName] = [];
                }
                // Use record Id when present so multiple children with same config externalId (e.g. LookupQuery under one PriceRule) all show
                const getUniqueKey = (item) => item.record?.Id ?? item.externalId;
                const existingKeys = new Set((children[childObjectName] || []).map(getUniqueKey));
                childRecords.forEach(item => {
                    const key = getUniqueKey(item);
                    if (key && !existingKeys.has(key)) {
                        existingKeys.add(key);
                        children[childObjectName].push(item);
                    }
                });
            }
        });
        
        window.SFDMU.Cpq.renderChildrenInModal(modalContent, phaseNumber, parentObjectName, parentExternalId, children, allChildConfigs);
        modal.classList.add('show');
    };

    /**
     * Render children in the modal
     */
    window.SFDMU.Cpq.renderChildrenInModal = function(container, phaseNumber, parentObjectName, parentExternalId, children, allChildConfigs) {
        container.innerHTML = '';
        
        if (Object.keys(children).length === 0) {
            container.innerHTML = '<p class="info-text">No children found for this parent record.</p>';
            return;
        }
        
        const sortedObjectTypes = Object.keys(children).sort();
        
        sortedObjectTypes.forEach(childObjectName => {
            const childRecords = children[childObjectName] || [];
            if (childRecords.length === 0) return;
            
            const childConfig = allChildConfigs.find(c => (c.childObjectName || c.objectName) === childObjectName);
            const childExternalId = childConfig ? (childConfig.externalId || childConfig.childExternalId) : '';
            
            const objectTypeHeader = document.createElement('div');
            objectTypeHeader.className = 'cpq-children-modal-object-header';
            
            const objectTypeLabel = document.createElement('span');
            objectTypeLabel.className = 'cpq-children-modal-object-label';
            objectTypeLabel.textContent = childObjectName;
            
            const objectTypeCount = document.createElement('span');
            objectTypeCount.className = 'cpq-children-modal-object-count';
            objectTypeCount.textContent = `${childRecords.length} record${childRecords.length !== 1 ? 's' : ''}`;
            
            objectTypeHeader.appendChild(objectTypeLabel);
            objectTypeHeader.appendChild(objectTypeCount);
            container.appendChild(objectTypeHeader);
            
            const childrenList = document.createElement('div');
            childrenList.className = 'cpq-children-modal-list';
            
            childRecords.forEach(item => {
                const childItem = document.createElement('div');
                childItem.className = 'cpq-children-modal-item';
                let childDisplayName = '';
                if (item.record) {
                    if (item.record.Name) {
                        childDisplayName = item.record.Name;
                    } else if (item.record.SBQQ__Name__c) {
                        childDisplayName = item.record.SBQQ__Name__c;
                    } else {
                        childDisplayName = buildExternalIdFromRecord(item.record, childExternalId);
                    }
                } else {
                    childDisplayName = item.externalId || 'Unnamed Record';
                }
                // If display name is the parent's name (e.g. from relationship field like SBQQ__Rule__r.Name), show child identity instead
                const parentNameNorm = (parentExternalId || '').trim().toLowerCase();
                const displayNorm = (childDisplayName || '').trim().toLowerCase();
                if (parentNameNorm && displayNorm === parentNameNorm) {
                    if (item.record && item.record.Id) {
                        childDisplayName = 'Record ' + item.record.Id.slice(-8);
                    } else {
                        childDisplayName = 'Unnamed Record';
                    }
                }
                const childName = document.createElement('span');
                childName.className = 'cpq-children-modal-item-name';
                childName.textContent = childDisplayName || 'Unnamed Record';
                childItem.appendChild(childName);
                childrenList.appendChild(childItem);
            });
            
            container.appendChild(childrenList);
        });
    };

    /**
     * Update button states for all phases (enable/disable based on org config)
     */
    window.SFDMU.Cpq.updatePhaseButtonStates = function() {
        const completedPhases = State.currentConfig.completedPhases || [];
        const hasSourceOrg = !!(State.currentConfig.sourceOrg?.username && State.currentConfig.sourceOrg?.instanceUrl);
        
        // Find all select master records buttons and update their disabled state
        const contentContainer = document.getElementById('cpq-individual-phases');
        if (contentContainer) {
            const allSelectButtons = contentContainer.querySelectorAll('.cpq-phase-action-btn');
            allSelectButtons.forEach(btn => {
                // Find which phase this button belongs to by looking for the phase title
                let phaseNumber = null;
                let current = btn.parentElement;
                while (current && current !== contentContainer) {
                    const phaseTitle = current.querySelector('.cpq-phase-title');
                    if (phaseTitle) {
                        const match = phaseTitle.textContent.match(/Phase (\d+)/);
                        if (match) {
                            phaseNumber = parseInt(match[1]);
                            break;
                        }
                    }
                    current = current.parentElement;
                }
                
                if (phaseNumber !== null) {
                    const isCompleted = completedPhases.includes(phaseNumber);
                    btn.disabled = !hasSourceOrg || isCompleted;
                    console.log(`[CPQ Phases] Updated button state for phase ${phaseNumber}:`, {
                        disabled: btn.disabled,
                        hasSourceOrg,
                        isCompleted
                    });
                }
            });
        }
    };

    /**
     * Render all phase tabs and content
     */
    window.SFDMU.Cpq.renderIndividualPhases = function() {
        const tabsContainer = document.getElementById('cpq-phase-tabs');
        const contentContainer = document.getElementById('cpq-individual-phases');
        if (!tabsContainer || !contentContainer) return;

        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        const phaseDefinitions = window.SFDMU.Cpq.getPhaseDefinitions();
    if (!phaseDefinitions || phaseDefinitions.length === 0) {
        contentContainer.innerHTML = '<p class="info-text">No CPQ phases defined.</p>';
        return;
    }

        // In CPQ mode we include all phases by default
        const selected = phaseDefinitions;
        const completedPhases = State.currentConfig.completedPhases || [];
        const activePhaseTab = window.SFDMU.Cpq.getActivePhaseTab();
    
    // Render tabs
    selected.forEach(phase => {
        const isCompleted = completedPhases.includes(phase.phaseNumber);
        const tab = document.createElement('button');
        tab.className = 'cpq-phase-tab';
        tab.dataset.phaseNumber = phase.phaseNumber;
        if (phase.phaseNumber === activePhaseTab) {
            tab.classList.add('active');
        }
        if (isCompleted) {
            tab.classList.add('completed');
        }
        
        // Tab label
        const tabLabel = document.createElement('span');
        tabLabel.className = 'cpq-phase-tab-label';
        tabLabel.textContent = `Phase ${phase.phaseNumber}`;
        tab.appendChild(tabLabel);
        
        // Completion indicator
        if (isCompleted) {
            const checkIcon = document.createElement('span');
            checkIcon.className = 'codicon codicon-check cpq-phase-tab-check';
            tab.appendChild(checkIcon);
        }
        
        // Selection count badge
        const phaseSelections = State.currentConfig.selectedMasterRecords?.[phase.phaseNumber] || {};
        let totalSelected = 0;
        Object.values(phaseSelections).forEach(arr => {
            totalSelected += arr.length;
        });
        if (totalSelected > 0) {
            const badge = document.createElement('span');
            badge.className = 'cpq-phase-tab-badge';
            badge.textContent = totalSelected;
            tab.appendChild(badge);
        }
        
            tab.addEventListener('click', () => {
                window.SFDMU.Cpq.switchPhaseTab(phase.phaseNumber);
            });
            
            tabsContainer.appendChild(tab);
        });
        
        // Render content for active tab
        window.SFDMU.Cpq.renderPhaseContent(activePhaseTab);
        
        // Update main DML dropdown to show active phase's operation
        const mainDmlSelect = document.getElementById('dml-operation');
        if (mainDmlSelect && State.currentConfig.cpqPhaseOperations) {
            const phaseOperation = State.currentConfig.cpqPhaseOperations[activePhaseTab] || State.currentConfig.operation || 'Upsert';
            if (mainDmlSelect.value !== phaseOperation) {
                mainDmlSelect.value = phaseOperation;
            }
        }
        // Request phase backup status so rollback buttons show only for phases with backups
        if (State.currentConfig && State.currentConfig.configName && (State.currentConfig.mode === 'cpq' || State.currentConfig.mode === 'rca')) {
            vscode.postMessage({
                command: 'checkPhaseBackups',
                configName: State.currentConfig.configName,
                mode: State.currentConfig.mode
            });
        }
    };

    /**
     * Switch to a different phase tab
     */
    window.SFDMU.Cpq.switchPhaseTab = function(phaseNumber) {
        window.SFDMU.Cpq.setActivePhaseTab(phaseNumber);
    
        // Update tab active states
        const tabs = document.querySelectorAll('.cpq-phase-tab');
        tabs.forEach(tab => {
            if (parseInt(tab.dataset.phaseNumber) === phaseNumber) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update main DML operation dropdown to show current phase's operation
        const mainDmlSelect = document.getElementById('dml-operation');
        if (mainDmlSelect) {
            // Initialize per-phase operations if needed
            if (!State.currentConfig.cpqPhaseOperations) {
                State.currentConfig.cpqPhaseOperations = {};
            }
            const phaseOperation = State.currentConfig.cpqPhaseOperations[phaseNumber] || State.currentConfig.operation || 'Upsert';
            if (mainDmlSelect.value !== phaseOperation) {
                mainDmlSelect.value = phaseOperation;
                // Don't trigger change event to avoid saving to global operation
            }
        }
        
        // Render content for selected phase
        window.SFDMU.Cpq.renderPhaseContent(phaseNumber);
    };

    /**
     * Check if phase files exist for a phase
     */
    window.SFDMU.Cpq.checkPhaseFilesExist = function(phaseNumber) {
        return window.SFDMU.Cpq.getHasPhaseFiles();
    };

    /**
     * Toggle phase complete status
     */
    window.SFDMU.Cpq.togglePhaseComplete = function(phaseNumber, isComplete) {
    // Initialize completedPhases array if it doesn't exist
    if (!State.currentConfig.completedPhases) {
        State.currentConfig.completedPhases = [];
    }

    if (isComplete) {
        // Add phase to completed list if not already there
        if (!State.currentConfig.completedPhases.includes(phaseNumber)) {
            State.currentConfig.completedPhases.push(phaseNumber);
        }
    } else {
        // Remove phase from completed list
        State.currentConfig.completedPhases = State.currentConfig.completedPhases.filter(
            p => p !== phaseNumber
        );
    }

        // Re-render phases to update UI
        window.SFDMU.Cpq.renderIndividualPhases();

    // Auto-save the configuration
    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
        window.SFDMU.ConfigManager.updateOrgConfig();
    }
    vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
    };

    /**
     * Generate phase files for a specific phase
     */
    window.SFDMU.Cpq.generatePhaseFiles = function(phaseNumber) {
    // Ensure org config is up-to-date
    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
        window.SFDMU.ConfigManager.updateOrgConfig();
    }

    if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
        vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
        return;
    }

    if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
        vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
        return;
    }

    // Send message to generate files for this specific phase
    vscode.postMessage({
        command: 'generatePhaseFile',
        config: State.currentConfig,
        phaseNumber: phaseNumber
    });
    };

    /**
     * Run a phase (simulation or actual run)
     */
    window.SFDMU.Cpq.exportPhaseToExcel = function(phaseNumber) {
        if (!State.currentConfig.sourceOrg.alias && !State.currentConfig.sourceOrg.username) {
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required for Excel export' });
            return;
        }
        
        // Show confirmation modal with phase number
        if (window.SFDMU.Modals) {
            window.SFDMU.Modals.showExcelExportConfirm(phaseNumber);
        }
    };
    
    window.SFDMU.Cpq.runPhase = function(phaseNumber, simulation) {
    // Ensure org config is up-to-date
    if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
        window.SFDMU.ConfigManager.updateOrgConfig();
    }

    if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
        vscode.postMessage({ command: 'showError', message: 'Error: Source org is required' });
        return;
    }

    if (!State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl) {
        vscode.postMessage({ command: 'showError', message: 'Error: Target org is required' });
        return;
    }

    vscode.postMessage({
        command: 'runCpqPhase',
        config: State.currentConfig,
        phaseNumber: phaseNumber,
        simulation: simulation
    });
    };

    /**
     * Render content for a specific phase
     */
    window.SFDMU.Cpq.renderPhaseContent = function(phaseNumber) {
    const contentContainer = document.getElementById('cpq-individual-phases');
    if (!contentContainer) return;
    
        const phaseDefinitions = window.SFDMU.Cpq.getPhaseDefinitions();
        const phase = phaseDefinitions.find(p => p.phaseNumber === phaseNumber);
    if (!phase) {
        contentContainer.innerHTML = '<p class="info-text">Phase not found.</p>';
        return;
    }
    
    const completedPhases = State.currentConfig.completedPhases || [];
    const isCompleted = completedPhases.includes(phase.phaseNumber);
    const hasPhaseFiles = window.SFDMU.Cpq.checkPhaseFilesExist(phase.phaseNumber);
    
    contentContainer.innerHTML = '';
    
    // Phase Header with Objects and Action Buttons
    const header = document.createElement('div');
    header.className = 'cpq-phase-header';
    
    // Left side: Title and Objects
    const headerLeft = document.createElement('div');
    headerLeft.className = 'cpq-phase-header-left';
    
    // Title row with Phase number and Mark as Complete button
    const titleRow = document.createElement('div');
    titleRow.className = 'cpq-phase-title-row';
    
    const title = document.createElement('h3');
    title.className = 'cpq-phase-title';
    title.textContent = `Phase ${phase.phaseNumber}`;
    titleRow.appendChild(title);
    
    // Mark as Complete/Incomplete button - next to the title
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = `btn-secondary cpq-phase-header-btn icon-button ${isCompleted ? 'phase-completed-btn' : ''}`;
    doneBtn.innerHTML = isCompleted 
        ? '<span class="codicon codicon-discard"></span>'
        : '<span class="codicon codicon-check"></span>';
    doneBtn.title = isCompleted ? 'Mark as Incomplete' : 'Mark as Complete';
    doneBtn.addEventListener('click', () => {
        window.SFDMU.Cpq.togglePhaseComplete(phase.phaseNumber, !isCompleted);
    });
    titleRow.appendChild(doneBtn);
    
    headerLeft.appendChild(titleRow);
    
    // Objects list directly under the title
    const objectsList = document.createElement('div');
    objectsList.className = 'cpq-phase-objects-list';
    
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
    headerRight.className = 'cpq-phase-header-right';
    
    // DML Operation dropdown - per-phase operation
    const dmlOperationSelect = document.getElementById('dml-operation');
    if (dmlOperationSelect) {
        const dmlWrapper = document.createElement('div');
        dmlWrapper.className = 'cpq-phase-dml-operation';
        
        // Clone the select element
        const dmlClone = dmlOperationSelect.cloneNode(true);
        dmlClone.id = `dml-operation-phase-${phase.phaseNumber}`;
        dmlClone.className = 'select-input cpq-phase-dml-select';
        
        // Initialize per-phase operations if needed
        if (!State.currentConfig.cpqPhaseOperations) {
            State.currentConfig.cpqPhaseOperations = {};
        }
        
        // Load phase-specific operation, or default to global operation
        const phaseOperation = State.currentConfig.cpqPhaseOperations[phase.phaseNumber] || State.currentConfig.operation || 'Upsert';
        dmlClone.value = phaseOperation;
        
        // Save changes to phase-specific operation
        dmlClone.addEventListener('change', (e) => {
            const newOperation = e.target.value;
            State.currentConfig.cpqPhaseOperations[phase.phaseNumber] = newOperation;
            
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
        configButtonClone.id = `migration-config-button-phase-${phase.phaseNumber}`;
        configButtonClone.className = 'icon-button cpq-phase-header-btn'; // Use same styling as other phase header buttons
        
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
    generateBtn.className = 'btn-secondary cpq-phase-header-btn icon-button';
    generateBtn.innerHTML = '<span class="codicon codicon-file-add"></span>';
    generateBtn.title = 'Generate Phase File';
    generateBtn.disabled = isCompleted || !State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl;
    generateBtn.addEventListener('click', () => {
        window.SFDMU.Cpq.generatePhaseFiles(phase.phaseNumber);
    });
    headerRight.appendChild(generateBtn);
    
    // Export to Excel button (icon only with tooltip)
    const exportExcelBtn = document.createElement('button');
    exportExcelBtn.type = 'button';
    exportExcelBtn.className = 'btn-secondary cpq-phase-header-btn icon-button';
    exportExcelBtn.innerHTML = '<span class="codicon codicon-table"></span>';
    exportExcelBtn.title = 'Export to Excel';
    exportExcelBtn.disabled = !State.currentConfig.sourceOrg.alias && !State.currentConfig.sourceOrg.username;
    exportExcelBtn.addEventListener('click', () => {
        window.SFDMU.Cpq.exportPhaseToExcel(phase.phaseNumber);
    });
    headerRight.appendChild(exportExcelBtn);
    
    // Simulation button (icon only with tooltip)
    const simBtn = document.createElement('button');
    simBtn.type = 'button';
    simBtn.className = 'btn-secondary cpq-phase-header-btn icon-button';
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
            
            // Request objects from export.json
            let objects = [];
            try {
                objects = await new Promise((resolve) => {
                    // Check cache first
                    if (window.cpqPhaseObjectsCache && window.cpqPhaseObjectsCache[phase.phaseNumber]) {
                        const cached = window.cpqPhaseObjectsCache[phase.phaseNumber];
                        // Use cache if less than 5 seconds old
                        if (Date.now() - cached.timestamp < 5000) {
                            resolve(cached.objects || []);
                            return;
                        }
                    }
                    
                    const handler = (event) => {
                        if (event.detail && event.detail.phaseNumber === phase.phaseNumber) {
                            window.removeEventListener('cpqPhaseObjectsReceived', handler);
                            if (event.detail.error) {
                                console.warn('Failed to load objects:', event.detail.error);
                                resolve([]);
                            } else {
                                resolve(event.detail.objects || []);
                            }
                        }
                    };
                    window.addEventListener('cpqPhaseObjectsReceived', handler);
                    vscode.postMessage({
                        command: 'getCpqPhaseObjects',
                        config: State.currentConfig,
                        phaseNumber: phase.phaseNumber
                    });
                    // Timeout after 3 seconds
                    setTimeout(() => {
                        window.removeEventListener('cpqPhaseObjectsReceived', handler);
                        resolve([]);
                    }, 3000);
                });
            } catch (error) {
                console.warn('Error loading objects:', error);
            }
            
            const confirmed = await UIUtils.showConfirmation(
                'Confirm CPQ Phase Simulation',
                `Run a simulation for ${descriptionText}?`,
                objects
            );
            if (!confirmed) {
                return;
            }
        }
        window.SFDMU.Cpq.runPhase(phase.phaseNumber, true);
    });
    headerRight.appendChild(simBtn);
    
    // Run button (icon only with tooltip)
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'btn-primary cpq-phase-header-btn icon-button';
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
            
            // Request objects from export.json
            let objects = [];
            try {
                objects = await new Promise((resolve) => {
                    // Check cache first
                    if (window.cpqPhaseObjectsCache && window.cpqPhaseObjectsCache[phase.phaseNumber]) {
                        const cached = window.cpqPhaseObjectsCache[phase.phaseNumber];
                        // Use cache if less than 5 seconds old
                        if (Date.now() - cached.timestamp < 5000) {
                            resolve(cached.objects || []);
                            return;
                        }
                    }
                    
                    const handler = (event) => {
                        if (event.detail && event.detail.phaseNumber === phase.phaseNumber) {
                            window.removeEventListener('cpqPhaseObjectsReceived', handler);
                            if (event.detail.error) {
                                console.warn('Failed to load objects:', event.detail.error);
                                resolve([]);
                            } else {
                                resolve(event.detail.objects || []);
                            }
                        }
                    };
                    window.addEventListener('cpqPhaseObjectsReceived', handler);
                    vscode.postMessage({
                        command: 'getCpqPhaseObjects',
                        config: State.currentConfig,
                        phaseNumber: phase.phaseNumber
                    });
                    // Timeout after 3 seconds
                    setTimeout(() => {
                        window.removeEventListener('cpqPhaseObjectsReceived', handler);
                        resolve([]);
                    }, 3000);
                });
            } catch (error) {
                console.warn('Error loading objects:', error);
            }
            
            const confirmed = await UIUtils.showConfirmation(
                'Confirm CPQ Phase Run',
                `Run ${descriptionText}? This will execute the migration and make changes to the target org.`,
                objects
            );
            if (!confirmed) {
                return;
            }
        }
        window.SFDMU.Cpq.runPhase(phase.phaseNumber, false);
    });
    headerRight.appendChild(runBtn);
    
    // Backup button (phase-scoped)
    const backupBtn = document.createElement('button');
    backupBtn.type = 'button';
    backupBtn.className = 'btn-secondary cpq-phase-header-btn icon-button';
    backupBtn.innerHTML = '<span class="codicon codicon-cloud-download"></span>';
    backupBtn.title = 'Create Backup';
    backupBtn.disabled = !State.currentConfig.targetOrg.username || !State.currentConfig.targetOrg.instanceUrl || !State.currentConfig.configName || isCompleted;
    backupBtn.addEventListener('click', () => {
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateExcludedObjects) {
            window.SFDMU.ConfigManager.updateExcludedObjects();
        }
        vscode.postMessage({
            command: 'createBackup',
            config: State.currentConfig,
            phaseNumber: phase.phaseNumber
        });
    });
    headerRight.appendChild(backupBtn);
    
    // Rollback button (phase-scoped; only visible when this phase has backups)
    const rollbackBtn = document.createElement('button');
    rollbackBtn.type = 'button';
    rollbackBtn.className = 'icon-button icon-button-warning cpq-phase-header-btn';
    rollbackBtn.id = `rollback-phase-${phase.phaseNumber}`;
    rollbackBtn.innerHTML = '<span class="codicon codicon-discard"></span>';
    rollbackBtn.title = 'Rollback Phase ' + phase.phaseNumber;
    rollbackBtn.style.display = 'none';
    rollbackBtn.addEventListener('click', () => {
        if (window.SFDMU.RollbackModal && State.currentConfig && State.currentConfig.configName) {
            window.SFDMU.RollbackModal.show(State.currentConfig.configName, phase.phaseNumber);
        }
    });
    headerRight.appendChild(rollbackBtn);
    // Show only if we already know this phase has backups (e.g. after tab switch)
    if (window.SFDMU.Cpq.phasesWithBackups && window.SFDMU.Cpq.phasesWithBackups.includes(phase.phaseNumber)) {
        rollbackBtn.style.display = 'inline-flex';
    }
    
    header.appendChild(headerRight);
    contentContainer.appendChild(header);
    
    // Selected Records Section
    const selectedRecordsSection = document.createElement('div');
    selectedRecordsSection.className = 'cpq-phase-selected-records-section';
    
    const selectedRecordsTitleRow = document.createElement('div');
    selectedRecordsTitleRow.className = 'cpq-phase-selected-records-title-row';
    
    const selectedRecordsTitle = document.createElement('h4');
    selectedRecordsTitle.className = 'cpq-phase-section-title';
    selectedRecordsTitle.textContent = 'Selected Parent Records';
    selectedRecordsTitleRow.appendChild(selectedRecordsTitle);
    
    // Select Master Records button (moved to title row)
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'btn-secondary cpq-phase-action-btn';
        const masterObjects = window.SFDMU.Cpq.getMasterObjectsForPhase(phase.phaseNumber);
    selectBtn.innerHTML = `<span class="codicon codicon-search"></span> ${masterObjects.length > 0 ? 'Select Master Records' : 'Select Records'}`;
    selectBtn.addEventListener('click', () => {
        console.log('[CPQ Phases] Select Master Records button clicked for phase', phase.phaseNumber);
        console.log('[CPQ Phases] Button disabled?', selectBtn.disabled);
        console.log('[CPQ Phases] Source org state:', {
            username: State.currentConfig.sourceOrg?.username,
            instanceUrl: State.currentConfig.sourceOrg?.instanceUrl,
            hasUsername: !!State.currentConfig.sourceOrg?.username,
            hasInstanceUrl: !!State.currentConfig.sourceOrg?.instanceUrl
        });
        console.log('[CPQ Phases] window.SFDMU exists?', !!window.SFDMU);
        console.log('[CPQ Phases] window.SFDMU.Cpq exists?', !!(window.SFDMU && window.SFDMU.Cpq));
        console.log('[CPQ Phases] window.SFDMU.Cpq.openMasterSelectionModal exists?', !!(window.SFDMU && window.SFDMU.Cpq && window.SFDMU.Cpq.openMasterSelectionModal));
        console.log('[CPQ Phases] window.SFDMU.Cpq keys:', window.SFDMU && window.SFDMU.Cpq ? Object.keys(window.SFDMU.Cpq) : 'N/A');
        
        if (selectBtn.disabled) {
            console.warn('[CPQ Phases] Button is disabled, click ignored');
            return;
        }
        
        if (window.SFDMU && window.SFDMU.Cpq && window.SFDMU.Cpq.openMasterSelectionModal) {
            console.log('[CPQ Phases] Calling openMasterSelectionModal...');
            window.SFDMU.Cpq.openMasterSelectionModal(phase.phaseNumber);
        } else {
            console.error('[CPQ Phases] openMasterSelectionModal function not available');
            console.error('[CPQ Phases] Full window.SFDMU.Cpq object:', window.SFDMU && window.SFDMU.Cpq);
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
        badge.className = 'cpq-phase-action-badge';
        badge.textContent = `${totalSelected} selected`;
        selectBtn.appendChild(badge);
    }
    
    selectedRecordsTitleRow.appendChild(selectBtn);
    selectedRecordsSection.appendChild(selectedRecordsTitleRow);
    
    const selectedRecordsContainer = document.createElement('div');
    selectedRecordsContainer.className = 'cpq-phase-selected-records-container';
    
    // Get selected records for this phase
    const phaseSelections = State.currentConfig.selectedMasterRecords?.[phase.phaseNumber] || {};
    // Handle both old format (string[]) and new format ({ externalId, id }[])
    const hasSelections = Object.keys(phaseSelections).length > 0 && 
                        Object.values(phaseSelections).some(arr => Array.isArray(arr) && arr.length > 0);
    
    // Get all selectable objects for this phase (to show even when no selections)
    const selectableObjects = window.SFDMU.Cpq.getSelectableObjectsForPhase(phase.phaseNumber, State.currentConfig.includeProduct2 || false);
    
    // Initialize queried child records for this phase if needed
    if (!queriedChildRecords[phase.phaseNumber]) {
        queriedChildRecords[phase.phaseNumber] = {};
    }
    
    // Load queried child records from config if available
    const savedQueriedChildRecords = State.currentConfig.queriedChildRecords?.[phase.phaseNumber];
    if (savedQueriedChildRecords) {
        // Merge saved records into queriedChildRecords
        Object.keys(savedQueriedChildRecords).forEach(parentObjectName => {
            if (!queriedChildRecords[phase.phaseNumber][parentObjectName]) {
                queriedChildRecords[phase.phaseNumber][parentObjectName] = {};
            }
            Object.keys(savedQueriedChildRecords[parentObjectName]).forEach(parentExternalId => {
                if (!queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId]) {
                    queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId] = {};
                }
                Object.keys(savedQueriedChildRecords[parentObjectName][parentExternalId]).forEach(childObjectName => {
                    queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId][childObjectName] = 
                        savedQueriedChildRecords[parentObjectName][parentExternalId][childObjectName] || [];
                });
            });
        });
    }
    
    // Show all selectable objects, even if they have no selections
    if (selectableObjects.length > 0) {
        // First, show objects that have selections (existing logic)
        if (hasSelections) {
        // Get all parent objects that have children (from COMPREHENSIVE_RELATIONSHIPS)
        const allParentObjects = Object.keys(COMPREHENSIVE_RELATIONSHIPS).filter(parentObj => {
            const children = COMPREHENSIVE_RELATIONSHIPS[parentObj];
            return children.some(child => child.phaseNumber === phase.phaseNumber);
        });
        
        // Also check hierarchical relationships for backward compatibility
        const hierarchicalConfig = HIERARCHICAL_RELATIONSHIPS[phase.phaseNumber] || {};
        const hierarchicalParentObjects = Object.keys(hierarchicalConfig);
        
        // Combine both sources
        const parentObjects = [...new Set([...allParentObjects, ...hierarchicalParentObjects])];
        const childObjects = new Set();
        
        // Collect all child object names from both sources
        parentObjects.forEach(parentObj => {
            if (COMPREHENSIVE_RELATIONSHIPS[parentObj]) {
                COMPREHENSIVE_RELATIONSHIPS[parentObj].forEach(child => {
                    if (child.phaseNumber === phase.phaseNumber) {
                        childObjects.add(child.childObjectName);
                    }
                });
            }
        });
        Object.values(hierarchicalConfig).forEach(config => {
            if (config.childObject) {
                childObjects.add(config.childObject);
            }
            if (config.childObjects) {
                config.childObjects.forEach(child => {
                    childObjects.add(child.objectName);
                });
            }
        });
        
        // Separate parent and non-parent objects
        const parentObjectNames = new Set(parentObjects);
        const nonParentObjects = Object.keys(phaseSelections).filter(objName => 
            !parentObjectNames.has(objName) && !childObjects.has(objName)
        );
        
        // Load saved child records from config (but don't auto-fetch new ones)
        // Children will only be fetched when user clicks the fetch button
        parentObjects.forEach(parentObjectName => {
            // Handle both old format (string[]) and new format ({ externalId, id }[])
            const parentSelected = phaseSelections[parentObjectName] || [];
            const parentSelectedIds = parentSelected.map(item => 
                typeof item === 'object' && item.externalId ? item.externalId : item
            );
            if (parentSelectedIds.length === 0) return;
            
            // Get child configurations to check if parent has children
            const comprehensiveChildren = (COMPREHENSIVE_RELATIONSHIPS[parentObjectName] || [])
                .filter(child => child.phaseNumber === phase.phaseNumber);
            
            const hierarchicalConfigForParent = hierarchicalConfig[parentObjectName];
            const hierarchicalChildren = hierarchicalConfigForParent ? 
                (hierarchicalConfigForParent.childObjects || (hierarchicalConfigForParent.childObject ? [{
                    objectName: hierarchicalConfigForParent.childObject,
                    relationshipField: hierarchicalConfigForParent.relationshipField,
                    externalId: hierarchicalConfigForParent.childExternalId
                }] : [])) : [];
            
            const allChildConfigs = [...comprehensiveChildren, ...hierarchicalChildren];
            
            // Only load saved children from config, don't query new ones
            if (parentSelectedIds.length > 0 && allChildConfigs.length > 0) {
                parentSelectedIds.forEach(parentExternalId => {
                    // Check if we have saved child records for this parent
                    const savedChildren = State.currentConfig.queriedChildRecords?.[phase.phaseNumber]?.[parentObjectName]?.[parentExternalId];
                    if (savedChildren) {
                        // Load saved children into queriedChildRecords for display
                        if (!queriedChildRecords[phase.phaseNumber][parentObjectName]) {
                            queriedChildRecords[phase.phaseNumber][parentObjectName] = {};
                        }
                        if (!queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId]) {
                            queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId] = {};
                        }
                        Object.keys(savedChildren).forEach(childObjectName => {
                            queriedChildRecords[phase.phaseNumber][parentObjectName][parentExternalId][childObjectName] = 
                                savedChildren[childObjectName];
                        });
                    }
                });
            }
        });
        
        // Single view: all selected records use the same "parent" row structure. View/Fetch children only when object has children.
        const objectsWithSelections = [];
        parentObjects.forEach(parentObjectName => {
            const list = phaseSelections[parentObjectName] || [];
            if (list.length > 0) objectsWithSelections.push({ objectName: parentObjectName, selectedRecordsList: list });
        });
        nonParentObjects.forEach(objectName => {
            const list = phaseSelections[objectName] || [];
            if (list.length > 0) objectsWithSelections.push({ objectName, selectedRecordsList: list });
        });

        objectsWithSelections.forEach(({ objectName, selectedRecordsList }) => {
            const comprehensiveChildren = (COMPREHENSIVE_RELATIONSHIPS[objectName] || [])
                .filter(child => child.phaseNumber === phase.phaseNumber);
            const hierarchicalConfigForParent = hierarchicalConfig[objectName];
            const hierarchicalChildren = hierarchicalConfigForParent ?
                (hierarchicalConfigForParent.childObjects || (hierarchicalConfigForParent.childObject ? [{
                    objectName: hierarchicalConfigForParent.childObject,
                    relationshipField: hierarchicalConfigForParent.relationshipField,
                    externalId: hierarchicalConfigForParent.childExternalId
                }] : [])) : [];
            const allChildConfigs = [...comprehensiveChildren, ...hierarchicalChildren];

            const objectGroup = document.createElement('div');
            objectGroup.className = 'cpq-selected-records-group';

            const recordCount = selectedRecordsList.length;
            // Header child count = sum of each row’s child count (same logic as the rows)
            let sectionChildCount = 0;
            selectedRecordsList.forEach(selectionItem => {
                const recordExternalId = typeof selectionItem === 'object' && selectionItem.externalId ? selectionItem.externalId : selectionItem;
                const childrenByObjectType = new Map();
                allChildConfigs.forEach(childConfig => {
                    const childObjectName = childConfig.childObjectName || childConfig.objectName;
                    const childExternalId = childConfig.externalId || childConfig.childExternalId;
                    const queriedChildren = queriedChildRecords[phase.phaseNumber]?.[objectName]?.[recordExternalId]?.[childObjectName] || [];
                    const childSelected = phaseSelections[childObjectName] || [];
                    const childSelectedIds = childSelected.map(item =>
                        typeof item === 'object' && item.externalId ? item.externalId : item
                    );
                    const childRecords = [];
                    const addedKeys = new Set();
                    queriedChildren.forEach(childRecord => {
                        const childRecordExternalId = buildExternalIdFromRecord(childRecord, childExternalId);
                        const uniqueKey = childRecord.Id ?? childRecordExternalId;
                        if (uniqueKey && !addedKeys.has(uniqueKey)) {
                            addedKeys.add(uniqueKey);
                            childRecords.push({ record: childRecord, externalId: childRecordExternalId, isQueried: true });
                        }
                    });
                    childSelectedIds.forEach(childExternalIdValue => {
                        if (addedKeys.has(childExternalIdValue)) return;
                        let isMatch = false;
                        if (phase.phaseNumber === 3 && objectName === 'SBQQ__PriceRule__c' && childObjectName === 'SBQQ__LookupQuery__c') {
                            isMatch = (recordExternalId || '').trim().toLowerCase() === (childExternalIdValue || '').trim().toLowerCase();
                        } else if (phase.phaseNumber === 4 && objectName === 'SBQQ__TemplateSection__c' && childObjectName === 'SBQQ__LineColumn__c') {
                            const templateName = (recordExternalId.split('|')[0] || recordExternalId).trim().toLowerCase();
                            const childTemplateName = (childExternalIdValue.split('|')[0] || childExternalIdValue).trim().toLowerCase();
                            isMatch = templateName === childTemplateName;
                        } else {
                            const parentParts = recordExternalId.split('|');
                            const childParts = childExternalIdValue.split('|');
                            if (parentParts.length > 1 && childParts.length > 1) {
                                isMatch = parentParts[0] === childParts[0] || childExternalIdValue.includes(parentParts[0]) || recordExternalId.includes(childParts[0]);
                            } else {
                                isMatch = childExternalIdValue.includes(recordExternalId) || recordExternalId.includes(childExternalIdValue);
                            }
                        }
                        if (isMatch) {
                            addedKeys.add(childExternalIdValue);
                            childRecords.push({ externalId: childExternalIdValue, isQueried: false });
                        }
                    });
                    if (childRecords.length > 0) {
                        if (!childrenByObjectType.has(childObjectName)) {
                            childrenByObjectType.set(childObjectName, []);
                        }
                        const existing = childrenByObjectType.get(childObjectName);
                        const getUniqueKey = (item) => item.record?.Id ?? item.externalId;
                        const existingKeys = new Set(existing.map(getUniqueKey));
                        childRecords.forEach(item => {
                            const key = getUniqueKey(item);
                            if (key && !existingKeys.has(key)) {
                                existingKeys.add(key);
                                existing.push(item);
                            }
                        });
                    }
                });
                childrenByObjectType.forEach(records => {
                    sectionChildCount += records.length;
                });
            });

            const objectHeader = document.createElement('div');
            objectHeader.className = 'cpq-selected-records-object-header';
            const objectLabel = document.createElement('span');
            objectLabel.className = 'cpq-selected-records-object-label';
            objectLabel.textContent = objectName;
            const parentCountBadge = document.createElement('span');
            parentCountBadge.className = 'cpq-selected-records-count';
            parentCountBadge.textContent = `${recordCount} parent${recordCount !== 1 ? 's' : ''}`;
            const childCountBadge = document.createElement('span');
            childCountBadge.className = 'cpq-selected-records-count';
            childCountBadge.textContent = `${sectionChildCount} child${sectionChildCount !== 1 ? 'ren' : ''}`;
            const countBadgesWrapper = document.createElement('span');
            countBadgesWrapper.className = 'cpq-selected-records-count-badges';
            countBadgesWrapper.appendChild(parentCountBadge);
            countBadgesWrapper.appendChild(childCountBadge);
            objectHeader.appendChild(objectLabel);
            objectHeader.appendChild(countBadgesWrapper);
            objectGroup.appendChild(objectHeader);

            const recordsListContainer = document.createElement('div');
            recordsListContainer.className = 'cpq-selected-records-list-container';
            const recordsList = document.createElement('div');
            recordsList.className = 'cpq-selected-records-list';

            selectedRecordsList.forEach(selectionItem => {
                const recordExternalId = typeof selectionItem === 'object' && selectionItem.externalId ? selectionItem.externalId : selectionItem;
                const recordId = typeof selectionItem === 'object' && selectionItem.id ? selectionItem.id : null;
                const childrenByObjectType = new Map();
                allChildConfigs.forEach(childConfig => {
                    const childObjectName = childConfig.childObjectName || childConfig.objectName;
                    const childExternalId = childConfig.externalId || childConfig.childExternalId;
                    const queriedChildren = queriedChildRecords[phase.phaseNumber]?.[objectName]?.[recordExternalId]?.[childObjectName] || [];
                    const childSelected = phaseSelections[childObjectName] || [];
                    const childSelectedIds = childSelected.map(item =>
                        typeof item === 'object' && item.externalId ? item.externalId : item
                    );
                    const childRecords = [];
                    const addedKeys = new Set();
                    queriedChildren.forEach(childRecord => {
                        const childRecordExternalId = buildExternalIdFromRecord(childRecord, childExternalId);
                        const uniqueKey = childRecord.Id ?? childRecordExternalId;
                        if (uniqueKey && !addedKeys.has(uniqueKey)) {
                            addedKeys.add(uniqueKey);
                            childRecords.push({ record: childRecord, externalId: childRecordExternalId, isQueried: true });
                        }
                    });
                    childSelectedIds.forEach(childExternalIdValue => {
                        if (addedKeys.has(childExternalIdValue)) return;
                        let isMatch = false;
                        if (phase.phaseNumber === 3 && objectName === 'SBQQ__PriceRule__c' && childObjectName === 'SBQQ__LookupQuery__c') {
                            isMatch = (recordExternalId || '').trim().toLowerCase() === (childExternalIdValue || '').trim().toLowerCase();
                        } else if (phase.phaseNumber === 4 && objectName === 'SBQQ__TemplateSection__c' && childObjectName === 'SBQQ__LineColumn__c') {
                            const templateName = (recordExternalId.split('|')[0] || recordExternalId).trim().toLowerCase();
                            const childTemplateName = (childExternalIdValue.split('|')[0] || childExternalIdValue).trim().toLowerCase();
                            isMatch = templateName === childTemplateName;
                        } else {
                            const parentParts = recordExternalId.split('|');
                            const childParts = childExternalIdValue.split('|');
                            if (parentParts.length > 1 && childParts.length > 1) {
                                isMatch = parentParts[0] === childParts[0] || childExternalIdValue.includes(parentParts[0]) || recordExternalId.includes(childParts[0]);
                            } else {
                                isMatch = childExternalIdValue.includes(recordExternalId) || recordExternalId.includes(childExternalIdValue);
                            }
                        }
                        if (isMatch) {
                            addedKeys.add(childExternalIdValue);
                            childRecords.push({ externalId: childExternalIdValue, isQueried: false });
                        }
                    });
                    if (childRecords.length > 0) {
                        if (!childrenByObjectType.has(childObjectName)) {
                            childrenByObjectType.set(childObjectName, []);
                        }
                        const existing = childrenByObjectType.get(childObjectName);
                        const getUniqueKey = (item) => item.record?.Id ?? item.externalId;
                        const existingKeys = new Set(existing.map(getUniqueKey));
                        childRecords.forEach(item => {
                            const key = getUniqueKey(item);
                            if (key && !existingKeys.has(key)) {
                                existingKeys.add(key);
                                existing.push(item);
                            }
                        });
                    }
                });

                let totalChildCount = 0;
                childrenByObjectType.forEach(records => { totalChildCount += records.length; });

                const recordContainer = document.createElement('div');
                recordContainer.className = 'cpq-parent-record-container';
                const recordHeader = document.createElement('div');
                recordHeader.className = 'cpq-record-row cpq-parent-record-header';
                recordHeader.dataset.phaseNumber = phase.phaseNumber;
                recordHeader.dataset.parentObjectName = objectName;
                recordHeader.dataset.parentExternalId = recordExternalId;

                const nameContainer = document.createElement('div');
                nameContainer.className = 'cpq-record-row-name-container';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'cpq-record-name';
                nameSpan.textContent = recordExternalId;
                nameContainer.appendChild(nameSpan);

                if (allChildConfigs.length > 0) {
                    const viewChildrenBtn = document.createElement('button');
                    viewChildrenBtn.type = 'button';
                    viewChildrenBtn.className = 'cpq-view-children-btn';
                    if (totalChildCount > 0) {
                        const icon = document.createElement('span');
                        icon.className = 'codicon codicon-list-tree';
                        viewChildrenBtn.appendChild(icon);
                        viewChildrenBtn.appendChild(document.createTextNode(`View ${totalChildCount} child${totalChildCount !== 1 ? 'ren' : ''}`));
                        viewChildrenBtn.title = 'View child records';
                        viewChildrenBtn.dataset.phaseNumber = phase.phaseNumber;
                        viewChildrenBtn.dataset.parentObjectName = objectName;
                        viewChildrenBtn.dataset.parentExternalId = recordExternalId;
                        viewChildrenBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            window.SFDMU.Cpq.openChildrenModal(
                                parseInt(viewChildrenBtn.dataset.phaseNumber),
                                viewChildrenBtn.dataset.parentObjectName,
                                viewChildrenBtn.dataset.parentExternalId
                            );
                        });
                    } else {
                        viewChildrenBtn.style.display = 'none';
                    }
                    nameContainer.appendChild(viewChildrenBtn);
                }

                const actionButtonsContainer = document.createElement('div');
                actionButtonsContainer.className = 'cpq-parent-record-actions';
                actionButtonsContainer.style.display = 'flex';
                actionButtonsContainer.style.alignItems = 'center';
                actionButtonsContainer.style.gap = '8px';

                if (allChildConfigs.length > 0 && totalChildCount === 0) {
                    const childrenBtn = document.createElement('button');
                    childrenBtn.className = 'cpq-fetch-children-btn';
                    childrenBtn.dataset.phaseNumber = phase.phaseNumber;
                    childrenBtn.dataset.parentObjectName = objectName;
                    childrenBtn.dataset.parentExternalId = recordExternalId;
                    const icon = document.createElement('span');
                    icon.className = 'codicon codicon-list-tree';
                    childrenBtn.appendChild(icon);
                    childrenBtn.textContent = 'Fetch Children';
                    childrenBtn.title = 'Children are included in export by parent ID. Fetch only to view or manage them here.';
                    childrenBtn.disabled = false;
                    childrenBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        icon.className = 'codicon codicon-loading codicon-modifier-spin';
                        window.SFDMU.Cpq.fetchChildrenForParent(
                            parseInt(btn.dataset.phaseNumber),
                            btn.dataset.parentObjectName,
                            btn.dataset.parentExternalId
                        );
                    });
                    actionButtonsContainer.appendChild(childrenBtn);
                }

                // Open in Salesforce button (same as master selection modal)
                if (recordId && State.currentConfig.sourceOrg?.instanceUrl) {
                    const viewInSfBtn = document.createElement('button');
                    viewInSfBtn.type = 'button';
                    viewInSfBtn.className = 'icon-button';
                    viewInSfBtn.title = 'View record in Salesforce';
                    viewInSfBtn.innerHTML = '<span class="codicon codicon-link-external"></span>';
                    viewInSfBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const recordUrl = `${State.currentConfig.sourceOrg.instanceUrl}/${recordId}`;
                        vscode.postMessage({ command: 'openExternal', url: recordUrl });
                    });
                    actionButtonsContainer.appendChild(viewInSfBtn);
                }

                recordHeader.appendChild(nameContainer);
                recordHeader.appendChild(actionButtonsContainer);
                recordContainer.appendChild(recordHeader);
                recordsList.appendChild(recordContainer);
            });

            recordsListContainer.appendChild(recordsList);
            objectGroup.appendChild(recordsListContainer);
            selectedRecordsContainer.appendChild(objectGroup);
        });
        }
        
        // Now show selectable objects that have no selections
        selectableObjects.forEach(selectableObj => {
            const objectName = selectableObj.objectName;
            const selected = phaseSelections[objectName] || [];
            
            // Skip if already shown above (has selections)
            // Handle both old format (string[]) and new format ({ externalId, id }[])
            if (selected.length > 0) {
                return;
            }
            
            // Check if object is excluded
            const excludedObjects = State.currentConfig.excludedObjectsByPhase?.[phase.phaseNumber] || [];
            const isExcluded = excludedObjects.includes(objectName);
            
            // Show object with appropriate message
            const objectGroup = document.createElement('div');
            objectGroup.className = 'cpq-selected-records-group';
            if (isExcluded) {
                objectGroup.classList.add('excluded');
            }
            
            const objectHeader = document.createElement('div');
            objectHeader.className = 'cpq-selected-records-object-header';
            const objectLabel = document.createElement('span');
            objectLabel.className = 'cpq-selected-records-object-label';
            objectLabel.textContent = objectName;
            
            // Apply strikethrough if excluded
            if (isExcluded) {
                objectLabel.style.textDecoration = 'line-through';
                objectLabel.style.opacity = '0.6';
            }
            
            const countBadge = document.createElement('span');
            countBadge.className = 'cpq-selected-records-count';
            if (isExcluded) {
                countBadge.classList.add('cpq-selected-records-count-excluded');
                countBadge.style.fontStyle = 'italic';
                countBadge.style.color = 'var(--vscode-errorForeground)';
                const excludeIcon = document.createElement('span');
                excludeIcon.className = 'codicon codicon-circle-slash';
                excludeIcon.setAttribute('aria-hidden', 'true');
                countBadge.appendChild(excludeIcon);
                countBadge.appendChild(document.createTextNode('Not migrating this object'));
            } else {
                countBadge.textContent = 'No records selected';
                countBadge.style.fontStyle = 'italic';
                countBadge.style.color = 'var(--vscode-descriptionForeground)';
            }
            
            objectHeader.appendChild(objectLabel);
            objectHeader.appendChild(countBadge);
            objectGroup.appendChild(objectHeader);
            
            selectedRecordsContainer.appendChild(objectGroup);
        });
    } else {
        // No selectable objects defined - show generic message
        const emptyState = document.createElement('p');
        emptyState.className = 'info-text';
        emptyState.textContent = 'No records selected. Click "Select Master Records" to choose records for this phase.';
        selectedRecordsContainer.appendChild(emptyState);
    }
    
    selectedRecordsSection.appendChild(selectedRecordsContainer);
    contentContainer.appendChild(selectedRecordsSection);
    };
})();

