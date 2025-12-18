// Migration Objects Module
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;
    
    window.SFDMU.MigrationObjects = {
        add: function(objectName = '', externalId = '', useCustomQuery = false, soqlQuery = '') {
            if (!State.currentConfig.objects) {
                State.currentConfig.objects = [];
            }
            
            const newObject = {
                objectName: objectName,
                externalId: externalId,
                phaseNumber: 1,
                useCustomQuery: useCustomQuery,
                soqlQuery: soqlQuery
            };
            
            State.currentConfig.objects.push(newObject);
            this.render();
            
            // Prefetch fields for the newly added object
            if (objectName) {
                const sourceOrgSelect = document.getElementById('source-org-select');
                let orgAlias = sourceOrgSelect ? sourceOrgSelect.value : '';
                if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                    orgAlias = State.currentConfig.sourceOrg.alias;
                }
                if (orgAlias && window.SFDMU.Main && window.SFDMU.Main.prefetchFields) {
                    window.SFDMU.Main.prefetchFields(orgAlias, objectName);
                }
            }
            
            if (!State.isCheckingConfigChanges && State.lastGeneratedConfig) {
                setTimeout(() => {
                    if (window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check(true);
                    }
                }, 100);
            }
        },
        
        remove: function(index) {
            if (State.currentConfig.objects && index >= 0 && index < State.currentConfig.objects.length) {
                State.currentConfig.objects.splice(index, 1);
                this.render();
                
                if (!State.isCheckingConfigChanges && State.lastGeneratedConfig) {
                    setTimeout(() => {
                        if (window.SFDMU.ConfigChangeChecker) {
                            window.SFDMU.ConfigChangeChecker.check(true);
                        }
                    }, 100);
                }
            }
        },
        
        move: function(index, direction) {
            if (!State.currentConfig.objects || index < 0 || index >= State.currentConfig.objects.length) {
                return;
            }
            
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            
            if (newIndex < 0 || newIndex >= State.currentConfig.objects.length) {
                return;
            }
            
            const cards = document.querySelectorAll('.migration-object-card');
            const currentCard = cards[index];
            const targetCard = cards[newIndex];
            
            if (currentCard && targetCard) {
                if (direction === 'up') {
                    currentCard.classList.add('moving-up', 'is-active-moving');
                    targetCard.classList.add('moving-down');
                } else {
                    currentCard.classList.add('moving-down', 'is-active-moving');
                    targetCard.classList.add('moving-up');
                }
                
                const temp = State.currentConfig.objects[index];
                State.currentConfig.objects[index] = State.currentConfig.objects[newIndex];
                State.currentConfig.objects[newIndex] = temp;
                
                setTimeout(() => {
                    this.render();
                    if (!State.isCheckingConfigChanges && State.lastGeneratedConfig) {
                        setTimeout(() => {
                            if (window.SFDMU.ConfigChangeChecker) {
                                window.SFDMU.ConfigChangeChecker.check(true);
                            }
                        }, 100);
                    }
                }, 300);
            } else {
                const temp = State.currentConfig.objects[index];
                State.currentConfig.objects[index] = State.currentConfig.objects[newIndex];
                State.currentConfig.objects[newIndex] = temp;
                this.render();
                
                if (!State.isCheckingConfigChanges && State.lastGeneratedConfig) {
                    setTimeout(() => {
                        if (window.SFDMU.ConfigChangeChecker) {
                            window.SFDMU.ConfigChangeChecker.check(true);
                        }
                    }, 100);
                }
            }
        },
        
        update: function() {
            const objectCards = document.querySelectorAll('.migration-object-card');
            const oldObjects = [...(State.currentConfig.objects || [])];
            State.currentConfig.objects = [];
            
            objectCards.forEach((card, index) => {
                const oldObj = oldObjects[index] || {};
                
                // When using a custom query, the Object Name row may be hidden.
                // Fall back to the previous value so toggling the checkbox
                // does not delete the object from the configuration.
                const objectNameInput = card.querySelector('.migration-input[data-field="objectName"]');
                const objectName = (objectNameInput && objectNameInput.value) || oldObj.objectName || '';
                
                const externalIdInput = card.querySelector('.migration-input[data-field="externalId"]');
                const externalId = (externalIdInput && externalIdInput.value) || oldObj.externalId || '';
                
                const useCustomQueryCheckbox = card.querySelector('.use-custom-query');
                const useCustomQuery = useCustomQueryCheckbox !== null
                    ? !!useCustomQueryCheckbox.checked
                    : !!oldObj.useCustomQuery;
                
                const soqlTextarea = card.querySelector('.migration-textarea');
                const soqlQuery = (soqlTextarea && soqlTextarea.value) || oldObj.soqlQuery || '';
                
                if (objectName) {
                    State.currentConfig.objects.push({
                        objectName: objectName,
                        externalId: externalId,
                        phaseNumber: oldObj.phaseNumber || 1,
                        useCustomQuery: useCustomQuery,
                        soqlQuery: soqlQuery,
                        selectedFields: oldObj.selectedFields,
                        whereClause: oldObj.whereClause
                    });
                }
            });
            
            if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                window.SFDMU.ConfigChangeChecker.check();
            }
        },
        
        render: function() {
            const container = document.getElementById('migration-objects-list');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (!State.currentConfig.objects || State.currentConfig.objects.length === 0) {
                container.innerHTML = '<p class="info-text">No objects added yet. Click "Add Object" to get started.</p>';
                return;
            }
            
            State.currentConfig.objects.forEach((obj, index) => {
                const objectCard = document.createElement('div');
                objectCard.className = 'migration-object-card';
                objectCard.dataset.index = index.toString();
                
                const numberBadge = document.createElement('div');
                numberBadge.className = 'migration-object-number';
                numberBadge.textContent = (index + 1).toString();
                numberBadge.title = `Migration order: ${index + 1}`;
                
                const cardContent = document.createElement('div');
                cardContent.className = 'migration-object-content';
                
                const removeButtonContainer = document.createElement('div');
                removeButtonContainer.className = 'migration-object-remove-container';
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'migration-object-remove';
                removeBtn.type = 'button';
                removeBtn.innerHTML = '×';
                removeBtn.title = 'Remove object';
                removeBtn.setAttribute('aria-label', 'Remove object');
                removeBtn.addEventListener('click', () => {
                    this.remove(index);
                });
                
                removeButtonContainer.appendChild(removeBtn);
                
                const moveButtonsContainer = document.createElement('div');
                moveButtonsContainer.className = 'migration-object-actions';
                
                const moveUpBtn = document.createElement('button');
                moveUpBtn.className = 'migration-object-move';
                moveUpBtn.type = 'button';
                moveUpBtn.innerHTML = '↑';
                moveUpBtn.title = 'Move up';
                moveUpBtn.setAttribute('aria-label', 'Move up');
                moveUpBtn.disabled = index === 0;
                moveUpBtn.addEventListener('click', () => {
                    this.move(index, 'up');
                });
                
                const moveDownBtn = document.createElement('button');
                moveDownBtn.className = 'migration-object-move';
                moveDownBtn.type = 'button';
                moveDownBtn.innerHTML = '↓';
                moveDownBtn.title = 'Move down';
                moveDownBtn.setAttribute('aria-label', 'Move down');
                moveDownBtn.disabled = index === State.currentConfig.objects.length - 1;
                moveDownBtn.addEventListener('click', () => {
                    this.move(index, 'down');
                });
                
                moveButtonsContainer.appendChild(moveUpBtn);
                moveButtonsContainer.appendChild(moveDownBtn);
                
                const nameField = document.createElement('div');
                nameField.className = 'migration-field';
                const nameLabel = document.createElement('label');
                nameLabel.className = 'migration-field-label';
                nameLabel.textContent = 'Object Name';
                const nameInputGroup = document.createElement('div');
                nameInputGroup.className = 'migration-input-group';
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'migration-input';
                nameInput.value = obj.objectName || '';
                nameInput.placeholder = 'e.g., Account, CustomObject__c';
                nameInput.dataset.field = 'objectName';
                nameInput.addEventListener('input', () => {
                    this.update();
                });
                
                const selectFieldsBtn = document.createElement('button');
                selectFieldsBtn.textContent = obj.selectedFields && obj.selectedFields.length > 0 
                    ? `Fields (${obj.selectedFields.length} selected)` 
                    : 'Select Fields (All)';
                selectFieldsBtn.className = 'migration-action-btn';
                selectFieldsBtn.type = 'button';
                selectFieldsBtn.addEventListener('click', () => {
                    const objectName = nameInput.value.trim();
                    if (!objectName) {
                        vscode.postMessage({ command: 'showError', message: 'Please enter an object name first' });
                        return;
                    }
                    const sourceOrgSelect = document.getElementById('source-org-select');
                    let orgAlias = sourceOrgSelect.value;
                    
                    if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                        orgAlias = State.currentConfig.sourceOrg.alias;
                    }
                    
                    if (!orgAlias) {
                        vscode.postMessage({ command: 'showError', message: 'Please select a source org first' });
                        return;
                    }
                    
                    if (window.SFDMU.Modals) {
                        window.SFDMU.Modals.showFieldSelection(objectName, orgAlias, index, obj.selectedFields || []);
                    }
                });
                
                // Create filter button (outside the 85% group)
                const filterBtn = document.createElement('button');
                filterBtn.className = 'migration-action-btn migration-filter-btn';
                filterBtn.type = 'button';
                filterBtn.title = obj.whereClause ? 'Edit WHERE clause' : 'Add WHERE clause';
                filterBtn.innerHTML = `
                    <span class="codicon codicon-edit" style="margin-right: 4px;"></span>
                    WHERE
                `;
                // Set initial button state
                if (obj.whereClause) {
                    filterBtn.classList.add('has-filter');
                    filterBtn.title = 'Edit WHERE clause';
                } else {
                    filterBtn.title = 'Add WHERE clause';
                }
                
                filterBtn.addEventListener('click', () => {
                    if (window.SFDMU.Modals) {
                        window.SFDMU.Modals.showObjectFilter(obj.objectName, index, obj.whereClause || '');
                    }
                });
                
                nameInputGroup.appendChild(nameInput);
                nameInputGroup.appendChild(selectFieldsBtn);
                
                // Create a wrapper for the input group and filter button
                const nameInputWrapper = document.createElement('div');
                nameInputWrapper.className = 'migration-field-input-wrapper';
                nameInputWrapper.appendChild(nameInputGroup);
                nameInputWrapper.appendChild(filterBtn);
                
                nameField.appendChild(nameLabel);
                nameField.appendChild(nameInputWrapper);
                
                const externalIdField = document.createElement('div');
                externalIdField.className = 'migration-field';
                const externalIdLabel = document.createElement('label');
                externalIdLabel.className = 'migration-field-label';
                externalIdLabel.textContent = 'External ID';
                const externalIdGroup = document.createElement('div');
                externalIdGroup.className = 'migration-input-group';
                const externalIdInput = document.createElement('input');
                externalIdInput.type = 'text';
                externalIdInput.className = 'migration-input';
                externalIdInput.value = obj.externalId || '';
                externalIdInput.placeholder = 'e.g., Name, Id, or composite: Field1;Field2';
                externalIdInput.dataset.field = 'externalId';
                externalIdInput.addEventListener('input', () => {
                    this.update();
                });
                
                const selectExternalIdBtn = document.createElement('button');
                selectExternalIdBtn.textContent = 'Select External ID';
                selectExternalIdBtn.className = 'migration-action-btn';
                selectExternalIdBtn.type = 'button';
                selectExternalIdBtn.addEventListener('click', () => {
                    const objectName = nameInput.value.trim();
                    if (!objectName) {
                        vscode.postMessage({ command: 'showError', message: 'Please enter an object name first' });
                        return;
                    }
                    const sourceOrgSelect = document.getElementById('source-org-select');
                    let orgAlias = sourceOrgSelect.value;
                    
                    if (!orgAlias && State.currentConfig.sourceOrg && State.currentConfig.sourceOrg.alias) {
                        orgAlias = State.currentConfig.sourceOrg.alias;
                    }
                    
                    if (!orgAlias) {
                        vscode.postMessage({ command: 'showError', message: 'Please select a source org first' });
                        return;
                    }
                    
                    if (window.SFDMU.Modals) {
                        window.SFDMU.Modals.showExternalIdSelection(objectName, orgAlias, index, externalIdInput);
                    }
                });
                
                externalIdGroup.appendChild(externalIdInput);
                externalIdGroup.appendChild(selectExternalIdBtn);
                externalIdField.appendChild(externalIdLabel);
                externalIdField.appendChild(externalIdGroup);
                
                const customQueryField = document.createElement('div');
                customQueryField.className = 'migration-field';
                const customQueryLabel = document.createElement('label');
                customQueryLabel.className = 'migration-checkbox-label';
                const customQueryCheckbox = document.createElement('input');
                customQueryCheckbox.type = 'checkbox';
                customQueryCheckbox.className = 'migration-checkbox use-custom-query';
                customQueryCheckbox.checked = obj.useCustomQuery || false;
                customQueryCheckbox.addEventListener('change', () => {
                    this.update();
                    this.render();
                });
                const customQuerySpan = document.createElement('span');
                customQuerySpan.textContent = 'Use custom SOQL query';
                customQueryLabel.appendChild(customQueryCheckbox);
                customQueryLabel.appendChild(customQuerySpan);
                customQueryField.appendChild(customQueryLabel);
                
                if (obj.useCustomQuery) {
                    const soqlField = document.createElement('div');
                    soqlField.className = 'migration-field';
                    const soqlLabel = document.createElement('label');
                    soqlLabel.className = 'migration-field-label';
                    soqlLabel.textContent = 'SOQL Query';
                    const soqlInput = document.createElement('textarea');
                    soqlInput.className = 'migration-textarea';
                    soqlInput.value = obj.soqlQuery || '';
                    soqlInput.placeholder = 'SELECT Id, Name FROM ObjectName WHERE ...';
                    soqlInput.rows = 3;
                    soqlInput.addEventListener('input', () => {
                        this.update();
                    });
                    soqlField.appendChild(soqlLabel);
                    soqlField.appendChild(soqlInput);
                    cardContent.appendChild(soqlField);
                }
                
                // Only show Object Name field when not using custom query
                if (!obj.useCustomQuery) {
                    cardContent.appendChild(nameField);
                }
                cardContent.appendChild(externalIdField);
                cardContent.appendChild(customQueryField);
                
                objectCard.appendChild(numberBadge);
                objectCard.appendChild(cardContent);
                objectCard.appendChild(removeButtonContainer);
                objectCard.appendChild(moveButtonsContainer);
                
                container.appendChild(objectCard);
            });
        },
        
        renderExcludedObjects: function() {
            const textarea = document.getElementById('excluded-objects');
            if (!textarea) return;
            
            if (State.currentConfig.excludedObjects && State.currentConfig.excludedObjects.length > 0) {
                textarea.value = State.currentConfig.excludedObjects.join('\n');
            } else {
                textarea.value = '';
                State.currentConfig.excludedObjects = [];
            }
        }
    };
})();

