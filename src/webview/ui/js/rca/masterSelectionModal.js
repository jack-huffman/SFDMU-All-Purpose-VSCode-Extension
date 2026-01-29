/**
 * RCA Master Selection Modal
 * Functions for managing the master record selection modal UI
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    const RECORDS_PER_PAGE = window.SFDMU.Rca.RECORDS_PER_PAGE || 100;

    /**
     * Open master selection modal for RCA
     */
    window.SFDMU.Rca.openMasterSelectionModal = function(phaseNumber) {
        // Validate source org is configured
        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required to select records' });
            return;
        }

        const modal = document.getElementById('cpq-master-selection-modal');
        if (!modal) {
            console.error('[RCA Master Selection] Modal element not found!');
            return;
        }
        
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const rcaPendingTimeouts = window.SFDMU.Rca.getRcaPendingTimeouts();
        
        // Reset cancellation flag
        window.SFDMU.Rca.setIsRcaModalClosed(false);
        
        // Clear any pending timeouts
        rcaPendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        rcaPendingTimeouts.clear();

        rcaMasterSelectionState.phaseNumber = phaseNumber;
        rcaMasterSelectionState.selectableObjects = [];
        rcaMasterSelectionState.selectedRecords = {};
        rcaMasterSelectionState.selectedRecordIds = {};
        rcaMasterSelectionState.excludedObjects = new Set();
        rcaMasterSelectionState.currentTab = null;
        rcaMasterSelectionState.isLoading = true;

        // Update phase number in modal
        const phaseNumberEl = document.getElementById('master-selection-phase-number');
        if (phaseNumberEl) {
            phaseNumberEl.textContent = phaseNumber;
        }

        // Get selectable objects for this phase
        const includeProduct2 = State.currentConfig.rcaIncludeProduct2 || false;
        
        // If phase definitions aren't loaded yet, request them and wait
        const phaseDefinitions = window.SFDMU.Rca.getPhaseDefinitions();
        if (!phaseDefinitions || phaseDefinitions.length === 0) {
            console.log('[RCA Master Selection] Phase definitions not loaded, requesting...');
            // Store the phase number so we can reopen the modal after definitions load
            window.SFDMU.Rca._pendingModalPhase = phaseNumber;
            if (window.SFDMU.Rca.requestPhaseDefinitions) {
                window.SFDMU.Rca.requestPhaseDefinitions();
            }
            vscode.postMessage({ 
                command: 'showInfo', 
                message: 'Loading phase definitions... The modal will open automatically when ready.' 
            });
            return;
        }
        
        const selectableObjects = window.SFDMU.Rca.getSelectableObjectsForPhase(phaseNumber, includeProduct2);
        
        console.log('[RCA Master Selection] Selectable objects for phase', phaseNumber, ':', selectableObjects);
        
        rcaMasterSelectionState.selectableObjects = selectableObjects.map(obj => ({
            objectName: obj.objectName,
            externalIdField: obj.externalIdField,
            records: [],
            loadedCount: 0,
            totalRequested: 0,
            allRecordsLoaded: false
        }));
        
        if (selectableObjects.length === 0) {
            console.warn('[RCA Master Selection] No selectable objects found for phase', phaseNumber);
            // No selectable objects - show empty state
            window.SFDMU.Rca.renderMasterSelectionTabs([]);
            window.SFDMU.Rca.renderMasterSelectionContent(null, []);
            rcaMasterSelectionState.isLoading = false;
            modal.classList.add('show');
            return;
        }

        // Load existing selections
        const phaseSelections = State.currentConfig.selectedMasterRecords?.[phaseNumber] || {};
        selectableObjects.forEach(obj => {
            const selected = phaseSelections[obj.objectName] || [];
            const externalIdValues = selected.map(item => {
                return typeof item === 'object' && item.externalId ? item.externalId : item;
            });
            rcaMasterSelectionState.selectedRecords[obj.objectName] = new Set(externalIdValues);
            
            if (!rcaMasterSelectionState.selectedRecordIds[obj.objectName]) {
                rcaMasterSelectionState.selectedRecordIds[obj.objectName] = new Map();
            }
            selected.forEach(item => {
                if (typeof item === 'object' && item.externalId && item.id) {
                    rcaMasterSelectionState.selectedRecordIds[obj.objectName].set(item.externalId, item.id);
                }
            });
        });
        
        // Load existing excluded objects
        const excludedObjects = State.currentConfig.excludedObjectsByPhase?.[phaseNumber] || [];
        excludedObjects.forEach(objectName => {
            rcaMasterSelectionState.excludedObjects.add(objectName);
        });

        // Render tabs
        window.SFDMU.Rca.renderMasterSelectionTabs(selectableObjects);

        // Show loading state
        const loadingEl = document.getElementById('master-selection-loading');
        const contentEl = document.getElementById('master-selection-content');
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) {
            Array.from(contentEl.children).forEach(child => {
                if (child.id !== 'master-selection-loading') {
                    child.style.display = 'none';
                }
            });
        }

        // Show modal
        modal.classList.add('show');

        // Set first tab as active if available and load its records
        if (selectableObjects.length > 0) {
            const firstObject = selectableObjects[0].objectName;
            window.SFDMU.Rca.switchMasterSelectionTab(firstObject);
            // Load initial batch for first tab
            window.SFDMU.Rca.loadMoreMasterRecords(firstObject, false);
        }
    };
    
    /**
     * Render master selection tabs
     */
    window.SFDMU.Rca.renderMasterSelectionTabs = function(selectableObjects) {
        const tabsContainer = document.getElementById('master-selection-tabs');
        if (!tabsContainer) {
            console.error('[RCA Master Selection] Tabs container not found!');
            return;
        }

        console.log('[RCA Master Selection] Rendering tabs for', selectableObjects.length, 'objects:', selectableObjects);
        tabsContainer.innerHTML = '';

        if (!selectableObjects || selectableObjects.length === 0) {
            console.warn('[RCA Master Selection] No selectable objects to render tabs for');
            return;
        }

        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();

        selectableObjects.forEach(obj => {
            const tab = document.createElement('button');
            tab.className = 'master-selection-tab';
            
            const isExcluded = rcaMasterSelectionState.excludedObjects.has(obj.objectName);
            const selectedSet = rcaMasterSelectionState.selectedRecords[obj.objectName] || new Set();
            const selectedCount = selectedSet.size;
            
            const tabContent = document.createElement('span');
            tabContent.textContent = obj.objectName;
            
            if (isExcluded) {
                tabContent.style.textDecoration = 'line-through';
                tabContent.style.opacity = '0.6';
                tab.classList.add('excluded');
            }
            
            if (selectedCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'master-selection-tab-badge';
                badge.textContent = selectedCount;
                tab.appendChild(tabContent);
                tab.appendChild(badge);
            } else {
                if (isExcluded) {
                    const excludeIcon = document.createElement('span');
                    excludeIcon.className = 'codicon codicon-circle-slash';
                    excludeIcon.style.color = 'var(--vscode-errorForeground)';
                    excludeIcon.style.marginLeft = '6px';
                    tab.appendChild(tabContent);
                    tab.appendChild(excludeIcon);
                } else {
                    const warningIcon = document.createElement('span');
                    warningIcon.className = 'codicon codicon-warning';
                    warningIcon.style.color = 'var(--vscode-errorForeground)';
                    warningIcon.style.marginLeft = '6px';
                    tab.appendChild(tabContent);
                    tab.appendChild(warningIcon);
                }
            }
            
            tab.dataset.objectName = obj.objectName;
            if (rcaMasterSelectionState.currentTab === obj.objectName) {
                tab.classList.add('active');
            }
            
            if (selectedCount === 0 && !isExcluded) {
                tab.classList.add('no-selections');
            }
            
            tab.addEventListener('click', () => {
                window.SFDMU.Rca.switchMasterSelectionTab(obj.objectName);
            });
            
            tabsContainer.appendChild(tab);
        });
        
        console.log('[RCA Master Selection] Rendered', tabsContainer.children.length, 'tabs');
    };
    
    /**
     * Switch master selection tab
     */
    window.SFDMU.Rca.switchMasterSelectionTab = function(objectName) {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        rcaMasterSelectionState.currentTab = objectName;

        const tabs = document.querySelectorAll('.master-selection-tab');
        tabs.forEach(tab => {
            if (tab.dataset.objectName === objectName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        const searchTerm = rcaMasterSelectionState.searchTerms[objectName];
        const recordsToRender = (obj && obj.records) ? obj.records : [];
        
        window.SFDMU.Rca.renderMasterSelectionContent(objectName, recordsToRender);
        
        if (!searchTerm && (!obj || !obj.records || obj.records.length === 0) && !rcaMasterSelectionState.loadingMore[objectName]) {
            window.SFDMU.Rca.loadMoreMasterRecords(objectName, false);
        }
    };
    
    /**
     * Load more master records
     */
    window.SFDMU.Rca.loadMoreMasterRecords = function(objectName, append) {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const isRcaModalClosed = window.SFDMU.Rca.getIsRcaModalClosed();
        
        if (isRcaModalClosed || !rcaMasterSelectionState.phaseNumber) return;
        
        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        if (rcaMasterSelectionState.loadingMore[objectName]) return;
        
        rcaMasterSelectionState.loadingMore[objectName] = true;
        
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        const offset = append ? (obj.totalRequested || 0) : 0;
        const searchTerm = rcaMasterSelectionState.searchTerms[objectName] || '';
        
        // Use the same command as CPQ but with RCA mode detection
        vscode.postMessage({
            command: 'getCpqMasterRecords',
            objectName: objectName,
            phaseNumber: rcaMasterSelectionState.phaseNumber,
            orgAlias: sourceOrgAlias,
            externalIdField: obj.externalIdField,
            offset: offset,
            limit: RECORDS_PER_PAGE,
            searchTerm: searchTerm,
            isSearch: !!searchTerm,
            append: append,
            mode: 'rca' // Indicate this is for RCA mode
        });
    };
    
    /**
     * Render master selection content
     */
    window.SFDMU.Rca.renderMasterSelectionContent = function(objectName, records) {
        const contentEl = document.getElementById('master-selection-content');
        if (!contentEl) return;
        
        const loadingEl = document.getElementById('master-selection-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        
        // Hide all existing content
        Array.from(contentEl.children).forEach(child => {
            if (child.id !== 'master-selection-loading') {
                child.style.display = 'none';
            }
        });
        
        if (!objectName) {
            contentEl.innerHTML = '<p class="info-text">No objects to select for this phase.</p>';
            return;
        }
        
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        // Create or get container for this object
        let containerEl = document.getElementById(`master-selection-list-${objectName}`);
        if (!containerEl) {
            containerEl = document.createElement('div');
            containerEl.id = `master-selection-list-${objectName}`;
            containerEl.className = 'master-selection-list';
            contentEl.appendChild(containerEl);
        }
        containerEl.style.display = 'block';
        
        window.SFDMU.Rca.renderMasterSelectionRecords(objectName, records);
    };
    
    /**
     * Render master selection records table
     */
    window.SFDMU.Rca.renderMasterSelectionRecords = function(objectName, records) {
        const containerEl = document.getElementById(`master-selection-list-${objectName}`);
        if (!containerEl) return;
        
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        const displayConfig = window.SFDMU.Rca && window.SFDMU.Rca.getDisplayFieldForObject ? 
            window.SFDMU.Rca.getDisplayFieldForObject(objectName, obj.externalIdField) : null;
        
        // Build table
        const table = document.createElement('table');
        table.className = 'master-selection-table';
        
        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const selectHeader = document.createElement('th');
        selectHeader.style.width = '40px';
        headerRow.appendChild(selectHeader);
        
        const nameHeader = document.createElement('th');
        nameHeader.textContent = 'Record';
        nameHeader.style.textAlign = 'left';
        headerRow.appendChild(nameHeader);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = document.createElement('tbody');
        
        records.forEach(record => {
            const row = document.createElement('tr');
            
            // Checkbox
            const selectCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            
            // Build external ID from record
            let recordExternalId = '';
            if (displayConfig && displayConfig.isComposite) {
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
                const field = obj.externalIdField;
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
            
            const selectedSet = rcaMasterSelectionState.selectedRecords[objectName] || new Set();
            checkbox.checked = selectedSet.has(recordExternalId);
            
            checkbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                if (!rcaMasterSelectionState.selectedRecords[objectName]) {
                    rcaMasterSelectionState.selectedRecords[objectName] = new Set();
                }
                if (!rcaMasterSelectionState.selectedRecordIds[objectName]) {
                    rcaMasterSelectionState.selectedRecordIds[objectName] = new Map();
                }
                
                if (isChecked) {
                    rcaMasterSelectionState.selectedRecords[objectName].add(recordExternalId);
                    if (record.Id) {
                        rcaMasterSelectionState.selectedRecordIds[objectName].set(recordExternalId, record.Id);
                    }
                } else {
                    rcaMasterSelectionState.selectedRecords[objectName].delete(recordExternalId);
                    rcaMasterSelectionState.selectedRecordIds[objectName].delete(recordExternalId);
                }
                
                window.SFDMU.Rca.updateMasterSelectionCount();
                window.SFDMU.Rca.renderMasterSelectionTabs(rcaMasterSelectionState.selectableObjects.map(o => ({
                    objectName: o.objectName,
                    externalIdField: o.externalIdField
                })));
            });
            
            selectCell.appendChild(checkbox);
            row.appendChild(selectCell);
            
            // Record name
            const nameCell = document.createElement('td');
            const displayValue = displayConfig ? displayConfig.formatValue(record) : (record.Name || recordExternalId || record.Id);
            nameCell.textContent = displayValue;
            row.appendChild(nameCell);
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        containerEl.innerHTML = '';
        containerEl.appendChild(table);
        
        // Add search and load more functionality
        window.SFDMU.Rca.renderMasterSelectionControls(objectName, containerEl);
    };
    
    /**
     * Render master selection controls (search, load more)
     */
    window.SFDMU.Rca.renderMasterSelectionControls = function(objectName, containerEl) {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const rcaPendingTimeouts = window.SFDMU.Rca.getRcaPendingTimeouts();
        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        // Check if search container already exists
        const existingSearchContainer = document.getElementById(`master-selection-search-${objectName}`);
        if (existingSearchContainer) {
            // Search container already exists, just update the load more button
            const existingLoadMoreContainer = document.getElementById(`master-selection-loadmore-${objectName}`);
            if (existingLoadMoreContainer) {
                existingLoadMoreContainer.remove();
            }
        } else {
            // Add search box
            const searchContainer = document.createElement('div');
            searchContainer.id = `master-selection-search-${objectName}`;
            searchContainer.style.marginBottom = '12px';
            searchContainer.style.display = 'flex';
            searchContainer.style.gap = '8px';
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'text-input';
            searchInput.placeholder = 'Search records...';
            searchInput.value = rcaMasterSelectionState.searchTerms[objectName] || '';
            searchInput.style.flex = '1';
            
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const term = e.target.value.trim();
                rcaMasterSelectionState.searchTerms[objectName] = term;
                
                searchTimeout = setTimeout(() => {
                    if (term) {
                        window.SFDMU.Rca.loadMoreMasterRecords(objectName, false);
                    } else {
                        // Clear search - reload all
                        obj.records = [];
                        obj.loadedCount = 0;
                        obj.totalRequested = 0;
                        obj.allRecordsLoaded = false;
                        window.SFDMU.Rca.loadMoreMasterRecords(objectName, false);
                    }
                }, 500);
                rcaPendingTimeouts.add(searchTimeout);
            });
            
            searchContainer.appendChild(searchInput);
            containerEl.parentElement.insertBefore(searchContainer, containerEl);
        }
        
        // Add load more button if needed
        // Remove existing load more button if it exists
        const existingLoadMoreContainer = document.getElementById(`master-selection-loadmore-${objectName}`);
        if (existingLoadMoreContainer) {
            existingLoadMoreContainer.remove();
        }
        
        if (!obj.allRecordsLoaded && !rcaMasterSelectionState.searchTerms[objectName]) {
            const loadMoreContainer = document.createElement('div');
            loadMoreContainer.id = `master-selection-loadmore-${objectName}`;
            loadMoreContainer.style.marginTop = '12px';
            loadMoreContainer.style.textAlign = 'center';
            
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'btn-secondary';
            loadMoreBtn.textContent = 'Load More';
            loadMoreBtn.disabled = rcaMasterSelectionState.loadingMore[objectName];
            loadMoreBtn.addEventListener('click', () => {
                window.SFDMU.Rca.loadMoreMasterRecords(objectName, true);
            });
            
            loadMoreContainer.appendChild(loadMoreBtn);
            containerEl.parentElement.appendChild(loadMoreContainer);
        }
    };
    
    /**
     * Update master selection count
     */
    window.SFDMU.Rca.updateMasterSelectionCount = function() {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        let totalSelected = 0;
        Object.values(rcaMasterSelectionState.selectedRecords).forEach(set => {
            totalSelected += set.size;
        });
        
        const countEl = document.getElementById('master-selection-count');
        if (countEl) {
            countEl.textContent = `${totalSelected} record${totalSelected !== 1 ? 's' : ''} selected`;
        }
    };
    
    /**
     * Save master selections
     */
    window.SFDMU.Rca.saveMasterSelections = function(closeModal = false) {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        if (!rcaMasterSelectionState.phaseNumber) return;

        if (!State.currentConfig.selectedMasterRecords) {
            State.currentConfig.selectedMasterRecords = {};
        }

        const phaseSelections = {};
        Object.keys(rcaMasterSelectionState.selectedRecords).forEach(objectName => {
            const set = rcaMasterSelectionState.selectedRecords[objectName];
            if (set.size > 0) {
                const idMap = rcaMasterSelectionState.selectedRecordIds[objectName] || new Map();
                const selections = Array.from(set).map(externalIdValue => {
                    const id = idMap.get(externalIdValue) || '';
                    return {
                        externalId: externalIdValue,
                        id: id
                    };
                });
                phaseSelections[objectName] = selections;
            }
        });

        if (Object.keys(phaseSelections).length > 0) {
            State.currentConfig.selectedMasterRecords[rcaMasterSelectionState.phaseNumber] = phaseSelections;
        } else {
            delete State.currentConfig.selectedMasterRecords[rcaMasterSelectionState.phaseNumber];
            if (Object.keys(State.currentConfig.selectedMasterRecords).length === 0) {
                State.currentConfig.selectedMasterRecords = undefined;
            }
        }

        // Save excluded objects
        if (!State.currentConfig.excludedObjectsByPhase) {
            State.currentConfig.excludedObjectsByPhase = {};
        }
        const excludedArray = Array.from(rcaMasterSelectionState.excludedObjects);
        if (excludedArray.length > 0) {
            State.currentConfig.excludedObjectsByPhase[rcaMasterSelectionState.phaseNumber] = excludedArray;
        } else {
            delete State.currentConfig.excludedObjectsByPhase[rcaMasterSelectionState.phaseNumber];
            if (Object.keys(State.currentConfig.excludedObjectsByPhase).length === 0) {
                State.currentConfig.excludedObjectsByPhase = undefined;
            }
        }

        // Save config
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }
        vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });

        // Re-render phases to show selection count
        if (window.SFDMU.Rca && window.SFDMU.Rca.renderIndividualPhases) {
            window.SFDMU.Rca.renderIndividualPhases();
        }

        if (closeModal) {
            window.SFDMU.Rca.closeMasterSelectionModal();
        }
    };
    
    /**
     * Close master selection modal
     */
    window.SFDMU.Rca.closeMasterSelectionModal = function() {
        window.SFDMU.Rca.setIsRcaModalClosed(true);
        
        const rcaPendingTimeouts = window.SFDMU.Rca.getRcaPendingTimeouts();
        rcaPendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        rcaPendingTimeouts.clear();
        
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        Object.keys(rcaMasterSelectionState.loadingMore || {}).forEach(objectName => {
            rcaMasterSelectionState.loadingMore[objectName] = false;
        });
        
        const modal = document.getElementById('cpq-master-selection-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // Clear state
        rcaMasterSelectionState.phaseNumber = null;
        rcaMasterSelectionState.selectableObjects = [];
        rcaMasterSelectionState.selectedRecords = {};
        rcaMasterSelectionState.selectedRecordIds = {};
        rcaMasterSelectionState.currentTab = null;
        rcaMasterSelectionState.isLoading = false;
        rcaMasterSelectionState.searchTerms = {};
        rcaMasterSelectionState.loadingMore = {};
        rcaMasterSelectionState.excludedObjects = new Set();
        
        setTimeout(() => {
            window.SFDMU.Rca.setIsRcaModalClosed(false);
        }, 100);
    };
    
    /**
     * Handle master records response from backend
     */
    window.SFDMU.Rca.handleMasterRecords = function(objectName, records, phaseNumber, isSearch = false, append = false) {
        const rcaMasterSelectionState = window.SFDMU.Rca.getMasterSelectionState();
        const isRcaModalClosed = window.SFDMU.Rca.getIsRcaModalClosed();
        
        if (isRcaModalClosed || rcaMasterSelectionState.phaseNumber !== phaseNumber) return;

        const obj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        const searchTerm = rcaMasterSelectionState.searchTerms[objectName];
        
        if (obj) {
            if (isSearch) {
                obj.records = records || [];
                obj.loadedCount = obj.records.length;
                obj.totalRequested = records ? records.length : 0;
                obj.allRecordsLoaded = true;
            } else if (append) {
                const existingRecords = obj.records || [];
                const existingIds = new Set(existingRecords.map(r => r.Id));
                const newRecords = (records || []).filter(r => r.Id && !existingIds.has(r.Id));
                
                obj.totalRequested = (obj.totalRequested || 0) + (records ? records.length : 0);
                
                if (newRecords.length === 0) {
                    obj.allRecordsLoaded = true;
                } else {
                    obj.records = [...existingRecords, ...newRecords];
                    obj.loadedCount = obj.records.length;
                    if (records.length < RECORDS_PER_PAGE) {
                        obj.allRecordsLoaded = true;
                    }
                }
            } else {
                const newRecords = (records || []).filter(r => r.Id);
                obj.totalRequested = (obj.totalRequested || 0) + (newRecords.length);
                
                if (obj.records && obj.records.length > 0) {
                    const existingIds = new Set(obj.records.map(r => r.Id));
                    const uniqueNew = newRecords.filter(r => r.Id && !existingIds.has(r.Id));
                    obj.records = [...obj.records, ...uniqueNew];
                } else {
                    obj.records = newRecords;
                }
                obj.loadedCount = obj.records.length;
                obj.allRecordsLoaded = newRecords.length < RECORDS_PER_PAGE;
            }
        } else {
            const includeProduct2 = State.currentConfig.rcaIncludeProduct2 || false;
            const selectableObjects = window.SFDMU.Rca.getSelectableObjectsForPhase(phaseNumber, includeProduct2);
            const found = selectableObjects.find(o => o.objectName === objectName);
            if (found) {
                const newObj = {
                    objectName: found.objectName,
                    externalIdField: found.externalIdField,
                    records: records || [],
                    loadedCount: records.length,
                    totalRequested: records ? records.length : 0,
                    allRecordsLoaded: isSearch || records.length < RECORDS_PER_PAGE
                };
                rcaMasterSelectionState.selectableObjects.push(newObj);
            }
        }

        rcaMasterSelectionState.loadingMore[objectName] = false;
        
        const currentObj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (currentObj) {
            const recordsToRender = currentObj.records || [];
            
            if (rcaMasterSelectionState.currentTab === objectName) {
                const containerEl = document.getElementById(`master-selection-list-${objectName}`);
                if (containerEl) {
                    window.SFDMU.Rca.renderMasterSelectionRecords(objectName, recordsToRender);
                } else {
                    window.SFDMU.Rca.renderMasterSelectionContent(objectName, recordsToRender);
                }
            } else if (!rcaMasterSelectionState.currentTab) {
                window.SFDMU.Rca.switchMasterSelectionTab(objectName);
            }
        }
        
        if (!isSearch) {
            const includeProduct2 = State.currentConfig.rcaIncludeProduct2 || false;
            const expectedObjects = window.SFDMU.Rca.getSelectableObjectsForPhase(phaseNumber, includeProduct2);
            const allInitialLoaded = expectedObjects.every(expectedObj => {
                const loadedObj = rcaMasterSelectionState.selectableObjects.find(o => o.objectName === expectedObj.objectName);
                return loadedObj && loadedObj.records !== undefined && loadedObj.records.length > 0;
            });
            
            if (allInitialLoaded) {
                rcaMasterSelectionState.isLoading = false;
                const loadingEl = document.getElementById('master-selection-loading');
                if (loadingEl) loadingEl.style.display = 'none';
            }
        } else {
            rcaMasterSelectionState.isLoading = false;
            const loadingEl = document.getElementById('master-selection-loading');
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

    /**
     * Setup master selection modal event handlers
     */
    window.SFDMU.Rca.setupMasterSelectionModalHandlers = function() {
        const closeBtn = document.getElementById('cpq-master-selection-close');
        const cancelBtn = document.getElementById('master-selection-cancel');
        const saveBtn = document.getElementById('master-selection-save');
        const saveAndCloseBtn = document.getElementById('master-selection-save-close');

        if (closeBtn && window.SFDMU.Rca && window.SFDMU.Rca.closeMasterSelectionModal) {
            closeBtn.addEventListener('click', window.SFDMU.Rca.closeMasterSelectionModal);
        }
        if (cancelBtn && window.SFDMU.Rca && window.SFDMU.Rca.closeMasterSelectionModal) {
            cancelBtn.addEventListener('click', window.SFDMU.Rca.closeMasterSelectionModal);
        }
        if (saveBtn && window.SFDMU.Rca && window.SFDMU.Rca.saveMasterSelections) {
            saveBtn.addEventListener('click', () => {
                window.SFDMU.Rca.saveMasterSelections(false); // Save without closing
            });
        }
        if (saveAndCloseBtn && window.SFDMU.Rca && window.SFDMU.Rca.saveMasterSelections) {
            saveAndCloseBtn.addEventListener('click', () => {
                window.SFDMU.Rca.saveMasterSelections(true); // Save and close
            });
        }
    };
    
    // Setup handlers when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.SFDMU.Rca.setupMasterSelectionModalHandlers);
    } else {
        window.SFDMU.Rca.setupMasterSelectionModalHandlers();
    }
})();
