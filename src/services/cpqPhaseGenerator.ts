import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MigrationConfig,
  PhaseConfig,
  PhaseObjectInfo,
  CPQ_DEFAULT_EXCLUDED_OBJECTS
} from '../models/migrationConfig';
import { extractRelationshipFields } from './queryGenerator';

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
    objects: ['SBQQ__TemplateContent__c', 'SBQQ__QuoteTemplate__c'],
    description:
      'Phase 4: Template Contents & Quote Templates - Template content and quote template structure',
    comment:
      'Template Content is migrated before Quote Templates as templates may reference template content.'
  },
  {
    phaseNumber: 5,
    objects: ['SBQQ__LineColumn__c', 'SBQQ__TemplateSection__c'],
    description:
      'Phase 5: Line Columns & Template Sections - Line columns and template sections',
    comment:
      'Line Columns and Template Sections are migrated after Quote Templates. Template Section has Master-Detail to Quote Template.'
  },
  {
    phaseNumber: 6,
    objects: ['SBQQ__OptionConstraint__c', 'SBQQ__UpgradeSource__c', 'SBQQ__SummaryVariable__c'],
    description:
      'Phase 6: Additional Product Configuration - Option constraints, upgrade sources, and summary variables',
    comment:
      'These objects support product configuration but are migrated after core product and rule objects. Summary Variables are used by Product Rules and Price Rules.'
  },
  {
    phaseNumber: 7,
    objects: ['SBQQ__DiscountTier__c', 'SBQQ__BlockPrice__c'],
    description:
      'Phase 7: Discounts & Block Pricing - Discount tiers and block prices',
    comment:
      'Discount Tier has Master-Detail to Discount Schedule (Phase 1). Block Price depends on Price Book and Product.'
  },
  {
    phaseNumber: 8,
    objects: ['SBQQ__QuoteProcess__c', 'SBQQ__ProcessInput__c', 'SBQQ__ProcessInputCondition__c'],
    description:
      'Phase 8: Quote Process Configuration - Quote process and related input objects',
    comment:
      'Process Input has Master-Detail to Quote Process. Process Input Condition has Master-Detail to Process Input.'
  },
  {
    phaseNumber: 9,
    objects: ['SBQQ__CustomAction__c', 'SBQQ__CustomActionCondition__c', 'SBQQ__SearchFilter__c'],
    description:
      'Phase 9: Custom Actions & Filters - Custom actions and their related objects',
    comment: 'Custom Action Condition has Master-Detail to Custom Action.'
  },
  {
    phaseNumber: 10,
    objects: ['SBQQ__ImportFormat__c', 'SBQQ__ImportColumn__c'],
    description:
      'Phase 10: Import/Export Configuration - Import format and column definitions',
    comment: 'Import Column has Master-Detail to Import Format.'
  },
  {
    phaseNumber: 11,
    objects: ['SBQQ__Localization__c'],
    description:
      'Phase 11: Localization - Translations and localized content (Final Phase)',
    comment:
      'This object references many other CPQ objects. Must be migrated last after all referenced objects exist.'
  }
];

function getPhaseAndExternalId(
  objectName: string,
  includeProduct2: boolean
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
        // Product Rule lookup queries
        return { phaseNumber: phaseNum, externalId: 'Name' };
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
        // Price Rule lookup queries
        return {
          phaseNumber: phaseNum,
          externalId: 'SBQQ__PriceRule2__r.Name;SBQQ__Type__c'
        };
    }
  }

  // Phase 4: Template Contents & Quote Templates
  if (['SBQQ__TemplateContent__c', 'SBQQ__QuoteTemplate__c'].includes(objectName)) {
    const phaseNum = 4;
    switch (objectName) {
      case 'SBQQ__TemplateContent__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
      case 'SBQQ__QuoteTemplate__c':
        return { phaseNumber: phaseNum, externalId: 'Name' };
    }
  }

  // Phase 5: Line Columns & Template Sections
  if (['SBQQ__LineColumn__c', 'SBQQ__TemplateSection__c'].includes(objectName)) {
    const phaseNum = 5;
    switch (objectName) {
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

  // Phase 6: Additional Product Configuration
  if (['SBQQ__OptionConstraint__c', 'SBQQ__UpgradeSource__c', 'SBQQ__SummaryVariable__c'].includes(objectName)) {
    const phaseNum = 6;
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

  // Phase 7: Discounts & Block Pricing
  if (['SBQQ__DiscountTier__c', 'SBQQ__BlockPrice__c'].includes(objectName)) {
    const phaseNum = 7;
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

  // Phase 8: Quote Process Configuration
  if (['SBQQ__QuoteProcess__c', 'SBQQ__ProcessInput__c', 'SBQQ__ProcessInputCondition__c'].includes(objectName)) {
    const phaseNum = 8;
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

  // Phase 9: Custom Actions & Filters
  if (['SBQQ__CustomAction__c', 'SBQQ__CustomActionCondition__c', 'SBQQ__SearchFilter__c'].includes(objectName)) {
    const phaseNum = 9;
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

  // Phase 10: Import/Export Configuration
  if (['SBQQ__ImportFormat__c', 'SBQQ__ImportColumn__c'].includes(objectName)) {
    const phaseNum = 10;
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

  // Phase 11: Localization
  if (objectName === 'SBQQ__Localization__c') {
    return { phaseNumber: 11, externalId: 'Name' };
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
  phaseNumber?: number
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

      const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2);
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
    const excludedObjects =
      config.excludedObjects && config.excludedObjects.length > 0
        ? [...config.excludedObjects]
        : [...CPQ_DEFAULT_EXCLUDED_OBJECTS];

    if (includeProduct2) {
      const idx = excludedObjects.indexOf('Product2');
      if (idx > -1) {
        excludedObjects.splice(idx, 1);
      }
    } else if (!excludedObjects.includes('Product2')) {
      excludedObjects.push('Product2');
    }

    const exportJson: any = {
      objects: [],
      excludedObjects
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

    for (const obj of objects) {
      const soqlQuery = generateCpqSOQLQuery(
        obj.objectName,
        obj.externalId,
        config.modifiedSince,
        config.customFilters,
        includeProduct2,
        phaseNum
      );

      const scriptObject: any = {
        query: soqlQuery,
        operation: config.operation,
        externalId: obj.externalId
      };

      exportJson.objects.push(scriptObject);
    }

    const exportPath = path.join(phaseDir, 'export.json');
    await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
  }
}


