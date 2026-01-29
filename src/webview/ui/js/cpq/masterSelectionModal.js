/**
 * CPQ Master Selection Modal
 * Functions for managing the master record selection modal UI
 */

(function() {
    'use strict';

    console.log('[Master Selection Modal] Module loading...');
    
    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    const masterSelectionState = window.masterSelectionModalState || {};
    const RECORDS_PER_PAGE = window.SFDMU.Cpq.RECORDS_PER_PAGE || 100;
    
    console.log('[Master Selection Modal] Module loaded, dependencies:', {
        vscode: !!vscode,
        State: !!State,
        masterSelectionState: !!masterSelectionState
    });
    
    // Track pending timeouts and query cancellation
    const pendingTimeouts = new Set();
    let isModalClosed = false;

    // Internal helper functions (not exposed)
    function renderMasterSelectionTabs(selectableObjects) {
        const tabsContainer = document.getElementById('master-selection-tabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        selectableObjects.forEach(obj => {
            const tab = document.createElement('button');
            tab.className = 'master-selection-tab';
            
            // Check if object is excluded
            const isExcluded = masterSelectionState.excludedObjects.has(obj.objectName);
            
            // Get selection count for this object
            const selectedSet = masterSelectionState.selectedRecords[obj.objectName] || new Set();
            const selectedCount = selectedSet.size;
            
            // Create tab content with object name and count
            const tabContent = document.createElement('span');
            tabContent.textContent = obj.objectName;
            
            // Apply strikethrough if excluded
            if (isExcluded) {
                tabContent.style.textDecoration = 'line-through';
                tabContent.style.opacity = '0.6';
                tab.classList.add('excluded');
            }
            
            // Add count badge
            if (selectedCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'master-selection-tab-badge';
                badge.textContent = selectedCount;
                badge.title = `${selectedCount} record${selectedCount !== 1 ? 's' : ''} selected`;
                tab.appendChild(tabContent);
                tab.appendChild(badge);
            } else {
                // Show appropriate indicator based on exclusion status
                if (isExcluded) {
                    // Show exclusion icon
                    const excludeIcon = document.createElement('span');
                    excludeIcon.className = 'codicon codicon-circle-slash';
                    excludeIcon.style.color = 'var(--vscode-errorForeground)';
                    excludeIcon.style.marginLeft = '6px';
                    excludeIcon.title = 'This object is excluded from migration';
                    tab.appendChild(tabContent);
                    tab.appendChild(excludeIcon);
                } else {
                    // Show warning indicator when no records selected
                    const warningIcon = document.createElement('span');
                    warningIcon.className = 'codicon codicon-warning';
                    warningIcon.style.color = 'var(--vscode-errorForeground)';
                    warningIcon.style.marginLeft = '6px';
                    warningIcon.title = 'No records selected - this object will not be migrated';
                    tab.appendChild(tabContent);
                    tab.appendChild(warningIcon);
                }
            }
            
            tab.dataset.objectName = obj.objectName;
            if (masterSelectionState.currentTab === obj.objectName) {
                tab.classList.add('active');
            }
            
            // Add visual styling for objects with no selections (if not excluded)
            if (selectedCount === 0 && !isExcluded) {
                tab.classList.add('no-selections');
            }
            
            tab.addEventListener('click', () => {
                window.SFDMU.Cpq.switchMasterSelectionTab(obj.objectName);
            });
            tabsContainer.appendChild(tab);
        });
    }

    function switchMasterSelectionTab(objectName) {
        masterSelectionState.currentTab = objectName;

        // Update tab active state
        const tabs = document.querySelectorAll('.master-selection-tab');
        tabs.forEach(tab => {
            if (tab.dataset.objectName === objectName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Find the object and render its content
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        const searchTerm = masterSelectionState.searchTerms[objectName];
        
        // Always render the content first (this sets up the tab structure)
        const recordsToRender = (obj && obj.records) ? obj.records : [];
        renderMasterSelectionContent(objectName, recordsToRender);
        
        // Then check if we need to load records
        if (!searchTerm && (!obj || !obj.records || obj.records.length === 0) && !masterSelectionState.loadingMore[objectName]) {
            // No records loaded yet and not loading - load initial batch
            loadMoreMasterRecords(objectName, false);
        }
    }

    function renderMasterSelectionContent(objectName, records) {
        const contentEl = document.getElementById('master-selection-content');
        if (!contentEl) return;

        // Hide loading
        const loadingEl = document.getElementById('master-selection-loading');
        if (loadingEl) loadingEl.style.display = 'none';

        // Remove existing tab content
        const existingContent = contentEl.querySelectorAll('.master-selection-tab-content');
        existingContent.forEach(el => el.remove());

        // Create new tab content
        const tabContent = document.createElement('div');
        tabContent.className = 'master-selection-tab-content';
        if (masterSelectionState.currentTab === objectName) {
            tabContent.classList.add('active');
        }
        tabContent.dataset.objectName = objectName;

        if (!objectName) {
            tabContent.innerHTML = '<p class="info-text">No selectable objects for this phase.</p>';
            contentEl.appendChild(tabContent);
            updateMasterSelectionCount();
            return;
        }

        // Create "Do not migrate" button action bar
        const actionBar = document.createElement('div');
        actionBar.className = 'master-selection-action-bar';
        actionBar.style.display = 'flex';
        actionBar.style.justifyContent = 'flex-end';
        actionBar.style.marginBottom = '12px';
        actionBar.style.gap = '8px';
        
        const doNotMigrateButton = document.createElement('button');
        doNotMigrateButton.type = 'button';
        doNotMigrateButton.className = 'btn-secondary';
        const isExcluded = masterSelectionState.excludedObjects.has(objectName);
        if (isExcluded) {
            doNotMigrateButton.classList.add('excluded');
            doNotMigrateButton.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground)';
            doNotMigrateButton.style.color = 'var(--vscode-errorForeground)';
            doNotMigrateButton.style.borderColor = 'var(--vscode-errorForeground)';
        }
        doNotMigrateButton.innerHTML = `<span class="codicon ${isExcluded ? 'codicon-close' : 'codicon-circle-slash'}"></span> ${isExcluded ? 'Migrate' : 'Do not migrate'} ${objectName} records`;
        doNotMigrateButton.title = isExcluded 
            ? `Click to include ${objectName} records in migration` 
            : `Click to exclude ${objectName} records from migration`;
        
        doNotMigrateButton.addEventListener('click', () => {
            const wasExcluded = masterSelectionState.excludedObjects.has(objectName);
            
            if (wasExcluded) {
                // Unmark as excluded
                masterSelectionState.excludedObjects.delete(objectName);
            } else {
                // Mark as excluded - clear any existing selections
                masterSelectionState.excludedObjects.add(objectName);
                // Clear selections for this object
                if (masterSelectionState.selectedRecords[objectName]) {
                    masterSelectionState.selectedRecords[objectName].clear();
                }
                if (masterSelectionState.selectedRecordIds[objectName]) {
                    masterSelectionState.selectedRecordIds[objectName].clear();
                }
            }
            
            // Re-render the content to update button state and clear selections if needed
            const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
            const recordsToRender = (obj && obj.records) ? obj.records : [];
            renderMasterSelectionContent(objectName, recordsToRender);
            
            // Update tabs to reflect exclusion status
            renderMasterSelectionTabs(masterSelectionState.selectableObjects);
            updateMasterSelectionCount();
        });
        
        actionBar.appendChild(doNotMigrateButton);
        tabContent.appendChild(actionBar);

        // Create search input with Filters button
        const searchContainer = document.createElement('div');
        searchContainer.className = 'master-selection-search';
        
        const searchInputWrapper = document.createElement('div');
        searchInputWrapper.className = 'master-selection-search-wrapper';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search records...';
        searchInput.className = 'text-input';
        // Restore previous search term if any
        if (masterSelectionState.searchTerms[objectName]) {
            searchInput.value = masterSelectionState.searchTerms[objectName];
        }
        // Debounce search input to avoid excessive queries
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            masterSelectionState.searchTerms[objectName] = searchTerm;
            
            // Clear any pending search
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                pendingTimeouts.delete(searchTimeout);
            }
            
            if (searchTerm) {
                // Debounce search query - wait 500ms after user stops typing
                searchTimeout = setTimeout(() => {
                    pendingTimeouts.delete(searchTimeout);
                    searchTimeout = null;
                    if (!isModalClosed) {
                        queryMasterRecordsWithSearch(objectName, searchTerm);
                    }
                }, 500);
                pendingTimeouts.add(searchTimeout);
            } else {
                // Clear search immediately - show loaded records from state
                const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
                if (obj && obj.records && obj.records.length > 0) {
                    // Re-render with records from state
                    renderMasterSelectionRecords(objectName, obj.records);
                } else {
                    // No records loaded yet, load initial batch
                    loadMoreMasterRecords(objectName, false);
                }
            }
        });
        searchInputWrapper.appendChild(searchInput);
        
        // Add Filters button
        const filtersButton = document.createElement('button');
        filtersButton.className = 'master-selection-filters-button';
        filtersButton.type = 'button';
        filtersButton.title = 'Edit Filters';
        filtersButton.innerHTML = '<span class="codicon codicon-settings"></span>';
        filtersButton.addEventListener('click', () => {
            const filtersSection = document.getElementById(`master-selection-filters-${objectName}`);
            if (filtersSection) {
                const isVisible = filtersSection.style.display !== 'none';
                filtersSection.style.display = isVisible ? 'none' : 'block';
                if (!isVisible) {
                    // Load field metadata if not already loaded
                    loadFieldMetadataForFilters(objectName);
                    // Render filters if they exist
                    renderFilterSection(objectName);
                }
                // Update button active state
                if (isVisible) {
                    filtersButton.classList.remove('active');
                } else {
                    filtersButton.classList.add('active');
                }
            }
        });
        searchInputWrapper.appendChild(filtersButton);
        
        searchContainer.appendChild(searchInputWrapper);
        
        // Create filter section (initially hidden)
        const filtersSection = document.createElement('div');
        filtersSection.className = 'master-selection-filters';
        filtersSection.id = `master-selection-filters-${objectName}`;
        filtersSection.style.display = 'none';
        searchContainer.appendChild(filtersSection);
        
        tabContent.appendChild(searchContainer);

        // Create table container
        const tableContainer = document.createElement('div');
        tableContainer.className = 'master-selection-list';
        tableContainer.id = `master-selection-list-${objectName}`;
        
        // Add scroll listener for lazy loading with throttling
        let scrollTimeout;
        tableContainer.addEventListener('scroll', () => {
            // Don't process scroll events if modal is closed
            if (isModalClosed) return;
            
            // Throttle scroll events to avoid excessive checks
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                if (isModalClosed) return;
                
                const container = tableContainer;
                const scrollTop = container.scrollTop;
                const scrollHeight = container.scrollHeight;
                const clientHeight = container.clientHeight;
                
                // Load more when near bottom (within 200px for better UX)
                const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                if (distanceFromBottom < 200) {
                    const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
                    const searchTerm = masterSelectionState.searchTerms[objectName];
                    if (!searchTerm && obj && !obj.allRecordsLoaded && !masterSelectionState.loadingMore[objectName] && !isModalClosed) {
                        loadMoreMasterRecords(objectName, true);
                    }
                }
            }, 100); // Throttle to check every 100ms max
        });
        
        tabContent.appendChild(tableContainer);
        
        // Append tab content to DOM first so container exists when we render records
        contentEl.appendChild(tabContent);

        // Get the actual records from state (always use state, not the parameter which may be stale)
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        // Always prefer records from state object, fall back to parameter only if state doesn't have records yet
        const actualRecords = (obj && obj.records) ? obj.records : (records || []);
        
        // Always render records - if empty, show empty state or loading
        renderMasterSelectionRecords(objectName, actualRecords);
        
        // If no records and not searching, trigger initial load (but only if this is the active tab)
        if (actualRecords.length === 0 && masterSelectionState.currentTab === objectName) {
            const searchTerm = masterSelectionState.searchTerms[objectName];
            if (!searchTerm && (!obj || !obj.records || obj.records.length === 0) && !masterSelectionState.loadingMore[objectName]) {
                // No records loaded yet and no search - load initial batch
                loadMoreMasterRecords(objectName, false);
            }
        }

        updateMasterSelectionCount();
    }

    function renderMasterSelectionRecords(objectName, records) {
        const containerEl = document.getElementById(`master-selection-list-${objectName}`);
        if (!containerEl) {
            // Container doesn't exist yet - this means the tab content hasn't been created
            // This can happen if records arrive before the tab is fully rendered
            // In this case, we need to ensure the tab content is created first
            if (masterSelectionState.currentTab === objectName) {
                // Re-render the full content to ensure container exists
                const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
                const recordsToUse = (obj && obj.records) ? obj.records : records;
                renderMasterSelectionContent(objectName, recordsToUse);
                return;
            }
            return;
        }

        containerEl.innerHTML = '';

        if (records.length === 0) {
            const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
            const searchTerm = masterSelectionState.searchTerms[objectName];
            const isLoading = masterSelectionState.loadingMore[objectName];
            
            if (isLoading) {
                containerEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><span class="codicon codicon-loading codicon-modifier-spin" style="font-size: 24px; color: var(--vscode-foreground);"></span></div>';
            } else if (searchTerm) {
                containerEl.innerHTML = '<p class="info-text" style="padding: 20px; text-align: center;">No records found matching your search.</p>';
            } else if (obj && obj.records && obj.records.length === 0 && !obj.allRecordsLoaded) {
                containerEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><span class="codicon codicon-loading codicon-modifier-spin" style="font-size: 24px; color: var(--vscode-foreground);"></span></div>';
            } else {
                containerEl.innerHTML = '<p class="info-text" style="padding: 20px; text-align: center;">No records found.</p>';
            }
            return;
        }

        const selectedSet = masterSelectionState.selectedRecords[objectName] || new Set();
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;

        // Get display field configuration
        const displayConfig = window.SFDMU.Cpq.getDisplayFieldForObject(objectName, obj.externalIdField);

        // Get sort state for this object - default to LastModifiedDate DESC
        const sortState = masterSelectionState.sortState[objectName] || { column: 'lastModifiedDate', direction: 'desc' };
        
        // Ensure sortState is set if it wasn't already
        if (!masterSelectionState.sortState[objectName]) {
            masterSelectionState.sortState[objectName] = sortState;
        }
        
        // Sort records
        const sortedRecords = [...records].sort((a, b) => {
            if (!sortState.column) return 0;
            
            let aVal, bVal;
            if (sortState.column === 'name') {
                // Use the display value for sorting
                aVal = displayConfig.formatValue(a);
                bVal = displayConfig.formatValue(b);
            } else if (sortState.column === 'lastModifiedDate') {
                // Parse dates for proper comparison
                aVal = a.LastModifiedDate ? new Date(a.LastModifiedDate).getTime() : 0;
                bVal = b.LastModifiedDate ? new Date(b.LastModifiedDate).getTime() : 0;
            } else if (sortState.column === 'lastModifiedBy') {
                aVal = (a.LastModifiedBy && a.LastModifiedBy.Name) || '';
                bVal = (b.LastModifiedBy && b.LastModifiedBy.Name) || '';
            } else {
                return 0;
            }
            
            // Compare values
            if (aVal < bVal) return sortState.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Create table
        const table = document.createElement('table');
        table.className = 'master-selection-table';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
            // Note: Expand column removed - child records are not displayed in the modal
        
        // Checkbox column with "Select All" functionality
        const checkboxHeader = document.createElement('th');
        checkboxHeader.style.width = '40px';
        checkboxHeader.style.textAlign = 'center';
        
        // Calculate selection state for all records
        let allSelected = true;
        let someSelected = false;
        let noneSelected = true;
        
        sortedRecords.forEach(record => {
            // Build external ID value (same logic as in row creation)
            let externalIdValue = '';
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
                externalIdValue = values.join('|');
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
                    externalIdValue = value || '';
                } else {
                    externalIdValue = record[field] || record.Id || '';
                }
            }
            
            const isSelected = selectedSet.has(externalIdValue);
            if (isSelected) {
                someSelected = true;
                noneSelected = false;
            } else {
                allSelected = false;
            }
        });
        
        // Create select all checkbox
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.checked = allSelected && sortedRecords.length > 0;
        selectAllCheckbox.indeterminate = someSelected && !allSelected;
        selectAllCheckbox.title = allSelected ? 'Deselect all' : 'Select all';
        selectAllCheckbox.style.cursor = 'pointer';
        
        selectAllCheckbox.addEventListener('change', (e) => {
            const shouldSelectAll = e.target.checked;
            const selectedSet = masterSelectionState.selectedRecords[objectName] || new Set();
            
            sortedRecords.forEach(record => {
                // Build external ID value (same logic as above)
                let externalIdValue = '';
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
                    externalIdValue = values.join('|');
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
                        externalIdValue = value || '';
                    } else {
                        externalIdValue = record[field] || record.Id || '';
                    }
                }
                
                if (shouldSelectAll) {
                    selectedSet.add(externalIdValue);
                    // Store the Id for this external ID value
                    if (!masterSelectionState.selectedRecordIds[objectName]) {
                        masterSelectionState.selectedRecordIds[objectName] = new Map();
                    }
                    if (record.Id) {
                        masterSelectionState.selectedRecordIds[objectName].set(externalIdValue, record.Id);
                    }
                } else {
                    selectedSet.delete(externalIdValue);
                    // Remove the Id mapping
                    if (masterSelectionState.selectedRecordIds[objectName]) {
                        masterSelectionState.selectedRecordIds[objectName].delete(externalIdValue);
                    }
                }
            });
            
            masterSelectionState.selectedRecords[objectName] = selectedSet;
            updateMasterSelectionCount();
            
            // Re-render to update all checkboxes
            renderMasterSelectionRecords(objectName, records);
            
            // If this object has children, query child records
            if (window.SFDMU.Cpq.hasChildObjects(objectName)) {
                window.SFDMU.Cpq.queryChildRecords(objectName);
            }
        });
        
        checkboxHeader.appendChild(selectAllCheckbox);
        headerRow.appendChild(checkboxHeader);
        
        // Name column
        const nameHeader = document.createElement('th');
        nameHeader.className = 'sortable';
        nameHeader.textContent = 'Name';
        nameHeader.dataset.column = 'name';
        if (sortState.column === 'name') {
            nameHeader.classList.add(`sort-${sortState.direction}`);
        }
        nameHeader.addEventListener('click', () => {
            const currentSort = masterSelectionState.sortState[objectName] || { column: null, direction: 'asc' };
            if (currentSort.column === 'name') {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = 'name';
                currentSort.direction = 'asc';
            }
            masterSelectionState.sortState[objectName] = currentSort;
            renderMasterSelectionRecords(objectName, records);
        });
        headerRow.appendChild(nameHeader);
        
        // LastModifiedDate column
        const dateHeader = document.createElement('th');
        dateHeader.className = 'sortable';
        dateHeader.textContent = 'Last Modified Date';
        dateHeader.dataset.column = 'lastModifiedDate';
        if (sortState.column === 'lastModifiedDate') {
            dateHeader.classList.add(`sort-${sortState.direction}`);
        }
        dateHeader.addEventListener('click', () => {
            const currentSort = masterSelectionState.sortState[objectName] || { column: 'lastModifiedDate', direction: 'desc' };
            if (currentSort.column === 'lastModifiedDate') {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = 'lastModifiedDate';
                currentSort.direction = 'desc'; // Default to DESC for date
            }
            masterSelectionState.sortState[objectName] = currentSort;
            renderMasterSelectionRecords(objectName, records);
        });
        headerRow.appendChild(dateHeader);
        
        // LastModifiedBy column
        const byHeader = document.createElement('th');
        byHeader.className = 'sortable';
        byHeader.textContent = 'Last Modified By';
        byHeader.dataset.column = 'lastModifiedBy';
        if (sortState.column === 'lastModifiedBy') {
            byHeader.classList.add(`sort-${sortState.direction}`);
        }
        byHeader.addEventListener('click', () => {
            const currentSort = masterSelectionState.sortState[objectName] || { column: 'lastModifiedDate', direction: 'desc' };
            if (currentSort.column === 'lastModifiedBy') {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = 'lastModifiedBy';
                currentSort.direction = 'asc';
            }
            masterSelectionState.sortState[objectName] = currentSort;
            renderMasterSelectionRecords(objectName, records);
        });
        headerRow.appendChild(byHeader);
        
        // Actions column (for view record link)
        const actionsHeader = document.createElement('th');
        actionsHeader.style.width = '50px';
        actionsHeader.textContent = '';
        headerRow.appendChild(actionsHeader);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        
        sortedRecords.forEach(record => {
            const row = document.createElement('tr');
            row.dataset.recordId = record.Id;
            
            // Get the external ID value for selection
            // For composite keys, build the full composite value (e.g., "TemplateName|ContentName")
            // For single fields, use the field value
            let externalIdValue = '';
            if (displayConfig.isComposite) {
                // For composite keys, build the full composite value
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
                // Join with | separator for composite keys
                externalIdValue = values.join('|');
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
                    externalIdValue = value || '';
                } else {
                    externalIdValue = record[field] || record.Id || '';
                }
            }

            const isSelected = selectedSet.has(externalIdValue);
            if (isSelected) {
                row.classList.add('selected');
                // Populate the Id map for pre-selected records
                if (!masterSelectionState.selectedRecordIds[objectName]) {
                    masterSelectionState.selectedRecordIds[objectName] = new Map();
                }
                if (record.Id) {
                    masterSelectionState.selectedRecordIds[objectName].set(externalIdValue, record.Id);
                }
            }

            // Checkbox cell
            const checkboxCell = document.createElement('td');
            
            // Note: Expand button removed - child records are not displayed in the modal
            
            const isExcluded = masterSelectionState.excludedObjects.has(objectName);
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isSelected;
            checkbox.disabled = isExcluded;
            if (isExcluded) {
                checkbox.title = 'This object is excluded from migration';
            }
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedSet.add(externalIdValue);
                    row.classList.add('selected');
                    
                    // Store the Id for this external ID value
                    if (!masterSelectionState.selectedRecordIds[objectName]) {
                        masterSelectionState.selectedRecordIds[objectName] = new Map();
                    }
                    if (record.Id) {
                        masterSelectionState.selectedRecordIds[objectName].set(externalIdValue, record.Id);
                    }
                    
                    // If this object has children, automatically expand and query child records
                    if (window.SFDMU.Cpq.hasChildObjects(objectName)) {
                        const config = window.SFDMU.Cpq.getHierarchicalConfig(objectName);
                        if (config && config.autoExpandOnSelect) {
                            if (!masterSelectionState.expandedParents[objectName]) {
                                masterSelectionState.expandedParents[objectName] = new Set();
                            }
                            masterSelectionState.expandedParents[objectName].add(record.Id);
                        }
                        window.SFDMU.Cpq.queryChildRecords(objectName);
                    }
                } else {
                    selectedSet.delete(externalIdValue);
                    row.classList.remove('selected');
                    
                    // Remove the Id mapping
                    if (masterSelectionState.selectedRecordIds[objectName]) {
                        masterSelectionState.selectedRecordIds[objectName].delete(externalIdValue);
                    }
                    
                    // If this object has children, query child records (may clear some)
                    if (window.SFDMU.Cpq.hasChildObjects(objectName)) {
                        window.SFDMU.Cpq.queryChildRecords(objectName);
                    }
                }
                masterSelectionState.selectedRecords[objectName] = selectedSet;
                updateMasterSelectionCount();
            });
            checkboxCell.appendChild(checkbox);
            row.appendChild(checkboxCell);

            // Name cell - show just the Name field, with Product info below
            const nameCell = document.createElement('td');
            
            // Create a container for the name with additional details
            const nameContainer = document.createElement('div');
            nameContainer.style.display = 'flex';
            nameContainer.style.flexDirection = 'column';
            nameContainer.style.gap = '2px';
            
            // Primary display value - just the Name field (bold)
            const primaryText = document.createElement('div');
            primaryText.textContent = record.Name || '(No Name)';
            primaryText.style.fontWeight = '500';
            nameContainer.appendChild(primaryText);
            
            // Add Product2 information if available
            if (record.SBQQ__Product__r) {
                const detailsContainer = document.createElement('div');
                detailsContainer.style.fontSize = '11px';
                detailsContainer.style.color = 'var(--vscode-descriptionForeground)';
                detailsContainer.style.display = 'flex';
                detailsContainer.style.flexDirection = 'column';
                detailsContainer.style.gap = '2px';
                
                if (record.SBQQ__Product__r.Name) {
                    const productName = document.createElement('span');
                    productName.textContent = `Product: ${record.SBQQ__Product__r.Name}`;
                    detailsContainer.appendChild(productName);
                }
                if (record.SBQQ__Product__r.ProductCode) {
                    const productCode = document.createElement('span');
                    productCode.textContent = `Code: ${record.SBQQ__Product__r.ProductCode}`;
                    detailsContainer.appendChild(productCode);
                }
                
                if (detailsContainer.children.length > 0) {
                    nameContainer.appendChild(detailsContainer);
                }
            }
            
            nameCell.appendChild(nameContainer);
            
            // Debug: Log record data for troubleshooting
            if (objectName === 'SBQQ__Dimension__c' && records.indexOf(record) === 0) {
                console.log('[masterSelectionModal] First SBQQ__Dimension__c record:', {
                    Name: record.Name,
                    SBQQ__Product__r: record.SBQQ__Product__r,
                    SBQQ__PriceBook__r: record.SBQQ__PriceBook__r,
                    SBQQ__Type__c: record.SBQQ__Type__c,
                    allKeys: Object.keys(record)
                });
            }
            nameCell.style.cursor = 'pointer';
            nameCell.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
            row.appendChild(nameCell);

            // LastModifiedDate cell
            const dateCell = document.createElement('td');
            if (record.LastModifiedDate) {
                const date = new Date(record.LastModifiedDate);
                dateCell.textContent = date.toLocaleString();
            } else {
                dateCell.textContent = '-';
            }
            row.appendChild(dateCell);

            // LastModifiedBy cell
            const byCell = document.createElement('td');
            if (record.LastModifiedBy && record.LastModifiedBy.Name) {
                byCell.textContent = record.LastModifiedBy.Name;
            } else {
                byCell.textContent = '-';
            }
            row.appendChild(byCell);

            // Actions cell (view record link)
            const actionsCell = document.createElement('td');
            actionsCell.style.textAlign = 'center';
            if (record.Id && State.currentConfig.sourceOrg.instanceUrl) {
                const viewButton = document.createElement('button');
                viewButton.className = 'icon-button';
                viewButton.title = 'View record in Salesforce';
                viewButton.innerHTML = '<span class="codicon codicon-link-external"></span>';
                viewButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent row click
                    const recordUrl = `${State.currentConfig.sourceOrg.instanceUrl}/${record.Id}`;
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

            tbody.appendChild(row);
            
            // Note: Child records are NOT displayed in the master selection modal
            // They will only appear in the "Selected Parent Records" section on the main CPQ screen
        });

        table.appendChild(tbody);
        
        // Add footer row for loading indicator or "no more records" message
        // Reuse obj from above (line 293) - it's already declared in this function scope
        // Show footer if we have records OR if all records are loaded (to show "no more records" message)
        if (obj && (records.length > 0 || obj.allRecordsLoaded)) {
            const tfoot = document.createElement('tfoot');
            const footerRow = document.createElement('tr');
            footerRow.id = `loading-more-${objectName}`;
            const footerCell = document.createElement('td');
            footerCell.colSpan = 5; // Checkbox, Name, Last Modified Date, Last Modified By, Actions
            footerCell.style.textAlign = 'center';
            footerCell.style.padding = '20px';
            
            // Check loading state and allRecordsLoaded to determine what to show
            const isLoading = masterSelectionState.loadingMore[objectName];
            const allLoaded = obj.allRecordsLoaded;
            
            if (isLoading) {
                // Show loading indicator
                footerCell.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin" style="font-size: 18px; color: var(--vscode-foreground); margin-right: 8px;"></span><span style="color: var(--vscode-descriptionForeground);">Loading more records...</span>';
            } else if (allLoaded) {
                // Show "no more records" message
                footerCell.innerHTML = '<span style="color: var(--vscode-descriptionForeground); font-size: 13px;">No more records to load</span>';
            }
            // If neither condition is true, don't show footer (initial state)
            
            // Only append footer if we have something to show
            if (isLoading || allLoaded) {
                footerRow.appendChild(footerCell);
                tfoot.appendChild(footerRow);
                table.appendChild(tfoot);
            }
        }
        
        containerEl.appendChild(table);
    }

    function loadMoreMasterRecords(objectName, append = false) {
        // Don't load if modal is closed
        if (isModalClosed) return;
        
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        if (masterSelectionState.loadingMore[objectName]) return; // Already loading
        
        masterSelectionState.loadingMore[objectName] = true;
        
        // Show loading state if not appending (initial load)
        if (!append) {
            const containerEl = document.getElementById(`master-selection-list-${objectName}`);
            if (containerEl) {
                containerEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><span class="codicon codicon-loading codicon-modifier-spin" style="font-size: 24px; color: var(--vscode-foreground);"></span></div>';
            }
        } else {
            // When appending, show loading indicator at bottom of table
            // This will be added in renderMasterSelectionRecords
            // Re-render to show loading indicator
            const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
            if (obj && obj.records) {
                renderMasterSelectionRecords(objectName, obj.records);
            }
        }
        
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        // Pass the FULL externalIdField to the backend - it needs all fields for composite keys
        // The backend will handle extracting what it needs for the query
        // Use totalRequested for OFFSET, not loadedCount, because OFFSET is based on total records returned, not unique ones
        const offset = append ? (obj.totalRequested || 0) : 0;
        
        // Build filters WHERE clause
        const filtersWhereClause = buildWhereClauseFromFilters(objectName);
        
        vscode.postMessage({
            command: 'getCpqMasterRecords',
            objectName: obj.objectName,
            externalIdField: obj.externalIdField, // Pass the full composite external ID
            orgAlias: sourceOrgAlias,
            phaseNumber: masterSelectionState.phaseNumber,
            limit: RECORDS_PER_PAGE,
            offset: offset,
            filters: filtersWhereClause ? [{ whereClause: filtersWhereClause }] : undefined
        });
    }
    
    function queryMasterRecordsWithSearch(objectName, searchTerm) {
        // Don't query if modal is closed
        if (isModalClosed) return;
        
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (!obj) return;
        
        if (masterSelectionState.loadingMore[objectName]) return; // Already loading
        
        masterSelectionState.loadingMore[objectName] = true;
        
        // Show loading state
        const containerEl = document.getElementById(`master-selection-list-${objectName}`);
        if (containerEl) {
            containerEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; padding: 40px;"><span class="codicon codicon-loading codicon-modifier-spin" style="font-size: 24px; color: var(--vscode-foreground);"></span></div>';
        }
        
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        // For search, we need to search across all fields in the external ID
        // Extract all fields from composite external ID
        let searchFields = [];
        if (obj.externalIdField.includes(';')) {
            searchFields = obj.externalIdField.split(';').map(f => f.trim());
        } else {
            searchFields = [obj.externalIdField.trim()];
        }
        
        // Build filters WHERE clause
        const filtersWhereClause = buildWhereClauseFromFilters(objectName);
        
        // Pass the FULL externalIdField to the backend - it needs all fields for composite keys
        // The backend will handle extracting what it needs for the query
        vscode.postMessage({
            command: 'getCpqMasterRecords',
            objectName: obj.objectName,
            externalIdField: obj.externalIdField, // Pass the full composite external ID
            orgAlias: sourceOrgAlias,
            phaseNumber: masterSelectionState.phaseNumber,
            searchTerm: searchTerm,
            searchFields: searchFields, // Pass all fields for search
            limit: 1000, // Load more results for search
            filters: filtersWhereClause ? [{ whereClause: filtersWhereClause }] : undefined
        });
    }

    function updateMasterSelectionCount() {
        const countEl = document.getElementById('master-selection-count');
        if (!countEl) return;

        let totalCount = 0;
        let objectsWithSelections = 0;
        let objectsWithoutSelections = 0;
        
        const selectableObjects = masterSelectionState.selectableObjects || [];
        selectableObjects.forEach(obj => {
            const selectedSet = masterSelectionState.selectedRecords[obj.objectName] || new Set();
            const count = selectedSet.size;
            totalCount += count;
            if (count > 0) {
                objectsWithSelections++;
            } else {
                objectsWithoutSelections++;
            }
        });

        // Update count display with warning about objects with no selections
        let countText = `${totalCount} record${totalCount !== 1 ? 's' : ''} selected`;
        if (objectsWithoutSelections > 0) {
            countText += ` • ${objectsWithoutSelections} object${objectsWithoutSelections !== 1 ? 's' : ''} with no selections (will not be migrated)`;
        }
        countEl.textContent = countText;
        
        // Update tabs to reflect current selection counts
        renderMasterSelectionTabs(selectableObjects);
    }

    // Initialize filter state if needed
    function initializeFilterState(objectName) {
        if (!masterSelectionState.filters) {
            masterSelectionState.filters = {};
        }
        if (!masterSelectionState.filters[objectName]) {
            masterSelectionState.filters[objectName] = [];
        }
        if (!masterSelectionState.fieldMetadata) {
            masterSelectionState.fieldMetadata = {};
        }
    }

    // Load field metadata for autocomplete
    function loadFieldMetadataForFilters(objectName) {
        if (masterSelectionState.fieldMetadata[objectName]) {
            return; // Already loaded
        }

        // Get org alias from state
        const sourceOrgAlias = State.currentConfig.sourceOrg.alias || 
                              State.currentConfig.sourceOrg.username || '';
        
        if (!sourceOrgAlias) {
            console.error('No source org configured for field metadata');
            return;
        }

        // Request field metadata from backend
        vscode.postMessage({
            command: 'getAllFieldsWithDataType',
            objectName: objectName,
            orgAlias: sourceOrgAlias
        });
    }

    // Build WHERE clause from filters array
    function buildWhereClauseFromFilters(objectName) {
        initializeFilterState(objectName);
        const filters = masterSelectionState.filters[objectName] || [];
        
        if (filters.length === 0) {
            return null;
        }

        const conditions = filters.map(filter => {
            const { fieldApiName, operator, value } = filter;
            
            if (!fieldApiName || !operator) {
                return null; // Skip invalid filters
            }

            // Validate and clean field API name
            const trimmedField = fieldApiName.trim();
            if (!trimmedField || trimmedField.length === 0) {
                return null; // Skip if field name is empty
            }
            
            // Basic validation: field name should only contain alphanumeric, underscores, and dots (for relationships)
            if (!/^[a-zA-Z0-9_.]+$/.test(trimmedField)) {
                console.warn(`Invalid field API name: ${trimmedField}`);
                return null; // Skip invalid field names
            }


            // Handle IN and NOT IN (value should be comma-separated)
            if (operator === 'IN' || operator === 'NOT IN') {
                if (!value || value.trim() === '') {
                    return null; // Skip if no value
                }
                // Split by comma and trim each value
                const values = value.split(',').map(v => v.trim()).filter(v => v);
                if (values.length === 0) {
                    return null;
                }
                // Use values as-is (user is responsible for quoting strings)
                return `${fieldApiName} ${operator} (${values.join(', ')})`;
            }

            // Handle LIKE operator
            if (operator === 'LIKE') {
                if (!value || value.trim() === '') {
                    return null;
                }
                // Use value as-is (user is responsible for quoting and wildcards)
                return `${fieldApiName} LIKE ${value.trim()}`;
            }

            // Handle comparison operators (=, !=, >, <, >=, <=)
            if (!value || value.trim() === '') {
                return null; // Skip if no value
            }
            
            const trimmedValue = value.trim();
            
            // Handle null values (case-insensitive)
            if (trimmedValue.toLowerCase() === 'null') {
                return `${trimmedField} ${operator} null`;
            }
            
            // Use value as-is (user is responsible for proper formatting)
            // Numbers, dates, booleans, and strings should be entered as they should appear in SOQL
            return `${trimmedField} ${operator} ${trimmedValue}`;
        }).filter(condition => condition !== null);

        if (conditions.length === 0) {
            return null;
        }

        // Join conditions and ensure no extra whitespace
        const whereClause = conditions.join(' AND ').trim();
        
        // Ensure WHERE clause doesn't already contain "WHERE" keyword
        if (whereClause.toUpperCase().startsWith('WHERE ')) {
            return whereClause.substring(6).trim();
        }
        
        return whereClause;
    }

    // Render filter section
    function renderFilterSection(objectName) {
        const filtersSection = document.getElementById(`master-selection-filters-${objectName}`);
        if (!filtersSection) return;

        initializeFilterState(objectName);
        const filters = masterSelectionState.filters[objectName] || [];

        filtersSection.innerHTML = '';

        // Add help text about value formatting
        const helpText = document.createElement('div');
        helpText.className = 'master-selection-filter-help';
        helpText.innerHTML = '<strong>Note:</strong> Enter values as they should appear in SOQL. Wrap strings in single quotes (e.g., <code>\'Active\'</code>). Numbers, dates, and booleans should not be quoted. For LIKE, include wildcards (e.g., <code>\'%test%\'</code>).';
        filtersSection.appendChild(helpText);

        // Render each filter
        filters.forEach((filter, index) => {
            const filterRow = createFilterRow(objectName, filter, index);
            filtersSection.appendChild(filterRow);
        });

        // Add "Add Filter" button
        const addFilterButton = document.createElement('button');
        addFilterButton.className = 'btn-secondary master-selection-add-filter';
        addFilterButton.type = 'button';
        addFilterButton.textContent = 'Add Filter';
        addFilterButton.addEventListener('click', () => {
            initializeFilterState(objectName);
            masterSelectionState.filters[objectName].push({
                fieldApiName: '',
                operator: '=',
                value: ''
            });
            renderFilterSection(objectName);
        });
        filtersSection.appendChild(addFilterButton);
    }

    // Create a single filter row
    function createFilterRow(objectName, filter, index) {
        const row = document.createElement('div');
        row.className = 'master-selection-filter-row';

        // Field API Name input with autocomplete
        const fieldInputWrapper = document.createElement('div');
        fieldInputWrapper.className = 'master-selection-filter-field-wrapper';
        
        const fieldInput = document.createElement('input');
        fieldInput.type = 'text';
        fieldInput.className = 'text-input master-selection-filter-field';
        fieldInput.placeholder = 'Field API Name';
        fieldInput.value = filter.fieldApiName || '';
        fieldInput.dataset.filterIndex = index;
        
        fieldInputWrapper.appendChild(fieldInput);

        // Field pills container - will be appended to row later to span full width
        const pillsContainer = document.createElement('div');
        pillsContainer.className = 'master-selection-filter-pills';
        pillsContainer.id = `filter-pills-${objectName}-${index}`;

        // Autocomplete handler
        fieldInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            filter.fieldApiName = value;
            
            // Update filter in state
            initializeFilterState(objectName);
            if (masterSelectionState.filters[objectName][index]) {
                masterSelectionState.filters[objectName][index].fieldApiName = value;
            }

            // Show autocomplete pills
            if (value.length >= 1 && masterSelectionState.fieldMetadata[objectName]) {
                renderFieldPillsForFilter(objectName, index, value, fieldInput);
            } else {
                pillsContainer.innerHTML = '';
            }
        });

        // Operator dropdown
        const operatorSelect = document.createElement('select');
        operatorSelect.className = 'master-selection-filter-operator';
        const operators = [
            { value: '=', label: '=' },
            { value: '!=', label: '!=' },
            { value: '>', label: '>' },
            { value: '<', label: '<' },
            { value: '>=', label: '>=' },
            { value: '<=', label: '<=' },
            { value: 'LIKE', label: 'LIKE' },
            { value: 'IN', label: 'IN' },
            { value: 'NOT IN', label: 'NOT IN' }
        ];
        operators.forEach(op => {
            const option = document.createElement('option');
            option.value = op.value;
            option.textContent = op.label;
            if (op.value === filter.operator) {
                option.selected = true;
            }
            operatorSelect.appendChild(option);
        });
            operatorSelect.addEventListener('change', (e) => {
            filter.operator = e.target.value;
            initializeFilterState(objectName);
            if (masterSelectionState.filters[objectName][index]) {
                masterSelectionState.filters[objectName][index].operator = e.target.value;
            }
            // Value input is always shown (null can be entered as a value)
            // Only re-query if filter has a field name (filter is at least partially complete)
            if (filter.fieldApiName && filter.fieldApiName.trim()) {
                // Debounce operator change to avoid rapid queries
                const operatorTimeout = setTimeout(() => {
                    pendingTimeouts.delete(operatorTimeout);
                    if (!isModalClosed) {
                        const searchTerm = masterSelectionState.searchTerms[objectName];
                        if (searchTerm) {
                            queryMasterRecordsWithSearch(objectName, searchTerm);
                        } else {
                            loadMoreMasterRecords(objectName, false);
                        }
                    }
                }, 300);
                pendingTimeouts.add(operatorTimeout);
                // Store timeout for cleanup if needed
                row._operatorTimeout = operatorTimeout;
            }
        });

        // Value input
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'text-input master-selection-filter-value';
        valueInput.placeholder = 'Value';
        valueInput.value = filter.value || '';
        valueInput.title = 'Enter value as it should appear in SOQL. Wrap strings in single quotes (e.g., \'Active\'). Numbers, dates, and booleans should not be quoted.';
        // Debounce value input to avoid too many queries
        valueInput.addEventListener('input', (e) => {
            filter.value = e.target.value;
            initializeFilterState(objectName);
            if (masterSelectionState.filters[objectName][index]) {
                masterSelectionState.filters[objectName][index].value = e.target.value;
            }
            // Clean up previous timeout
            if (row._valueInputTimeout) {
                clearTimeout(row._valueInputTimeout);
            }
            // Debounce re-query - wait 500ms after user stops typing
            // Only query if filter has a field name (filter is at least partially complete)
            if (filter.fieldApiName && filter.fieldApiName.trim()) {
                const valueTimeout = setTimeout(() => {
                    pendingTimeouts.delete(valueTimeout);
                    if (!isModalClosed) {
                        const searchTerm = masterSelectionState.searchTerms[objectName];
                        if (searchTerm) {
                            queryMasterRecordsWithSearch(objectName, searchTerm);
                        } else {
                            loadMoreMasterRecords(objectName, false);
                        }
                    }
                }, 500);
                pendingTimeouts.add(valueTimeout);
                row._valueInputTimeout = valueTimeout;
            }
        });

        // Remove filter button
        const removeButton = document.createElement('button');
        removeButton.className = 'icon-button master-selection-filter-remove';
        removeButton.type = 'button';
        removeButton.title = 'Remove filter';
        removeButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        removeButton.addEventListener('click', () => {
            initializeFilterState(objectName);
            masterSelectionState.filters[objectName].splice(index, 1);
            renderFilterSection(objectName);
            // Re-query records with updated filters
            const searchTerm = masterSelectionState.searchTerms[objectName];
            if (searchTerm) {
                queryMasterRecordsWithSearch(objectName, searchTerm);
            } else {
                loadMoreMasterRecords(objectName, false);
            }
        });

        row.appendChild(fieldInputWrapper);
        row.appendChild(operatorSelect);
        row.appendChild(valueInput);
        row.appendChild(removeButton);
        
        // Field pills container - positioned below the entire row to span full width
        // (pillsContainer was already created earlier, just append it now)
        row.appendChild(pillsContainer);

        return row;
    }

    // Render field pills for filter autocomplete
    function renderFieldPillsForFilter(objectName, filterIndex, searchTerm, inputElement) {
        const pillsContainer = document.getElementById(`filter-pills-${objectName}-${filterIndex}`);
        if (!pillsContainer) return;

        const fields = masterSelectionState.fieldMetadata[objectName] || [];
        if (fields.length === 0) return;

        pillsContainer.innerHTML = '';
        pillsContainer.style.display = 'flex';

        const term = searchTerm.toLowerCase();
        const exactMatches = [];
        const containsMatches = [];

        fields.forEach(field => {
            const fieldNameLower = field.name.toLowerCase();
            const fieldLabelLower = field.label ? field.label.toLowerCase() : '';
            
            if (fieldNameLower.startsWith(term) || fieldLabelLower.startsWith(term)) {
                exactMatches.push(field);
            } else if (fieldNameLower.includes(term) || fieldLabelLower.includes(term)) {
                containsMatches.push(field);
            }
        });

        const filtered = [...exactMatches, ...containsMatches].slice(0, 20);

        filtered.forEach(field => {
            const pill = document.createElement('span');
            pill.className = 'field-pill';
            pill.textContent = field.name;
            pill.title = field.label ? `${field.label} (${field.name})` : field.name;
            pill.style.cssText = `
                display: inline-flex;
                align-items: center;
                padding: 4px 10px;
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
                border-radius: 12px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            pill.addEventListener('click', () => {
                inputElement.value = field.name;
                inputElement.dispatchEvent(new Event('input'));
                pillsContainer.innerHTML = '';
            });
            
            pill.addEventListener('mouseenter', () => {
                pill.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
            });
            
            pill.addEventListener('mouseleave', () => {
                pill.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
            });
            
            pillsContainer.appendChild(pill);
        });
    }

    // Public API - exposed on window.SFDMU.Cpq
    console.log('[Master Selection Modal] Defining openMasterSelectionModal function...');
    window.SFDMU.Cpq.openMasterSelectionModal = function(phaseNumber) {
        console.log('[Master Selection Modal] openMasterSelectionModal called for phase', phaseNumber);
        console.log('[Master Selection Modal] Source org state:', {
            username: State.currentConfig.sourceOrg?.username,
            instanceUrl: State.currentConfig.sourceOrg?.instanceUrl,
            hasUsername: !!State.currentConfig.sourceOrg?.username,
            hasInstanceUrl: !!State.currentConfig.sourceOrg?.instanceUrl
        });
        
        // Validate source org is configured
        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.sourceOrg.instanceUrl) {
            console.warn('[Master Selection Modal] Source org not configured, showing error');
            vscode.postMessage({ command: 'showError', message: 'Error: Source org is required to select records' });
            return;
        }

        const modal = document.getElementById('cpq-master-selection-modal');
        if (!modal) {
            console.error('[Master Selection Modal] Modal element not found!');
            return;
        }
        
        console.log('[Master Selection Modal] Modal element found, proceeding...');

        // Reset cancellation flag when opening modal
        isModalClosed = false;
        
        // Clear any pending timeouts from previous session
        pendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        pendingTimeouts.clear();

        masterSelectionState.phaseNumber = phaseNumber;
        masterSelectionState.selectableObjects = [];
        masterSelectionState.selectedRecords = {};
        masterSelectionState.selectedRecordIds = {};
        masterSelectionState.excludedObjects = new Set(); // Reset excluded objects
        masterSelectionState.currentTab = null;
        masterSelectionState.isLoading = true;

        // Update phase number in modal
        const phaseNumberEl = document.getElementById('master-selection-phase-number');
        if (phaseNumberEl) {
            phaseNumberEl.textContent = phaseNumber;
        }

        // Get selectable objects for this phase
        const selectableObjects = window.SFDMU.Cpq.getSelectableObjectsForPhase(phaseNumber, State.currentConfig.includeProduct2 || false);
        masterSelectionState.selectableObjects = selectableObjects.map(obj => ({
            objectName: obj.objectName,
            externalIdField: obj.externalIdField,
            records: [], // Will be populated when records are received
            loadedCount: 0,
            totalRequested: 0,
            allRecordsLoaded: false
        }));
        
        if (selectableObjects.length === 0) {
            // No selectable objects - show empty state
            renderMasterSelectionTabs([]);
            renderMasterSelectionContent(null, []);
            masterSelectionState.isLoading = false;
            modal.classList.add('show');
            return;
        }

        // Load existing selections
        // Handle both old format (string[]) and new format ({ externalId, id }[])
        const phaseSelections = State.currentConfig.selectedMasterRecords?.[phaseNumber] || {};
        selectableObjects.forEach(obj => {
            const selected = phaseSelections[obj.objectName] || [];
            // Convert to Set of external ID values (for backward compatibility)
            const externalIdValues = selected.map(item => {
                // If it's the new format (object), use externalId; if it's old format (string), use as-is
                return typeof item === 'object' && item.externalId ? item.externalId : item;
            });
            masterSelectionState.selectedRecords[obj.objectName] = new Set(externalIdValues);
            
            // Also populate the Id map if we have the new format
            if (!masterSelectionState.selectedRecordIds[obj.objectName]) {
                masterSelectionState.selectedRecordIds[obj.objectName] = new Map();
            }
            selected.forEach(item => {
                if (typeof item === 'object' && item.externalId && item.id) {
                    masterSelectionState.selectedRecordIds[obj.objectName].set(item.externalId, item.id);
                }
            });
        });
        
        // Load existing excluded objects
        const excludedObjects = State.currentConfig.excludedObjectsByPhase?.[phaseNumber] || [];
        excludedObjects.forEach(objectName => {
            masterSelectionState.excludedObjects.add(objectName);
        });

        // Render tabs
        renderMasterSelectionTabs(selectableObjects);

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
        console.log('[Master Selection Modal] Adding show class to modal...');
        modal.classList.add('show');
        console.log('[Master Selection Modal] Modal classes after adding show:', modal.className);
        console.log('[Master Selection Modal] Modal display style:', window.getComputedStyle(modal).display);
        console.log('[Master Selection Modal] Modal visibility:', window.getComputedStyle(modal).visibility);
        console.log('[Master Selection Modal] Modal opacity:', window.getComputedStyle(modal).opacity);

        // Initialize objects in state (don't query yet - will be queried when tab is clicked)
        selectableObjects.forEach((obj) => {
            const existingObj = masterSelectionState.selectableObjects.find(o => o.objectName === obj.objectName);
            if (!existingObj) {
        masterSelectionState.selectableObjects.push({
            objectName: obj.objectName,
            externalIdField: obj.externalIdField,
            records: [],
            loadedCount: 0, // Number of unique records we have
            totalRequested: 0, // Total number of records we've requested from backend (for OFFSET calculation)
            allRecordsLoaded: false
        });
            }
        });

        // Set first tab as active if available and load its records
        if (selectableObjects.length > 0) {
            const firstObject = selectableObjects[0].objectName;
            switchMasterSelectionTab(firstObject);
            // Load initial batch for first tab
            loadMoreMasterRecords(firstObject, false);
            
            // If any object with hierarchical relationships has existing selections, query child records after records load
            selectableObjects.forEach(obj => {
                if (window.SFDMU.Cpq.hasChildObjects(obj.objectName)) {
                    const selections = masterSelectionState.selectedRecords[obj.objectName];
                    if (selections && selections.size > 0) {
                        // Wait for records to load, then query child records
                        setTimeout(() => {
                            window.SFDMU.Cpq.queryChildRecords(obj.objectName);
                            
                            // Also expand all selected parents
                            const config = window.SFDMU.Cpq.getHierarchicalConfig(obj.objectName);
                            if (config && config.autoExpandOnSelect) {
                                const parentObj = masterSelectionState.selectableObjects.find(o => o.objectName === obj.objectName);
                                if (parentObj && parentObj.records) {
                                    if (!masterSelectionState.expandedParents[obj.objectName]) {
                                        masterSelectionState.expandedParents[obj.objectName] = new Set();
                                    }
                                    // Expand all selected parent records
                                    parentObj.records.forEach(record => {
                                        const displayConfig = window.SFDMU.Cpq.getDisplayFieldForObject(obj.objectName, obj.externalIdField);
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
                                        
                                        if (selections.has(recordExternalId)) {
                                            masterSelectionState.expandedParents[obj.objectName].add(record.Id);
                                        }
                                    });
                                }
                            }
                        }, 1000);
                    }
                }
            });
        }
    };

    window.SFDMU.Cpq.switchMasterSelectionTab = switchMasterSelectionTab;

    window.SFDMU.Cpq.saveMasterSelections = function(closeModal = false) {
        if (!masterSelectionState.phaseNumber) return;

        // Initialize selectedMasterRecords if needed
        if (!State.currentConfig.selectedMasterRecords) {
            State.currentConfig.selectedMasterRecords = {};
        }

        // Convert Sets to Arrays with both externalId and Id
        // Use the selectedRecordIds Map that was populated when records were selected
        const phaseSelections = {};
        Object.keys(masterSelectionState.selectedRecords).forEach(objectName => {
            const set = masterSelectionState.selectedRecords[objectName];
            if (set.size > 0) {
                const idMap = masterSelectionState.selectedRecordIds[objectName] || new Map();
                
                // Build array of { externalId, id } objects
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
        
        // Child records are already included in selectedRecords above, no need for special handling

        // Update config
        if (Object.keys(phaseSelections).length > 0) {
            State.currentConfig.selectedMasterRecords[masterSelectionState.phaseNumber] = phaseSelections;
        } else {
            // Remove phase entry if no selections
            delete State.currentConfig.selectedMasterRecords[masterSelectionState.phaseNumber];
            // Clean up empty object
            if (Object.keys(State.currentConfig.selectedMasterRecords).length === 0) {
                State.currentConfig.selectedMasterRecords = undefined;
            }
        }

        // Save excluded objects
        if (!State.currentConfig.excludedObjectsByPhase) {
            State.currentConfig.excludedObjectsByPhase = {};
        }
        const excludedArray = Array.from(masterSelectionState.excludedObjects);
        if (excludedArray.length > 0) {
            State.currentConfig.excludedObjectsByPhase[masterSelectionState.phaseNumber] = excludedArray;
        } else {
            // Remove phase entry if no excluded objects
            delete State.currentConfig.excludedObjectsByPhase[masterSelectionState.phaseNumber];
            // Clean up empty object
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
        window.SFDMU.Cpq.renderIndividualPhases();

        // Close modal only if requested
        if (closeModal) {
            window.SFDMU.Cpq.closeMasterSelectionModal();
        }
    };

    window.SFDMU.Cpq.renderFilterSection = renderFilterSection;

    window.SFDMU.Cpq.closeMasterSelectionModal = function() {
        // Set cancellation flag to ignore any pending query responses
        isModalClosed = true;
        
        // Cancel all pending timeouts
        pendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        pendingTimeouts.clear();
        
        // Clear all loading states to prevent new queries
        Object.keys(masterSelectionState.loadingMore || {}).forEach(objectName => {
            masterSelectionState.loadingMore[objectName] = false;
        });
        
        // Clear any scroll timeouts
        const allTableContainers = document.querySelectorAll('.master-selection-list');
        allTableContainers.forEach(container => {
            // Remove scroll listeners by cloning (clean way to remove all listeners)
            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);
        });
        
        // Hide modal
        const modal = document.getElementById('cpq-master-selection-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // Clear all state
        masterSelectionState.phaseNumber = null;
        masterSelectionState.selectableObjects = [];
        masterSelectionState.selectedRecords = {};
        masterSelectionState.selectedRecordIds = {};
        masterSelectionState.currentTab = null;
        masterSelectionState.isLoading = false;
        masterSelectionState.searchTerms = {};
        masterSelectionState.loadingMore = {};
        masterSelectionState.childRecordsByParent = {};
        masterSelectionState.expandedParents = {};
        masterSelectionState.filters = {};
        masterSelectionState.fieldMetadata = {};
        
        // Reset cancellation flag for next time modal opens
        // Use setTimeout to ensure it happens after any pending operations
        setTimeout(() => {
            isModalClosed = false;
        }, 100);
    };

    window.SFDMU.Cpq.handleMasterRecords = function(objectName, records, phaseNumber, isSearch = false, append = false) {
        // Ignore responses if modal is closed or phase doesn't match
        if (isModalClosed || masterSelectionState.phaseNumber !== phaseNumber) return;

        // Keep loading state true until after rendering (so loading indicator shows)

        // Find the object in selectableObjects
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        const searchTerm = masterSelectionState.searchTerms[objectName];
        
        if (obj) {
            if (isSearch) {
                // Search results - replace all records
                obj.records = records || [];
                obj.loadedCount = obj.records.length;
                obj.totalRequested = records ? records.length : 0; // Reset for search
                obj.allRecordsLoaded = true; // Search results are complete
            } else if (append) {
                // Append to existing records, avoiding duplicates by Id
                const existingRecords = obj.records || [];
                const existingIds = new Set(existingRecords.map(r => r.Id));
                const newRecords = (records || []).filter(r => r.Id && !existingIds.has(r.Id));
                
                // Update totalRequested to track how many records we've requested from backend
                obj.totalRequested = (obj.totalRequested || 0) + (records ? records.length : 0);
                
                // If we got no new unique records, we've reached the end (or backend is returning duplicates)
                if (newRecords.length === 0) {
                    obj.allRecordsLoaded = true;
                } else {
                    obj.records = [...existingRecords, ...newRecords];
                    obj.loadedCount = obj.records.length;
                    // Also check if we got fewer records than requested (means we're at the end)
                    // This handles the case where we request 100 but only get 40 (e.g., records 200-240 out of 240 total)
                    if (records.length < RECORDS_PER_PAGE) {
                        obj.allRecordsLoaded = true;
                    }
                }
            } else {
                // Initial load - deduplicate by Id in case of multiple calls
                const newRecords = (records || []).filter(r => r.Id); // Filter out any records without Id
                
                // Update totalRequested to track how many records we've requested from backend
                obj.totalRequested = (obj.totalRequested || 0) + (newRecords.length);
                
                if (obj.records && obj.records.length > 0) {
                    // Merge with existing, avoiding duplicates
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
            // Add it if not found
            const selectableObjects = window.SFDMU.Cpq.getSelectableObjectsForPhase(phaseNumber, State.currentConfig.includeProduct2 || false);
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
                masterSelectionState.selectableObjects.push(newObj);
            }
        }

        // Clear loading state BEFORE rendering so the footer shows correct state
        masterSelectionState.loadingMore[objectName] = false;
        
        // Always render records for the current tab if it matches, or if no tab is selected
        const currentObj = masterSelectionState.selectableObjects.find(o => o.objectName === objectName);
        if (currentObj) {
            // Use the records from the state object (which was just updated above)
            const recordsToRender = currentObj.records || [];
            
            if (masterSelectionState.currentTab === objectName) {
                // This is the active tab - check if container exists, if so just update records, otherwise full render
                const containerEl = document.getElementById(`master-selection-list-${objectName}`);
                if (containerEl) {
                    // Container exists - just update the records display
                    renderMasterSelectionRecords(objectName, recordsToRender);
                } else {
                    // Container doesn't exist - need full content setup
                    renderMasterSelectionContent(objectName, recordsToRender);
                }
            } else if (!masterSelectionState.currentTab) {
                // No tab selected yet - select this one and render
                switchMasterSelectionTab(objectName);
            }
        }
        if (!isSearch) {
            const expectedObjects = window.SFDMU.Cpq.getSelectableObjectsForPhase(phaseNumber, State.currentConfig.includeProduct2 || false);
            const allInitialLoaded = expectedObjects.every(expectedObj => {
                const loadedObj = masterSelectionState.selectableObjects.find(o => o.objectName === expectedObj.objectName);
                return loadedObj && loadedObj.records !== undefined && loadedObj.records.length > 0;
            });
            
            if (allInitialLoaded) {
                masterSelectionState.isLoading = false;
                const loadingEl = document.getElementById('master-selection-loading');
                if (loadingEl) loadingEl.style.display = 'none';
            }
        } else {
            // Search is complete
            masterSelectionState.isLoading = false;
            const loadingEl = document.getElementById('master-selection-loading');
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

    window.SFDMU.Cpq.handleChildRecords = function(parentObjectName, childObjectName, records, childRecordsByParent, phaseNumber) {
        if (masterSelectionState.phaseNumber !== phaseNumber) return;
        
        // Initialize child records storage if needed
        if (!masterSelectionState.childRecordsByParent[parentObjectName]) {
            masterSelectionState.childRecordsByParent[parentObjectName] = {};
        }
        
        // Update child records by parent ID
        // childRecordsByParent is { parentId: childRecord[] }
        Object.keys(childRecordsByParent || {}).forEach(parentId => {
            if (!masterSelectionState.childRecordsByParent[parentObjectName][parentId]) {
                masterSelectionState.childRecordsByParent[parentObjectName][parentId] = [];
            }
            // Merge with existing records (avoid duplicates)
            const existing = masterSelectionState.childRecordsByParent[parentObjectName][parentId];
            const newRecords = childRecordsByParent[parentId] || [];
            const existingIds = new Set(existing.map(r => r.Id));
            const uniqueNew = newRecords.filter(r => !existingIds.has(r.Id));
            masterSelectionState.childRecordsByParent[parentObjectName][parentId] = [...existing, ...uniqueNew];
        });
        
        // Re-render parent table to show child records if parents are expanded
        const obj = masterSelectionState.selectableObjects.find(o => o.objectName === parentObjectName);
        if (obj && obj.records && masterSelectionState.currentTab === parentObjectName) {
            renderMasterSelectionRecords(parentObjectName, obj.records);
        }
        
        updateMasterSelectionCount();
    };
    
    console.log('[Master Selection Modal] Module initialization complete. openMasterSelectionModal available:', typeof window.SFDMU.Cpq.openMasterSelectionModal);
})();
