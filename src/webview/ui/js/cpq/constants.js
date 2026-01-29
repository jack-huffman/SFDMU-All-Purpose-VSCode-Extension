/**
 * CPQ Mode Constants
 * Contains all constant values and configuration for CPQ mode
 */

(function() {
    'use strict';

    try {
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Cpq = window.SFDMU.Cpq || {};

    // Default excluded objects for CPQ configuration-only migrations
    window.SFDMU.Cpq.CPQ_DEFAULT_EXCLUDED_OBJECTS = [
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

    // Hierarchical relationship configuration
    // Defines parent-child relationships for hierarchical view
    window.SFDMU.Cpq.HIERARCHICAL_RELATIONSHIPS = {
    // Phase 4: TemplateSection → LineColumn
    4: {
        'SBQQ__TemplateSection__c': {
            childObject: 'SBQQ__LineColumn__c',
            relationshipField: 'SBQQ__Section__c', // Field on child that references parent
            childExternalId: 'SBQQ__Template__r.Name;SBQQ__Section__r.Name',
            autoExpandOnSelect: true
        }
    },
    // Phase 2: ProductRule → ErrorCondition, ProductAction, LookupQuery
    2: {
        'SBQQ__ProductRule__c': {
            childObjects: [
                {
                    objectName: 'SBQQ__ErrorCondition__c',
                    relationshipField: 'SBQQ__Rule__c', // Fixed: was SBQQ__ProductRule__c
                    externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c'
                },
                {
                    objectName: 'SBQQ__ProductAction__c',
                    relationshipField: 'SBQQ__Rule__c', // Fixed: was SBQQ__ProductRule__c
                    externalId: 'SBQQ__Rule__r.Name'
                },
                {
                    objectName: 'SBQQ__LookupQuery__c',
                    relationshipField: 'SBQQ__ProductRule__c', // This one is correct - LookupQuery uses SBQQ__ProductRule__c
                    externalId: 'Name'
                }
            ],
            autoExpandOnSelect: true
        }
    },
    // Phase 3: PriceRule → PriceCondition, PriceAction, LookupQuery
    3: {
        'SBQQ__PriceRule__c': {
            childObjects: [
                {
                    objectName: 'SBQQ__PriceCondition__c',
                    relationshipField: 'SBQQ__Rule__c',
                    externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c'
                },
                {
                    objectName: 'SBQQ__PriceAction__c',
                    relationshipField: 'SBQQ__Rule__c',
                    externalId: 'SBQQ__Rule__r.Name'
                },
                {
                    objectName: 'SBQQ__LookupQuery__c',
                    relationshipField: 'SBQQ__PriceRule2__c', // Fixed: was SBQQ__PriceRule__c, but audit shows it should be SBQQ__PriceRule2__c
                    externalId: 'SBQQ__PriceRule2__r.Name'
                }
            ],
            autoExpandOnSelect: true
        }
    },
    // Phase 6: DiscountSchedule → DiscountTier (formerly Phase 7)
    6: {
        'SBQQ__DiscountSchedule__C': {
            childObject: 'SBQQ__DiscountTier__c',
            relationshipField: 'SBQQ__Schedule__c',
            childExternalId: 'SBQQ__Schedule__r.Name;SBQQ__Number__c',
            autoExpandOnSelect: true
        }
    },
    // Phase 7: QuoteProcess → ProcessInput → ProcessInputCondition (nested, formerly Phase 8)
    7: {
        'SBQQ__QuoteProcess__c': {
            childObject: 'SBQQ__ProcessInput__c',
            relationshipField: 'SBQQ__QuoteProcess__c',
            childExternalId: 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name',
            autoExpandOnSelect: true,
            nestedChildren: {
                'SBQQ__ProcessInput__c': {
                    childObject: 'SBQQ__ProcessInputCondition__c',
                    relationshipField: 'SBQQ__ProcessInput__c',
                    childExternalId: 'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name'
                }
            }
        }
    },
    // Phase 8: CustomAction → CustomActionCondition (formerly Phase 9)
    8: {
        'SBQQ__CustomAction__c': {
            childObject: 'SBQQ__CustomActionCondition__c',
            relationshipField: 'SBQQ__CustomAction__c',
            childExternalId: 'SBQQ__CustomAction__r.Name;SBQQ__Field__c',
            autoExpandOnSelect: true
        }
    },
    // Phase 9: ImportFormat → ImportColumn (formerly Phase 10)
    9: {
        'SBQQ__ImportFormat__c': {
            childObject: 'SBQQ__ImportColumn__c',
            relationshipField: 'SBQQ__ImportFormat__c',
            childExternalId: 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c',
            autoExpandOnSelect: true
        }
    }
};

    // Records per page for lazy loading
    window.SFDMU.Cpq.RECORDS_PER_PAGE = 100;

    // Comprehensive parent-child relationship map based on audit results
    // Maps parent object names to arrays of child object configurations
    // This is used to automatically query and display all children of selected parent records
    // Format: { parentObjectName: [{ childObjectName, relationshipField, externalId, phaseNumber }] }
    window.SFDMU.Cpq.COMPREHENSIVE_RELATIONSHIPS = {
        // Phase 2: ProductRule children
        'SBQQ__ProductRule__c': [
            {
                childObjectName: 'SBQQ__ErrorCondition__c',
                relationshipField: 'SBQQ__Rule__c',
                externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c',
                phaseNumber: 2
            },
            {
                childObjectName: 'SBQQ__ProductAction__c',
                relationshipField: 'SBQQ__Rule__c',
                externalId: 'SBQQ__Rule__r.Name',
                phaseNumber: 2
            },
            {
                childObjectName: 'SBQQ__LookupQuery__c',
                relationshipField: 'SBQQ__ProductRule__c',
                externalId: 'Name',
                phaseNumber: 2
            }
        ],
        // Phase 3: PriceRule children
        'SBQQ__PriceRule__c': [
            {
                childObjectName: 'SBQQ__PriceCondition__c',
                relationshipField: 'SBQQ__Rule__c',
                externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c',
                phaseNumber: 3
            },
            {
                childObjectName: 'SBQQ__PriceAction__c',
                relationshipField: 'SBQQ__Rule__c',
                externalId: 'SBQQ__Rule__r.Name',
                phaseNumber: 3
            },
            {
                childObjectName: 'SBQQ__LookupQuery__c',
                relationshipField: 'SBQQ__PriceRule2__c',
                externalId: 'SBQQ__PriceRule2__r.Name',
                phaseNumber: 3
            }
        ],
        // Phase 4: TemplateSection children
        'SBQQ__TemplateSection__c': [
            {
                childObjectName: 'SBQQ__LineColumn__c',
                relationshipField: 'SBQQ__Section__c',
                externalId: 'SBQQ__Template__r.Name;SBQQ__Section__r.Name',
                phaseNumber: 4
            }
        ],
        // Phase 6: DiscountSchedule children
        'SBQQ__DiscountSchedule__C': [
            {
                childObjectName: 'SBQQ__DiscountTier__c',
                relationshipField: 'SBQQ__Schedule__c',
                externalId: 'SBQQ__Schedule__r.Name;SBQQ__Number__c',
                phaseNumber: 6
            }
        ],
        // Phase 7: QuoteProcess children
        'SBQQ__QuoteProcess__c': [
            {
                childObjectName: 'SBQQ__ProcessInput__c',
                relationshipField: 'SBQQ__QuoteProcess__c',
                externalId: 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name',
                phaseNumber: 7
            }
        ],
        // Phase 7: ProcessInput children (nested)
        'SBQQ__ProcessInput__c': [
            {
                childObjectName: 'SBQQ__ProcessInputCondition__c',
                relationshipField: 'SBQQ__ProcessInput__c',
                externalId: 'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name',
                phaseNumber: 7
            }
        ],
        // Phase 8: CustomAction children
        'SBQQ__CustomAction__c': [
            {
                childObjectName: 'SBQQ__CustomActionCondition__c',
                relationshipField: 'SBQQ__CustomAction__c',
                externalId: 'SBQQ__CustomAction__r.Name;SBQQ__Field__c',
                phaseNumber: 8
            }
        ],
        // Phase 9: ImportFormat children
        'SBQQ__ImportFormat__c': [
            {
                childObjectName: 'SBQQ__ImportColumn__c',
                relationshipField: 'SBQQ__ImportFormat__c',
                externalId: 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c',
                phaseNumber: 9
            }
        ]
    };

    // Product2 lookup metadata
    // Maps object names to their Product2 lookup field information
    // This can be used to automatically include Product2 fields in SOQL queries
    // Format: { objectName: { lookupField: 'SBQQ__Product__c', relationshipName: 'SBQQ__Product__r' } }
    // Updated based on audit results from ButterflyMX FullQA org
    window.SFDMU.Cpq.PRODUCT2_LOOKUPS = {
        // Objects with standard SBQQ__Product__c lookup
        'SBQQ__ConfigurationAttribute__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__Dimension__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__Cost__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__LookupData__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__DiscountSchedule__C': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__ProductAction__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__ConfigurationRule__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__PriceRule__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__BlockPrice__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        'SBQQ__Localization__c': {
            lookupField: 'SBQQ__Product__c',
            relationshipName: 'SBQQ__Product__r'
        },
        // Objects with ConfiguredSKU lookup (also Product2)
        'SBQQ__ProductFeature__c': {
            lookupField: 'SBQQ__ConfiguredSKU__c',
            relationshipName: 'SBQQ__ConfiguredSKU__r'
        },
        'SBQQ__ProductOption__c': {
            lookupField: 'SBQQ__ConfiguredSKU__c', // Primary lookup (also has SBQQ__OptionalSKU__c)
            relationshipName: 'SBQQ__ConfiguredSKU__r'
        },
        'SBQQ__OptionConstraint__c': {
            lookupField: 'SBQQ__ConfiguredSKU__c',
            relationshipName: 'SBQQ__ConfiguredSKU__r'
        },
        // Objects with multiple Product2 lookups
        'SBQQ__UpgradeSource__c': {
            lookupField: 'SBQQ__SourceProduct__c', // Primary lookup (also has SBQQ__UpgradeProduct__c)
            relationshipName: 'SBQQ__SourceProduct__r'
        }
    };
    } catch (error) {
        console.error('Error loading CPQ constants.js:', error);
        // Ensure namespace exists even on error
        window.SFDMU = window.SFDMU || {};
        window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    }
})();

