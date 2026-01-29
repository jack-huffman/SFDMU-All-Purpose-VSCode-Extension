/**
 * CPQ Master Objects
 * Helper functions for identifying master objects and their external IDs
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Cpq = window.SFDMU.Cpq || {};
    
    // Access State with defensive check (may not be loaded yet)
    const State = window.SFDMU.State;

    /**
     * Helper function to identify master objects for a phase
     * Based on CPQ_PHASE_MASTER_SLAVE_RELATIONSHIPS.md
     */
    window.SFDMU.Cpq.getMasterObjectsForPhase = function(phaseNumber) {
    const masterMap = {
        1: [], // All objects are masters (no filtering needed, but allow selection)
        2: ['SBQQ__ProductRule__c'],
        3: ['SBQQ__ConfigurationRule__c', 'SBQQ__PriceRule__c'],
        4: ['SBQQ__QuoteTemplate__c', 'SBQQ__TemplateContent__c', 'SBQQ__TemplateSection__c'], // TemplateSection is selectable as parent for LineColumn inheritance
        5: [], // All objects are masters (allow selection) - OptionConstraint, UpgradeSource, SummaryVariable
        6: ['SBQQ__BlockPrice__c', 'SBQQ__DiscountSchedule__C'], // BlockPrice, DiscountTier
        7: ['SBQQ__QuoteProcess__c'], // QuoteProcess, ProcessInput, ProcessInputCondition
        8: ['SBQQ__CustomAction__c', 'SBQQ__SearchFilter__c'], // CustomAction, SearchFilter, CustomActionCondition
        9: ['SBQQ__ImportFormat__c'], // ImportFormat, ImportColumn
        10: [] // All objects are masters (allow selection) - Localization
        };
        return masterMap[phaseNumber] || [];
    };

    /**
     * Get selectable objects for a phase (masters or all objects if no masters)
     */
    window.SFDMU.Cpq.getSelectableObjectsForPhase = function(phaseNumber, includeProduct2 = false) {
        const phaseDefinitions = window.SFDMU.Cpq.getPhaseDefinitions();
    const phase = phaseDefinitions.find(p => p.phaseNumber === phaseNumber);
    if (!phase) return [];

    const masterObjects = window.SFDMU.Cpq.getMasterObjectsForPhase(phaseNumber);
    
    // If phase has masters, return only masters; otherwise return all objects
    if (masterObjects.length > 0) {
        return masterObjects.map(objName => {
            // Get external ID for this object
            const phaseInfo = window.SFDMU.Cpq.getPhaseAndExternalId(objName, includeProduct2, phaseNumber);
            return {
                objectName: objName,
                externalIdField: phaseInfo ? phaseInfo.externalId : 'Name'
            };
        });
    } else {
        // No masters - return all objects in phase
        return phase.objects.map(objName => {
            const phaseInfo = window.SFDMU.Cpq.getPhaseAndExternalId(objName, includeProduct2, phaseNumber);
            return {
                objectName: objName,
                externalIdField: phaseInfo ? phaseInfo.externalId : 'Name'
            };
            });
        }
    };

    /**
     * Helper to get display field(s) for an object in the table
     * Returns an object with displayFields array and formatValue function
     */
    window.SFDMU.Cpq.getDisplayFieldForObject = function(objectName, externalIdField) {
    // For composite external IDs, we want to show a combination
    // For simple fields, show the field value
    // For relationship fields, show the relationship value
    
    // Helper to extract Product2 info from record
    // CPQ uses SBQQ__Product__r for Product2 lookups (not Product2__r or Product2)
    const getProduct2Info = function(record) {
        const productInfo = [];
        // Check for CPQ Product2 lookup (SBQQ__Product__r)
        if (record.SBQQ__Product__r && typeof record.SBQQ__Product__r === 'object') {
            if (record.SBQQ__Product__r.Name) {
                productInfo.push(`Product: ${record.SBQQ__Product__r.Name}`);
            }
            if (record.SBQQ__Product__r.ProductCode) {
                productInfo.push(`Code: ${record.SBQQ__Product__r.ProductCode}`);
            }
        }
        return productInfo.length > 0 ? productInfo.join(', ') : null;
    };
    
    if (externalIdField.includes(';')) {
        // Composite external ID - show all fields combined
        const fields = externalIdField.split(';').map(f => f.trim());
        return {
            displayFields: fields,
            isComposite: true,
            formatValue: (record) => {
                // First, try to get Name field if available
                const nameValue = record.Name;
                
                const values = fields.map((field, index) => {
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
                    
                    // Return field label and value, or just value if empty
                    if (fieldValue) {
                        // Extract field name for label (last part after dot or the field itself)
                        const fieldLabel = field.includes('.') ? field.split('.').pop() : field;
                        return `${fieldLabel}: ${fieldValue}`;
                    }
                    return null;
                }).filter(v => v !== null);
                
                // Build display string
                let displayParts = [];
                
                // Add Name if available
                if (nameValue) {
                    displayParts.push(nameValue);
                }
                
                // Add composite external ID values
                if (values.length > 0) {
                    displayParts.push(values.join(' | '));
                }
                
                // Add Product2 info if available
                const productInfo = getProduct2Info(record);
                if (productInfo) {
                    displayParts.push(`(${productInfo})`);
                }
                
                // If we have any display parts, join them
                if (displayParts.length > 0) {
                    return displayParts.join(' ');
                } else {
                    // Fallback to Id if all fields are empty
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
                // First, try to get Name field if available
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
                
                // Build display string
                let displayParts = [];
                
                // Add Name if available (preferred)
                if (nameValue) {
                    displayParts.push(nameValue);
                } else if (primaryValue) {
                    // Use primary value if Name not available
                    displayParts.push(primaryValue);
                }
                
                // Add Product2 info if available
                const productInfo = getProduct2Info(record);
                if (productInfo) {
                    displayParts.push(`(${productInfo})`);
                }
                
                // If we have display parts, return them
                if (displayParts.length > 0) {
                    return displayParts.join(' ');
                } else {
                    // Fallback: try lookup field, then Id
                    if (isRelationship) {
                        const lookupField = field.split('__r.')[0] + '__c';
                        if (record[lookupField]) {
                            return `Lookup: ${record[lookupField]}`;
                        }
                    }
                    return record.Id ? `Id: ${record.Id}` : '(No value)';
                }
                }
            };
        }
    };

    /**
     * Helper to get external ID field for an object
     * This mirrors the logic in cpqPhaseGenerator.ts getPhaseAndExternalId function
     */
    window.SFDMU.Cpq.getPhaseAndExternalId = function(objectName, includeProduct2, phaseNumber) {
    // Phase 1 objects
    if (['PriceBook2', 'SBQQ__DiscountCategory__c', 'SBQQ__SolutionGroup__c', 
         'SBQQ__Theme__c', 'SBQQ__CustomScript__c', 'SBQQ__LookupData__c', 
         'SBQQ__DiscountSchedule__C', 'SBQQ__ProductFeature__c'].includes(objectName)) {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__ProductOption__c') {
        return { externalId: 'SBQQ__ProductCode__c' };
    }
    if (objectName === 'SBQQ__ConfigurationAttribute__c') {
        return { externalId: 'SBQQ__Feature__r.Name' };
    }
    if (objectName === 'SBQQ__Dimension__c') {
        return { externalId: 'SBQQ__PriceBook__r.Name;SBQQ__Product__r.ProductCode;SBQQ__Type__c' };
    }
    if (objectName === 'SBQQ__Cost__c') {
        return { externalId: 'SBQQ__Product__r.ProductCode' };
    }
    if (objectName === 'Product2' && includeProduct2) {
        return { externalId: 'ProductCode' };
    }
    
    // Phase 2 objects
    if (objectName === 'SBQQ__ProductRule__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__LookupQuery__c' && (phaseNumber === undefined || phaseNumber === 2)) {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__ErrorCondition__c') {
        return { externalId: 'SBQQ__Rule__r.Name' };
    }
    if (objectName === 'SBQQ__ProductAction__c') {
        return { externalId: 'SBQQ__Rule__r.Name;SBQQ__Product__r.ProductCode' };
    }
    
    // Phase 3 objects
    if (objectName === 'SBQQ__PriceRule__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__ConfigurationRule__c') {
        return { externalId: 'SBQQ__ProductFeature__r.Name;SBQQ__ProductRule__r.Name' };
    }
    if (objectName === 'SBQQ__PriceCondition__c') {
        return { externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c' };
    }
    if (objectName === 'SBQQ__PriceAction__c') {
        return { externalId: 'SBQQ__Rule__r.Name' };
    }
    if (objectName === 'SBQQ__LookupQuery__c' && phaseNumber === 3) {
        return { externalId: 'SBQQ__PriceRule2__r.Name' };
    }
    
    // Phase 4 objects (includes former Phase 5 objects)
    if (objectName === 'SBQQ__TemplateContent__c' || objectName === 'SBQQ__QuoteTemplate__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__LineColumn__c') {
        return { externalId: 'SBQQ__Template__r.Name;SBQQ__Section__r.Name' };
    }
    if (objectName === 'SBQQ__TemplateSection__c') {
        return { externalId: 'SBQQ__Template__r.Name;SBQQ__Content__r.Name' };
    }
    
    // Phase 5 objects (formerly Phase 6)
    if (objectName === 'SBQQ__OptionConstraint__c') {
        return { externalId: 'SBQQ__ConstrainedOption__r.SBQQ__ProductCode__c;SBQQ__ConfiguredSKU__r.ProductCode' };
    }
    if (objectName === 'SBQQ__UpgradeSource__c') {
        return { externalId: 'SBQQ__SourceProduct__r.ProductCode;SBQQ__UpgradeProduct__r.ProductCode' };
    }
    if (objectName === 'SBQQ__SummaryVariable__c') {
        return { externalId: 'Name' };
    }
    
    // Phase 7 objects
    if (objectName === 'SBQQ__DiscountTier__c') {
        return { externalId: 'SBQQ__Schedule__r.Name;SBQQ__Number__c' };
    }
    if (objectName === 'SBQQ__BlockPrice__c') {
        return { externalId: 'SBQQ__PriceBook2__r.Name;SBQQ__Product__r.ProductCode;SBQQ__LowerBound__c' };
    }
    
    // Phase 8 objects
    if (objectName === 'SBQQ__QuoteProcess__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__ProcessInput__c') {
        return { externalId: 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name' };
    }
    if (objectName === 'SBQQ__ProcessInputCondition__c') {
        return { externalId: 'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name' };
    }
    
    // Phase 9 objects
    if (objectName === 'SBQQ__CustomAction__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__CustomActionCondition__c') {
        return { externalId: 'SBQQ__CustomAction__r.Name;SBQQ__Field__c' };
    }
    if (objectName === 'SBQQ__SearchFilter__c') {
        return { externalId: 'SBQQ__Action__r.Name' };
    }
    
    // Phase 10 objects
    if (objectName === 'SBQQ__ImportFormat__c') {
        return { externalId: 'Name' };
    }
    if (objectName === 'SBQQ__ImportColumn__c') {
        return { externalId: 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c' };
    }
    
    // Phase 11 objects
    if (objectName === 'SBQQ__Localization__c') {
        return { externalId: 'Name' };
    }
    
    // Default to Name
    return { externalId: 'Name' };
    };
})();

