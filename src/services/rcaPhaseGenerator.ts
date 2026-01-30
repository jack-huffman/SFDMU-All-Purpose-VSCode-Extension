import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MigrationConfig,
  PhaseConfig,
  PhaseObjectInfo,
  RCA_DEFAULT_EXCLUDED_OBJECTS
} from '../models/migrationConfig';
import { extractRelationshipFields } from './queryGenerator';

// RCA Object Configuration Interface
interface RcaObjectConfig {
  sobject: string;
  query: string;
  externalIdField?: string | null;
  compositeKey?: {
    required: string[];
    optional?: string[];
  } | null;
  lookups: Array<{
    field: string;
    sobject?: string;
    externalId?: string;
    targetField: string;
    targetSobjectCompositeKey?: {
      required: string[];
      optional?: string[];
    };
    polymorphicConfig?: Record<string, {
      sobject: string;
      externalId: string;
    }>;
  }>;
  overrides?: Record<string, any>;
  overridesForDelete?: Record<string, any>;
  useRestApi?: boolean;
  binaryFields?: string[];
  mode?: string | null;
  preQueries?: Array<{
    name: string;
    query: string;
  }>;
  fieldsToExclude?: string[];
}

interface RcaConfigFile {
  metadata: {
    planName: string;
    displayName: string;
    totalConfigs: number;
    uniqueObjects: number;
    extractedAt: string;
  };
  configurations: RcaObjectConfig[];
}

// Phase definitions - Based on RCA migration best practices
// Structure follows dependency order for Revenue Cloud Advanced
const PHASE_DEFINITIONS: PhaseConfig[] = [
  {
    phaseNumber: 1,
    objects: [
      'CurrencyType',
      'UnitOfMeasureClass', // initial - Status = Draft
      'UnitOfMeasure',
      'UnitOfMeasureClass', // final - Status = Active
      'AttributeCategory',
      'AttributePicklist',
      'AttributePicklistValue',
      'AttributeDefinition',
      'AttributeCategoryAttribute',
      'ProductClassification',
      'ProductClassificationAttr',
      'LegalEntity',
      'PaymentTerm', // initial - Status = Draft, Insert-Only
      'PaymentTermItem',
      'PaymentTerm', // final
      'TaxEngineProvider',
      'TaxEngine',
      'TaxPolicy', // initial - Status = Draft, Insert-Only
      'TaxTreatment', // Insert-Only
      'TaxPolicy', // final
      'BillingPolicy', // initial - Status = Draft, Insert-Only
      'BillingTreatment', // initial - Status = Draft, Insert-Only
      'BillingTreatmentItem', // Insert-Only
      'BillingTreatment', // final
      'BillingPolicy', // final
      'ProductSpecificationType',
      'ProductSpecificationRecType'
    ],
    description: 'Phase 1: Foundation Objects - Currency, Units of Measure, Attributes, Legal Entities, Payment Terms, Tax Policies, Billing Policies, and Product Specifications',
    comment: 'Foundation objects that all other RCA objects depend on. Includes multiple configurations for same objects (UnitOfMeasureClass, PaymentTerm, TaxPolicy, BillingPolicy, BillingTreatment) with status transitions from Draft to Active.'
  },
  {
    phaseNumber: 2,
    objects: [
      'Product2',
      'ProductAttributeDefinition',
      'AttrPicklistExcludedValue',
      'Product2DataTranslation'
    ],
    description: 'Phase 2: Product Core Objects - Products, Product Attributes, Attribute Exclusions, and Product Translations',
    comment: 'Core product objects. Product2 is optional (default excluded). ProductAttributeDefinition uses complex composite keys with optional fields. AttrPicklistExcludedValue has polymorphic lookups.'
  },
  {
    phaseNumber: 3,
    objects: [
      'CostBook',
      'CostBookEntry',
      'Pricebook2',
      'ProrationPolicy', // Insert-Only
      'ProductSellingModel',
      'ProductSellingModelOption',
      'PricebookEntry'
    ],
    description: 'Phase 3: Pricing and Selling Models - Cost Books, Pricebooks, Selling Models, and Pricebook Entries',
    comment: 'Pricing foundation objects. PricebookEntry uses ORDER BY for consistent migration. Composite keys include optional currency fields.'
  },
  {
    phaseNumber: 4,
    objects: [
      'ProductCatalog',
      'ProductCategory',
      'ProductCategoryDataTranslation',
      'ProductCategoryProduct'
    ],
    description: 'Phase 4: Catalog Structure - Product Catalogs, Categories, Category Translations, and Category-Product Relationships',
    comment: 'Catalog hierarchy objects. ProductCategory has self-referential lookups (ParentCategory).'
  },
  {
    phaseNumber: 5,
    objects: [
      'ProductComponentGroup',
      'ProductComponentGrpOverride',
      'ProductRelatedComponent',
      'ProductRelComponentOverride'
    ],
    description: 'Phase 5: Product Components and Relationships - Component Groups, Overrides, Related Components, and Component Overrides',
    comment: 'Product component and relationship objects. ProductRelatedComponent has the most complex composite key (3 required + 4 optional fields). ProductRelComponentOverride uses composite key lookups.'
  },
  {
    phaseNumber: 6,
    objects: [
      'PriceAdjustmentSchedule',
      'PriceAdjustmentTier',
      'BundleBasedAdjustment',
      'AttributeBasedAdjRule',
      'AttributeAdjustmentCondition',
      'AttributeBasedAdjustment'
    ],
    description: 'Phase 6: Pricing Rules and Adjustments - Price Adjustment Schedules, Tiers, Bundle Adjustments, and Attribute-Based Adjustments',
    comment: 'Pricing adjustment objects. BundleBasedAdjustment has 7 lookups. Attribute-based adjustments support complex pricing rules.'
  },
  {
    phaseNumber: 7,
    objects: [
      'ProductConfigurationFlow', // Insert-Only
      'ProductConfigFlowAssignment',
      'ProductFulfillmentDecompRule',
      'ValTfrmGrp',
      'ValTfrm',
      'ProductDecompEnrichmentRule', // Requires Tooling API metadata (DecisionMatrixDefinition, ExpressionSet)
      'ProdtDecompEnrchVarMap',
      'FulfillmentStepDefinitionGroup',
      'OmniUiCardConfig',
      'OmniIntegrationProcConfig',
      'IntegrationProviderDef',
      'FulfillmentStepDefinition',
      'FulfillmentStepDependencyDef',
      'FulfillmentWorkspace',
      'FulfillmentWorkspaceItem',
      'ProductFulfillmentScenario'
    ],
    description: 'Phase 7: Configuration and Fulfillment - Product Configuration Flows, Fulfillment Rules, Value Transforms, Enrichment Rules, Fulfillment Steps, Workspaces, and Scenarios',
    comment: 'Fulfillment orchestration objects. ProductDecompEnrichmentRule has polymorphic lookups to metadata objects (DecisionMatrixDefinition, ExpressionSet) that require Tooling API deployment before Phase 7.'
  }
];

// Load RCA configuration from JSON file (copied to out/webview/ui/js/rca/ by copy-webview)
// Extension is bundled to out/extension.js, so __dirname is out/
async function loadRcaConfig(): Promise<RcaConfigFile> {
  const configPath = path.join(__dirname, 'webview/ui/js/rca/rca-complete-config.json');
  const content = await fs.readFile(configPath, 'utf8');
  return JSON.parse(content) as RcaConfigFile;
}

// Map of object name to configuration (handles multiple configs per object)
const objectConfigMap = new Map<string, RcaObjectConfig[]>();

// Initialize config map (called once)
let configInitialized = false;
async function initializeConfigMap(): Promise<void> {
  if (configInitialized) return;
  
  const rcaConfig = await loadRcaConfig();
  for (const config of rcaConfig.configurations) {
    const key = config.sobject;
    if (!objectConfigMap.has(key)) {
      objectConfigMap.set(key, []);
    }
    objectConfigMap.get(key)!.push(config);
  }
  configInitialized = true;
}

/**
 * Get external ID for an object (handles composite keys)
 * Returns semicolon-separated string for composite keys
 */
function getExternalIdForObject(objectName: string, configIndex: number = 0): string | null {
  const configs = objectConfigMap.get(objectName);
  if (!configs || configs.length === 0) {
    return null;
  }
  
  const config = configs[configIndex] || configs[0];
  
  if (config.externalIdField) {
    return config.externalIdField;
  }
  
  if (config.compositeKey) {
    const required = config.compositeKey.required || [];
    const optional = config.compositeKey.optional || [];
    const allFields = [...required, ...optional];
    return allFields.join(';');
  }
  
  return null;
}

/**
 * Get master objects for a phase (objects that require user selection)
 * Based on RCA_MASTER_SLAVE_OBJECTS.md
 */
export function getMasterObjectsForPhase(phaseNumber: number): string[] {
  const masterMap: { [phase: number]: string[] } = {
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
}

/**
 * Determine if an object should be a slave (master=false)
 * Slave objects only fetch records related to previously selected master objects
 */
function isSlaveObject(objectName: string, phaseNumber: number): boolean {
  // Phase 1: PaymentTermItem is slave to PaymentTerm
  if (phaseNumber === 1 && objectName === 'PaymentTermItem') {
    return true;
  }
  
  // Phase 1: BillingTreatmentItem is slave to BillingTreatment
  if (phaseNumber === 1 && objectName === 'BillingTreatmentItem') {
    return true;
  }
  
  // Phase 2: ProductAttributeDefinition, AttrPicklistExcludedValue, Product2DataTranslation are slaves to Product2
  if (phaseNumber === 2) {
    return ['ProductAttributeDefinition', 'AttrPicklistExcludedValue', 'Product2DataTranslation'].includes(objectName);
  }
  
  // Phase 3: CostBookEntry is slave to CostBook, ProductSellingModelOption is slave to ProductSellingModel, PricebookEntry is slave to Pricebook2
  if (phaseNumber === 3) {
    return ['CostBookEntry', 'ProductSellingModelOption', 'PricebookEntry'].includes(objectName);
  }
  
  // Phase 4: ProductCategoryDataTranslation and ProductCategoryProduct are slaves
  if (phaseNumber === 4) {
    return ['ProductCategoryDataTranslation', 'ProductCategoryProduct'].includes(objectName);
  }
  
  // Phase 5: ProductComponentGrpOverride and ProductRelComponentOverride are slaves
  if (phaseNumber === 5) {
    return ['ProductComponentGrpOverride', 'ProductRelComponentOverride'].includes(objectName);
  }
  
  // Phase 6: PriceAdjustmentTier, BundleBasedAdjustment, AttributeAdjustmentCondition, AttributeBasedAdjustment are slaves
  if (phaseNumber === 6) {
    return ['PriceAdjustmentTier', 'BundleBasedAdjustment', 'AttributeAdjustmentCondition', 'AttributeBasedAdjustment'].includes(objectName);
  }
  
  // Phase 7: Most objects are slaves to their parent objects
  if (phaseNumber === 7) {
    return [
      'ProductConfigFlowAssignment',
      'ProdtDecompEnrchVarMap',
      'FulfillmentStepDependencyDef',
      'FulfillmentWorkspaceItem'
    ].includes(objectName);
  }
  
  return false;
}

/**
 * Get phase number and external ID for an object
 * Handles multiple configurations per object
 */
function getPhaseAndExternalId(
  objectName: string,
  includeProduct2: boolean,
  configIndex: number = 0
): { phaseNumber: number; externalId: string; configIndex: number } | null {
  // Product2 - only if includeProduct2 is true, goes to Phase 2
  if (objectName === 'Product2') {
    if (includeProduct2) {
      const externalId = getExternalIdForObject(objectName, 0);
      if (externalId) {
        return { phaseNumber: 2, externalId, configIndex: 0 };
      }
    }
    return null;
  }
  
  // Find which phase contains this object
  for (const phase of PHASE_DEFINITIONS) {
    const objectIndex = phase.objects.indexOf(objectName);
    if (objectIndex >= 0) {
      // Handle multiple configs - find the right config index
      let actualConfigIndex = configIndex;
      const configs = objectConfigMap.get(objectName) || [];
      
      // For objects with multiple configs, determine which one based on position in phase
      if (configs.length > 1) {
        // Count how many times this object appears before this index in the phase
        let occurrenceCount = 0;
        for (let i = 0; i < objectIndex; i++) {
          if (phase.objects[i] === objectName) {
            occurrenceCount++;
          }
        }
        actualConfigIndex = occurrenceCount;
      }
      
      const externalId = getExternalIdForObject(objectName, actualConfigIndex);
      if (externalId) {
        return { phaseNumber: phase.phaseNumber, externalId, configIndex: actualConfigIndex };
      }
    }
  }
  
  return null;
}

/**
 * Generate SOQL query for RCA object
 * Uses the query from config, applies filters and overrides
 */
function generateRcaSOQLQuery(
  objectName: string,
  configIndex: number,
  modifiedSince?: string,
  customFilters?: { objectName: string; whereClause: string }[],
  includeProduct2: boolean = false
): string {
  const configs = objectConfigMap.get(objectName);
  if (!configs || configs.length === 0) {
    throw new Error(`No configuration found for object: ${objectName}`);
  }
  
  const config = configs[configIndex] || configs[0];
  let query = config.query.trim();
  
  // Extract relationship fields from external ID or composite key
  const externalId = getExternalIdForObject(objectName, configIndex);
  if (externalId) {
    const relFields = extractRelationshipFields(externalId);
    if (relFields.length > 0) {
      // Check if query already includes these fields
      const queryUpper = query.toUpperCase();
      for (const relField of relFields) {
        if (!queryUpper.includes(relField.toUpperCase())) {
          // Add relationship field if not already in SELECT
          // Insert after SELECT or SELECT all
          if (queryUpper.includes('SELECT ALL')) {
            query = query.replace(/SELECT\s+ALL/i, `SELECT all, ${relFields.join(', ')}`);
            break; // Only add once
          } else if (queryUpper.startsWith('SELECT')) {
            // Insert after SELECT keyword
            const selectMatch = query.match(/^SELECT\s+/i);
            if (selectMatch) {
              query = query.replace(/^SELECT\s+/i, `SELECT ${relFields.join(', ')}, `);
            }
          }
        }
      }
    }
  }
  
  // Apply field overrides (these are handled by SFDMU, but we can note them)
  // Overrides are applied during data transformation, not in SOQL
  
  // Add LastModifiedDate filter if provided
  if (modifiedSince) {
    const datetimeValue = `${modifiedSince}T00:00:00.000Z`;
    const hasWhere = /\bWHERE\b/i.test(query);
    if (hasWhere) {
      query += ` AND LastModifiedDate >= ${datetimeValue}`;
    } else {
      query += ` WHERE LastModifiedDate >= ${datetimeValue}`;
    }
  }
  
  // Add custom filters
  if (customFilters) {
    const objectFilter = customFilters.find((f) => f.objectName === objectName);
    if (objectFilter && objectFilter.whereClause) {
      const hasWhere = /\bWHERE\b/i.test(query);
      const filterConditions = objectFilter.whereClause
        .split(/\s+AND\s+/i)
        .map((c) => c.trim());
      
      if (hasWhere) {
        query += ' AND ' + filterConditions.join(' AND ');
      } else {
        query += ' WHERE ' + filterConditions.join(' AND ');
      }
    }
  }
  
  // Hard guard against transactional objects
  const excludedTransactionalObjects = [
    'Account',
    'Order',
    'OrderItem',
    'Opportunity',
    'Quote',
    'Contract',
    'Asset'
  ];
  
  if (excludedTransactionalObjects.includes(objectName)) {
    const hasWhere = /\bWHERE\b/i.test(query);
    if (hasWhere) {
      query += ' AND Id = null';
    } else {
      query += ' WHERE Id = null';
    }
  }
  
  return query;
}

/**
 * Get all RCA phase definitions, adjusting for Product2 inclusion
 */
export async function getRcaPhaseDefinitions(includeProduct2: boolean): Promise<PhaseConfig[]> {
  await initializeConfigMap();
  
  const phases = PHASE_DEFINITIONS.map((p) => ({ ...p, objects: [...p.objects] }));
  
  if (includeProduct2) {
    // Insert Product2 into Phase 2 if not already there
    const phase2 = phases[1];
    if (!phase2.objects.includes('Product2')) {
      phase2.objects = ['Product2', ...phase2.objects];
    }
    phase2.description = 'Phase 2: Product Core Objects - Products, Product Attributes, Attribute Exclusions, and Product Translations';
  } else {
    // Remove Product2 from Phase 2 if present
    const phase2 = phases[1];
    phase2.objects = phase2.objects.filter(obj => obj !== 'Product2');
  }
  
  return phases;
}

/**
 * Generate a single RCA phase file
 */
export async function generateRcaPhaseFile(
  config: MigrationConfig,
  phaseNumber: number
): Promise<void> {
  await initializeConfigMap();
  
  const outputDir = path.resolve(config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const includeProduct2 = !!config.rcaIncludeProduct2;
  const phases = await getRcaPhaseDefinitions(includeProduct2);
  const phase = phases.find((p) => p.phaseNumber === phaseNumber);

  if (!phase) {
    throw new Error(`Phase ${phaseNumber} not found`);
  }

  const excludedTransactionalObjects = [
    'Account',
    'Order',
    'OrderItem',
    'Opportunity',
    'Quote',
    'Contract',
    'Asset'
  ];

  const objects: Array<PhaseObjectInfo & { configIndex: number; insertOnly: boolean }> = [];
  
  // Track object occurrences in phase to get correct config index
  const objectOccurrenceMap = new Map<string, number>();

  for (const objectName of phase.objects) {
    if (excludedTransactionalObjects.includes(objectName)) {
      if (objectName === 'Product2' && includeProduct2) {
        // allowed
      } else {
        continue;
      }
    }

    // Count occurrence of this object in phase
    const occurrence = objectOccurrenceMap.get(objectName) || 0;
    objectOccurrenceMap.set(objectName, occurrence + 1);

    const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2, occurrence);
    if (phaseInfo && phaseInfo.phaseNumber === phaseNumber) {
      const configs = objectConfigMap.get(objectName) || [];
      const objConfig = configs[phaseInfo.configIndex] || configs[0];
      const insertOnly = objConfig.mode === 'insert-only';
      
      objects.push({
        objectName,
        externalId: phaseInfo.externalId,
        phaseNumber: phaseInfo.phaseNumber,
        configIndex: phaseInfo.configIndex,
        insertOnly
      });
    }
  }

  if (objects.length === 0) {
    throw new Error(`No objects found for Phase ${phaseNumber}`);
  }

  const phaseDir = path.join(outputDir, `Phase ${phaseNumber}`);
  await fs.mkdir(phaseDir, { recursive: true });

  // Start from RCA default excluded objects, allow override via config.excludedObjects
  const excludedObjects =
    config.excludedObjects && config.excludedObjects.length > 0
      ? [...config.excludedObjects]
      : [...RCA_DEFAULT_EXCLUDED_OBJECTS];

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

  // Get selected master records for this phase
  const phaseSelections = config.selectedMasterRecords?.[phaseNumber] || {};

  // Get excluded objects for this phase
  const excludedObjectsByPhase = config.excludedObjectsByPhase?.[phaseNumber] || [];

  // Get master objects for this phase to determine which objects require selections
  const masterObjects = getMasterObjectsForPhase(phaseNumber);

  for (const obj of objects) {
    // Skip objects that are explicitly marked as "do not migrate"
    if (excludedObjectsByPhase.includes(obj.objectName)) {
      continue;
    }

    // Skip master objects that have no selected records
    // Master objects require user selection - if none selected, don't include in export
    if (masterObjects.includes(obj.objectName)) {
      // Handle both old format (string[]) and new format ({ externalId, id }[])
      const selected = phaseSelections[obj.objectName] || [];
      if (Array.isArray(selected) && selected.length === 0) {
        // Master object with no selections - skip it
        continue;
      }
    }

    const soqlQuery = generateRcaSOQLQuery(
      obj.objectName,
      obj.configIndex,
      config.modifiedSince,
      config.customFilters,
      includeProduct2
    );

    // Use phase-specific operation if available, otherwise fall back to global operation
    // Note: obj.insertOnly takes precedence over phase operation
    const phaseOperation = config.rcaPhaseOperations?.[phaseNumber] || config.operation || 'Upsert';
    const finalOperation = obj.insertOnly ? 'Insert' : phaseOperation;

    const scriptObject: any = {
      query: soqlQuery,
      operation: finalOperation,
      externalId: obj.externalId
    };

    // Set master=false for slave objects
    if (isSlaveObject(obj.objectName, phaseNumber)) {
      scriptObject.master = false;
    }

    // Add field overrides if present
    const configs = objectConfigMap.get(obj.objectName) || [];
    const objConfig = configs[obj.configIndex] || configs[0];
    if (objConfig.overrides && Object.keys(objConfig.overrides).length > 0) {
      scriptObject.overrides = objConfig.overrides;
    }

    exportJson.objects.push(scriptObject);
  }

  const exportPath = path.join(phaseDir, 'export.json');
  await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
}

/**
 * Generate RCA phase files under config.outputDir/Phase N/export.json
 */
export async function generateRcaPhaseFiles(config: MigrationConfig): Promise<void> {
  await initializeConfigMap();
  
  const outputDir = path.resolve(config.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  
  const includeProduct2 = !!config.rcaIncludeProduct2;
  const phases = await getRcaPhaseDefinitions(includeProduct2);
  
  const selectedPhaseNumbers =
    config.rcaSelectedPhases && config.rcaSelectedPhases.length > 0
      ? config.rcaSelectedPhases
      : phases.map((p) => p.phaseNumber);
  
  const selectedPhases = phases.filter((p) => selectedPhaseNumbers.includes(p.phaseNumber));
  
  const phaseObjects: Map<number, Array<PhaseObjectInfo & { configIndex: number; insertOnly: boolean }>> = new Map();
  
  for (const phase of selectedPhases) {
    const objects: Array<PhaseObjectInfo & { configIndex: number; insertOnly: boolean }> = [];
    
    const excludedTransactionalObjects = [
      'Account',
      'Order',
      'OrderItem',
      'Opportunity',
      'Quote',
      'Contract',
      'Asset'
    ];
    
    // Track object occurrences in phase to get correct config index
    const objectOccurrenceMap = new Map<string, number>();
    
    for (const objectName of phase.objects) {
      if (excludedTransactionalObjects.includes(objectName)) {
        if (objectName === 'Product2' && includeProduct2) {
          // allowed
        } else {
          continue;
        }
      }
      
      // Count occurrence of this object in phase
      const occurrence = objectOccurrenceMap.get(objectName) || 0;
      objectOccurrenceMap.set(objectName, occurrence + 1);
      
      const phaseInfo = getPhaseAndExternalId(objectName, includeProduct2, occurrence);
      if (phaseInfo && phaseInfo.phaseNumber === phase.phaseNumber) {
        const configs = objectConfigMap.get(objectName) || [];
        const objConfig = configs[phaseInfo.configIndex] || configs[0];
        const insertOnly = objConfig.mode === 'insert-only';
        
        objects.push({
          objectName,
          externalId: phaseInfo.externalId,
          phaseNumber: phaseInfo.phaseNumber,
          configIndex: phaseInfo.configIndex,
          insertOnly
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
    
    // Start from RCA default excluded objects, allow override via config.excludedObjects
    const excludedObjects =
      config.excludedObjects && config.excludedObjects.length > 0
        ? [...config.excludedObjects]
        : [...RCA_DEFAULT_EXCLUDED_OBJECTS];
    
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
      const soqlQuery = generateRcaSOQLQuery(
        obj.objectName,
        obj.configIndex,
        config.modifiedSince,
        config.customFilters,
        includeProduct2
      );
      
      // Use phase-specific operation if available, otherwise fall back to global operation
      // Note: obj.insertOnly takes precedence over phase operation
      const phaseOperation = config.rcaPhaseOperations?.[phaseNum] || config.operation || 'Upsert';
      const finalOperation = obj.insertOnly ? 'Insert' : phaseOperation;
      
      const scriptObject: any = {
        query: soqlQuery,
        operation: finalOperation,
        externalId: obj.externalId
      };
      
      // Set master=false for slave objects
      if (isSlaveObject(obj.objectName, phaseNum)) {
        scriptObject.master = false;
      }
      
      // Add field overrides if present
      const configs = objectConfigMap.get(obj.objectName) || [];
      const objConfig = configs[obj.configIndex] || configs[0];
      if (objConfig.overrides && Object.keys(objConfig.overrides).length > 0) {
        scriptObject.overrides = objConfig.overrides;
      }
      
      exportJson.objects.push(scriptObject);
    }
    
    const exportPath = path.join(phaseDir, 'export.json');
    await fs.writeFile(exportPath, JSON.stringify(exportJson, null, 2), 'utf8');
  }
}

