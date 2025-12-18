// Modals Module
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    const MigrationObjects = window.SFDMU.MigrationObjects;
    
    // Object selection modal state - expose via window for message handler
    window.objectModalState = {
        allObjects: [],
        filteredObjects: [],
        selectedObjects: new Set()
    };
    const objectModalState = window.objectModalState;
    
    // Field selection modal state - expose via window for message handler
    window.fieldModalState = {
        objectName: '',
        objectIndex: -1,
        allFields: [],
        filteredFields: [],
        selectedFields: new Set(),
        orgAlias: ''
    };
    const fieldModalState = window.fieldModalState;
    
    // External ID selection modal state - expose via window for message handler
    window.externalIdModalState = {
        objectName: '',
        objectIndex: -1,
        inputElement: null,
        allFields: [],
        filteredFields: [],
        selectedFields: new Set(),
        orgAlias: ''
    };
    const externalIdModalState = window.externalIdModalState;
    
    window.SFDMU.Modals = {
        setupObjectSelection: function() {
            const modal = document.getElementById('object-selection-modal');
            const searchInput = document.getElementById('object-search-input');
            const objectList = document.getElementById('object-list');
            const loadingDiv = document.getElementById('object-list-loading');
            const addButton = document.getElementById('object-modal-add');
            const cancelButton = document.getElementById('object-modal-cancel');
            
            const filterObjectList = () => {
                const searchTerm = searchInput.value.toLowerCase().trim();
                if (searchTerm === '') {
                    objectModalState.filteredObjects = objectModalState.allObjects;
                } else {
                    objectModalState.filteredObjects = objectModalState.allObjects.filter(obj => 
                        obj.toLowerCase().includes(searchTerm)
                    );
                }
                this.renderObjectList();
            };
            
            this.renderObjectList = () => {
                objectList.innerHTML = '';
                objectModalState.filteredObjects.forEach(objName => {
                    const item = document.createElement('div');
                    item.className = 'object-list-item';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `obj-${objName}`;
                    checkbox.value = objName;
                    checkbox.checked = objectModalState.selectedObjects.has(objName);
                    checkbox.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            objectModalState.selectedObjects.add(objName);
                        } else {
                            objectModalState.selectedObjects.delete(objName);
                        }
                        this.updateSelectedCount();
                    });
                    
                    const label = document.createElement('label');
                    label.htmlFor = `obj-${objName}`;
                    label.textContent = objName;
                    
                    item.appendChild(checkbox);
                    item.appendChild(label);
                    objectList.appendChild(item);
                });
            };
            
            this.updateSelectedCount = () => {
                const count = objectModalState.selectedObjects.size;
                document.getElementById('selected-count').textContent = `${count} object${count !== 1 ? 's' : ''} selected`;
                addButton.disabled = count === 0;
            };
            
            // Store references to methods for use in callbacks
            const self = this;
            
            // Add methods to existing window.objectModalState
            window.objectModalState.setObjects = function(objects) {
                objectModalState.allObjects = objects;
                objectModalState.filteredObjects = objects;
                loadingDiv.style.display = 'none';
                self.renderObjectList();
                self.updateSelectedCount();
            };
            window.objectModalState.showLoading = function() {
                loadingDiv.style.display = 'block';
                objectList.innerHTML = '';
            };
            window.objectModalState.getSelected = function() {
                return Array.from(objectModalState.selectedObjects);
            };
            
            searchInput.addEventListener('input', filterObjectList);
            
            const selectTab = document.getElementById('tab-select-from-org');
            const manualTab = document.getElementById('tab-manual-entry');
            const selectContent = document.getElementById('tab-content-select');
            const manualContent = document.getElementById('tab-content-manual');
            
            selectTab.addEventListener('click', () => {
                selectTab.classList.add('active');
                manualTab.classList.remove('active');
                selectContent.classList.add('active');
                manualContent.classList.remove('active');
                addButton.textContent = 'Add Selected Objects';
                
                const sourceOrgSelect = document.getElementById('source-org-select');
                const orgAlias = sourceOrgSelect.value;
                
                if (orgAlias && objectModalState.allObjects.length === 0) {
                    window.objectModalState.showLoading();
                    vscode.postMessage({ 
                        command: 'getAvailableObjects', 
                        orgAlias: orgAlias,
                        includeStandard: true
                    });
                } else if (orgAlias && objectModalState.allObjects.length > 0) {
                    this.renderObjectList();
                    this.updateSelectedCount();
                } else if (!orgAlias) {
                    objectList.innerHTML = '<p class="info-text">Please select a source org first</p>';
                    addButton.disabled = true;
                } else {
                    this.updateSelectedCount();
                }
            });
            
            manualTab.addEventListener('click', () => {
                manualTab.classList.add('active');
                selectTab.classList.remove('active');
                manualContent.classList.add('active');
                selectContent.classList.remove('active');
                addButton.textContent = 'Add Object';
                this.updateManualEntryButtonState();
            });
            
            const manualObjectName = document.getElementById('manual-object-name');
            const manualExternalId = document.getElementById('manual-external-id');
            const manualUseCustomQuery = document.getElementById('manual-use-custom-query');
            const manualSoqlQuery = document.getElementById('manual-soql-query');
            const manualSoqlGroup = document.getElementById('manual-soql-group');
            const manualAutoDetect = document.getElementById('manual-auto-detect');
            
            manualUseCustomQuery.addEventListener('change', (e) => {
                manualSoqlGroup.style.display = e.target.checked ? 'block' : 'none';
                this.updateManualEntryButtonState();
            });
            
            [manualObjectName, manualExternalId, manualSoqlQuery].forEach(input => {
                input.addEventListener('input', () => this.updateManualEntryButtonState());
            });
            
            manualAutoDetect.addEventListener('click', async () => {
                const objectName = manualObjectName.value.trim();
                if (!objectName) {
                    vscode.postMessage({ command: 'showError', message: 'Please enter an object name first' });
                    return;
                }
                
                const sourceOrgSelect = document.getElementById('source-org-select');
                const orgAlias = sourceOrgSelect.value;
                if (!orgAlias) {
                    vscode.postMessage({ command: 'showError', message: 'Please select a source org first' });
                    return;
                }
                
                manualAutoDetect.disabled = true;
                manualAutoDetect.textContent = 'Detecting...';
                vscode.postMessage({ 
                    command: 'detectExternalId', 
                    objectName: objectName,
                    orgAlias: orgAlias
                });
            });
            
            this.updateManualEntryButtonState = () => {
                const objectName = manualObjectName.value.trim();
                const externalId = manualExternalId.value.trim();
                const useCustomQuery = manualUseCustomQuery.checked;
                const soqlQuery = manualSoqlQuery.value.trim();
                
                const isValid = objectName && externalId && (!useCustomQuery || soqlQuery);
                addButton.disabled = !isValid;
            };
            
            cancelButton.addEventListener('click', () => this.hideObjectSelection());
            
            addButton.addEventListener('click', () => {
                if (selectTab.classList.contains('active')) {
                    const selected = Array.from(objectModalState.selectedObjects);
                    selected.forEach(objName => {
                        MigrationObjects.add(objName, '', false, '');
                    });
                } else {
                    const objectName = manualObjectName.value.trim();
                    const externalId = manualExternalId.value.trim();
                    const useCustomQuery = manualUseCustomQuery.checked;
                    const soqlQuery = manualSoqlQuery.value.trim();
                    
                    if (objectName && externalId && (!useCustomQuery || soqlQuery)) {
                        MigrationObjects.add(objectName, externalId, useCustomQuery, soqlQuery);
                    }
                }
                this.hideObjectSelection();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideObjectSelection();
                }
            });
        },
        
        showObjectSelection: function(mode = 'select') {
            const modal = document.getElementById('object-selection-modal');
            const searchInput = document.getElementById('object-search-input');
            const objectList = document.getElementById('object-list');
            const loadingDiv = document.getElementById('object-list-loading');
            const addButton = document.getElementById('object-modal-add');
            const selectTab = document.getElementById('tab-select-from-org');
            const manualTab = document.getElementById('tab-manual-entry');
            const selectContent = document.getElementById('tab-content-select');
            const manualContent = document.getElementById('tab-content-manual');
            
            objectList.innerHTML = '';
            searchInput.value = '';
            objectModalState.allObjects = [];
            objectModalState.filteredObjects = [];
            objectModalState.selectedObjects.clear();
            
            document.getElementById('manual-object-name').value = '';
            document.getElementById('manual-external-id').value = '';
            document.getElementById('manual-use-custom-query').checked = false;
            document.getElementById('manual-soql-query').value = '';
            document.getElementById('manual-soql-group').style.display = 'none';
            
            if (mode === 'manual') {
                selectTab.classList.remove('active');
                manualTab.classList.add('active');
                selectContent.classList.remove('active');
                manualContent.classList.add('active');
                addButton.disabled = false;
                addButton.textContent = 'Add Object';
            } else {
                selectTab.classList.add('active');
                manualTab.classList.remove('active');
                selectContent.classList.add('active');
                manualContent.classList.remove('active');
                addButton.disabled = true;
                addButton.textContent = 'Add Selected Objects';
                
                if (window.objectModalState && window.objectModalState.showLoading) {
                    window.objectModalState.showLoading();
                } else {
                    loadingDiv.style.display = 'block';
                    objectList.innerHTML = '';
                }
                document.getElementById('selected-count').textContent = '0 objects selected';
            }
            
            modal.classList.add('show');
        },
        
        hideObjectSelection: function() {
            const modal = document.getElementById('object-selection-modal');
            modal.classList.remove('show');
        },
        
        setupFieldSelection: function() {
            const modal = document.getElementById('field-selection-modal');
            const searchInput = document.getElementById('field-search-input');
            const fieldList = document.getElementById('field-list');
            const loadingDiv = document.getElementById('field-list-loading');
            const saveButton = document.getElementById('field-modal-save');
            const cancelButton = document.getElementById('field-modal-cancel');
            const clearButton = document.getElementById('field-modal-clear');
            const selectAllCheckbox = document.getElementById('select-all-fields');
            
            const filterFieldList = () => {
                const searchTerm = searchInput.value.toLowerCase().trim();
                if (searchTerm === '') {
                    fieldModalState.filteredFields = fieldModalState.allFields;
                } else {
                    fieldModalState.filteredFields = fieldModalState.allFields.filter(field => 
                        field.name.toLowerCase().includes(searchTerm) ||
                        (field.label && field.label.toLowerCase().includes(searchTerm))
                    );
                }
                this.renderFieldList();
            };
            
            this.renderFieldList = () => {
                fieldList.innerHTML = '';
                fieldModalState.filteredFields.forEach(field => {
                    const item = document.createElement('div');
                    item.className = 'object-list-item';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `field-${field.name}`;
                    checkbox.value = field.name;
                    checkbox.checked = fieldModalState.selectedFields.has(field.name);
                    checkbox.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            fieldModalState.selectedFields.add(field.name);
                        } else {
                            fieldModalState.selectedFields.delete(field.name);
                        }
                        this.updateFieldSelectedCount();
                        this.updateSelectAllCheckbox();
                    });
                    
                    const label = document.createElement('label');
                    label.htmlFor = `field-${field.name}`;
                    label.innerHTML = `<strong>${field.label || field.name}</strong> <span style="color: var(--vscode-descriptionForeground); font-size: 11px;">(${field.name})</span> <span class="field-type-badge">${field.type || 'Unknown'}</span>`;
                    
                    item.appendChild(checkbox);
                    item.appendChild(label);
                    fieldList.appendChild(item);
                });
                this.updateSelectAllCheckbox();
            };
            
            this.updateFieldSelectedCount = () => {
                const count = fieldModalState.selectedFields.size;
                document.getElementById('field-selected-count').textContent = `${count} field${count !== 1 ? 's' : ''} selected`;
                saveButton.disabled = count === 0;
            };
            
            this.updateSelectAllCheckbox = () => {
                const allSelected = fieldModalState.filteredFields.length > 0 && 
                    fieldModalState.filteredFields.every(field => fieldModalState.selectedFields.has(field.name));
                selectAllCheckbox.checked = allSelected;
            };
            
            // Store references to methods for use in callbacks
            const self = this;
            
            // Add methods to existing window.fieldModalState
            window.fieldModalState.setFields = function(fields) {
                fieldModalState.allFields = fields;
                fieldModalState.filteredFields = fields;
                loadingDiv.style.display = 'none';
                self.renderFieldList();
                self.updateFieldSelectedCount();
            };
            window.fieldModalState.showLoading = function() {
                loadingDiv.style.display = 'block';
                fieldList.innerHTML = '';
            };
            
            searchInput.addEventListener('input', filterFieldList);
            
            selectAllCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    fieldModalState.filteredFields.forEach(field => {
                        fieldModalState.selectedFields.add(field.name);
                    });
                } else {
                    fieldModalState.filteredFields.forEach(field => {
                        fieldModalState.selectedFields.delete(field.name);
                    });
                }
                this.renderFieldList();
                this.updateFieldSelectedCount();
            });
            
            cancelButton.addEventListener('click', () => this.hideFieldSelection());
            
            clearButton.addEventListener('click', () => {
                if (State.currentConfig.objects && fieldModalState.objectIndex >= 0 && fieldModalState.objectIndex < State.currentConfig.objects.length) {
                    State.currentConfig.objects[fieldModalState.objectIndex].selectedFields = undefined;
                    MigrationObjects.render();
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                }
                this.hideFieldSelection();
            });
            
            saveButton.addEventListener('click', () => {
                const selectedFields = Array.from(fieldModalState.selectedFields);
                if (State.currentConfig.objects && fieldModalState.objectIndex >= 0 && fieldModalState.objectIndex < State.currentConfig.objects.length) {
                    State.currentConfig.objects[fieldModalState.objectIndex].selectedFields = selectedFields;
                    MigrationObjects.render();
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                }
                this.hideFieldSelection();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideFieldSelection();
                }
            });
        },
        
        showFieldSelection: function(objectName, orgAlias, objectIndex, currentSelectedFields) {
            const modal = document.getElementById('field-selection-modal');
            const searchInput = document.getElementById('field-search-input');
            const fieldList = document.getElementById('field-list');
            const loadingDiv = document.getElementById('field-list-loading');
            const saveButton = document.getElementById('field-modal-save');
            const selectAllCheckbox = document.getElementById('select-all-fields');
            const title = document.getElementById('field-modal-title');
            
            fieldModalState.objectName = objectName;
            fieldModalState.objectIndex = objectIndex;
            fieldModalState.orgAlias = orgAlias;
            fieldModalState.allFields = [];
            fieldModalState.filteredFields = [];
            fieldModalState.selectedFields = new Set(currentSelectedFields);
            
            title.textContent = `Select Fields: ${objectName}`;
            
            fieldList.innerHTML = '';
            searchInput.value = '';
            selectAllCheckbox.checked = false;
            saveButton.disabled = true;
            
            modal.classList.add('show');
            
            // Check cache first
            const cached = State.fieldsCache[orgAlias] && State.fieldsCache[orgAlias][objectName];
            if (cached && cached.fields && cached.fields.length > 0) {
                // Use cached fields immediately
                loadingDiv.style.display = 'none';
                if (fieldModalState.setFields) {
                    fieldModalState.setFields(cached.fields);
                }
                // Still fetch in background to refresh cache
            vscode.postMessage({
                    command: 'getAllFieldsWithDataType',
                objectName: objectName,
                orgAlias: orgAlias
            });
            } else {
                // No cache, fetch normally
                loadingDiv.style.display = 'block';
                vscode.postMessage({
                    command: 'getAllFieldsWithDataType',
                    objectName: objectName,
                    orgAlias: orgAlias
                });
            }
        },
        
        hideFieldSelection: function() {
            const modal = document.getElementById('field-selection-modal');
            modal.classList.remove('show');
        },
        
        setupExternalIdSelection: function() {
            const modal = document.getElementById('external-id-selection-modal');
            const searchInput = document.getElementById('external-id-search-input');
            const fieldList = document.getElementById('external-id-list');
            const saveButton = document.getElementById('external-id-modal-save');
            const cancelButton = document.getElementById('external-id-modal-cancel');
            
            searchInput.addEventListener('input', () => {
                const searchTerm = searchInput.value.toLowerCase().trim();
                if (!searchTerm) {
                    externalIdModalState.filteredFields = [...externalIdModalState.allFields];
                } else {
                    externalIdModalState.filteredFields = externalIdModalState.allFields.filter(field =>
                        field.label.toLowerCase().includes(searchTerm) ||
                        field.name.toLowerCase().includes(searchTerm)
                    );
                }
                this.renderExternalIdFieldList();
            });
            
            saveButton.addEventListener('click', () => {
                if (externalIdModalState.inputElement && externalIdModalState.selectedFields.size > 0) {
                    const selectedFieldsArray = Array.from(externalIdModalState.selectedFields);
                    externalIdModalState.inputElement.value = selectedFieldsArray.join(';');
                    externalIdModalState.inputElement.dispatchEvent(new Event('input'));
                }
                this.hideExternalIdSelection();
            });
            
            cancelButton.addEventListener('click', () => this.hideExternalIdSelection());
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideExternalIdSelection();
                }
            });
        },
        
        showExternalIdSelection: function(objectName, orgAlias, objectIndex, inputElement) {
            const modal = document.getElementById('external-id-selection-modal');
            const searchInput = document.getElementById('external-id-search-input');
            const fieldList = document.getElementById('external-id-list');
            const loadingDiv = document.getElementById('external-id-list-loading');
            const saveButton = document.getElementById('external-id-modal-save');
            const objectNameSpan = document.getElementById('external-id-modal-object-name');
            
            externalIdModalState.objectName = objectName;
            externalIdModalState.objectIndex = objectIndex;
            externalIdModalState.inputElement = inputElement;
            externalIdModalState.orgAlias = orgAlias;
            externalIdModalState.allFields = [];
            externalIdModalState.filteredFields = [];
            externalIdModalState.selectedFields = new Set();
            
            if (inputElement && inputElement.value) {
                const currentValue = inputElement.value.trim();
                if (currentValue) {
                    currentValue.split(';').forEach(field => {
                        const trimmed = field.trim();
                        if (trimmed) {
                            externalIdModalState.selectedFields.add(trimmed);
                        }
                    });
                }
            }
            
            objectNameSpan.textContent = objectName;
            
            fieldList.innerHTML = '';
            searchInput.value = '';
            saveButton.disabled = externalIdModalState.selectedFields.size === 0;
            
            modal.classList.add('show');
            
            // Check cache first
            const cached = State.fieldsCache[orgAlias] && State.fieldsCache[orgAlias][objectName];
            if (cached && cached.fields && cached.fields.length > 0) {
                // Use cached fields immediately
                loadingDiv.style.display = 'none';
                externalIdModalState.allFields = cached.fields;
                externalIdModalState.filteredFields = [...cached.fields];
                this.renderExternalIdFieldList();
                // Still fetch in background to refresh cache
            vscode.postMessage({
                command: 'getAllFieldsWithDataType',
                objectName: objectName,
                orgAlias: orgAlias
            });
            } else {
                // No cache, fetch normally
                loadingDiv.style.display = 'block';
                vscode.postMessage({
                    command: 'getAllFieldsWithDataType',
                    objectName: objectName,
                    orgAlias: orgAlias
                });
            }
        },
        
        hideExternalIdSelection: function() {
            const modal = document.getElementById('external-id-selection-modal');
            modal.classList.remove('show');
        },
        
        renderExternalIdFieldList: function() {
            const fieldList = document.getElementById('external-id-list');
            fieldList.innerHTML = '';
            
            const relationshipFields = [];
            const regularFields = [];
            
            externalIdModalState.filteredFields.forEach(field => {
                const dataType = field.type || '';
                const isRelationship = (
                    dataType.includes('Lookup') ||
                    dataType === 'Hierarchy' ||
                    dataType.includes('Master-Detail')
                );
                
                if (isRelationship) {
                    relationshipFields.push(field);
                } else {
                    regularFields.push(field);
                }
            });
            
            if (relationshipFields.length > 0) {
                const relationshipHeader = document.createElement('div');
                relationshipHeader.className = 'field-group-header';
                relationshipHeader.textContent = 'Relationship Fields';
                fieldList.appendChild(relationshipHeader);
                
                relationshipFields.forEach(field => {
                    fieldList.appendChild(this.createExternalIdFieldItem(field));
                });
            }
            
            if (regularFields.length > 0) {
                const regularHeader = document.createElement('div');
                regularHeader.className = 'field-group-header';
                regularHeader.textContent = 'Other Fields';
                if (relationshipFields.length > 0) {
                    regularHeader.style.marginTop = '16px';
                }
                fieldList.appendChild(regularHeader);
                
                regularFields.forEach(field => {
                    fieldList.appendChild(this.createExternalIdFieldItem(field));
                });
            }
        },
        
        createExternalIdFieldItem: function(field) {
            const listItem = document.createElement('div');
            listItem.className = 'object-list-item';
            if (externalIdModalState.selectedFields.has(field.name)) {
                listItem.classList.add('selected');
            }
            
            listItem.innerHTML = `
                <label class="checkbox-label">
                    <input type="checkbox" ${externalIdModalState.selectedFields.has(field.name) ? 'checked' : ''}>
                    <span>${field.label} (${field.name})</span>
                    <span class="field-type-badge">${field.type}</span>
                </label>
            `;
            
            const checkbox = listItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    externalIdModalState.selectedFields.add(field.name);
                    listItem.classList.add('selected');
                } else {
                    externalIdModalState.selectedFields.delete(field.name);
                    listItem.classList.remove('selected');
                }
                
                const saveButton = document.getElementById('external-id-modal-save');
                saveButton.disabled = externalIdModalState.selectedFields.size === 0;
            });
            
            return listItem;
        },
        
        showConfigChangeWarning: function(simulation) {
            const modal = document.getElementById('confirm-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalMessage = document.getElementById('modal-message');
            const confirmButton = document.getElementById('modal-confirm');
            const cancelButton = document.getElementById('modal-cancel');
            
            const action = simulation ? 'simulate' : 'run';
            modalTitle.textContent = 'Configuration Changed';
            modalMessage.textContent = `You have made changes to the migration configuration without regenerating the export file. The current ${action} will use the old configuration. Please regenerate the migration file first to apply your changes.`;
            
            confirmButton.textContent = 'Continue Anyway';
            cancelButton.textContent = 'Cancel';
            
            window.pendingMigrationAction = { 
                simulation,
                proceed: () => {
                    this.showMigrationConfirm(simulation);
                }
            };
            
            modal.classList.add('show');
            modal.style.display = 'flex';
            
            setTimeout(() => {
                cancelButton.focus();
            }, 100);
        },
        
        showMigrationConfirm: function(simulation) {
            const modal = document.getElementById('confirm-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalMessage = document.getElementById('modal-message');
            const confirmButton = document.getElementById('modal-confirm');
            const cancelButton = document.getElementById('modal-cancel');
            
            if (simulation) {
                modalTitle.textContent = 'Confirm Simulation';
                modalMessage.textContent = 'Are you sure you want to run a simulation? This will test the migration without making any changes to the target org.';
            } else {
                modalTitle.textContent = 'Confirm Migration';
                modalMessage.textContent = 'Are you sure you want to run the migration? This will execute the migration and make changes to the target org.';
            }
            
            confirmButton.textContent = 'Confirm';
            cancelButton.textContent = 'Cancel';
            
            window.pendingMigrationAction = { 
                simulation,
                proceed: null // Will be handled by UIUtils
            };
            
            modal.classList.add('show');
            modal.style.display = 'flex';
            
            setTimeout(() => {
                confirmButton.focus();
            }, 100);
        },
        
        showObjectFilter: function(objectName, objectIndex, currentWhereClause) {
            const modal = document.getElementById('object-filter-modal');
            const title = document.getElementById('object-filter-modal-title');
            const whereInput = document.getElementById('object-filter-where');
            const saveButton = document.getElementById('object-filter-save');
            const cancelButton = document.getElementById('object-filter-cancel');
            const clearButton = document.getElementById('object-filter-clear');
            const dataTypeSelect = document.getElementById('object-filter-data-type');
            const insertButton = document.getElementById('object-filter-insert');
            const fieldSearchInput = document.getElementById('object-filter-field-search');
            const fieldPillsDiv = document.getElementById('object-filter-field-pills');
            const fieldLoadingP = document.getElementById('object-filter-field-loading');
            const MigrationObjects = window.SFDMU.MigrationObjects;
            const State = window.SFDMU.State;
            
            // Field picker state - store all fields
            let filterModalFields = [];
            
            title.textContent = `Configure Filters: ${objectName}`;
            whereInput.value = currentWhereClause || '';
            
            // Reset field picker
            fieldSearchInput.value = '';
            fieldPillsDiv.innerHTML = '';
            
            modal.classList.add('show');
            modal.style.display = 'flex';
            
            // Fetch fields for this object
            const sourceOrgSelect = document.getElementById('source-org-select');
            let orgAlias = sourceOrgSelect ? sourceOrgSelect.value : '';
            if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                orgAlias = State.currentConfig.sourceOrg.alias;
            }
            
            if (orgAlias && objectName) {
                // Check cache first
                const cached = State.fieldsCache[orgAlias] && State.fieldsCache[orgAlias][objectName];
                if (cached && cached.fields && cached.fields.length > 0) {
                    // Use cached fields immediately
                    fieldLoadingP.style.display = 'none';
                    filterModalFields = cached.fields;
                    // Still fetch in background to refresh cache
                    vscode.postMessage({
                        command: 'getAllFieldsWithDataType',
                        objectName: objectName,
                        orgAlias: orgAlias
                    });
                } else {
                    // No cache, fetch normally
                fieldLoadingP.style.display = 'block';
                vscode.postMessage({
                        command: 'getAllFieldsWithDataType',
                    objectName: objectName,
                    orgAlias: orgAlias
                });
                }
            } else {
                fieldLoadingP.style.display = 'none';
            }
            
            // Render field pills
            const renderFieldPills = (fields, searchTerm = '') => {
                const pillsContainer = document.getElementById('object-filter-field-pills');
                if (!pillsContainer) {
                    console.error('Field pills container not found');
                    return;
                }
                
                pillsContainer.innerHTML = '';
                
                if (!searchTerm) {
                    return; // Don't show pills if no search term
                }
                
                if (!fields || fields.length === 0) {
                    return; // No fields to show
                }
                
                const term = searchTerm.toLowerCase();
                
                // Separate fields into exact matches (starts with) and contains matches
                const exactMatches = [];
                const containsMatches = [];
                
                fields.forEach(field => {
                    const fieldNameLower = field.name.toLowerCase();
                    const fieldLabelLower = field.label ? field.label.toLowerCase() : '';
                    
                    // Check if field name or label starts with the search term (exact match)
                    if (fieldNameLower.startsWith(term) || fieldLabelLower.startsWith(term)) {
                        exactMatches.push(field);
                    }
                    // Check if field name or label contains the search term (but doesn't start with it)
                    else if (fieldNameLower.includes(term) || fieldLabelLower.includes(term)) {
                        containsMatches.push(field);
                    }
                });
                
                // Combine: exact matches first, then contains matches
                const filtered = [...exactMatches, ...containsMatches];
                
                // Limit to 20 pills to avoid overwhelming the UI
                const limited = filtered.slice(0, 20);
                
                limited.forEach(field => {
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
                        // Insert field name into WHERE clause at cursor position
                        const currentWhereInput = document.getElementById('object-filter-where');
                        if (currentWhereInput) {
                            const start = currentWhereInput.selectionStart;
                            const end = currentWhereInput.selectionEnd;
                            const text = currentWhereInput.value;
                            const newText = text.substring(0, start) + field.name + text.substring(end);
                            currentWhereInput.value = newText;
                            
                            // Set cursor position after inserted field
                            const newCursorPos = start + field.name.length;
                            currentWhereInput.setSelectionRange(newCursorPos, newCursorPos);
                            currentWhereInput.focus();
                        }
                        
                        // Clear search input
                        const currentSearchInput = document.getElementById('object-filter-field-search');
                        if (currentSearchInput) {
                            currentSearchInput.value = '';
                        }
                        pillsContainer.innerHTML = '';
                    });
                    
                    pill.addEventListener('mouseenter', () => {
                        pill.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
                        pill.style.borderColor = 'var(--vscode-button-border, var(--vscode-panel-border))';
                    });
                    
                    pill.addEventListener('mouseleave', () => {
                        pill.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
                        pill.style.borderColor = 'var(--vscode-button-border, var(--vscode-panel-border))';
                    });
                    
                    pillsContainer.appendChild(pill);
                });
            };
            
            // Field search handler - update pills as user types
            const fieldSearchHandler = () => {
                const currentSearchInput = document.getElementById('object-filter-field-search');
                if (!currentSearchInput) {
                    console.error('Field search input not found');
                    return;
                }
                
                const searchTerm = currentSearchInput.value.trim();
                if (filterModalFields.length > 0) {
                    renderFieldPills(filterModalFields, searchTerm);
                }
            };
            
            // Store field data handler for cleanup
            const fieldDataHandler = (event) => {
                const message = event.data;
                if (message.command === 'allFieldsWithDataType' && message.objectName === objectName) {
                    const currentLoadingP = document.getElementById('object-filter-field-loading');
                    if (currentLoadingP) {
                        currentLoadingP.style.display = 'none';
                    }
                    
                    if (message.fields && message.fields.length > 0) {
                        filterModalFields = message.fields;
                        console.log('Loaded fields:', filterModalFields.length);
                        
                        // If there's already text in the search, show matching pills
                        const currentSearchInput = document.getElementById('object-filter-field-search');
                        if (currentSearchInput) {
                            const searchTerm = currentSearchInput.value.trim();
                            if (searchTerm) {
                                renderFieldPills(filterModalFields, searchTerm);
                            }
                        }
                    } else {
                        filterModalFields = [];
                        console.log('No fields loaded');
                    }
                }
            };
            window.addEventListener('message', fieldDataHandler);
            modal._fieldDataHandler = fieldDataHandler;
            
            // Function to get sample value based on data type
            const getSampleValue = (dataType) => {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                
                switch (dataType) {
                    case 'string':
                        return "'Sample Text'";
                    case 'number':
                        return '12345';
                    case 'boolean-true':
                        return 'true';
                    case 'boolean-false':
                        return 'false';
                    case 'date':
                        return `${year}-${month}-${day}`;
                    case 'datetime':
                        return `${year}-${month}-${day}T00:00:00.000-0000`;
                    case 'date-today':
                        return 'TODAY';
                    case 'date-yesterday':
                        return 'YESTERDAY';
                    case 'date-tomorrow':
                        return 'TOMORROW';
                    case 'date-last-week':
                        return 'LAST_WEEK';
                    case 'date-this-week':
                        return 'THIS_WEEK';
                    case 'date-next-week':
                        return 'NEXT_WEEK';
                    case 'date-last-month':
                        return 'LAST_MONTH';
                    case 'date-this-month':
                        return 'THIS_MONTH';
                    case 'date-next-month':
                        return 'NEXT_MONTH';
                    case 'date-last-year':
                        return 'LAST_YEAR';
                    case 'date-this-year':
                        return 'THIS_YEAR';
                    case 'date-next-year':
                        return 'NEXT_YEAR';
                    case 'null':
                        return 'null';
                    default:
                        return '';
                }
            };
            
            // Insert handler
            const insertHandler = () => {
                const currentDataTypeSelect = document.getElementById('object-filter-data-type');
                const dataType = currentDataTypeSelect ? currentDataTypeSelect.value : dataTypeSelect.value;
                const sampleValue = getSampleValue(dataType);
                
                if (sampleValue) {
                    const start = whereInput.selectionStart;
                    const end = whereInput.selectionEnd;
                    const text = whereInput.value;
                    const newText = text.substring(0, start) + sampleValue + text.substring(end);
                    whereInput.value = newText;
                    
                    // Set cursor position after inserted text
                    const newCursorPos = start + sampleValue.length;
                    whereInput.setSelectionRange(newCursorPos, newCursorPos);
                    whereInput.focus();
                }
            };
            
            // Save handler - validates SOQL via backend
            const saveHandler = async () => {
                const whereClause = whereInput.value.trim();
                
                // Validate SOQL if clause is not empty
                    if (whereClause) {
                    // Get org alias
                    const sourceOrgSelect = document.getElementById('source-org-select');
                    let orgAlias = sourceOrgSelect ? sourceOrgSelect.value : '';
                    if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                        orgAlias = State.currentConfig.sourceOrg.alias;
                    }
                    
                    if (!orgAlias) {
                        // Show error if no org selected
                        let errorMsg = document.getElementById('object-filter-error');
                        if (!errorMsg) {
                            errorMsg = document.createElement('p');
                            errorMsg.id = 'object-filter-error';
                            errorMsg.className = 'error-text';
                            errorMsg.style.marginTop = '8px';
                            whereInput.parentNode.appendChild(errorMsg);
                        }
                        errorMsg.textContent = 'Please select a source org first to validate the WHERE clause';
                        errorMsg.style.display = 'block';
                        whereInput.classList.add('error-input');
                        whereInput.focus();
                        return;
                    }
                    
                    // Show loading state
                    const saveButton = document.getElementById('object-filter-save');
                    const originalButtonText = saveButton ? saveButton.textContent : 'Save';
                    if (saveButton) {
                        saveButton.disabled = true;
                        saveButton.textContent = 'Validating...';
                    }
                    
                    // Remove any existing error styling
                    whereInput.classList.remove('error-input');
                    const existingErrorMsg = document.getElementById('object-filter-error');
                    if (existingErrorMsg) {
                        existingErrorMsg.style.display = 'none';
                    }
                    
                    // Validate via backend
                    return new Promise((resolve) => {
                        const validationHandler = (event) => {
                            const message = event.data;
                            if (message.command === 'soqlWhereClauseValidated' && 
                                message.objectName === objectName && 
                                message.whereClause === whereClause) {
                                window.removeEventListener('message', validationHandler);
                                
                                // Restore button state
                                if (saveButton) {
                                    saveButton.disabled = false;
                                    saveButton.textContent = originalButtonText;
                                }
                                
                                if (!message.valid) {
                                    // Show error message
                                    let errorMsg = document.getElementById('object-filter-error');
                                    if (!errorMsg) {
                                        errorMsg = document.createElement('p');
                                        errorMsg.id = 'object-filter-error';
                                        errorMsg.className = 'error-text';
                                        errorMsg.style.marginTop = '8px';
                                        whereInput.parentNode.appendChild(errorMsg);
                                    }
                                    errorMsg.textContent = `SOQL Error: ${message.error || 'Invalid WHERE clause'}`;
                                    errorMsg.style.display = 'block';
                                    
                                    // Highlight the textarea
                                    whereInput.classList.add('error-input');
                                    whereInput.focus();
                                    
                                    // Don't save, keep modal open
                                    resolve();
                                    return;
                                }
                                
                                // Validation passed - proceed with save
                                if (State.currentConfig.objects && objectIndex >= 0 && objectIndex < State.currentConfig.objects.length) {
                        State.currentConfig.objects[objectIndex].whereClause = whereClause;
                                    // Trigger update to save the change
                                    if (MigrationObjects.update) {
                                        MigrationObjects.update();
                                    }
                                    // Re-render to update the gear button appearance
                                    MigrationObjects.render();
                                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                                        window.SFDMU.ConfigChangeChecker.check();
                                    }
                                }
                                this.hideObjectFilter();
                                resolve();
                            } else if (message.command === 'soqlWhereClauseValidationError' && 
                                      message.objectName === objectName && 
                                      message.whereClause === whereClause) {
                                window.removeEventListener('message', validationHandler);
                                
                                // Restore button state
                                if (saveButton) {
                                    saveButton.disabled = false;
                                    saveButton.textContent = originalButtonText;
                                }
                                
                                // Show error message
                                let errorMsg = document.getElementById('object-filter-error');
                                if (!errorMsg) {
                                    errorMsg = document.createElement('p');
                                    errorMsg.id = 'object-filter-error';
                                    errorMsg.className = 'error-text';
                                    errorMsg.style.marginTop = '8px';
                                    whereInput.parentNode.appendChild(errorMsg);
                                }
                                errorMsg.textContent = `SOQL Error: ${message.error || 'Failed to validate WHERE clause'}`;
                                errorMsg.style.display = 'block';
                                
                                // Highlight the textarea
                                whereInput.classList.add('error-input');
                                whereInput.focus();
                                
                                resolve();
                            }
                        };
                        
                        window.addEventListener('message', validationHandler);
                        
                        // Request validation from backend
                        vscode.postMessage({
                            command: 'validateSOQLWhereClause',
                            objectName: objectName,
                            whereClause: whereClause,
                            orgAlias: orgAlias
                        });
                    });
                    } else {
                    // Empty clause is valid - proceed with save
                    // Remove error styling if clause is empty
                    whereInput.classList.remove('error-input');
                    const errorMsg = document.getElementById('object-filter-error');
                    if (errorMsg) {
                        errorMsg.style.display = 'none';
                    }
                    
                    if (State.currentConfig.objects && objectIndex >= 0 && objectIndex < State.currentConfig.objects.length) {
                        delete State.currentConfig.objects[objectIndex].whereClause;
                    // Trigger update to save the change
                    if (MigrationObjects.update) {
                        MigrationObjects.update();
                    }
                    // Re-render to update the gear button appearance
                    MigrationObjects.render();
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                }
                this.hideObjectFilter();
                }
            };
            
            // Clear handler
            const clearHandler = () => {
                whereInput.value = '';
                if (State.currentConfig.objects && objectIndex >= 0 && objectIndex < State.currentConfig.objects.length) {
                    delete State.currentConfig.objects[objectIndex].whereClause;
                    // Trigger update to save the change
                    if (MigrationObjects.update) {
                        MigrationObjects.update();
                    }
                    // Re-render to update the gear button appearance
                    MigrationObjects.render();
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                }
                this.hideObjectFilter();
            };
            
            // Clear error styling when user types
            whereInput.addEventListener('input', () => {
                whereInput.classList.remove('error-input');
                const errorMsg = document.getElementById('object-filter-error');
                if (errorMsg) {
                    errorMsg.style.display = 'none';
                }
            });
            
            // Remove old listeners and add new ones
            const newSaveButton = saveButton.cloneNode(true);
            saveButton.parentNode.replaceChild(newSaveButton, saveButton);
            newSaveButton.addEventListener('click', saveHandler);
            
            const newClearButton = clearButton.cloneNode(true);
            clearButton.parentNode.replaceChild(newClearButton, clearButton);
            newClearButton.addEventListener('click', clearHandler);
            
            const newCancelButton = cancelButton.cloneNode(true);
            cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);
            newCancelButton.addEventListener('click', () => {
                // Clear error styling when canceling
                whereInput.classList.remove('error-input');
                const errorMsg = document.getElementById('object-filter-error');
                if (errorMsg) {
                    errorMsg.style.display = 'none';
                }
                this.hideObjectFilter();
            });
            
            // Insert button handler
            const newInsertButton = insertButton.cloneNode(true);
            insertButton.parentNode.replaceChild(newInsertButton, insertButton);
            newInsertButton.addEventListener('click', insertHandler);
            
            // Allow Enter key on data type select to insert
            const newDataTypeSelect = dataTypeSelect.cloneNode(true);
            dataTypeSelect.parentNode.replaceChild(newDataTypeSelect, dataTypeSelect);
            const finalDataTypeSelect = document.getElementById('object-filter-data-type');
            finalDataTypeSelect.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    insertHandler();
                }
            });
            
            // Field picker handler - update pills as user types
            const newFieldSearchInput = fieldSearchInput.cloneNode(true);
            fieldSearchInput.parentNode.replaceChild(newFieldSearchInput, fieldSearchInput);
            newFieldSearchInput.addEventListener('input', () => {
                const searchTerm = newFieldSearchInput.value.trim();
                console.log('Search term:', searchTerm, 'Fields available:', filterModalFields.length);
                if (filterModalFields.length > 0) {
                    renderFieldPills(filterModalFields, searchTerm);
                }
            });
            
            // Close on outside click
            const clickHandler = (e) => {
                if (e.target === modal) {
                    this.hideObjectFilter();
                }
            };
            modal.addEventListener('click', clickHandler);
            
            // Store click handler for cleanup
            modal._filterClickHandler = clickHandler;
            
            setTimeout(() => {
                whereInput.focus();
            }, 100);
        },
        
        hideObjectFilter: function() {
            const modal = document.getElementById('object-filter-modal');
            const whereInput = document.getElementById('object-filter-where');
            modal.classList.remove('show');
            modal.style.display = 'none';
            
            // Clear error styling when hiding modal
            if (whereInput) {
                whereInput.classList.remove('error-input');
            }
            const errorMsg = document.getElementById('object-filter-error');
            if (errorMsg) {
                errorMsg.style.display = 'none';
            }
            
            // Remove click handler
            if (modal._filterClickHandler) {
                modal.removeEventListener('click', modal._filterClickHandler);
                delete modal._filterClickHandler;
            }
            
            // Remove field data handler
            if (modal._fieldDataHandler) {
                window.removeEventListener('message', modal._fieldDataHandler);
                delete modal._fieldDataHandler;
            }
            
            // Hide field list
            const fieldListDiv = document.getElementById('object-filter-field-list');
            if (fieldListDiv) {
                fieldListDiv.style.display = 'none';
            }
        },
        
        showConfigConflict: function(configName, targetPath, operation) {
            return new Promise((resolve) => {
                const modal = document.getElementById('config-conflict-modal');
                const messageEl = document.getElementById('config-conflict-message');
                const cancelBtn = document.getElementById('config-conflict-cancel');
                const keepBothBtn = document.getElementById('config-conflict-keep-both');
                const replaceBtn = document.getElementById('config-conflict-replace');
                
                // Clear previous event listeners by cloning and replacing
                const newCancelBtn = cancelBtn.cloneNode(true);
                const newKeepBothBtn = keepBothBtn.cloneNode(true);
                const newReplaceBtn = replaceBtn.cloneNode(true);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                keepBothBtn.parentNode.replaceChild(newKeepBothBtn, keepBothBtn);
                replaceBtn.parentNode.replaceChild(newReplaceBtn, replaceBtn);
                
                // Set message
                const operationText = operation === 'save' ? 'save' : 'move';
                const displayPath = targetPath ? `${targetPath}/${configName}` : configName;
                messageEl.textContent = `A configuration named "${configName}" already exists at "${displayPath}". How would you like to proceed?`;
                
                // Show modal
                modal.classList.add('show');
                modal.style.display = 'flex';
                
                // Handle cancel
                newCancelBtn.addEventListener('click', () => {
                    modal.classList.remove('show');
                    modal.style.display = 'none';
                    resolve({ action: 'cancel' });
                });
                
                // Handle keep both
                newKeepBothBtn.addEventListener('click', () => {
                    modal.classList.remove('show');
                    modal.style.display = 'none';
                    resolve({ action: 'keepBoth' });
                });
                
                // Handle replace
                newReplaceBtn.addEventListener('click', () => {
                    modal.classList.remove('show');
                    modal.style.display = 'none';
                    resolve({ action: 'replace' });
                });
                
                // Focus on replace button (default action)
                setTimeout(() => {
                    newReplaceBtn.focus();
                }, 100);
            });
        }
    };
})();

