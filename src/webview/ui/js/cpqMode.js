(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    const vscode = window.SFDMU.vscode;
    const State = window.SFDMU.State;

    // Default excluded objects for CPQ configuration-only migrations
    const CPQ_DEFAULT_EXCLUDED_OBJECTS = [
        'Account',
        'Order',
        'OrderItem',
        'Opportunity',
        'Quote',
        'SBQQ__Quote__c',
        'SBQQ__QuoteLine__c',
        'Contract',
        'SBQQ__Subscription__c',
        'Asset'
    ];

    let phaseDefinitions = [];
    let hasPhaseFiles = false;

    function isCpqMode() {
        return (State.currentConfig.mode || 'standard') === 'cpq';
    }

    function setMode(mode) {
        State.currentConfig.mode = mode;
        const modeToggle = document.getElementById('mode-toggle-switch');
        const objectsContainer = document.getElementById('objects-mode-container');
        const cpqContainer = document.getElementById('cpq-mode-container');
        const titleEl = document.getElementById('migration-objects-title');
        const lastModifiedTab = document.getElementById('config-tab-last-modified-date');
        const cpqDisclaimer = document.getElementById('excluded-objects-cpq-disclaimer');

        // Update toggle switch state
        if (modeToggle) {
            modeToggle.checked = (mode === 'cpq');
        }

        if (objectsContainer && cpqContainer) {
            const mainContent = document.getElementById('main-content');
            
            if (mode === 'cpq') {
                objectsContainer.style.display = 'none';
                cpqContainer.style.display = 'block';
                if (titleEl) {
                    titleEl.textContent = 'CPQ Migrations';
                }
                // Add cpq-mode class to main content to hide standard-mode-only buttons
                if (mainContent) {
                    mainContent.classList.add('cpq-mode');
                }
                // Show CPQ-specific tab in configuration modal
                if (lastModifiedTab) {
                    lastModifiedTab.style.display = 'block';
                }
                // Show CPQ disclaimer
                if (cpqDisclaimer) {
                    cpqDisclaimer.style.display = 'block';
                }

                // When switching into CPQ mode, set excluded objects to CPQ defaults (including Product2)
                State.currentConfig.excludedObjects = [...CPQ_DEFAULT_EXCLUDED_OBJECTS];
                // Ensure Product2 is in excluded objects if not already there
                if (!State.currentConfig.excludedObjects.includes('Product2')) {
                    State.currentConfig.excludedObjects.push('Product2');
                }
                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.renderExcludedObjects) {
                    window.SFDMU.ConfigManager.renderExcludedObjects();
                }
            } else {
                objectsContainer.style.display = 'block';
                cpqContainer.style.display = 'none';
                if (titleEl) {
                    titleEl.textContent = 'Migration Objects';
                }
                // Remove cpq-mode class to show standard-mode-only buttons
                if (mainContent) {
                    mainContent.classList.remove('cpq-mode');
                }
                // When switching to standard mode, clear excluded objects
                State.currentConfig.excludedObjects = [];
                if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.renderExcludedObjects) {
                    window.SFDMU.ConfigManager.renderExcludedObjects();
                }
                // Hide CPQ-specific tab in configuration modal
                if (lastModifiedTab) {
                    lastModifiedTab.style.display = 'none';
                    lastModifiedTab.classList.remove('active');
                }
                // Hide CPQ disclaimer
                if (cpqDisclaimer) {
                    cpqDisclaimer.style.display = 'none';
                }
                // If Last Modified Date tab was active, switch to Excluded Objects
                const lastModifiedContent = document.getElementById('config-tab-content-last-modified-date');
                const excludedTab = document.getElementById('config-tab-excluded-objects');
                const excludedTabContent = document.getElementById('config-tab-content-excluded-objects');
                if (lastModifiedTab && lastModifiedTab.classList.contains('active')) {
                    lastModifiedTab.classList.remove('active');
                    if (lastModifiedContent) {
                        lastModifiedContent.classList.remove('active');
                    }
                    if (excludedTab) {
                        excludedTab.classList.add('active');
                    }
                    if (excludedTabContent) {
                        excludedTabContent.classList.add('active');
                    }
                }
            }
        }

        // Recompute generate button titles / enabled state
        if (window.SFDMU.MigrationExecution && window.SFDMU.MigrationExecution.checkPhaseFiles) {
            setTimeout(() => window.SFDMU.MigrationExecution.checkPhaseFiles(), 50);
        }
    }

    function requestPhaseDefinitions() {
        vscode.postMessage({
            command: 'getCpqPhaseDefinitions',
            includeProduct2: false // Product2 is always excluded in CPQ mode
        });
    }

    function renderIndividualPhases() {
        const container = document.getElementById('cpq-individual-phases');
        if (!container) return;

        container.innerHTML = '';

        if (!phaseDefinitions || phaseDefinitions.length === 0) {
            container.innerHTML = '<p class="info-text">No CPQ phases defined.</p>';
            return;
        }

        // In CPQ mode we include all phases by default
        const selected = phaseDefinitions;
        const completedPhases = State.currentConfig.completedPhases || [];
        
        selected.forEach(phase => {
            const isCompleted = completedPhases.includes(phase.phaseNumber);
            const row = document.createElement('div');
            row.className = 'individual-phase-item';
            if (isCompleted) {
                row.classList.add('phase-completed');
            }

            const info = document.createElement('div');
            info.className = 'individual-phase-info';

            const title = document.createElement('div');
            title.className = 'individual-phase-title';

            // Avoid duplicating "Phase X" if it's already present in the description
            const prefix = `Phase ${phase.phaseNumber}:`;
            const rawDescription = (phase.description || '').trim();
            const hasPrefix = rawDescription.toLowerCase().startsWith(prefix.toLowerCase());
            const titleText = hasPrefix ? rawDescription : `${prefix} ${rawDescription}`;
            title.textContent = titleText;

            const objects = document.createElement('div');
            objects.className = 'individual-phase-objects';

            // Render each object as a pill
            if (Array.isArray(phase.objects) && phase.objects.length > 0) {
                phase.objects.forEach(objName => {
                    const pill = document.createElement('span');
                    pill.className = 'phase-object-pill';
                    pill.textContent = objName;
                    objects.appendChild(pill);
                });
            }

            info.appendChild(title);
            info.appendChild(objects);

            const actions = document.createElement('div');
            actions.className = 'individual-phase-actions';

            // Simulation icon button (matches header simulate icon)
            const simBtn = document.createElement('button');
            simBtn.type = 'button';
            simBtn.className = 'icon-button';
            simBtn.title = 'Simulate this phase';
            simBtn.innerHTML = '<span class="codicon codicon-debug-alt"></span>';
            simBtn.addEventListener('click', async () => {
                const UIUtils = window.SFDMU && window.SFDMU.UIUtils;
                if (UIUtils && UIUtils.showConfirmation) {
                    // Avoid duplicating "Phase X:" if it's already in the description
                    const prefix = `Phase ${phase.phaseNumber}:`;
                    const rawDescription = (phase.description || '').trim();
                    const hasPrefix = rawDescription.toLowerCase().startsWith(prefix.toLowerCase());
                    const descriptionText = hasPrefix ? rawDescription : `${prefix} ${rawDescription}`;
                    
                    const confirmed = await UIUtils.showConfirmation(
                        'Confirm CPQ Phase Simulation',
                        `Run a simulation for ${descriptionText}?`
                    );
                    if (!confirmed) {
                        return;
                    }
                }
                runPhase(phase.phaseNumber, true);
            });

            // Run icon button (matches header run icon)
            const runBtn = document.createElement('button');
            runBtn.type = 'button';
            runBtn.className = 'icon-button icon-button-primary';
            runBtn.title = 'Run this phase';
            runBtn.innerHTML = '<span class="codicon codicon-run"></span>';
            runBtn.addEventListener('click', async () => {
                const UIUtils = window.SFDMU && window.SFDMU.UIUtils;
                if (UIUtils && UIUtils.showConfirmation) {
                    // Avoid duplicating "Phase X:" if it's already in the description
                    const prefix = `Phase ${phase.phaseNumber}:`;
                    const rawDescription = (phase.description || '').trim();
                    const hasPrefix = rawDescription.toLowerCase().startsWith(prefix.toLowerCase());
                    const descriptionText = hasPrefix ? rawDescription : `${prefix} ${rawDescription}`;
                    
                    const confirmed = await UIUtils.showConfirmation(
                        'Confirm CPQ Phase Run',
                        `Run ${descriptionText}? This will execute the migration and make changes to the target org.`
                    );
                    if (!confirmed) {
                        return;
                    }
                }
                runPhase(phase.phaseNumber, false);
            });

            // Disable buttons if phase files do not exist yet OR if phase is marked as done
            if (!hasPhaseFiles || isCompleted) {
                simBtn.disabled = true;
                runBtn.disabled = true;
            }

            // Button to mark phase as done (appears below run buttons)
            const doneBtn = document.createElement('button');
            doneBtn.type = 'button';
            doneBtn.className = 'icon-button phase-done-button';
            if (isCompleted) {
                doneBtn.classList.add('phase-done-button-completed');
            }
            doneBtn.title = isCompleted ? 'Mark as Incomplete' : 'Mark as Complete';
            // Use discard codicon when completed, check codicon when not completed
            doneBtn.innerHTML = isCompleted 
                ? '<span class="codicon codicon-discard"></span>'
                : '<span class="codicon codicon-check"></span>';
            doneBtn.addEventListener('click', () => {
                togglePhaseComplete(phase.phaseNumber, !isCompleted);
            });

            // Create a container for the run buttons and done button
            const runButtonsContainer = document.createElement('div');
            runButtonsContainer.className = 'phase-run-buttons-container';
            runButtonsContainer.appendChild(simBtn);
            runButtonsContainer.appendChild(runBtn);

            const doneButtonContainer = document.createElement('div');
            doneButtonContainer.className = 'phase-done-button-container';
            doneButtonContainer.appendChild(doneBtn);

            actions.appendChild(runButtonsContainer);
            actions.appendChild(doneButtonContainer);

            row.appendChild(info);
            row.appendChild(actions);

            container.appendChild(row);
        });
    }

    function togglePhaseComplete(phaseNumber, isComplete) {
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
        renderIndividualPhases();

        // Auto-save the configuration
        if (window.SFDMU.ConfigManager && window.SFDMU.ConfigManager.updateOrgConfig) {
            window.SFDMU.ConfigManager.updateOrgConfig();
        }
        vscode.postMessage({ command: 'saveConfig', config: State.currentConfig });
    }

    function runPhase(phaseNumber, simulation) {
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
    }

    window.SFDMU.CpqMode = {
        init: function() {
            const modeToggle = document.getElementById('mode-toggle-switch');
            const lastModifiedDate = document.getElementById('cpq-advanced-last-modified-date');

            if (modeToggle) {
                modeToggle.addEventListener('change', (e) => {
                    const mode = e.target.checked ? 'cpq' : 'standard';
                    setMode(mode);
                    if (mode === 'cpq') {
                        requestPhaseDefinitions();
                    }
                });
            }

            if (lastModifiedDate) {
                // Sync initial state from currentConfig
                if (State.currentConfig.modifiedSince) {
                    lastModifiedDate.value = State.currentConfig.modifiedSince;
                }
                lastModifiedDate.addEventListener('change', (e) => {
                    State.currentConfig.modifiedSince = e.target.value || '';
                    if (!State.isCheckingConfigChanges && window.SFDMU.ConfigChangeChecker) {
                        window.SFDMU.ConfigChangeChecker.check();
                    }
                });
            }
        },

        handlePhaseDefinitions: function(phases) {
            phaseDefinitions = phases || [];
            renderIndividualPhases();
        },

        setPhaseFilesStatus: function(hasFiles) {
            hasPhaseFiles = !!hasFiles;
            renderIndividualPhases();
        },

        // Apply the current config's mode to the UI (used when loading/switching configs)
        applyModeFromConfig: function() {
            const mode = (State.currentConfig && State.currentConfig.mode) || 'standard';
            setMode(mode);
            if (mode === 'cpq') {
                requestPhaseDefinitions();
                // Sync LastModifiedDate field
                const lastModifiedDate = document.getElementById('cpq-advanced-last-modified-date');
                if (lastModifiedDate && State.currentConfig.modifiedSince) {
                    lastModifiedDate.value = State.currentConfig.modifiedSince;
                }
            }
        }
    };
})();


