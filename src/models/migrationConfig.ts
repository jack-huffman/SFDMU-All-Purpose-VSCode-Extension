export type DMLOperation = 'Insert' | 'Update' | 'Upsert' | 'Delete' | 'DeleteHierarchy' | 'DeleteSource';

// Overall migration mode - standard object-based or CPQ phase-based
export type MigrationMode = 'standard' | 'cpq';

export interface OrgConfig {
  alias?: string;
  username: string;
  instanceUrl: string;
  accessToken?: string;
}

export interface ObjectFilter {
  objectName: string;
  whereClause: string;
}

export interface MigrationObject {
  objectName: string;
  externalId: string;
  soqlQuery?: string; // Optional custom query
  phaseNumber: number;
  useCustomQuery: boolean;
  selectedFields?: string[]; // Selected fields for migration (if empty/null, uses all fields)
  whereClause?: string; // Custom WHERE clause for this object's SOQL query
}

export interface MigrationPhase {
  phaseNumber: number;
  objects: MigrationObject[];
  description?: string;
}

export interface MigrationConfig {
  // Overall mode for this configuration.
  // 'standard' uses object-based export.json generation (current behavior).
  // 'cpq' uses CPQ phase-based generation (Phase 1..N folders with export.json files).
  mode?: MigrationMode;

  // Standard object-based migration objects (used when mode !== 'cpq')
  objects: MigrationObject[];

  // CPQ phase-based settings (used when mode === 'cpq')
  selectedPhases?: number[];
  completedPhases?: number[];
  includeProduct2?: boolean;

  sourceOrg: OrgConfig;
  targetOrg: OrgConfig;
  operation: DMLOperation;
  modifiedSince?: string;
  customFilters?: ObjectFilter[];
  excludedObjects?: string[];
  outputDir: string;
  configName?: string;
}

// Default excluded objects for standard migrations (can be customized by user)
export const DEFAULT_EXCLUDED_OBJECTS: string[] = [];

// Default excluded objects for CPQ configuration-only migrations
export const CPQ_DEFAULT_EXCLUDED_OBJECTS: string[] = [
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

export interface OrgInfo {
  alias: string;
  username: string;
  instanceUrl: string;
  accessToken?: string;
}

export interface SFDMUResult {
  success: boolean;
  recordsProcessed?: number;
  errors?: string[];
  output: string;
}

// Legacy interface for backward compatibility (if needed)
export interface PhaseObjectInfo {
  objectName: string;
  externalId: string;
  phaseNumber: number;
}

// Phase definition used by CPQ phase-based migrations
export interface PhaseConfig {
  phaseNumber: number;
  objects: string[];
  description: string;
  comment: string;
}

export interface ObjectMetadata {
  name: string;
  label: string;
  fields: FieldMetadata[];
}

export interface FieldMetadata {
  name: string;
  label: string;
  type: string;
  isExternalId: boolean;
  isUnique: boolean;
  referenceTo?: string[];
}

