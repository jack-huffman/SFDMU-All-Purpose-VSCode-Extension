/**
 * RCA State Management
 * Manages global state for RCA mode including phases and master selection modal
 */

(function() {
    'use strict';

    try {
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Rca = window.SFDMU.Rca || {};

        // Phase state
        let phaseDefinitions = [];
        let hasPhaseFiles = false;
        let activePhaseTab = 1;

        // Master selection modal state (RCA-specific, reuses CPQ modal HTML)
        const rcaMasterSelectionState = {
            phaseNumber: null,
            selectableObjects: [],
            selectedRecords: {},
            selectedRecordIds: {},
            excludedObjects: new Set(),
            currentTab: null,
            isLoading: false,
            sortState: {},
            searchTerms: {},
            loadingMore: {}
        };

        // Modal cancellation tracking
        let isRcaModalClosed = false;
        const rcaPendingTimeouts = new Set();

        // State setters
        window.SFDMU.Rca.setPhaseDefinitions = function(definitions) {
            phaseDefinitions = definitions || [];
        };

        window.SFDMU.Rca.setHasPhaseFiles = function(hasFiles) {
            hasPhaseFiles = !!hasFiles;
        };

        window.SFDMU.Rca.setActivePhaseTab = function(tabNumber) {
            activePhaseTab = tabNumber;
        };

        window.SFDMU.Rca.getPhaseDefinitions = function() {
            return phaseDefinitions;
        };

        window.SFDMU.Rca.getHasPhaseFiles = function() {
            return hasPhaseFiles;
        };

        window.SFDMU.Rca.getActivePhaseTab = function() {
            return activePhaseTab || 'metadata';
        };

        // Expose master selection state
        window.SFDMU.Rca.getMasterSelectionState = function() {
            return rcaMasterSelectionState;
        };

        window.SFDMU.Rca.setIsRcaModalClosed = function(value) {
            isRcaModalClosed = value;
        };

        window.SFDMU.Rca.getIsRcaModalClosed = function() {
            return isRcaModalClosed;
        };

        window.SFDMU.Rca.getRcaPendingTimeouts = function() {
            return rcaPendingTimeouts;
        };
    } catch (error) {
        console.error('Error loading RCA state.js:', error);
        // Ensure namespace exists even on error
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Rca = window.SFDMU.Rca || {};
    }
})();
