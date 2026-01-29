/**
 * CPQ Hierarchical View
 * Functions for managing parent-child relationships in the master selection modal
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const State = window.SFDMU.State;
    const vscode = window.SFDMU.vscode;

    const HIERARCHICAL_RELATIONSHIPS = window.SFDMU.Cpq.HIERARCHICAL_RELATIONSHIPS || {};
    const masterSelectionState = window.masterSelectionModalState || {};

    /**
     * Get hierarchical relationship configuration for a parent object in the current phase
     */
    window.SFDMU.Cpq.getHierarchicalConfig = function(parentObjectName) {
    const phaseNum = masterSelectionState.phaseNumber;
    if (!phaseNum || !HIERARCHICAL_RELATIONSHIPS[phaseNum]) {
        return null;
    }
        return HIERARCHICAL_RELATIONSHIPS[phaseNum][parentObjectName] || null;
    };
    
    /**
     * Check if an object has child objects in the hierarchical view
     */
    window.SFDMU.Cpq.hasChildObjects = function(objectName) {
        return window.SFDMU.Cpq.getHierarchicalConfig(objectName) !== null;
    };
    
    /**
     * Get child records for a parent record ID
     */
    window.SFDMU.Cpq.getChildRecords = function(parentObjectName, parentId) {
        const config = window.SFDMU.Cpq.getHierarchicalConfig(parentObjectName);
        if (!config) return [];
    
    // Initialize child records storage if needed
    if (!masterSelectionState.childRecordsByParent[parentObjectName]) {
        masterSelectionState.childRecordsByParent[parentObjectName] = {};
    }
    
        return masterSelectionState.childRecordsByParent[parentObjectName][parentId] || [];
    };
    
    /**
     * Check if a parent record is expanded
     */
    window.SFDMU.Cpq.isParentExpanded = function(parentObjectName, parentId) {
    if (!masterSelectionState.expandedParents[parentObjectName]) {
        masterSelectionState.expandedParents[parentObjectName] = new Set();
    }
        return masterSelectionState.expandedParents[parentObjectName].has(parentId);
    };
    
    /**
     * Toggle expand/collapse state for a parent record
     * @param {Function} renderCallback - Callback to re-render the table
     */
    window.SFDMU.Cpq.toggleParentExpand = function(parentObjectName, parentId, renderCallback) {
    if (!masterSelectionState.expandedParents[parentObjectName]) {
        masterSelectionState.expandedParents[parentObjectName] = new Set();
    }
    
    if (masterSelectionState.expandedParents[parentObjectName].has(parentId)) {
        masterSelectionState.expandedParents[parentObjectName].delete(parentId);
    } else {
        masterSelectionState.expandedParents[parentObjectName].add(parentId);
    }
    
    // Re-render the table to show/hide child rows
        if (renderCallback) {
            renderCallback();
        }
    };
    
    /**
     * Create a generic child sub-row for hierarchical display
     * @param {Function} updateCountCallback - Callback to update selection count
     */
    window.SFDMU.Cpq.createChildSubRow = function(childRecord, parentObjectName, childObjectName, childExternalId, updateCountCallback) {
        if (!childRecord) return null;
    
    const row = document.createElement('tr');
    row.className = 'child-sub-row';
    row.style.backgroundColor = 'var(--vscode-editor-inactiveSelectionBackground)';
    
        // Empty cell for expand button (if parent has expand column)
        if (window.SFDMU.Cpq.hasChildObjects(parentObjectName)) {
        const expandCell = document.createElement('td');
        expandCell.style.width = '30px';
        row.appendChild(expandCell);
    }
    
    // Checkbox cell
    const checkboxCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    
        // Get external ID for child record
        const displayConfig = window.SFDMU.Cpq.getDisplayFieldForObject(childObjectName, childExternalId);
    let externalIdValue = '';
    
    if (displayConfig.isComposite) {
        const values = displayConfig.displayFields.map(field => {
            if (field.includes('__r.') || field.includes('.')) {
                const parts = field.split('.');
                let value = childRecord;
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
                return childRecord[field] || '';
            }
        }).filter(v => v !== '');
        externalIdValue = values.join('|');
    } else {
        const field = displayConfig.displayFields[0];
        if (field.includes('__r.') || field.includes('.')) {
            const parts = field.split('.');
            let value = childRecord;
            for (const part of parts) {
                if (value && typeof value === 'object') {
                    value = value[part];
                } else {
                    value = null;
                    break;
                }
            }
            externalIdValue = value || '';
        } else {
            externalIdValue = childRecord[field] || childRecord.Id || '';
        }
    }
    
    // Initialize child selection set if needed
    if (!masterSelectionState.selectedRecords[childObjectName]) {
        masterSelectionState.selectedRecords[childObjectName] = new Set();
    }
    const childSelectedSet = masterSelectionState.selectedRecords[childObjectName];
    const isSelected = childSelectedSet.has(externalIdValue);
    
    if (isSelected) {
        row.classList.add('selected');
    }
    
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            childSelectedSet.add(externalIdValue);
            row.classList.add('selected');
        } else {
            childSelectedSet.delete(externalIdValue);
            row.classList.remove('selected');
        }
        masterSelectionState.selectedRecords[childObjectName] = childSelectedSet;
        if (updateCountCallback) {
            updateCountCallback();
        }
    });
    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);
    
    // Name cell (indented)
    const nameCell = document.createElement('td');
    nameCell.style.paddingLeft = '24px';
    nameCell.textContent = displayConfig.formatValue(childRecord);
    nameCell.style.cursor = 'pointer';
    nameCell.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });
    row.appendChild(nameCell);
    
    // LastModifiedDate cell
    const dateCell = document.createElement('td');
    if (childRecord.LastModifiedDate) {
        const date = new Date(childRecord.LastModifiedDate);
        dateCell.textContent = date.toLocaleString();
    } else {
        dateCell.textContent = '-';
    }
    row.appendChild(dateCell);
    
    // LastModifiedBy cell
    const byCell = document.createElement('td');
    if (childRecord.LastModifiedBy && childRecord.LastModifiedBy.Name) {
        byCell.textContent = childRecord.LastModifiedBy.Name;
    } else {
        byCell.textContent = '-';
    }
    row.appendChild(byCell);
    
    // Actions cell (view record link)
    const actionsCell = document.createElement('td');
    actionsCell.style.textAlign = 'center';
    if (childRecord.Id && State.currentConfig.sourceOrg.instanceUrl) {
        const viewButton = document.createElement('button');
        viewButton.className = 'icon-button';
        viewButton.title = 'View record in Salesforce';
        viewButton.innerHTML = '<span class="codicon codicon-link-external"></span>';
        viewButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const recordUrl = `${State.currentConfig.sourceOrg.instanceUrl}/${childRecord.Id}`;
            vscode.postMessage({
                command: 'openExternal',
                url: recordUrl
            });
        });
        actionsCell.appendChild(viewButton);
    } else {
        actionsCell.innerHTML = '-';
    }
    row.appendChild(actionsCell);
    
    return row;
    };
    
    /**
     * Query child records for selected parent records
     */
    window.SFDMU.Cpq.queryChildRecords = function(parentObjectName) {
        const phaseNum = masterSelectionState.phaseNumber;
        if (!phaseNum) return;
        
        const config = window.SFDMU.Cpq.getHierarchicalConfig(parentObjectName);
        if (!config) return;
        
        // Get selected parent records with their IDs
        const parentObj = masterSelectionState.selectableObjects.find(o => o.objectName === parentObjectName);
        if (!parentObj || !parentObj.records) return;
        
        const selectedExternalIds = masterSelectionState.selectedRecords[parentObjectName] || new Set();
        if (selectedExternalIds.size === 0) {
            // No selections - clear child records
            if (masterSelectionState.childRecordsByParent[parentObjectName]) {
                masterSelectionState.childRecordsByParent[parentObjectName] = {};
            }
            return;
        }
        
        // Get the Salesforce IDs of selected parent records
        const selectedParentIds = [];
        parentObj.records.forEach(record => {
            // Build external ID from record to match
            const displayConfig = window.SFDMU.Cpq.getDisplayFieldForObject(parentObjectName, parentObj.externalIdField);
            let recordExternalId = '';
            
            if (displayConfig.isComposite) {
                const values = displayConfig.displayFields.map(field => {
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
                recordExternalId = values.join('|');
            } else {
                const field = displayConfig.displayFields[0];
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
                    recordExternalId = value || '';
                } else {
                    recordExternalId = record[field] || record.Id || '';
                }
            }
            
            // Check if this record's external ID matches any selected one
            for (const selectedId of selectedExternalIds) {
                const normalizedRecordId = recordExternalId.replace(/\s+/g, '').toLowerCase();
                const normalizedSelectedId = selectedId.replace(/\s+/g, '').toLowerCase();
                
                if (normalizedRecordId === normalizedSelectedId || 
                    normalizedRecordId.includes(normalizedSelectedId) || 
                    normalizedSelectedId.includes(normalizedRecordId)) {
                    selectedParentIds.push(record.Id);
                    break;
                }
            }
        });
        
        if (selectedParentIds.length === 0) {
            if (masterSelectionState.childRecordsByParent[parentObjectName]) {
                masterSelectionState.childRecordsByParent[parentObjectName] = {};
            }
            return;
        }
        
        // Handle single child object or multiple child objects
        const childObjects = config.childObjects || (config.childObject ? [{
            objectName: config.childObject,
            relationshipField: config.relationshipField,
            externalId: config.childExternalId
        }] : []);
        
        // Query each child object type
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        childObjects.forEach(childConfig => {
            vscode.postMessage({
                command: 'getChildRecords',
                parentObjectName: parentObjectName,
                childObjectName: childConfig.objectName,
                relationshipField: childConfig.relationshipField,
                parentIds: selectedParentIds,
                childExternalId: childConfig.externalId,
                orgAlias: sourceOrgAlias,
                phaseNumber: phaseNum
            });
        });
    };
})();

