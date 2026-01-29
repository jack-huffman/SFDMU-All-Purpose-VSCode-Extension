/**
 * CPQ State Management
 * Manages global state for CPQ mode including phases and master selection modal
 */

(function() {
    'use strict';

    try {
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Cpq = window.SFDMU.Cpq || {};

    // Phase state
    let phaseDefinitions = [];
    let hasPhaseFiles = false;
    let activePhaseTab = 1;

    // Master selection modal state
    window.masterSelectionModalState = {
        phaseNumber: null,
        selectableObjects: [], // Array of { objectName, externalIdField, records: [], allRecordsLoaded: false, loadedCount: 0, totalCount: 0 }
        selectedRecords: {}, // { objectName: Set(externalIdValues) }
        selectedRecordIds: {}, // { objectName: Map(externalIdValue -> Id) } - Map to store Id for each external ID
        excludedObjects: new Set(), // Set of object names marked as "do not migrate"
        currentTab: null,
        isLoading: false,
        sortState: {}, // { objectName: { column: string, direction: 'asc' | 'desc' } }
        searchTerms: {}, // { objectName: string } - current search term per object
        loadingMore: {}, // { objectName: boolean } - track if loading more records
        // Generic hierarchical state
        childRecordsByParent: {}, // { parentObjectName: { parentId: childRecord[] } }
        expandedParents: {} // { parentObjectName: Set(parentId) }
    };

    // State setters
    window.SFDMU.Cpq.setPhaseDefinitions = function(definitions) {
        phaseDefinitions = definitions || [];
    };

    window.SFDMU.Cpq.setHasPhaseFiles = function(hasFiles) {
        hasPhaseFiles = !!hasFiles;
    };

    window.SFDMU.Cpq.setActivePhaseTab = function(tabNumber) {
        activePhaseTab = tabNumber;
    };

    window.SFDMU.Cpq.getPhaseDefinitions = function() {
        return phaseDefinitions;
    };

    window.SFDMU.Cpq.getHasPhaseFiles = function() {
        return hasPhaseFiles;
    };

    window.SFDMU.Cpq.getActivePhaseTab = function() {
        return activePhaseTab;
    };

    // Expose masterSelectionModalState
    window.SFDMU.Cpq.masterSelectionModalState = window.masterSelectionModalState;
    } catch (error) {
        console.error('Error loading CPQ state.js:', error);
        // Ensure namespace exists even on error
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    }
})();

