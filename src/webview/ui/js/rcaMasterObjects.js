/**
 * RCA Master Objects
 * Helper functions for identifying master objects and their external IDs
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access State with defensive check (may not be loaded yet)
    const State = window.SFDMU.State;

    /**
     * Helper function to identify master objects for a phase
     * Based on RCA_MASTER_SLAVE_OBJECTS.md
     */
    window.SFDMU.Rca.getMasterObjectsForPhase = function(phaseNumber) {
        const masterMap = {
            1: [
                'CurrencyType',
                'UnitOfMeasureClass',
                'UnitOfMeasure',
                'AttributeCategory',
                'AttributePicklist',
                'AttributePicklistValue',
                'AttributeDefinition',
                'ProductClassification',
                'LegalEntity',
                'PaymentTerm',
                'TaxEngineProvider',
                'TaxEngine',
                'TaxPolicy',
                'BillingPolicy',
                'ProductSpecificationType',
                'ProductSpecificationRecType'
            ],
            2: ['Product2'], // Optional, default excluded
            3: ['CostBook', 'Pricebook2', 'ProrationPolicy', 'ProductSellingModel'],
            4: ['ProductCatalog', 'ProductCategory'],
            5: ['ProductComponentGroup', 'ProductRelatedComponent'],
            6: ['PriceAdjustmentSchedule', 'AttributeBasedAdjRule'],
            7: [
                'ProductConfigurationFlow',
                'ProductFulfillmentDecompRule',
                'ValTfrmGrp',
                'FulfillmentStepDefinitionGroup',
                'OmniUiCardConfig',
                'OmniIntegrationProcConfig',
                'IntegrationProviderDef',
                'FulfillmentStepDefinition',
                'FulfillmentWorkspace',
                'ProductFulfillmentScenario'
            ]
        };
        return masterMap[phaseNumber] || [];
    };

    /**
     * Get selectable objects for a phase (masters or all objects if no masters)
     */
    window.SFDMU.Rca.getSelectableObjectsForPhase = function(phaseNumber, includeProduct2 = false) {
        console.log('[RCA Master Objects] getSelectableObjectsForPhase called for phase', phaseNumber, 'includeProduct2:', includeProduct2);
        
        // First, get master objects for this phase (this doesn't require phase definitions)
        const masterObjects = window.SFDMU.Rca.getMasterObjectsForPhase(phaseNumber);
        console.log('[RCA Master Objects] Master objects for phase', phaseNumber, ':', masterObjects);
        
        // If we have master objects, return them directly (don't need phase definitions)
        if (masterObjects.length > 0) {
            const result = masterObjects.map(objName => {
                // Get external ID for this object
                const phaseInfo = window.SFDMU.Rca.getPhaseAndExternalId(objName, includeProduct2);
                return {
                    objectName: objName,
                    externalIdField: phaseInfo ? phaseInfo.externalId : 'Name'
                };
            });
            console.log('[RCA Master Objects] Returning master objects:', result);
            return result;
        }
        
        // If no master objects, we need phase definitions to get all phase objects
        // Get phase definitions from the rcaMode module
        if (!window.SFDMU.Rca.getPhaseDefinitions) {
            console.error('[RCA Master Objects] getPhaseDefinitions not available and no master objects');
            return [];
        }
        
        const phaseDefinitions = window.SFDMU.Rca.getPhaseDefinitions();
        console.log('[RCA Master Objects] Phase definitions retrieved:', phaseDefinitions);
        console.log('[RCA Master Objects] Phase definitions length:', phaseDefinitions ? phaseDefinitions.length : 0);
        
        if (!phaseDefinitions || phaseDefinitions.length === 0) {
            console.warn('[RCA Master Objects] Phase definitions are empty and no master objects');
            return [];
        }
        
        const phase = phaseDefinitions.find(p => p.phaseNumber === phaseNumber);
        console.log('[RCA Master Objects] Found phase:', phase);
        
        if (!phase) {
            console.warn('[RCA Master Objects] Phase', phaseNumber, 'not found in phase definitions');
            console.log('[RCA Master Objects] Available phase numbers:', phaseDefinitions.map(p => p.phaseNumber));
            return [];
        }

        // No masters - return all objects in phase
        if (!phase.objects || phase.objects.length === 0) {
            console.warn('[RCA Master Objects] Phase has no master objects and no phase.objects array');
            return [];
        }
        
        const result = phase.objects.map(objName => {
            const phaseInfo = window.SFDMU.Rca.getPhaseAndExternalId(objName, includeProduct2);
            return {
                objectName: objName,
                externalIdField: phaseInfo ? phaseInfo.externalId : 'Name'
            };
        });
        console.log('[RCA Master Objects] No masters, returning all phase objects:', result);
        return result;
    };

    /**
     * Helper to get external ID field for an object
     * This mirrors the logic in rcaPhaseGenerator.ts getPhaseAndExternalId function
     */
    window.SFDMU.Rca.getPhaseAndExternalId = function(objectName, includeProduct2) {
        // Phase 1 objects - CurrencyType uses IsoCode, not Code
        if (objectName === 'CurrencyType') {
            return { externalId: 'IsoCode' };
        }
        if (['UnitOfMeasureClass', 'UnitOfMeasure', 'AttributeCategory',
             'AttributePicklist', 'AttributePicklistValue', 'AttributeDefinition',
             'ProductClassification', 'LegalEntity', 'PaymentTerm', 'TaxEngineProvider',
             'TaxEngine', 'TaxPolicy', 'BillingPolicy', 'ProductSpecificationType',
             'ProductSpecificationRecType'].includes(objectName)) {
            return { externalId: 'Code' };
        }
        if (objectName === 'Product2' && includeProduct2) {
            return { externalId: 'StockKeepingUnit' };
        }
        
        // Phase 2 objects
        if (objectName === 'ProductAttributeDefinition') {
            return { externalId: 'Product2.StockKeepingUnit;AttributeDefinition.Code' };
        }
        if (objectName === 'AttrPicklistExcludedValue') {
            return { externalId: 'Attribute.Code;PicklistValue.Code' };
        }
        if (objectName === 'Product2DataTranslation') {
            return { externalId: 'Product2.StockKeepingUnit;Language' };
        }
        
        // Phase 3 objects
        if (objectName === 'CostBook') {
            return { externalId: 'Code' };
        }
        if (objectName === 'Pricebook2') {
            return { externalId: 'Name' };
        }
        if (objectName === 'ProrationPolicy') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductSellingModel') {
            return { externalId: 'Name' };
        }
        if (objectName === 'CostBookEntry') {
            return { externalId: 'CostBook.Code;Product2.StockKeepingUnit' };
        }
        if (objectName === 'ProductSellingModelOption') {
            return { externalId: 'ProductSellingModel.Name;Product2.StockKeepingUnit' };
        }
        if (objectName === 'PricebookEntry') {
            return { externalId: 'ProductSellingModel.Name;Product2.StockKeepingUnit;Pricebook2.Name' };
        }
        
        // Phase 4 objects
        if (objectName === 'ProductCatalog') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductCategory') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductCategoryDataTranslation') {
            return { externalId: 'ProductCategory.Code;Language' };
        }
        if (objectName === 'ProductCategoryProduct') {
            return { externalId: 'ProductCategory.Code;Product2.StockKeepingUnit' };
        }
        
        // Phase 5 objects
        if (objectName === 'ProductComponentGroup') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductRelatedComponent') {
            return { externalId: 'ParentProduct.StockKeepingUnit;ProductComponentGroup.Code;ProductRelationshipType.Name' };
        }
        if (objectName === 'ProductComponentGrpOverride') {
            return { externalId: 'ProductComponentGroup.Code;Product2.StockKeepingUnit' };
        }
        if (objectName === 'ProductRelComponentOverride') {
            return { externalId: 'ProductRelatedComponent.ParentProduct.StockKeepingUnit;ProductRelatedComponent.ProductComponentGroup.Code;ProductRelatedComponent.ProductRelationshipType.Name' };
        }
        
        // Phase 6 objects
        if (objectName === 'PriceAdjustmentSchedule') {
            return { externalId: 'Code' };
        }
        if (objectName === 'AttributeBasedAdjRule') {
            return { externalId: 'Code' };
        }
        if (objectName === 'PriceAdjustmentTier') {
            return { externalId: 'PriceAdjustmentSchedule.Code;Product2.StockKeepingUnit;TierNumber' };
        }
        if (objectName === 'BundleBasedAdjustment') {
            return { externalId: 'PriceAdjustmentSchedule.Code;ParentProduct.StockKeepingUnit;Product2.StockKeepingUnit' };
        }
        if (objectName === 'AttributeAdjustmentCondition') {
            return { externalId: 'AttributeBasedAdjRule.Code;AttributeDefinition.Code;Product2.StockKeepingUnit' };
        }
        if (objectName === 'AttributeBasedAdjustment') {
            return { externalId: 'AttributeBasedAdjRule.Code;PriceAdjustmentSchedule.Code;Product2.StockKeepingUnit' };
        }
        
        // Phase 7 objects
        if (objectName === 'ProductConfigurationFlow') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductFulfillmentDecompRule') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ValTfrmGrp') {
            return { externalId: 'Code' };
        }
        if (objectName === 'FulfillmentStepDefinitionGroup') {
            return { externalId: 'Code' };
        }
        if (objectName === 'OmniUiCardConfig') {
            return { externalId: 'DeveloperName' };
        }
        if (objectName === 'OmniIntegrationProcConfig') {
            return { externalId: 'DeveloperName' };
        }
        if (objectName === 'IntegrationProviderDef') {
            return { externalId: 'Code' };
        }
        if (objectName === 'FulfillmentStepDefinition') {
            return { externalId: 'Code' };
        }
        if (objectName === 'FulfillmentWorkspace') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductFulfillmentScenario') {
            return { externalId: 'Code' };
        }
        if (objectName === 'ProductConfigFlowAssignment') {
            return { externalId: 'ProductConfigurationFlow.Code;Product2.StockKeepingUnit' };
        }
        if (objectName === 'ProdtDecompEnrchVarMap') {
            return { externalId: 'ProductDecompEnrichmentRule.Code;VariableName' };
        }
        if (objectName === 'FulfillmentStepDependencyDef') {
            return { externalId: 'FulfillmentStepDefinition.Code;DependentStepDefinition.Code' };
        }
        if (objectName === 'FulfillmentWorkspaceItem') {
            return { externalId: 'FulfillmentStepDefinitionGroup.Code;FulfillmentWorkspace.Code;StepDefinition.Code' };
        }
        if (objectName === 'ProductDecompEnrichmentRule') {
            return { externalId: 'Code' };
        }
        
        // Default to Code or Name
        return { externalId: 'Code' };
    };

    /**
     * Helper to get display field(s) for an object in the table
     * Returns an object with displayFields array and formatValue function
     */
    window.SFDMU.Rca.getDisplayFieldForObject = function(objectName, externalIdField) {
        // For composite external IDs, we want to show a combination
        // For simple fields, show the field value
        
        if (externalIdField.includes(';')) {
            // Composite external ID
            const fields = externalIdField.split(';').map(f => f.trim());
            return {
                displayFields: fields,
                isComposite: true,
                formatValue: (record) => {
                    const nameValue = record.Name;
                    const values = fields.map((field) => {
                        let fieldValue = '';
                        if (field.includes('__r.') || field.includes('.')) {
                            // Relationship field
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
                            fieldValue = value || '';
                        } else {
                            fieldValue = record[field] || '';
                        }
                        
                        if (fieldValue) {
                            const fieldLabel = field.includes('.') ? field.split('.').pop() : field;
                            return `${fieldLabel}: ${fieldValue}`;
                        }
                        return null;
                    }).filter(v => v !== null);
                    
                    let displayParts = [];
                    if (nameValue) {
                        displayParts.push(nameValue);
                    }
                    if (values.length > 0) {
                        displayParts.push(values.join(' | '));
                    }
                    if (displayParts.length > 0) {
                        return displayParts.join(' ');
                    } else {
                        return record.Id ? `Id: ${record.Id}` : '(No value)';
                    }
                }
            };
        } else {
            // Single field
            const field = externalIdField.trim();
            const isRelationship = field.includes('__r.') || field.includes('.');
            return {
                displayFields: [field],
                isComposite: false,
                formatValue: (record) => {
                    const nameValue = record.Name;
                    let primaryValue = '';
                    if (isRelationship) {
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
                        primaryValue = value || '';
                    } else {
                        primaryValue = record[field] || '';
                    }
                    
                    let displayParts = [];
                    if (nameValue) {
                        displayParts.push(nameValue);
                    } else if (primaryValue) {
                        displayParts.push(primaryValue);
                    }
                    
                    if (displayParts.length > 0) {
                        return displayParts.join(' ');
                    } else {
                        return record.Id ? `Id: ${record.Id}` : '(No value)';
                    }
                }
            };
        }
    };
})();
