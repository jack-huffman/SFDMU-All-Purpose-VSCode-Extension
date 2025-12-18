// Shared state management and vscode API
(function() {
    'use strict';
    
    window.SFDMU = window.SFDMU || {};
    
    // Make vscode API globally accessible
    window.SFDMU.vscode = acquireVsCodeApi();
    
    // Default excluded objects (can be customized)
    const DEFAULT_EXCLUDED_OBJECTS = [];
    
    // Shared state
    window.SFDMU.State = {
        currentConfig: {
            mode: 'standard', // 'standard' object-based or 'cpq' phase-based
            objects: [],
            // CPQ mode fields (used when mode === 'cpq')
            selectedPhases: [],
            completedPhases: [],
            includeProduct2: false,
            sourceOrg: { username: '', instanceUrl: '' },
            targetOrg: { username: '', instanceUrl: '' },
            operation: 'Upsert',
            modifiedSince: '',
            customFilters: [],
            excludedObjects: DEFAULT_EXCLUDED_OBJECTS,
            outputDir: 'sfdmu-migration'
        },
        
        orgList: [],
        objectCounter: 0, // Counter for unique object IDs
        lastGeneratedConfig: null, // Snapshot of config when files were last generated
        isCheckingConfigChanges: false, // Flag to prevent recursive calls
        isSyncingOrgs: false, // Flag to prevent config checks during org sync
        isRefreshingOrgs: false, // Flag to track manual org refresh for notification
        explorerTree: [],
        selectedConfigPath: null,
        currentFolderPath: null, // Track the folder path separately from config name
        objectsCache: {}, // Cache for objects by org alias: { [orgAlias]: { objects: [], timestamp: number } }
        fieldsCache: {}, // Cache for fields by org alias and object name: { [orgAlias]: { [objectName]: { fields: [], timestamp: number } } }
        
        // Modal states
        objectModalState: {
            selectedObjects: new Set(),
            searchTerm: '',
            isLoading: false
        },
        
        fieldModalState: {
            objectIndex: -1,
            selectedFields: new Set(),
            searchTerm: '',
            isLoading: false
        },
        
        externalIdModalState: {
            objectIndex: -1,
            selectedField: null,
            searchTerm: '',
            isLoading: false
        }
    };
})();

