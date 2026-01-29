export type DMLOperation = 'Insert' | 'Update' | 'Upsert' | 'Delete' | 'DeleteHierarchy' | 'DeleteSource';

// Overall migration mode - standard object-based, CPQ phase-based, or RCA phase-based
export type MigrationMode = 'standard' | 'cpq' | 'rca';

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
  orderByClause?: string; // Custom ORDER BY clause for this object's SOQL query
  limitClause?: string; // Custom LIMIT clause for this object's SOQL query
  master?: boolean; // Master/slave mode: true (default) = master object, false = slave object (only fetches records related to previously selected master objects)
  operation?: DMLOperation; // Per-object DML operation (if not specified, uses global config.operation)
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
  // 'rca' uses RCA phase-based generation (Phase 1..7 folders with export.json files).
  mode?: MigrationMode;

  // Standard object-based migration objects (used when mode !== 'cpq')
  objects: MigrationObject[];

  // CPQ phase-based settings (used when mode === 'cpq')
  selectedPhases?: number[];
  completedPhases?: number[];
  includeProduct2?: boolean;
  selectedMasterRecords?: CpqMasterRecordSelection; // Selected master records per phase
  queriedChildRecords?: CpqQueriedChildRecords; // Queried child records per phase, parent, and child object
  excludedObjectsByPhase?: { [phaseNumber: number]: string[] }; // Objects marked as "do not migrate" per phase
  cpqPhaseOperations?: { [phaseNumber: number]: DMLOperation }; // DML operation per phase

  // RCA phase-based settings (used when mode === 'rca')
  rcaSelectedPhases?: number[];
  rcaCompletedPhases?: number[];
  rcaIncludeProduct2?: boolean;
  rcaPhaseOperations?: { [phaseNumber: number]: DMLOperation }; // DML operation per phase

  sourceOrg: OrgConfig;
  targetOrg: OrgConfig;
  operation: DMLOperation;
  modifiedSince?: string;
  customFilters?: ObjectFilter[];
  excludedObjects?: string[];
  outputDir: string;
  configName?: string;
  backupLocation?: string; // Path to backup directory (populated after backup creation)
}

// Migration execution history
export interface MigrationHistory {
  id: string; // Unique identifier
  configName: string;
  mode: MigrationMode;
  sourceOrg: OrgConfig;
  targetOrg: OrgConfig;
  timestamp: string; // ISO timestamp
  operation: DMLOperation; // Global operation
  phaseNumber?: number; // For phase-based migrations
  objects: MigrationHistoryObject[];
  backupLocation?: string; // Path to backup directory
  status: 'completed' | 'failed' | 'partial';
  recordsProcessed?: number;
  errors?: string[];
}

export interface MigrationHistoryObject {
  objectName: string;
  operation: DMLOperation; // Per-object operation
  externalId: string;
  recordsAffected: {
    inserted?: number;
    updated?: number;
    deleted?: number;
    failed?: number;
  };
  backupFile?: string; // Path to backup CSV for this object
}

// Rollback configuration
export interface RollbackConfig {
  historyId?: string; // Reference to migration history (optional)
  backupDir: string; // Selected backup directory path
  mode: MigrationMode;
  phaseNumber?: number;
  objects: RollbackObject[];
  sourceOrg: OrgConfig; // Target org becomes source for rollback
  targetOrg: OrgConfig; // Source org becomes target (for restore operations)
}

export interface RollbackObject {
  objectName: string;
  originalOperation: DMLOperation;
  rollbackOperation: DMLOperation;
  externalId: string;
  query: string; // SOQL query to identify records to rollback
  backupFile?: string; // Path to backup CSV (for restore operations)
}

// Backup metadata
export interface BackupMetadata {
  timestamp: string;
  configName: string;
  mode: MigrationMode;
  phaseNumber?: number;
  sourceOrg: OrgConfig;
  targetOrg: OrgConfig;
  objects: Array<{
    objectName: string;
    operation: DMLOperation;
    externalId: string;
    backupFile: string; // Path to CSV file (pre-migration backup)
    recordCount: number;
    fields: string[]; // Fields backed up
    originalQuery?: string; // Original migration query (for rollback Delete operations)
    postMigrationBackupFile?: string; // Path to CSV file for post-migration backup (Insert operations - contains IDs)
    postMigrationRecordCount?: number; // Number of records in post-migration backup
    isPostMigration?: boolean; // Flag for post-migration backup entries
  }>;
}

// Backup info for listing available backups
export interface BackupInfo {
  timestamp: string; // Folder name (timestamp)
  path: string; // Full path to backup directory
  metadata: BackupMetadata; // Loaded metadata
  formattedDate: string; // Human-readable date/time
  objectCount: number; // Number of objects in backup
  totalRecords: number; // Total records across all objects
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

// Default excluded objects for RCA configuration-only migrations
export const RCA_DEFAULT_EXCLUDED_OBJECTS: string[] = [
  'Account',
  'Order',
  'OrderItem',
  'Opportunity',
  'Quote',
  'Contract',
  'Asset'
  // Note: Product2 is optional (like CPQ mode)
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

// CPQ master record selection - stores selected records with both external ID and Salesforce Id
export interface CpqMasterRecordSelection {
  [phaseNumber: number]: {
    [objectName: string]: Array<{
      externalId: string; // External ID value for display/identification
      id: string; // Salesforce Id for efficient querying
    }>;
  };
}

// CPQ queried child records - stores queried child record objects per phase, parent object, parent external ID, and child object
export interface CpqQueriedChildRecords {
  [phaseNumber: number]: {
    [parentObjectName: string]: {
      [parentExternalId: string]: {
        [childObjectName: string]: any[]; // Array of child record objects (with Id, Name, etc.)
      };
    };
  };
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

// Metadata deployment configuration for Tooling API
export interface MetadataDeploymentConfig {
  metadataType: string;
  externalIdField: string;
  deployBeforePhase?: number;
  required: boolean;
}

// Deployment result for metadata objects
export interface DeploymentResult {
  success: boolean;
  deployedRecords: number;
  errors: string[];
}

