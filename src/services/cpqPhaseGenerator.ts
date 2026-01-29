import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MigrationConfig,
  PhaseConfig,
  PhaseObjectInfo,
  CPQ_DEFAULT_EXCLUDED_OBJECTS
} from '../models/migrationConfig';
import { extractRelationshipFields } from './queryGenerator';

// Comprehensive parent-child relationship map based on audit results
// Maps parent object names to arrays of child object configurations
// This is the single source of truth for all CPQ parent-child relationships
// Format: { parentObjectName: [{ childObjectName, relationshipField, externalId, phaseNumber }] }
export const CPQ_COMPREHENSIVE_RELATIONSHIPS: {
  [parentObjectName: string]: Array<{
    childObjectName: string;
    relationshipField: string;
    externalId: string;
    phaseNumber: number;
  }>;
} = {
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

// Phase definitions - Based on Salto CPQ migration best practices
// Structure follows expert-recommended order for CPQ configuration migration
const PHASE_DEFINITIONS: PhaseConfig[] = [
  {
    phaseNumber: 1,
    objects: [
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
      'SBQQ__DiscountSchedule__C'
    ],
    description:
      'Phase 1: Pricebook & Product Configuration - Foundation objects including Pricebook, Product Features, Product Options, Configuration Attributes, Price Dimensions, and Costs',
    comment:
      'Based on Salto CPQ migration best practices. Includes Pricebook and all product-related configuration objects. Product2 records are NOT migrated - they must already exist in the target org. ProductCode must be marked as an External ID field. Standard Price Book is excluded (IsStandard = false).'
  },
  {
    phaseNumber: 2,
    objects: ['SBQQ__ProductRule__c', 'SBQQ__ErrorCondition__c', 'SBQQ__LookupQuery__c', 'SBQQ__ProductAction__c'],
    description:
      'Phase 2: Product Rules - Product rules with their child objects (Error Conditions, Lookup Queries, Product Actions)',
    comment:
      'Product Rule is migrated first, followed by its child objects. ErrorCondition, LookupQuery (for Product Rule), and ProductAction have Master-Detail relationships to ProductRule.'
  },
  {
    phaseNumber: 3,
    objects: [
      'SBQQ__ConfigurationRule__c',
      'SBQQ__PriceRule__c',
      'SBQQ__PriceCondition__c',
      'SBQQ__PriceAction__c',
      'SBQQ__LookupQuery__c'
    ],
    description:
      'Phase 3: Configuration Rules & Price Rules - Configuration rules and price rules with their conditions and actions',
    comment:
      'Configuration Rule and Price Rule are migrated, followed by Price Conditions, Price Actions, and LookupQueries which have Master-Detail relationships to PriceRule. Note: LookupQuery also appears in Phase 2 for Product Rules - the queries will filter based on the rule type.'
  },
  {
    phaseNumber: 4,
    objects: ['SBQQ__QuoteTemplate__c', 'SBQQ__TemplateContent__c', 'SBQQ__LineColumn__c', 'SBQQ__TemplateSection__c'],
    description:
      'Phase 4: Templates, Content & Sections - Quote templates, template content, line columns, and template sections',
    comment:
      'Quote Template is the summary/parent object and should be selected first. Template Content may reference Quote Templates via lookups. Template Section has Master-Detail to Quote Template. Line Column references Template and Section via lookups.'
  },
  {
    phaseNumber: 5,
    objects: ['SBQQ__OptionConstraint__c', 'SBQQ__UpgradeSource__c', 'SBQQ__SummaryVariable__c'],
    description:
      'Phase 6: Additional Product Configuration - Option constraints, upgrade sources, and summary variables',
    comment:
      'These objects support product configuration but are migrated after core product and rule objects. Summary Variables are used by Product Rules and Price Rules.'
  },
  {
    phaseNumber: 6,
    objects: ['SBQQ__BlockPrice__c', 'SBQQ__DiscountTier__c'],
    description:
      'Phase 6: Discounts & Block Pricing - Discount tiers and block prices',
    comment:
      'Block Price is a master object. Discount Tier has Master-Detail to Discount Schedule (Phase 1).'
  },
  {
    phaseNumber: 7,
    objects: ['SBQQ__QuoteProcess__c', 'SBQQ__ProcessInput__c', 'SBQQ__ProcessInputCondition__c'],
    description:
      'Phase 7: Quote Process Configuration - Quote process and related input objects',
    comment:
      'Process Input has Master-Detail to Quote Process. Process Input Condition has Master-Detail to Process Input.'
  },
  {
    phaseNumber: 8,
    objects: ['SBQQ__CustomAction__c', 'SBQQ__SearchFilter__c', 'SBQQ__CustomActionCondition__c'],
    description:
      'Phase 8: Custom Actions & Filters - Custom actions and their related objects',
    comment: 'Custom Action is the master object and should be selected first. Search Filter is independent. Custom Action Condition has Master-Detail to Custom Action.'
  },
  {
    phaseNumber: 9,
    objects: ['SBQQ__ImportFormat__c', 'SBQQ__ImportColumn__c'],
    description:
      'Phase 9: Import/Export Configuration - Import format and column definitions',
    comment: 'Import Column has Master-Detail to Import Format.'
  },
  {
    phaseNumber: 10,
    objects: ['SBQQ__Localization__c'],
    description:
      'Phase 10: Localization - Translations and localized content (Final Phase)',
    comment:
      'This object references many other CPQ objects. Must be migrated last after all referenced objects exist.'
  }
];

/**
 * Get master objects for a phase (objects that require user selection)
 */
export function getMasterObjectsForPhase(phaseNumber: number): string[] {
  const masterMap: { [phase: number]: string[] } = {
    1: [], // All objects are masters (no filtering needed, but allow selection)
    2: ['SBQQ__ProductRule__c'],
    3: ['SBQQ__ConfigurationRule__c', 'SBQQ__PriceRule__c'],
    4: ['SBQQ__QuoteTemplate__c', 'SBQQ__TemplateContent__c', 'SBQQ__TemplateSection__c'],
    5: [], // All objects are masters
    6: ['SBQQ__BlockPrice__c', 'SBQQ__DiscountSchedule__C'],
    7: ['SBQQ__QuoteProcess__c'],
    8: ['SBQQ__CustomAction__c', 'SBQQ__SearchFilter__c'],
    9: ['SBQQ__ImportFormat__c'],
    10: [] // All objects are masters
  };
  return masterMap[phaseNumber] || [];
}

/**
 * Determine if an object should be a slave (master=false) based on known CPQ Master-Detail relationships
 * Slave objects only fetch records related to previously selected master objects
 */
export function isSlaveObject(objectName: string, phaseNumber: number): boolean {
  // Phase 2: Child objects of ProductRule
  if (phaseNumber === 2) {
    return [
      'SBQQ__ErrorCondition__c',
      'SBQQ__ProductAction__c'
    ].includes(objectName);
    // Note: SBQQ__LookupQuery__c can be slave in Phase 2 OR Phase 3, handled separately
  }
  
  // Phase 3: Child objects of PriceRule
  if (phaseNumber === 3) {
    return [
      'SBQQ__PriceCondition__c',
      'SBQQ__PriceAction__c'
    ].includes(objectName);
    // Note: SBQQ__LookupQuery__c can be slave in Phase 2 OR Phase 3, handled separately
  }
  
  // Phase 4: TemplateSection is slave to QuoteTemplate
  if (phaseNumber === 4) {
    return objectName === 'SBQQ__TemplateSection__c';
  }
  
  // Phase 6: DiscountTier is slave to DiscountSchedule (from Phase 1)
  if (phaseNumber === 6) {
    return objectName === 'SBQQ__DiscountTier__c';
  }
  
  // Phase 7: ProcessInput is slave to QuoteProcess, ProcessInputCondition is slave to ProcessInput
  if (phaseNumber === 7) {
    return [
      'SBQQ__ProcessInput__c',
      'SBQQ__ProcessInputCondition__c'
    ].includes(objectName);
  }
  
  // Phase 8: CustomActionCondition is slave to CustomAction
  if (phaseNumber === 8) {
    return objectName === 'SBQQ__CustomActionCondition__c';
  }
  
  // Phase 9: ImportColumn is slave to ImportFormat
  if (phaseNumber === 9) {
    return objectName === 'SBQQ__ImportColumn__c';
  }
  
  return false;
}

/**
 * Special handling for SBQQ__LookupQuery__c which can be slave to either ProductRule (Phase 2) or PriceRule (Phase 3)
 */
export function isLookupQuerySlave(objectName: string, phaseNumber: number): boolean {
  if (objectName === 'SBQQ__LookupQuery__c') {
    // In Phase 2, it's slave to ProductRule
    // In Phase 3, it's slave to PriceRule
    return phaseNumber === 2 || phaseNumber === 3;
  }
  return false;
}

export function getPhaseAndExternalId(
  objectName: string,
  includeProduct2: boolean,
  phaseNumber?: number
): { phaseNumber: number; externalId: string } | null {
  // Phase 1: Pricebook & Product Configuration
  if (
    [
      'PriceBook2',
      'SBQQ__DiscountCategory__c',
      'SBQQ__SolutionGroup__c',
      'SBQQ__Theme__c',
      'SBQQ__CustomScript__c',
      'SBQQ__LookupData__c',
      'SBQQ__DiscountSchedule__C',
      'SBQQ__ProductFeature__c',
      'SBQQ__ProductOption__c',
      'SBQQ__ConfigurationAttribute__c',
      'SBQQ__Dimension__c',
      'SBQQ__Cost__c'
    ].includes(objectName)
  ) {
    if (
      objectName === 'PriceBook2' ||
      objectName === 'SBQQ__DiscountCategory__c' ||
      objectName === 'SBQQ__SolutionGroup__c' ||
      objectName === 'SBQQ__Theme__c' ||
      objectName === 'SBQQ__CustomScript__c' ||
      objectName === 'SBQQ__LookupData__c' ||
      objectName === 'SBQQ__DiscountSchedule__C'
    ) {
      return { phaseNumber: 1, externalId: 'Name' };
    }
    switch (objectName) {
      case 'SBQQ__ProductFeature__c':
        return { phaseNumber: 1, externalId: 'Name' };
      case 'SBQQ__ProductOption__c':
        return { phaseNumber: 1, externalId: 'SBQQ__ProductCode__c' };
      case 'SBQQ__ConfigurationAttribute__c':
        return { phaseNumber: 1, externalId: 'SBQQ__Feature__r.Name' };
      case 'SBQQ__Dimension__c':
        return {
          phaseNumber: 1,
          externalId: 'SBQQ__PriceBook__r.Name;SBQQ__Product__r.ProductCode;SBQQ__Type__c'
        };
      case 'SBQQ__Cost__c':
        return { phaseNumber: 1, externalId: 'SBQQ__Product__r.ProductCode' };
    }
  }

  // Product2 - only if includeProduct2 is true
  if (objectName === 'Product2') {
    if (includeProduct2) {
      return { phaseNumber: 1, externalId: 'ProductCode' };
    }
    return null;
  }

  // Phase 2: Product Rules
  if (
    ['SBQQ__ProductRule__c', 'SBQQ__ErrorCondition__c', 'SBQQ__LookupQuery__c', 'SBQQ__ProductAction__c'].includes(
      objectName
    )
  ) {
    const phaseNum = 2;
    switch (objectName) {
      case 'SBQQ__ProductRule__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__ErrorCondition__c':
        return { phaseNumber: phaseNum, externalId: 'SBQQ__Rule__r.Name' };
      case 'SBQQ__LookupQuery__c':
        // Product Rule lookup queries - only return when phase not specified or Phase 2
        if (!phaseNumber || phaseNumber === 2) {
          return { phaseNumber: phaseNum, externalId: 'Name' };
        }
        break;
      case 'SBQQ__ProductAction__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__Rule__r.Name;SBQQ__Product__r.ProductCode'
        };
    }
  }

  // Phase 3: Configuration Rules & Price Rules
  if (
    [
      'SBQQ__ConfigurationRule__c',
      'SBQQ__PriceRule__c',
      'SBQQ__PriceCondition__c',
      'SBQQ__PriceAction__c',
      'SBQQ__LookupQuery__c'
    ].includes(objectName)
  ) {
    const phaseNum = 3;
    switch (objectName) {
      case 'SBQQ__ConfigurationRule__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__ProductFeature__r.Name;SBQQ__ProductRule__r.Name'
        };
      case 'SBQQ__PriceRule__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__PriceCondition__c':
        return { phaseNumber: phaseNum, externalId: 'SBQQ__Rule__r.Name;SBQQ__Index__c' };
      case 'SBQQ__PriceAction__c':
        return { phaseNumber: phaseNum, externalId: 'SBQQ__Rule__r.Name' };
      case 'SBQQ__LookupQuery__c':
        // Price Rule lookup queries - only return when phase not specified or Phase 3
        // Note: SBQQ__Type__c doesn't exist on LookupQuery, so we use just the PriceRule name
        if (!phaseNumber || phaseNumber === 3) {
          return {
            phaseNumber: phaseNum,
            externalId: 'SBQQ__PriceRule2__r.Name'
          };
        }
        break;
    }
  }

  // Phase 4: Templates, Content, Line Columns & Template Sections
  if (['SBQQ__TemplateContent__c', 'SBQQ__QuoteTemplate__c', 'SBQQ__LineColumn__c', 'SBQQ__TemplateSection__c'].includes(objectName)) {
    const phaseNum = 4;
    switch (objectName) {
      case 'SBQQ__TemplateContent__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__QuoteTemplate__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__LineColumn__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__Template__r.Name;SBQQ__Section__r.Name'
        };
      case 'SBQQ__TemplateSection__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__Template__r.Name;SBQQ__Content__r.Name'
        };
    }
  }

  // Phase 5: Additional Product Configuration (formerly Phase 6)
  if (['SBQQ__OptionConstraint__c', 'SBQQ__UpgradeSource__c', 'SBQQ__SummaryVariable__c'].includes(objectName)) {
    const phaseNum = 5;
    switch (objectName) {
      case 'SBQQ__OptionConstraint__c':
        return {
          phaseNumber: phaseNum,
          externalId:
            'SBQQ__ConstrainedOption__r.SBQQ__ProductCode__c;SBQQ__ConfiguredSKU__r.ProductCode'
        };
      case 'SBQQ__UpgradeSource__c':
        return {
          phaseNumber: phaseNum,
          externalId:
            'SBQQ__SourceProduct__r.ProductCode;SBQQ__UpgradeProduct__r.ProductCode'
        };
      case 'SBQQ__SummaryVariable__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
    }
  }

  // Phase 6: Discounts & Block Pricing (formerly Phase 7)
  if (['SBQQ__DiscountTier__c', 'SBQQ__BlockPrice__c'].includes(objectName)) {
    const phaseNum = 6;
    switch (objectName) {
      case 'SBQQ__DiscountTier__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__Schedule__r.Name;SBQQ__Number__c'
        };
      case 'SBQQ__BlockPrice__c':
        return {
          phaseNumber: phaseNum,
          externalId:
            'SBQQ__PriceBook2__r.Name;SBQQ__Product__r.ProductCode;SBQQ__LowerBound__c'
        };
    }
  }

  // Phase 7: Quote Process Configuration (formerly Phase 8)
  if (['SBQQ__QuoteProcess__c', 'SBQQ__ProcessInput__c', 'SBQQ__ProcessInputCondition__c'].includes(objectName)) {
    const phaseNum = 7;
    switch (objectName) {
      case 'SBQQ__QuoteProcess__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__ProcessInput__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__QuoteProcess__r.Name;SBQQ__ProcessInputCondition__r.Name'
        };
      case 'SBQQ__ProcessInputCondition__c':
        return {
          phaseNumber: phaseNum,
          externalId:
            'SBQQ__ProcessInput__r.Name;SBQQ__MasterProcessInput__r.Name'
        };
    }
  }

  // Phase 8: Custom Actions & Filters (formerly Phase 9)
  if (['SBQQ__CustomAction__c', 'SBQQ__CustomActionCondition__c', 'SBQQ__SearchFilter__c'].includes(objectName)) {
    const phaseNum = 8;
    switch (objectName) {
      case 'SBQQ__CustomAction__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__CustomActionCondition__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__CustomAction__r.Name;SBQQ__Field__c'
        };
      case 'SBQQ__SearchFilter__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__Action__r.Name'
        };
    }
  }

  // Phase 9: Import/Export Configuration (formerly Phase 10)
  if (['SBQQ__ImportFormat__c', 'SBQQ__ImportColumn__c'].includes(objectName)) {
    const phaseNum = 9;
    switch (objectName) {
      case 'SBQQ__ImportFormat__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__ImportColumn__c':
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__ImportFormat__r.Name;SBQQ__ColumnIndex__c'
        };
    }
  }

  // Phase 10: Localization (formerly Phase 11)
  if (objectName === 'SBQQ__Localization__c') {
    return { phaseNumber: 10, externalId: 'Name' };
  }

  return null;
}

// Generate SOQL query with filters for CPQ configuration-only migrations
function generateCpqSOQLQuery(
  objectName: string,
  externalId: string,
  modifiedSince?: string,
  customFilters?: { objectName: string; whereClause: string }[],
  includeProduct2: boolean = false,
  phaseNumber?: number,
  selectedMasterRecords?: { 
    [objectName: string]: string[] | Array<{ externalId: string; id: string }> 
  }
): string {
  const relFields = extractRelationshipFields(externalId);

  let query = 'SELECT all';
  if (relFields.length > 0) {
    query += ', ' + relFields.join(', ');
  }

  const transactionalLookupFields: { [key: string]: string[] } = {
    SBQQ__DiscountSchedule__C: [
      'SBQQ__Account__c',
      'SBQQ__Order__c',
      'SBQQ__OrderProduct__c',
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'SBQQ__Product__c'
    ]
  };

  query += ` FROM ${objectName}`;

  const conditions: string[] = [];

  // LookupQuery phase-specific filters
  if (objectName === 'SBQQ__LookupQuery__c' && phaseNumber !== undefined) {
    if (phaseNumber === 2) {
      conditions.push('SBQQ__ProductRule__c != null');
    } else if (phaseNumber === 3) {
      conditions.push('(SBQQ__PriceRule__c != null OR SBQQ__PriceRule2__c != null)');
    }
  }

  // Object-specific filters
  if (objectName === 'PriceBook2') {
    conditions.push('IsStandard = false');
  }

  // Discount schedule transactional-lookups exclusion
  if (objectName === 'SBQQ__DiscountSchedule__C' && transactionalLookupFields[objectName]) {
    for (const field of transactionalLookupFields[objectName]) {
      if (field === 'SBQQ__Product__c' && includeProduct2) {
        continue;
      }
      conditions.push(`${field} = null`);
    }
  }

  // Hard guard against transactional objects
  const excludedTransactionalObjects = [
    'Product2',
    'Order',
    'OrderItem',
    'Account',
    'Opportunity',
    'Quote',
    'SBQQ__Quote__c',
    'SBQQ__QuoteLine__c',
    'Contract',
    'SBQQ__Subscription__c',
    'Asset'
  ];
  if (excludedTransactionalObjects.includes(objectName)) {
    conditions.push('Id = null');
  }

  // LastModifiedDate filter
  if (modifiedSince) {
    const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
    conditions.push(`LastModifiedDate >= ${datetimeValue}`);
  }

  // Custom filters
  if (customFilters) {
    const objectFilter = customFilters.find((f) => f.objectName === objectName);
    if (objectFilter && objectFilter.whereClause) {
      const filterConditions = objectFilter.whereClause
        .split(/\s+AND\s+/i)
        .map((c) => c.trim());
      conditions.push(...filterConditions);
    }
  }

  // Check if this is a slave object (needed for filtering logic below)
  const isSlave = phaseNumber !== undefined && (isSlaveObject(objectName, phaseNumber) || isLookupQuerySlave(objectName, phaseNumber));

  // Filter by selected master records if provided
  // Skip this for slave objects - they should only be filtered by parent IDs (handled below)
  if (!isSlave && selectedMasterRecords && selectedMasterRecords[objectName] && selectedMasterRecords[objectName].length > 0) {
    const selectedItems = selectedMasterRecords[objectName];
    
    // Normalize to new format: always work with { externalId, id } objects
    const normalizedSelections: Array<{ externalId: string; id: string }> = selectedItems
      .map((item: any) => {
        if (typeof item === 'object' && item !== null && 'externalId' in item && 'id' in item) {
          // Already in new format
          return { externalId: item.externalId || '', id: item.id || '' };
        } else if (typeof item === 'string') {
          // Old format: string only - we don't have the Id, so we'll need to use external ID
          return { externalId: item, id: '' };
        } else {
          // Invalid format, skip
          return null;
        }
      })
      .filter((item): item is { externalId: string; id: string } => 
        item !== null && item.externalId && item.externalId.trim() !== ''
      );
    
    if (normalizedSelections.length === 0) {
      // No valid selections - skip adding WHERE condition
    } else {
    
    // Check if we have Ids available (preferred method)
    const selectionsWithIds = normalizedSelections.filter(item => item.id && item.id.trim() !== '');
    
    if (selectionsWithIds.length > 0) {
      // Use Id IN (...) for maximum efficiency - this is the preferred path
      const ids = selectionsWithIds.map(item => item.id);
      const escapedIds = ids.map((id: string) => {
        const escaped = id.replace(/'/g, "''");
        return `'${escaped}'`;
      });
      conditions.push(`Id IN (${escapedIds.join(', ')})`);
    } else {
      // Fallback: use external ID field (for backward compatibility with old data)
      // This should rarely happen if data is properly saved in new format
      const externalIdValues = normalizedSelections.map(item => item.externalId);
      
      // Handle composite external IDs differently
      if (externalId.includes(';')) {
        // Composite external ID - need to match both fields
        const compositeFields = externalId.split(';').map(f => f.trim());
        const compositeConditions: string[] = [];
        
        externalIdValues.forEach(externalIdValue => {
          // Parse the composite value (format: "value1|value2")
          const parts = externalIdValue.split('|');
          
          if (parts.length === compositeFields.length) {
            // Build condition for this composite value
            const fieldConditions: string[] = [];
            compositeFields.forEach((field, index) => {
              const partValue = parts[index]?.trim();
              if (partValue) {
                const escaped = partValue.replace(/'/g, "''");
                fieldConditions.push(`${field} = '${escaped}'`);
              }
            });
            
            if (fieldConditions.length === compositeFields.length) {
              // All fields matched - combine with AND
              compositeConditions.push(`(${fieldConditions.join(' AND ')})`);
            }
          }
        });
        
        if (compositeConditions.length > 0) {
          // Combine all composite matches with OR
          conditions.push(`(${compositeConditions.join(' OR ')})`);
        }
      } else {
        // Simple external ID - use IN clause
        let filterField = externalId;
        if (externalId.includes('__r.') || externalId.includes('.')) {
          // Relationship field - use as is
          filterField = externalId;
        }
        
        // Escape single quotes in values and build IN clause
        const escapedValues = externalIdValues.map(val => {
          const escaped = val.replace(/'/g, "''");
          return `'${escaped}'`;
        });
        
        conditions.push(`${filterField} IN (${escapedValues.join(', ')})`);
      }
    }
    }
  }

  // Filter slave objects by their parent master record IDs
  // This ensures child records are included in export.json for selected parent records
  // Note: isSlave was already calculated above, so we reuse it here
  if (isSlave && selectedMasterRecords && phaseNumber !== undefined) {
    // Find the parent object for this slave object
    let parentObjectName: string | null = null;
    let relationshipField: string | null = null;
    
    // Search CPQ_COMPREHENSIVE_RELATIONSHIPS for the parent
    for (const [parentName, children] of Object.entries(CPQ_COMPREHENSIVE_RELATIONSHIPS)) {
      const childConfig = children.find(c => c.childObjectName === objectName && c.phaseNumber === phaseNumber);
      if (childConfig) {
        parentObjectName = parentName;
        relationshipField = childConfig.relationshipField;
        break;
      }
    }
    
    // If we found a parent, filter by parent IDs
    if (parentObjectName && relationshipField && selectedMasterRecords[parentObjectName]) {
      const parentSelections = selectedMasterRecords[parentObjectName];
      
      // Normalize parent selections to get IDs
      const normalizedParentSelections: Array<{ externalId: string; id: string }> = parentSelections
        .map((item: any) => {
          if (typeof item === 'object' && item !== null && 'externalId' in item && 'id' in item) {
            return { externalId: item.externalId || '', id: item.id || '' };
          } else if (typeof item === 'string') {
            return { externalId: item, id: '' };
          } else {
            return null;
          }
        })
        .filter((item): item is { externalId: string; id: string } => 
          item !== null && item.externalId && item.externalId.trim() !== ''
        );
      
      // Get parent IDs (preferred) or use external IDs as fallback
      const parentIds = normalizedParentSelections
        .filter(item => item.id && item.id.trim() !== '')
        .map(item => item.id);
      
      if (parentIds.length > 0) {
        // Filter slave object by parent relationship field
        const escapedIds = parentIds.map((id: string) => {
          const escaped = id.replace(/'/g, "''");
          return `'${escaped}'`;
        });
        conditions.push(`${relationshipField} IN (${escapedIds.join(', ')})`);
      }
    }
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  return query;
}

// Get all CPQ phase definitions, adjusting for Product2 inclusion
export function getCpqPhaseDefinitions(includeProduct2: boolean): PhaseConfig[] {
  const phases = PHASE_DEFINITIONS.map((p) => ({ ...p, objects: [...p.objects] }));

  if (includeProduct2) {
    // Insert Product2 into Phase 1
    const phase1 = phases[0];
    if (!phase1.objects.includes('Product2')) {
      phase1.objects = ['Product2', ...phase1.objects];
    }
    phase1.description =
      'Phase 1: Pricebook & Product Configuration - Foundation objects including Pricebook, Products, Product Features, Product Options, Configuration Attributes, Price Dimensions, and Costs';
  }

  return phases;
}

// Generate a single CPQ phase file
export async function generateCpqPhaseFile(
  config: MigrationConfig,
  phaseNumber: number
): Promise<void> {
  const outputDir = path.resolve(config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const includeProduct2 = !!config.includeProduct2;
  const phases = getCpqPhaseDefinitions(includeProduct2);
  const phase = phases.find((p) => p.phaseNumber === phaseNumber);

  if (!phase) {
    throw new Error(`Phase ${phaseNumber} not found`);
  }

  const excludedTransactionalObjects = [
    'Product2',
    'Order',
    'OrderItem',
    'Account',
    'Opportunity',
    'Quote',
    'SBQQ__Quote__c',
    'SBQQ__QuoteLine__c',
    'Contract',
    'SBQQ__Subscription__c',
    'Asset'
  ];

  const objects: PhaseObjectInfo[] = [];

  for (const objectName of phase.objects) {
    if (excludedTransactionalObjects.includes(objectName)) {
      if (objectName === 'Product2' && includeProduct2) {
        // allowed
      } else {
        continue;
      }
    }

    const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2, phaseNumber);
    if (phaseInfo && phaseInfo.phaseNumber === phaseNumber) {
      objects.push({
        objectName,
        externalId: phaseInfo.externalId,
        phaseNumber: phaseInfo.phaseNumber
      });
    }
  }

  if (objects.length === 0) {
    throw new Error(`No objects found for Phase ${phaseNumber}`);
  }

  const phaseDir = path.join(outputDir, `Phase ${phaseNumber}`);
  await fs.mkdir(phaseDir, { recursive: true });

  // Start from CPQ default excluded objects, allow override via config.excludedObjects
  const defaultExcludedObjects =
    config.excludedObjects && config.excludedObjects.length > 0
      ? [...config.excludedObjects]
      : [...CPQ_DEFAULT_EXCLUDED_OBJECTS];

  if (includeProduct2) {
    const idx = defaultExcludedObjects.indexOf('Product2');
    if (idx > -1) {
      defaultExcludedObjects.splice(idx, 1);
    }
  } else if (!defaultExcludedObjects.includes('Product2')) {
    defaultExcludedObjects.push('Product2');
  }

  const exportJson: any = {
    objects: [],
    excludedObjects: defaultExcludedObjects
  };

  // Add org info if provided
  if (config.sourceOrg.username && config.sourceOrg.instanceUrl) {
    exportJson.sourceOrg = {
      username: config.sourceOrg.username,
      instanceUrl: config.sourceOrg.instanceUrl
    };
    if (config.sourceOrg.accessToken) {
      exportJson.sourceOrg.accessToken = config.sourceOrg.accessToken;
    }
  }

  if (config.targetOrg.username && config.targetOrg.instanceUrl) {
    exportJson.targetOrg = {
      username: config.targetOrg.username,
      instanceUrl: config.targetOrg.instanceUrl
    };
    if (config.targetOrg.accessToken) {
      exportJson.targetOrg.accessToken = config.targetOrg.accessToken;
    }
  }

  // Get selected master records for this phase
  const phaseSelections = config.selectedMasterRecords?.[phaseNumber] || {};

  // Get excluded objects for this phase
  const excludedObjects = config.excludedObjectsByPhase?.[phaseNumber] || [];

  // Get master objects for this phase to determine which objects require selections
  const masterObjects = getMasterObjectsForPhase(phaseNumber);

  for (const obj of objects) {
    // Skip objects that are explicitly marked as "do not migrate"
    if (excludedObjects.includes(obj.objectName)) {
      continue;
    }

    // Skip master objects that have no selected records
    // Master objects require user selection - if none selected, don't include in export
    if (masterObjects.includes(obj.objectName)) {
      // Handle both old format (string[]) and new format ({ externalId, id }[])
      const selected = phaseSelections[obj.objectName] || [];
      if (selected.length === 0) {
        // Master object with no selections - skip it
        continue;
      }
    }

    const soqlQuery = generateCpqSOQLQuery(
      obj.objectName,
      obj.externalId,
      config.modifiedSince,
      config.customFilters,
      includeProduct2,
      phaseNumber,
      phaseSelections
    );

    // Use phase-specific operation if available, otherwise fall back to global operation
    const phaseOperation = config.cpqPhaseOperations?.[phaseNumber] || config.operation || 'Upsert';
    
    const scriptObject: any = {
      query: soqlQuery,
      operation: phaseOperation,
      externalId: obj.externalId
    };

    // Set master=false for slave objects (only fetch records related to previously selected master objects)
    if (isSlaveObject(obj.objectName, phaseNumber) || isLookupQuerySlave(obj.objectName, phaseNumber)) {
      scriptObject.master = false;
    }

    exportJson.objects.push(scriptObject);
  }

  const exportPath = path.join(phaseDir, 'export.json');
  await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
}

// Generate CPQ phase files under config.outputDir/Phase N/export.json
export async function generateCpqPhaseFiles(config: MigrationConfig): Promise<void> {
  const outputDir = path.resolve(config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const includeProduct2 = !!config.includeProduct2;
  const phases = getCpqPhaseDefinitions(includeProduct2);

  const selectedPhaseNumbers =
    config.selectedPhases && config.selectedPhases.length > 0
      ? config.selectedPhases
      : phases.map((p) => p.phaseNumber);

  const selectedPhases = phases.filter((p) => selectedPhaseNumbers.includes(p.phaseNumber));

  const phaseObjects: Map<number, PhaseObjectInfo[]> = new Map();

  for (const phase of selectedPhases) {
    const objects: PhaseObjectInfo[] = [];

    const excludedTransactionalObjects = [
      'Product2',
      'Order',
      'OrderItem',
      'Account',
      'Opportunity',
      'Quote',
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'Contract',
      'SBQQ__Subscription__c',
      'Asset'
    ];

    for (const objectName of phase.objects) {
      if (excludedTransactionalObjects.includes(objectName)) {
        if (objectName === 'Product2' && includeProduct2) {
          // allowed
        } else {
          continue;
        }
      }

      const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2, phase.phaseNumber);
      if (phaseInfo && phaseInfo.phaseNumber === phase.phaseNumber) {
        objects.push({
          objectName,
          externalId: phaseInfo.externalId,
          phaseNumber: phaseInfo.phaseNumber
        });
      }
    }

    if (objects.length > 0) {
      phaseObjects.set(phase.phaseNumber, objects);
    }
  }

  for (const [phaseNum, objects] of phaseObjects) {
    const phaseDir = path.join(outputDir, `Phase ${phaseNum}`);
    await fs.mkdir(phaseDir, { recursive: true });

    // Start from CPQ default excluded objects, allow override via config.excludedObjects
    const defaultExcludedObjects =
      config.excludedObjects && config.excludedObjects.length > 0
        ? [...config.excludedObjects]
        : [...CPQ_DEFAULT_EXCLUDED_OBJECTS];

    if (includeProduct2) {
      const idx = defaultExcludedObjects.indexOf('Product2');
      if (idx > -1) {
        defaultExcludedObjects.splice(idx, 1);
      }
    } else if (!defaultExcludedObjects.includes('Product2')) {
      defaultExcludedObjects.push('Product2');
    }

    const exportJson: any = {
      objects: [],
      excludedObjects: defaultExcludedObjects
    };

    // Add org info if provided
    if (config.sourceOrg.username && config.sourceOrg.instanceUrl) {
      exportJson.sourceOrg = {
        username: config.sourceOrg.username,
        instanceUrl: config.sourceOrg.instanceUrl
      };
      if (config.sourceOrg.accessToken) {
        exportJson.sourceOrg.accessToken = config.sourceOrg.accessToken;
      }
    }

    if (config.targetOrg.username && config.targetOrg.instanceUrl) {
      exportJson.targetOrg = {
        username: config.targetOrg.username,
        instanceUrl: config.targetOrg.instanceUrl
      };
      if (config.targetOrg.accessToken) {
        exportJson.targetOrg.accessToken = config.targetOrg.accessToken;
      }
    }

    // Get selected master records for this phase
    const phaseSelections = config.selectedMasterRecords?.[phaseNum] || {};

    // Get excluded objects for this phase
    const excludedObjects = config.excludedObjectsByPhase?.[phaseNum] || [];

    // Get master objects for this phase to determine which objects require selections
    const masterObjects = getMasterObjectsForPhase(phaseNum);

    for (const obj of objects) {
      // Skip objects that are explicitly marked as "do not migrate"
      if (excludedObjects.includes(obj.objectName)) {
        continue;
      }

      // Skip master objects that have no selected records
      // Master objects require user selection - if none selected, don't include in export
      if (masterObjects.includes(obj.objectName)) {
        // Handle both old format (string[]) and new format ({ externalId, id }[])
        const selected = phaseSelections[obj.objectName] || [];
        if (selected.length === 0) {
          // Master object with no selections - skip it
          continue;
        }
      }

      const soqlQuery = generateCpqSOQLQuery(
        obj.objectName,
        obj.externalId,
        config.modifiedSince,
        config.customFilters,
        includeProduct2,
        phaseNum,
        phaseSelections
      );

      // Use phase-specific operation if available, otherwise fall back to global operation
      const phaseOperation = config.cpqPhaseOperations?.[phaseNum] || config.operation || 'Upsert';
      
      const scriptObject: any = {
        query: soqlQuery,
        operation: phaseOperation,
        externalId: obj.externalId
      };

      // Set master=false for slave objects (only fetch records related to previously selected master objects)
      if (isSlaveObject(obj.objectName, phaseNum) || isLookupQuerySlave(obj.objectName, phaseNum)) {
        scriptObject.master = false;
      }

      exportJson.objects.push(scriptObject);
    }

    const exportPath = path.join(phaseDir, 'export.json');
    await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
  }
}


