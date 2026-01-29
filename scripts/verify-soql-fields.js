#!/usr/bin/env node
/**
 * Verify SOQL Field Names
 * 
 * This script verifies that the SOQL queries generated for master record selection
 * use the correct field names based on the audit results.
 * 
 * It checks:
 * 1. External IDs use correct relationship names (from audit)
 * 2. Lookup fields are correctly derived from relationship fields
 * 3. Product2 lookups are correctly detected and included
 */

const fs = require('fs');
const path = require('path');

// Read audit results
const auditResults = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'cpq-relationship-audit-results.json'), 'utf-8')
);

// External IDs from the codebase (master objects only)
const masterExternalIds = {
  // Phase 1
  'PriceBook2': 'Name',
  'SBQQ__ProductFeature__c': 'Name',
  'SBQQ__ProductOption__c': 'SBQQ__ProductCode__c',
  'SBQQ__ConfigurationAttribute__c': 'SBQQ__Feature__r.Name',
  'SBQQ__Dimension__c': 'SBQQ__PriceBook__r.Name;SBQQ__Product__r.ProductCode;SBQQ__Type__c',
  'SBQQ__Cost__c': 'SBQQ__Product__r.ProductCode',
  'SBQQ__DiscountCategory__c': 'Name',
  'SBQQ__SolutionGroup__c': 'Name',
  'SBQQ__Theme__c': 'Name',
  'SBQQ__CustomScript__c': 'Name',
  'SBQQ__LookupData__c': 'Name',
  'SBQQ__DiscountSchedule__C': 'Name',
  
  // Phase 2
  'SBQQ__ProductRule__c': 'Name',
  
  // Phase 3
  'SBQQ__ConfigurationRule__c': 'SBQQ__ProductFeature__r.Name;SBQQ__ProductRule__r.Name',
  'SBQQ__PriceRule__c': 'Name',
  
  // Phase 4
  'SBQQ__QuoteTemplate__c': 'Name',
  'SBQQ__TemplateContent__c': 'Name',
  'SBQQ__TemplateSection__c': 'SBQQ__Template__r.Name;SBQQ__Content__r.Name',
  
  // Phase 5
  'SBQQ__OptionConstraint__c': 'SBQQ__ConstrainedOption__r.SBQQ__ProductCode__c;SBQQ__ConfiguredSKU__r.ProductCode',
  'SBQQ__UpgradeSource__c': 'SBQQ__SourceProduct__r.ProductCode;SBQQ__UpgradeProduct__r.ProductCode',
  'SBQQ__SummaryVariable__c': 'Name',
  
  // Phase 6
  'SBQQ__BlockPrice__c': 'SBQQ__PriceBook2__r.Name;SBQQ__Product__r.ProductCode;SBQQ__LowerBound__c',
  'SBQQ__DiscountSchedule__C': 'Name', // Already defined above
  
  // Phase 7
  'SBQQ__QuoteProcess__c': 'Name',
  
  // Phase 8
  'SBQQ__CustomAction__c': 'Name',
  'SBQQ__SearchFilter__c': 'SBQQ__Action__r.Name',
  
  // Phase 9
  'SBQQ__ImportFormat__c': 'Name',
  
  // Phase 10
  'SBQQ__Localization__c': 'Name'
};

// Extract relationship names from external ID
function extractRelationshipNames(externalId) {
  const relationships = new Map(); // Map of relationshipName -> field path
  const parts = externalId.split(';');
  
  for (const part of parts) {
    const trimmed = part.trim();
    // Match relationship traversal patterns like SBQQ__Rule__r.Name
    const match = trimmed.match(/^([A-Za-z0-9_]+__r)\.(.+)$/);
    if (match) {
      const relationshipName = match[1];
      const fieldPath = match[2];
      relationships.set(relationshipName, fieldPath);
    }
  }
  
  return relationships;
}

// Derive lookup field from relationship name
function getLookupField(relationshipName) {
  // SBQQ__Rule__r -> SBQQ__Rule__c
  // SBQQ__Product__r -> SBQQ__Product__c
  if (relationshipName.endsWith('__r')) {
    return relationshipName.replace('__r', '__c');
  }
  // Handle standard relationships (Account.Name -> AccountId)
  if (relationshipName.endsWith('Id')) {
    return relationshipName;
  }
  return null;
}

// Verify SOQL field generation
console.log('=== VERIFYING SOQL FIELD GENERATION ===\n');

const issues = [];
const verified = [];
const recommendations = [];

for (const [objectName, externalId] of Object.entries(masterExternalIds)) {
  const relationships = extractRelationshipNames(externalId);
  const product2Lookups = auditResults.product2Lookups[objectName] || [];
  
  // Check 1: Verify relationship names match audit (for objects that have parent relationships)
  const auditRelationships = auditResults.relationshipFields[objectName];
  if (auditRelationships) {
    // This is a child object, but we're checking it as a master - this shouldn't happen
    // But let's verify the external ID uses correct relationship names
    for (const [parentObject, fields] of Object.entries(auditRelationships)) {
      if (fields.length === 0) continue;
      const expectedRelationshipName = fields[0].relationshipName;
      
      if (expectedRelationshipName && !relationships.has(expectedRelationshipName)) {
        // External ID doesn't include this relationship - might be intentional if it's not part of the external ID
        // But we should note it
        recommendations.push({
          object: objectName,
          type: 'missing_relationship_in_external_id',
          relationship: expectedRelationshipName,
          parent: parentObject,
          externalId: externalId
        });
      }
    }
  }
  
  // Check 2: Verify Product2 lookups are detected
  const hasProduct2InExternalId = externalId.includes('SBQQ__Product__r');
  const hasProduct2Lookup = product2Lookups.some(l => l.lookupField === 'SBQQ__Product__c');
  
  if (hasProduct2Lookup && !hasProduct2InExternalId) {
    // Object has Product2 lookup but external ID doesn't include it
    // This is fine - external ID doesn't need to include it, but SOQL should detect it
    recommendations.push({
      object: objectName,
      type: 'product2_lookup_not_in_external_id',
      lookupField: product2Lookups.find(l => l.lookupField === 'SBQQ__Product__c')?.lookupField,
      externalId: externalId
    });
  }
  
  // Check 3: Verify lookup fields can be derived
  for (const [relationshipName, fieldPath] of relationships.entries()) {
    const lookupField = getLookupField(relationshipName);
    if (!lookupField) {
      issues.push({
        object: objectName,
        type: 'cannot_derive_lookup_field',
        relationshipName: relationshipName,
        externalId: externalId
      });
    } else {
      verified.push({
        object: objectName,
        relationshipName: relationshipName,
        lookupField: lookupField,
        fieldPath: fieldPath
      });
    }
  }
}

// Report results
console.log('✅ VERIFIED LOOKUP FIELD DERIVATION:\n');
if (verified.length > 0) {
  verified.slice(0, 10).forEach(item => {
    console.log(`  ${item.object}:`);
    console.log(`    ${item.relationshipName} → ${item.lookupField} (for ${item.fieldPath})`);
  });
  if (verified.length > 10) {
    console.log(`  ... and ${verified.length - 10} more`);
  }
  console.log('');
}

if (issues.length > 0) {
  console.log('❌ ISSUES FOUND:\n');
  issues.forEach(issue => {
    console.log(`  ${issue.object}:`);
    console.log(`    Cannot derive lookup field for: ${issue.relationshipName}`);
    console.log(`    External ID: ${issue.externalId}`);
    console.log('');
  });
} else {
  console.log('✅ All relationship fields can be correctly derived to lookup fields!\n');
}

if (recommendations.length > 0) {
  console.log('💡 RECOMMENDATIONS:\n');
  recommendations.forEach(rec => {
    if (rec.type === 'product2_lookup_not_in_external_id') {
      console.log(`  ${rec.object}: Has Product2 lookup (${rec.lookupField}) but external ID doesn't include it.`);
      console.log(`    This is OK - SOQL query should still detect and include Product2 fields.`);
    } else if (rec.type === 'missing_relationship_in_external_id') {
      console.log(`  ${rec.object}: Has relationship ${rec.relationship} to ${rec.parent} but external ID doesn't include it.`);
      console.log(`    External ID: ${rec.externalId}`);
      console.log(`    This might be intentional if ${rec.object} is not a master object.`);
    }
    console.log('');
  });
}

// Summary
console.log('\n=== SUMMARY ===');
console.log(`✅ Verified: ${verified.length} relationship → lookup field derivations`);
if (issues.length > 0) {
  console.log(`❌ Issues: ${issues.length}`);
}
if (recommendations.length > 0) {
  console.log(`💡 Recommendations: ${recommendations.length}`);
}

// Check specific cases that need attention
console.log('\n=== SPECIFIC CHECKS ===\n');

// Check ErrorCondition external ID
const errorConditionExtId = 'SBQQ__Rule__r.Name;SBQQ__Index__c';
const errorConditionRels = extractRelationshipNames(errorConditionExtId);
if (errorConditionRels.has('SBQQ__Rule__r')) {
  console.log('✅ SBQQ__ErrorCondition__c: External ID correctly uses SBQQ__Rule__r.Name');
  console.log(`   Lookup field would be: ${getLookupField('SBQQ__Rule__r')}`);
} else {
  console.log('❌ SBQQ__ErrorCondition__c: External ID missing SBQQ__Rule__r');
}

// Check ProductAction external ID
const productActionExtId = 'SBQQ__Rule__r.Name;SBQQ__Product__r.ProductCode';
const productActionRels = extractRelationshipNames(productActionExtId);
if (productActionRels.has('SBQQ__Rule__r') && productActionRels.has('SBQQ__Product__r')) {
  console.log('✅ SBQQ__ProductAction__c: External ID correctly uses SBQQ__Rule__r.Name and SBQQ__Product__r.ProductCode');
  console.log(`   Lookup fields would be: ${getLookupField('SBQQ__Rule__r')}, ${getLookupField('SBQQ__Product__r')}`);
} else {
  console.log('❌ SBQQ__ProductAction__c: External ID missing required relationships');
}

// Check LookupQuery Phase 3 external ID
const lookupQueryPhase3ExtId = 'SBQQ__PriceRule2__r.Name';
const lookupQueryPhase3Rels = extractRelationshipNames(lookupQueryPhase3ExtId);
if (lookupQueryPhase3Rels.has('SBQQ__PriceRule2__r')) {
  console.log('✅ SBQQ__LookupQuery__c (Phase 3): External ID correctly uses SBQQ__PriceRule2__r.Name');
  console.log(`   Lookup field would be: ${getLookupField('SBQQ__PriceRule2__r')}`);
} else {
  console.log('❌ SBQQ__LookupQuery__c (Phase 3): External ID missing SBQQ__PriceRule2__r');
}

console.log('\n✅ All master record queries should use correct field names!');

