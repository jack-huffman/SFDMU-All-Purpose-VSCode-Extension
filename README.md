# SFDMU All-Purpose Migration VSCode Extension

A Visual Studio Code extension that provides a visual interface for configuring and executing SFDMU (Salesforce Data Move Utility) data migrations for any Salesforce objects between orgs.

## How to Use

**Open the Migration Panel:**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type **`SFDMU: Open Migration Panel`**
3. Press Enter

**Quick Start:**
1. Select your source and target orgs
2. Choose migration mode:
   - **Standard Mode**: Add individual objects with custom phase organization
   - **CPQ Mode**: Pre-configured 11-phase CPQ migration
   - **RCA Mode**: Pre-configured 7-phase Revenue Cloud Advanced migration (includes metadata deployment)
3. Configure migration settings:
   - **Standard Mode**: Add objects, configure external IDs (use "Auto-detect" or enter manually)
   - **CPQ/RCA Mode**: Select phases, configure filters and settings
4. **RCA Mode Only**: Deploy metadata prerequisites before Phase 7 (DecisionMatrixDefinition, ExpressionSet)
5. Click "Generate Migration Files"
6. Run simulation mode first, then execute migrations
7. **CPQ/RCA Mode**: Run phases sequentially, marking each as complete

## Prerequisites

- **Visual Studio Code** 1.80.0 or higher
- **Salesforce CLI (sf)** installed and configured
  - Install: https://developer.salesforce.com/tools/salesforcecli
  - Verify: `sf --version`
- **SFDMU Plugin** for Salesforce CLI
  - Install: `sf plugins install sfdmu`
  - Verify: `sf plugins list` (should show `@forcedotcom/sfdmu`)
- **Authorized Salesforce Orgs** in your Salesforce CLI
  - Authorize: `sf org login web --alias <alias>`
  - List: `sf org list`

## Features

- **Visual Configuration Interface**: Configure migrations through an intuitive webview panel (no manual JSON editing)
- **Three Migration Modes**:
  - **Standard Mode**: Configure any Salesforce objects with custom phase organization
  - **CPQ Mode**: Pre-configured 11 phases optimized for Salesforce CPQ migrations
  - **RCA Mode**: Pre-configured 7 phases optimized for Revenue Cloud Advanced (RCA) migrations, with automatic metadata deployment
- **Smart Automation**: Auto-detect external IDs, validate objects, generate SOQL queries
- **Configuration Management**: Organize configurations in folders with tree view, drag-and-drop support
- **Full SFDMU Integration**: Execute migrations directly from VS Code with terminal integration

## Usage Guide

### Standard Migration Mode

1. **Configure Migration Settings**:
   - Select "Standard" mode
   - Select source and target orgs (from dropdown or enter manually)
   - Add objects to migrate:
     - Click "Add Object" or "Load Objects from Org"
     - For each object, configure:
       - **Object Name**: API name (e.g., `Account`, `CustomObject__c`)
       - **External ID**: Field(s) used to match records
         - Single: `Name`, `Id`
         - Composite: `Field1;Field2` (semicolon-separated)
         - Relationship: `Account.Name`, `CustomField__r.Name`
       - **Auto-detect**: Click to automatically detect external ID fields
       - **Phase Number**: Number indicating migration order
       - **Custom SOQL**: Toggle to use a custom SOQL query (optional)
       - **WHERE Clause**: Add custom filters (optional)
   - Configure DML operation (Upsert recommended)
   - Set query filters (Last Modified Date, custom WHERE clauses)
   - Configure excluded objects
   - Set output directory (default: `sfdmu-migration`)

2. **Generate Migration Files**:
   - Click "Generate Migration Files"
   - Review the generated `export.json` file

3. **Run Migrations**:
   - Click "Run Simulation" first (recommended)
   - After successful simulation, click "Run Migration"
   - Monitor progress in the terminal

### CPQ Migration Mode

1. **Configure CPQ Migration Settings**:
   - Select "CPQ" mode
   - Select source and target orgs
   - Select phases to include (11 phases available)
   - Optionally include Product2 records
   - Configure DML operation, query filters, and output directory

2. **Generate CPQ Phase Files**:
   - Click "Generate Migration Files"
   - Review generated `export.json` files in `Phase N/` folders

3. **Run CPQ Phases**:
   - Expand "Run Individual Phases" section
   - Run simulation for Phase 1 first
   - After successful simulation, run each phase individually
   - Mark phases as complete as you progress

**CPQ Phase Descriptions:**
- **Phase 1**: Pricebook & Product Configuration (foundation objects)
- **Phase 2**: Product Rules (with child objects)
- **Phase 3**: Configuration Rules & Price Rules
- **Phase 4**: Template Contents & Quote Templates
- **Phase 5**: Line Columns & Template Sections
- **Phase 6**: Additional Product Configuration
- **Phase 7**: Discounts & Block Pricing
- **Phase 8**: Quote Process Configuration
- **Phase 9**: Custom Actions & Filters
- **Phase 10**: Import/Export Configuration
- **Phase 11**: Localization (final phase)

### RCA Migration Mode

Revenue Cloud Advanced (RCA) mode provides a pre-configured 7-phase migration structure optimized for RCA data migrations. This mode handles complex relationships, composite keys, and metadata prerequisites automatically.

#### Step-by-Step RCA Migration Guide

**Step 1: Select RCA Mode**
1. Open the Migration Panel
2. In the mode selector dropdown (top of panel), select **"RCA"**
3. The UI will switch to RCA mode, showing the Metadata Prerequisites section and RCA Phases

**Step 2: Configure Source and Target Orgs**
1. Select your **Source Org** (where data currently exists)
2. Select your **Target Org** (where data will be migrated)
3. Or click the edit icon to enter org details manually (username, instance URL, access token)

**Step 3: Configure Migration Settings**
1. **DML Operation**: Select "Upsert" (recommended) or "Insert"
2. **Last Modified Date Filter** (optional): Set to migrate only records modified after a specific date
3. **Output Directory**: Set the folder name for generated migration files (default: `sfdmu-migration`)
4. **Product2 Records**: 
   - By default, Product2 is **excluded** (assumes records exist in target org)
   - RCA configuration records will match to existing Product2 via `StockKeepingUnit` (must be External ID)
   - To include Product2 migration, remove it from the excluded objects list

**Step 4: Deploy Metadata Prerequisites** ⚠️ **Required Before Phase 7**
1. In the **Metadata Prerequisites** section, you'll see two metadata objects:
   - **DecisionMatrixDefinition**
   - **ExpressionSet**
2. Click **"Deploy All Metadata Prerequisites"** to deploy both at once
   - Or deploy individually using the "Deploy" button next to each
3. The extension will:
   - Check if metadata exists in the target org
   - Retrieve from source org if needed
   - Deploy to target org using Tooling API
4. Status badges will update to show "Deployed" when complete
5. **Note**: These metadata objects cannot be migrated via SFDMU (Bulk API) and must be deployed via Tooling API

**Step 5: Generate RCA Phase Files**
1. Click **"Generate Migration Files"** in the header
2. The extension will create phase directories:
   - `Phase 1/export.json`
   - `Phase 2/export.json`
   - ... (through Phase 7)
3. Each phase file contains the objects and queries for that phase
4. Review the generated files to verify configuration

**Step 6: Run RCA Phases (Sequentially)**
1. In the **"Run Individual Phases"** section, you'll see all 7 phases listed
2. **Start with Phase 1**:
   - Click **"Run Simulation"** for Phase 1
   - Review the simulation results in the terminal
   - If successful, click **"Run Migration"** for Phase 1
3. **Mark Phase as Complete**:
   - Check the checkbox next to Phase 1 after successful migration
   - This prevents accidental re-runs
4. **Continue with Remaining Phases**:
   - Run Phase 2 (simulation, then migration)
   - Continue through Phase 7 sequentially
   - **Phase 7** will automatically verify metadata prerequisites before running
5. **Track Progress**:
   - Completed phases show a checkmark and are disabled
   - Completion status is saved with your configuration

#### RCA Phase Descriptions

**Phase 1: Foundation Objects** (27 configurations)
- Currency, Units of Measure, Attributes, Legal Entities
- Payment Terms, Tax Policies, Billing Policies
- Product Specifications and related foundation data
- **Purpose**: Establishes base configuration required by all other phases

**Phase 2: Product Core Objects** (4 configurations)
- Products (Product2), Product Attributes
- Attribute Exclusions, Product Translations
- **Purpose**: Core product data and attributes

**Phase 3: Pricing and Selling Models** (7 configurations)
- Cost Books, Pricebooks, Selling Models
- Pricebook Entries and related pricing data
- **Purpose**: Pricing structure and selling model configuration

**Phase 4: Catalog Structure** (4 configurations)
- Product Catalogs, Categories
- Category Translations, Category-Product Relationships
- **Purpose**: Product catalog organization and hierarchy

**Phase 5: Product Components and Relationships** (4 configurations)
- Component Groups, Overrides
- Related Components, Component Overrides
- **Purpose**: Product bundling and component relationships

**Phase 6: Pricing Rules and Adjustments** (6 configurations)
- Price Adjustment Schedules, Tiers
- Bundle Adjustments, Attribute-Based Adjustments
- **Purpose**: Advanced pricing rules and adjustments

**Phase 7: Configuration and Fulfillment** (16 configurations)
- Product Configuration Flows, Fulfillment Rules
- Value Transforms, Enrichment Rules
- Fulfillment Steps, Workspaces, Scenarios
- **Purpose**: Product configuration and order fulfillment logic
- **⚠️ Requires**: DecisionMatrixDefinition and ExpressionSet metadata (deployed in Step 4)

#### RCA Special Features

**Composite Keys**
- Many RCA objects use multiple fields to uniquely identify records
- Format: `Field1;Field2;Field3` (semicolon-separated)
- Example: `ProductId;AttributeId` for ProductAttribute
- The extension automatically handles composite key generation in SOQL queries

**Polymorphic Lookups**
- Three objects use `TYPEOF` queries for polymorphic relationships
- Automatically handled in phase generation
- Example: Objects that can reference multiple parent types

**Field Overrides**
- Some objects require status transitions (e.g., Draft → Active)
- Handled via multiple configurations with different field values
- The extension generates appropriate queries for each status

**Insert-Only Objects**
- 8 objects cannot be updated and use Insert operation only
- Automatically configured in phase generation
- Includes: AttributeExclusion, CategoryTranslation, ProductTranslation, etc.

**Product2 Matching**
- Product2 is excluded by default in RCA mode
- RCA configuration records match to existing Product2 via `StockKeepingUnit`
- **Requirement**: `StockKeepingUnit` must be marked as External ID in target org
- To migrate Product2 records, remove Product2 from excluded objects list

**Metadata Prerequisites**
- **DecisionMatrixDefinition**: Custom Metadata Type (External ID: DeveloperName)
- **ExpressionSet**: Custom Metadata Type (External ID: ApiName)
- Must be deployed via Tooling API (cannot use SFDMU Bulk API)
- Extension provides automatic deployment, or deploy manually:
  ```bash
  sf project retrieve start --metadata DecisionMatrixDefinition,ExpressionSet --target-org source-alias
  sf project deploy start --metadata DecisionMatrixDefinition,ExpressionSet --target-org target-alias
  ```

#### RCA Deep Clone Feature (Future Enhancement)

The extension will support deep clone migrations starting from a single Product2 SKU, automatically discovering and migrating all related RCA configuration records. This feature is planned for a future release.

#### RCA Context Definitions (Future Enhancement)

Support for migrating Context Definitions and Context Services metadata will be added in a future release, providing complete RCA metadata migration capabilities.

### Configuration Management

The extension provides a configuration management system through the Explorer sidebar.

**Tree View Features:**
- Organize configurations in nested folders
- Drag and drop to move configurations
- Right-click for context menu actions (create, rename, delete, open)
- Double-click to open configurations

**Saving Configurations:**
- Enter a configuration name in the migration panel
- Optionally select a folder path (e.g., `ClientName/ProjectName`)
- Click "Save"

**Loading Configurations:**
- Double-click a configuration in the tree view, or
- Use "Load Configuration" dropdown in the migration panel

**Export/Import:**
- Click "Export" to copy configuration JSON to clipboard
- Paste JSON into import field and click "Import"

## Advanced Features

### Auto-detect External IDs
Click "Auto-detect" next to External ID field to automatically detect external ID fields from your Salesforce org. Works best for single-field external IDs.

### Custom SOQL Queries
Toggle "Use Custom SOQL" for an object to write custom queries. Ensure your query includes all fields needed for external ID matching, relationship fields, and the `Id` field.

**Example:**
```sql
SELECT Id, Name, Account.Name, CustomField__c 
FROM Opportunity 
WHERE StageName = 'Closed Won'
```

### Field Selection
Click "Select Fields" to choose specific fields to migrate instead of all fields. External ID fields and relationship fields are automatically included.

### Relationship Fields in External IDs
The extension supports relationship traversal:
- Standard: `Account.Name` (requires `AccountId` in query)
- Custom: `SBQQ__Product__r.ProductCode` (requires `SBQQ__Product__c` in query)
- Composite: `Account.Name;ProductCode`

The extension automatically includes necessary relationship fields in SOQL queries.

### Incremental Migrations
Set "Last Modified Date" filter to migrate only records modified on or after that date. Useful for syncing changes between orgs.

### Custom Filters
Add object-specific WHERE clauses in the Query Filters section. Multiple filters can be added for the same or different objects.

**Examples:**
- `LastModifiedBy.Name = 'John Doe'`
- `SBQQ__Active__c = true`
- `StageName IN ('Closed Won', 'Closed Lost')`

### Phase Completion Tracking
Check the checkbox next to a phase to mark it as complete. Completed phases show with a checkmark and are disabled. Completion status is saved with configurations.

## Migration Phases

Phases organize objects into execution groups. Objects in Phase 1 are migrated first, then Phase 2, and so on. This ensures dependencies are respected.

**Phase Dependencies:**
- **Master-Detail Relationships**: Child objects must be in the same or later phase than their parent
- **Lookup Relationships**: Objects with lookups should be in later phases
- **Composite External IDs**: Objects using relationship fields in external IDs must be in later phases

**Example Phase Organization:**
- **Phase 1**: `Account`, `Product2`, `Pricebook2`
- **Phase 2**: `Contact`, `Opportunity`, `PricebookEntry`
- **Phase 3**: `OpportunityLineItem`, `Quote`, `QuoteLineItem`

## External IDs and Relationships

External IDs are fields used to match records between source and target orgs. They must be unique identifiers, present in both orgs, and marked as External ID in the target org.

**Types of External IDs:**
1. **Single Field**: `Name`, `Id`, `ProductCode`
2. **Composite**: `Field1;Field2` (semicolon-separated)
3. **Relationship**: `Account.Name`, `SBQQ__Product__r.ProductCode`
4. **Composite with Relationships**: `Account.Name;ProductCode`

**Setting External IDs in Target Org:**
Before migrating, ensure external ID fields are marked as External ID in the target org:
1. Go to Object Manager → Select object → Fields & Relationships
2. Find the field(s) used as external ID
3. Edit the field → Check "External ID" checkbox → Save

**Note**: Standard fields like `Name` and `ProductCode` may already be external IDs. Custom fields must be explicitly marked.

## Best Practices

1. **Always Start with Simulation**: Run each phase in simulation mode first
2. **Migrate Phases in Order**: Run phases sequentially (1, 2, 3, etc.)
3. **Use Auto-detect for External IDs**: Verify detected external IDs match your requirements
4. **Organize Objects by Dependencies**: Place parent objects in earlier phases
5. **Use Incremental Migrations**: Set "Last Modified Date" filter for updates
6. **Exclude Unwanted Objects**: Add objects to the excluded objects list
7. **Mark Phases as Complete**: Track progress and prevent accidental re-runs
8. **Save Configurations**: Use descriptive names and organize in folders
9. **Test in Sandbox First**: Always test migrations in a sandbox before production
10. **Monitor Terminal Output**: Watch for SFDMU warnings and errors

## Troubleshooting

### Common Issues

**"Missing parent records" Error**
- Verify parent objects were migrated in earlier phases
- Check that Product2 records exist in target org (if Product2 is excluded)
- Ensure ProductCode is marked as External ID in target org
- Review the missing records list - some may be expected

**Org Dropdowns Are Empty**
- Verify orgs are authorized: `sf org list`
- Re-authorize orgs: `sf org login web --alias <alias>`
- Check Salesforce CLI is installed: `sf --version`

**Phase Files Not Generated**
- Check for error notifications in VS Code
- Verify output directory path is valid
- Ensure at least one object is configured (Standard Mode) or at least one phase is selected (CPQ Mode)

**Product2 Matching Fails**
- **CPQ Mode**: Verify ProductCode is marked as External ID in target org
- **RCA Mode**: Verify StockKeepingUnit is marked as External ID in target org
- Check that external ID values match between source and target
- Consider including Product2 in migration if matching is problematic

**RCA Metadata Deployment Fails**
- Verify Salesforce CLI is installed and configured
- Check that source org has the metadata objects (DecisionMatrixDefinition, ExpressionSet)
- Ensure target org has permissions to deploy Custom Metadata Types
- Try deploying manually using: `sf project deploy start --metadata DecisionMatrixDefinition,ExpressionSet --target-org <alias>`

**Terminal Doesn't Show Output**
- Wait a few seconds - SFDMU may take time to start
- Check that SFDMU plugin is installed: `sf plugins list`
- Verify org credentials are correct

**Configuration Not Saving**
- Ensure configuration name is not empty
- Check VS Code workspace is open (configurations are workspace-specific)
- Verify `.vscode/sfdmu/configs` directory exists and is writable

### Getting Help

1. Check SFDMU Documentation: https://help.sfdmu.com/
2. Review Terminal Output: Most errors include detailed messages
3. Check VS Code Output Panel: Select "SFDMU All-Purpose Migration" from dropdown
4. Enable Debug Logging: Set `SF_LOG_LEVEL=DEBUG` in terminal
5. Test Manually: Try running SFDMU from command line to isolate issues

## Development

### Project Structure
```
src/
├── extension.ts              # Extension entry point
├── webview/
│   ├── migrationPanel.ts     # Webview panel management
│   └── ui/                   # Webview UI files
├── services/                 # Core services
├── models/                   # TypeScript interfaces
└── utils/                    # Utility functions
```

### Building
```bash
npm run compile
```

### Testing
1. Press `F5` to launch Extension Development Host
2. In the new window, open Command Palette
3. Run "SFDMU: Open Migration Panel"

## License

MIT

## Acknowledgments

- Migration phase structure based on Salto CPQ migration best practices
- Built on SFDMU (Salesforce Data Move Utility)
- Uses Salesforce CLI for org management
