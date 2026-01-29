#!/usr/bin/env node
/**
 * Verify External ID Fields
 * 
 * This script compares the external ID fields used in the codebase
 * with the relationship field names found in the audit to ensure
 * they use the correct relationship traversal paths.
 */

const fs = require('fs');
const path = require('path');

// Read audit results
const auditResults = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'cpq-relationship-audit-results.json'), 'utf-8')
);

// External IDs from cpqPhaseGenerator.ts and masterObjects.js
const externalIds = {
  // Phase 1
  'SBQQ__ProductFeature__c': 'Name',
  'SBQQ__ProductOption__c': 'SBQQ__ProductCode__c',
  'SBQQ__ConfigurationAttribute__c': 'SBQQ__Feature__r.Name',
  'SBQQ__Dimension__c': 'SBQQ__PriceBook__r.Name;SBQQ__Product__r.ProductCode;SBQQ__Type__c',
  'SBQQ__Cost__c': 'SBQQ__Product__r.ProductCode',
  
  // Phase 2
  'SBQQ__ProductRule__c': 'Name',
  'SBQQ__ErrorCondition__c': 'SBQQ__Rule__r.Name;SBQQ__Index__c',
  'SBQQ__ProductAction__c': 'SBQQ__Rule__r.Name;SBQQ__Product__r.ProductCode',
  'SBQQ__LookupQuery__c': 'Name', // Phase 2 - ProductRule
  
  // Phase 3
  'SBQQ__ConfigurationRule__c': 'SBQQ__ProductFeature__r.Name;SBQQ__ProductRule__r.Name',
  'SBQQ__PriceRule__c': 'Name',
  'SBQQ__PriceCondition__c': 'SBQQ__Rule__r.Name;SBQQ__Index__c',
  'SBQQ__PriceAction__c': 'SBQQ__Rule__r.Name',
  'SBQQ__LookupQuery__c_Phase3': 'SBQQ__PriceRule2__r.Name', // Phase 3 - PriceRule
  
  // Phase 4
  'SBQQ__QuoteTemplate__c': 'Name',
  'SBQQ__TemplateContent__c': 'Name',
  'SBQQ__TemplateSection__c': 'SBQQ__Template__r.Name;SBQQ__Content__r.Name',
  'SBQQ__LineColumn__c': 'SBQQ__Template__r.Name;SBQQ__Section__r.Name',
  
  // Phase 5
  'SBQQ__OptionConstraint__c': 'SBQQ__ConstrainedOption__r.SBQQ__ProductCode__c;SBQQ__ConfiguredSKU__r.ProductCode',
  'SBQQ__UpgradeSource__c': 'SBQQ__SourceProduct__r.ProductCode;SBQQ__UpgradeProduct__r.ProductCode',
  'SBQQ__SummaryVariable__c': 'Name',
  
  // Phase 6
  'SBQQ__DiscountTier__c': 'SBQQ__Schedule__r.Name;SBQQ__Number__c',
  'SBQQ__BlockPrice__c': 'SBQQ__PriceBook2__r.Name;SBQQ__Product__r.ProductCode;SBQQ__LowerBound__c',
  
  // Phase 7
  'SBQQ__QuoteProcess__c': 'Name',
  'SBQQ__ProcessInput__c': 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name',
  'SBQQ__ProcessInputCondition__c': 'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name',
  
  // Phase 8
  'SBQQ__CustomAction__c': 'Name',
  'SBQQ__CustomActionCondition__c': 'SBQQ__CustomAction__r.Name;SBQQ__Field__c',
  'SBQQ__SearchFilter__c': 'SBQQ__Action__r.Name',
  
  // Phase 9
  'SBQQ__ImportFormat__c': 'Name',
  'SBQQ__ImportColumn__c': 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c',
  
  // Phase 10
  'SBQQ__Localization__c': 'Name'
};

// Extract relationship names from external IDs
function extractRelationshipNames(externalId) {
  const relationships = [];
  const parts = externalId.split(';');
  
  for (const part of parts) {
    const trimmed = part.trim();
    // Match relationship traversal patterns like SBQQ__Rule__r.Name
    const match = trimmed.match(/^([A-Za-z0-9_]+__r)\./);
    if (match) {
      relationships.push(match[1]);
    }
  }
  
  return relationships;
}

// Verify external IDs against audit results
console.log('=== VERIFYING EXTERNAL ID FIELDS ===\n');

const issues = [];
const verified = [];

for (const [objectName, externalId] of Object.entries(externalIds)) {
  // Skip Phase 3 LookupQuery special case
  if (objectName === 'SBQQ__LookupQuery__c_Phase3') {
    continue;
  }
  
  // Get relationship fields from audit for this object
  const auditRelationships = auditResults.relationshipFields[objectName];
  
  if (!auditRelationships) {
    // Not a child object, skip verification
    continue;
  }
  
  // Extract relationship names from external ID
  const externalIdRelationships = extractRelationshipNames(externalId);
  
  // Check each parent relationship
  for (const [parentObject, fields] of Object.entries(auditRelationships)) {
    if (fields.length === 0) continue;
    
    const auditField = fields[0];
    const expectedRelationshipName = auditField.relationshipName;
    
    // Check if external ID uses the correct relationship name
    if (expectedRelationshipName && !externalIdRelationships.includes(expectedRelationshipName)) {
      issues.push({
        object: objectName,
        parent: parentObject,
        expected: expectedRelationshipName,
        found: externalIdRelationships,
        externalId: externalId
      });
    } else {
      verified.push({
        object: objectName,
        parent: parentObject,
        relationship: expectedRelationshipName,
        externalId: externalId
      });
    }
  }
}

// Report results
if (issues.length > 0) {
  console.log('❌ ISSUES FOUND:\n');
  issues.forEach(issue => {
    console.log(`  ${issue.object} → ${issue.parent}:`);
    console.log(`    Expected relationship: ${issue.expected}`);
    console.log(`    Found in external ID: ${issue.found.join(', ') || 'none'}`);
    console.log(`    Current external ID: ${issue.externalId}`);
    console.log('');
  });
} else {
  console.log('✅ All external IDs use correct relationship names!\n');
}

console.log(`\n✅ Verified: ${verified.length} relationships`);
if (issues.length > 0) {
  console.log(`❌ Issues: ${issues.length} relationships`);
}

// Also check for missing relationship fields in external IDs
console.log('\n=== CHECKING FOR MISSING RELATIONSHIP FIELDS ===\n');

const missingFields = [];

for (const [objectName, fields] of Object.entries(auditResults.relationshipFields)) {
  const externalId = externalIds[objectName];
  if (!externalId) continue;
  
  for (const [parentObject, parentFields] of Object.entries(fields)) {
    if (parentFields.length === 0) continue;
    
    const relationshipName = parentFields[0].relationshipName;
    if (relationshipName && !externalId.includes(relationshipName)) {
      missingFields.push({
        object: objectName,
        parent: parentObject,
        relationship: relationshipName,
        externalId: externalId
      });
    }
  }
}

if (missingFields.length > 0) {
  console.log('⚠️  External IDs that might be missing relationship fields:\n');
  missingFields.forEach(item => {
    console.log(`  ${item.object} → ${item.parent}:`);
    console.log(`    Relationship: ${item.relationship}`);
    console.log(`    Current external ID: ${item.externalId}`);
    console.log('');
  });
} else {
  console.log('✅ All external IDs include necessary relationship fields!\n');
}

