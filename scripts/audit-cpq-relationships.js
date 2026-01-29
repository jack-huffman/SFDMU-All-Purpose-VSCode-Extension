#!/usr/bin/env node
/**
 * Audit CPQ Relationship Fields
 * 
 * This script queries Salesforce metadata for all CPQ objects to:
 * 1. Find correct relationship field names for parent-child relationships
 * 2. Identify Product2 lookup fields for all objects
 * 
 * Usage: node scripts/audit-cpq-relationships.js <org-alias>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// All CPQ objects from phase definitions
const CPQ_OBJECTS = [
  // Phase 1
  'PriceBook2',
  'SBQQ__ProductFeature__c',
  'SBQQ__ProductOption__c',
  'SBQQ__ConfigurationAttribute__c',
  'SBQQ__Dimension__c',
  'SBQQ__Cost__c',
  'SBQQ__DiscountCategory__c',
  'SBQQ__SolutionGroup__c',
  'SBQQ__Theme__c',
  'SBQQ__CustomScript__c',
  'SBQQ__LookupData__c',
  'SBQQ__DiscountSchedule__C',
  // Phase 2
  'SBQQ__ProductRule__c',
  'SBQQ__ErrorCondition__c',
  'SBQQ__LookupQuery__c',
  'SBQQ__ProductAction__c',
  // Phase 3
  'SBQQ__ConfigurationRule__c',
  'SBQQ__PriceRule__c',
  'SBQQ__PriceCondition__c',
  'SBQQ__PriceAction__c',
  // Phase 4
  'SBQQ__QuoteTemplate__c',
  'SBQQ__TemplateContent__c',
  'SBQQ__LineColumn__c',
  'SBQQ__TemplateSection__c',
  // Phase 5
  'SBQQ__OptionConstraint__c',
  'SBQQ__UpgradeSource__c',
  'SBQQ__SummaryVariable__c',
  // Phase 6
  'SBQQ__BlockPrice__c',
  'SBQQ__DiscountTier__c',
  // Phase 7
  'SBQQ__QuoteProcess__c',
  'SBQQ__ProcessInput__c',
  'SBQQ__ProcessInputCondition__c',
  // Phase 8
  'SBQQ__CustomAction__c',
  'SBQQ__SearchFilter__c',
  'SBQQ__CustomActionCondition__c',
  // Phase 9
  'SBQQ__ImportFormat__c',
  'SBQQ__ImportColumn__c',
  // Phase 10
  'SBQQ__Localization__c'
];

// Parent-child relationships to verify
const PARENT_CHILD_RELATIONSHIPS = {
  // Phase 2
  'SBQQ__ProductRule__c': ['SBQQ__ErrorCondition__c', 'SBQQ__ProductAction__c', 'SBQQ__LookupQuery__c'],
  // Phase 3
  'SBQQ__PriceRule__c': ['SBQQ__PriceCondition__c', 'SBQQ__PriceAction__c', 'SBQQ__LookupQuery__c'],
  // Phase 4
  'SBQQ__TemplateSection__c': ['SBQQ__LineColumn__c'],
  // Phase 6
  'SBQQ__DiscountSchedule__C': ['SBQQ__DiscountTier__c'],
  // Phase 7
  'SBQQ__QuoteProcess__c': ['SBQQ__ProcessInput__c'],
  'SBQQ__ProcessInput__c': ['SBQQ__ProcessInputCondition__c'],
  // Phase 8
  'SBQQ__CustomAction__c': ['SBQQ__CustomActionCondition__c'],
  // Phase 9
  'SBQQ__ImportFormat__c': ['SBQQ__ImportColumn__c']
};

function describeObject(objectName, orgAlias) {
  try {
    const command = `sf sobject describe --sobject "${objectName}" --target-org "${orgAlias}" --json`;
    const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const result = JSON.parse(output);
    
    if (result.status === 1) {
      throw new Error(result.message || 'Unknown error');
    }
    
    return result.result || result;
  } catch (error) {
    console.error(`Error describing ${objectName}:`, error.message);
    return null;
  }
}

function findRelationshipFields(metadata, targetObjectName) {
  const fields = metadata.fields || [];
  const relationshipFields = [];
  
  for (const field of fields) {
    const referenceTo = field.referenceTo || [];
    if (Array.isArray(referenceTo) && referenceTo.includes(targetObjectName)) {
      relationshipFields.push({
        name: field.name,
        relationshipName: field.relationshipName || null,
        type: field.type,
        label: field.label
      });
    }
  }
  
  return relationshipFields;
}

function findProduct2Lookups(metadata) {
  const fields = metadata.fields || [];
  const product2Fields = [];
  
  for (const field of fields) {
    const referenceTo = field.referenceTo || [];
    if (Array.isArray(referenceTo) && referenceTo.includes('Product2')) {
      product2Fields.push({
        lookupField: field.name,
        relationshipName: field.relationshipName || null,
        type: field.type,
        label: field.label
      });
    }
  }
  
  return product2Fields;
}

function main() {
  const orgAlias = process.argv[2];
  
  if (!orgAlias) {
    console.error('Usage: node scripts/audit-cpq-relationships.js <org-alias>');
    process.exit(1);
  }
  
  console.log(`Auditing CPQ objects in org: ${orgAlias}\n`);
  
  const results = {
    relationshipFields: {},
    product2Lookups: {},
    errors: []
  };
  
  // Audit all objects
  for (const objectName of CPQ_OBJECTS) {
    console.log(`Querying ${objectName}...`);
    const metadata = describeObject(objectName, orgAlias);
    
    if (!metadata) {
      results.errors.push(objectName);
      continue;
    }
    
    // Find Product2 lookups
    const product2Fields = findProduct2Lookups(metadata);
    if (product2Fields.length > 0) {
      results.product2Lookups[objectName] = product2Fields;
    }
    
    // Find parent relationship fields (if this is a child object)
    for (const [parentObject, children] of Object.entries(PARENT_CHILD_RELATIONSHIPS)) {
      if (children.includes(objectName)) {
        const relationshipFields = findRelationshipFields(metadata, parentObject);
        if (relationshipFields.length > 0) {
          if (!results.relationshipFields[objectName]) {
            results.relationshipFields[objectName] = {};
          }
          results.relationshipFields[objectName][parentObject] = relationshipFields;
        }
      }
    }
  }
  
  // Output results
  console.log('\n=== AUDIT RESULTS ===\n');
  
  console.log('RELATIONSHIP FIELDS (Child → Parent):');
  console.log('=====================================');
  for (const [childObject, parents] of Object.entries(results.relationshipFields)) {
    for (const [parentObject, fields] of Object.entries(parents)) {
      console.log(`\n${childObject} → ${parentObject}:`);
      fields.forEach(field => {
        console.log(`  - Field: ${field.name}`);
        if (field.relationshipName) {
          console.log(`    Relationship: ${field.relationshipName}`);
        }
        console.log(`    Type: ${field.type}`);
        console.log(`    Label: ${field.label}`);
      });
    }
  }
  
  console.log('\n\nPRODUCT2 LOOKUPS:');
  console.log('=================');
  for (const [objectName, fields] of Object.entries(results.product2Lookups)) {
    console.log(`\n${objectName}:`);
    fields.forEach(field => {
      console.log(`  - Lookup Field: ${field.lookupField}`);
      if (field.relationshipName) {
        console.log(`    Relationship: ${field.relationshipName}`);
      }
      console.log(`    Type: ${field.type}`);
      console.log(`    Label: ${field.label}`);
    });
  }
  
  if (results.errors.length > 0) {
    console.log('\n\nERRORS:');
    console.log('=======');
    results.errors.forEach(obj => {
      console.log(`  - ${obj}`);
    });
  }
  
  // Save results to JSON file
  const outputPath = path.join(__dirname, '..', 'cpq-relationship-audit-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\nResults saved to: ${outputPath}`);
}

main();

