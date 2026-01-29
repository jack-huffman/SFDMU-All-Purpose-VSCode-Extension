/**
 * RCA Mode Constants
 * Contains all constant values and configuration for RCA mode
 */

(function() {
    'use strict';

    try {
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Rca = window.SFDMU.Rca || {};

        // Default excluded objects for RCA configuration-only migrations
        window.SFDMU.Rca.RCA_DEFAULT_EXCLUDED_OBJECTS = [
            'Account',
            'Order',
            'OrderItem',
            'Opportunity',
            'Quote',
            'Contract',
            'Asset'
        ];

        // Default excluded objects for CPQ configuration-only migrations
        window.SFDMU.Rca.CPQ_DEFAULT_EXCLUDED_OBJECTS = [
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

        // Records per page for lazy loading
        window.SFDMU.Rca.RECORDS_PER_PAGE = 100;
    } catch (error) {
        console.error('Error loading RCA constants.js:', error);
        // Ensure namespace exists even on error
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Rca = window.SFDMU.Rca || {};
    }
})();
