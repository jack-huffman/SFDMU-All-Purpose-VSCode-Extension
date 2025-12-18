# SFDMU All-Purpose Migration VSCode Extension

A comprehensive Visual Studio Code extension that provides a visual interface for configuring and executing SFDMU (Salesforce Data Move Utility) data migrations for any Salesforce objects between orgs. This tool simplifies the complex process of migrating Salesforce data by allowing you to configure objects, external IDs, SOQL queries, and organize migrations into custom phases or use pre-configured CPQ migration phases.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
  - [Standard Migration Mode](#standard-migration-mode)
  - [CPQ Migration Mode](#cpq-migration-mode)
  - [Configuration Management](#configuration-management)
- [Advanced Features](#advanced-features)
- [Migration Phases](#migration-phases)
- [External IDs and Relationships](#external-ids-and-relationships)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Overview

The SFDMU All-Purpose Migration extension is a powerful tool designed to streamline Salesforce data migrations. It provides:

- **Visual Configuration Interface**: No need to manually edit JSON files - configure everything through an intuitive webview panel
- **Two Migration Modes**: 
  - **Standard Mode**: Configure any Salesforce objects with custom phase organization
  - **CPQ Mode**: Pre-configured phases optimized for Salesforce CPQ (SteelBrick) migrations
- **Configuration Management**: Organize configurations in folders with a tree view, drag-and-drop support, and version control
- **Smart Automation**: Auto-detect external IDs, validate objects, generate SOQL queries, and manage dependencies
- **Full SFDMU Integration**: Execute migrations directly from VS Code with terminal integration

## Features

### Visual Configuration Interface
- **Webview-based UI**: Intuitive interface for configuring migrations without editing JSON files
- **Collapsible Sections**: Organized UI with expandable/collapsible sections for better navigation
- **Real-time Validation**: Immediate feedback on configuration errors
- **Responsive Design**: Works seamlessly in VS Code's webview panel

### Migration Modes

#### Standard Mode
- **Custom Object Selection**: Migrate any Salesforce objects - standard or custom
- **Flexible Phase Organization**: Organize objects into phases with custom phase numbers
- **Manual Configuration**: Full control over external IDs, SOQL queries, and phase assignments

#### CPQ Mode
- **Pre-configured Phases**: 11 optimized phases based on Salto CPQ migration best practices
- **Automatic External IDs**: Pre-configured external IDs for all CPQ objects
- **Smart Filtering**: Automatically excludes transactional objects (Quotes, Orders, etc.)
- **Product2 Option**: Optional inclusion of Product2 records in Phase 1
- **Phase Selection**: Choose which phases to generate (useful for incremental migrations)

### Object Management
- **Add Any Objects**: Migrate any Salesforce objects - standard or custom
- **Auto-detect External IDs**: Automatically detect external ID fields from Salesforce metadata
- **Manual External ID Entry**: Enter external IDs manually, including composite external IDs
- **Custom SOQL Queries**: Use auto-generated queries or write custom SOQL for each object
- **Field Selection**: Choose specific fields to migrate (or use all fields)
- **Load Objects from Org**: Browse and select objects directly from your Salesforce org
- **Object Validation**: Validate object names and field references before migration

### Configuration Tree View
- **Hierarchical Organization**: Organize configurations in folders within the Explorer sidebar
- **Drag and Drop**: Move configurations between folders by dragging
- **Context Menu Actions**: Right-click to create, rename, delete, or open configurations
- **Auto-refresh**: Tree view automatically updates when files change
- **Visual Indicators**: Icons and colors distinguish folders and configuration files

### Phase Management
- **Custom Phases**: Organize objects into any number of phases (Standard Mode)
- **Pre-defined Phases**: Use 11 optimized CPQ phases (CPQ Mode)
- **Phase Completion Tracking**: Mark phases as complete and persist state in configurations
- **Individual Phase Execution**: Run phases one at a time with full control
- **Flexible Ordering**: Set phase numbers to control migration order

### Org Integration
- **Automatic Org Discovery**: Automatically fetches authorized orgs from Salesforce CLI
- **Manual Org Entry**: Option to manually enter org credentials (username, instance URL, access token)
- **Sorted Org Lists**: Alphabetically sorted org dropdowns for easy selection
- **Object Metadata Detection**: Query org metadata to detect external IDs and validate objects
- **API Version Detection**: Automatically detects and includes org API version in generated files

### Query Filtering
- **Last Modified Date Filter**: Filter records by `LastModifiedDate` for incremental migrations
- **Custom WHERE Clauses**: Add custom filters for specific objects
- **Multiple Filters**: Apply multiple filters to the same or different objects
- **SOQL Validation**: Validate WHERE clauses before generating migration files

### Excluded Objects Management
- **Customizable Exclusion List**: Edit the excluded objects list to match your needs
- **Flexible Configuration**: Exclude any objects you don't want to migrate
- **CPQ Defaults**: Pre-configured excluded objects for CPQ migrations (transactional objects)

### Configuration Management
- **Save Configurations**: Save migration settings with custom names in organized folders
- **Load Configurations**: Quickly load previously saved configurations from the tree view
- **Export/Import**: Export configurations as JSON or import from clipboard
- **Persistent State**: Phase completion status is saved with configurations
- **Conflict Resolution**: Handle naming conflicts with "Keep Both" or "Replace" options
- **Folder Organization**: Create nested folder structures for organizing multiple configurations

### DML Operations
- **Multiple Operation Types**: Support for Insert, Update, Upsert, Delete, DeleteHierarchy, DeleteSource
- **Simulation Mode**: Test migrations without making changes to the target org
- **Interactive Prompts**: Full terminal integration for responding to SFDMU prompts
- **Real-time Output**: See migration progress in real-time through integrated terminal

### File Generation
- **Automatic File Generation**: Creates properly structured `export.json` files
- **Organized Output**: Standard mode creates single file; CPQ mode creates phase folders
- **Regeneration Detection**: Button text changes when files already exist
- **API Version Inclusion**: Automatically includes org API version in generated files

## Prerequisites

Before using this extension, ensure you have:

1. **Visual Studio Code** 1.80.0 or higher
2. **Salesforce CLI (sf)** installed and configured
   - Install from: https://developer.salesforce.com/tools/salesforcecli
   - Verify installation: `sf --version`
3. **SFDMU Plugin** for Salesforce CLI
   - Install: `sf plugins install sfdmu`
   - Verify: `sf plugins list` (should show `@forcedotcom/sfdmu`)
4. **Authorized Salesforce Orgs** in your Salesforce CLI
   - Authorize orgs: `sf org login web --alias <alias>`
   - List orgs: `sf org list`
5. **Node.js** 18+ (for development only)

## Installation

### From VSIX File

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`)
4. Click the "..." menu at the top
5. Select "Install from VSIX..."
6. Choose the downloaded `.vsix` file

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "SFDMU All-Purpose Migration"
4. Click Install

### From Source (Development)

1. Clone the repository
2. Open the `vscode-extension-all-purpose` folder in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to launch Extension Development Host
5. In the new window, open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run "SFDMU: Open Migration Panel"

## Quick Start

1. **Install the Extension** (see [Installation](#installation))

2. **Open the Migration Panel**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "SFDMU: Open Migration Panel"
   - Press Enter

3. **Configure Your First Migration**
   - Select your source and target orgs
   - Choose migration mode (Standard or CPQ)
   - Add objects to migrate (Standard Mode) or select phases (CPQ Mode)
   - Configure external IDs (use "Auto-detect" or enter manually)
   - Set phase numbers to organize migration order
   - Click "Generate Migration Files"
   - Review the generated files in the output directory

4. **Execute the Migration**
   - Run Phase 1 in simulation mode to test
   - After successful simulation, run each phase individually
   - Mark phases as complete as you progress
   - Monitor progress in the terminal

## Usage Guide

### Standard Migration Mode

Standard mode gives you full control over which objects to migrate and how to organize them into phases.

#### Step 1: Configure Migration Settings

1. **Select Migration Mode**: Choose "Standard" from the mode selector
2. **Configure Orgs**:
   - **Source Org**: The org you're migrating FROM
   - **Target Org**: The org you're migrating TO
   - Select orgs from dropdown (auto-fills credentials) or enter manually
3. **Add Migration Objects**:
   - Click "Add Object" to add a new object
   - For each object, configure:
     - **Object Name**: API name (e.g., `Account`, `CustomObject__c`)
     - **External ID**: Field(s) used to match records
       - Single field: `Name`, `Id`
       - Composite: `Field1;Field2` (semicolon-separated)
       - Relationship fields: `Account.Name`, `CustomField__r.Name`
     - **Auto-detect**: Click to automatically detect external ID fields
     - **Phase Number**: Number indicating which phase this object belongs to
     - **Custom SOQL**: Toggle to use a custom SOQL query
     - **Selected Fields**: Choose specific fields to migrate (optional)
     - **WHERE Clause**: Add custom filters for this object
   - Click "Load Objects from Org" to browse available objects

4. **Configure DML Operation**:
   - **Upsert** (recommended): Updates existing records or inserts new ones
   - **Insert**: Only inserts new records (fails if record exists)
   - **Update**: Only updates existing records (fails if record doesn't exist)
   - **Delete**: Deletes records
   - **DeleteHierarchy**: Deletes records and their children
   - **DeleteSource**: Deletes records from source org after migration

5. **Set Query Filters**:
   - **Last Modified Date**: Filter records modified on or after this date
   - **Custom Filters**: Add WHERE clauses for specific objects

6. **Configure Excluded Objects**:
   - Edit the list (one object per line) to exclude objects you don't want to migrate

7. **Set Output Directory**:
   - Default: `sfdmu-migration`
   - Custom Path: Specify a relative or absolute path

#### Step 2: Generate Migration Files

1. Click **"Generate Migration Files"** button
2. The extension will:
   - Create the output directory
   - Generate `export.json` file containing all configured objects
   - Populate org connection details
   - Configure SOQL queries (auto-generated or custom) with proper external IDs
   - Set excluded objects
3. Review the generated file in your workspace

#### Step 3: Run Migrations

1. **Simulation Mode** (Recommended First Step):
   - Click **"Run Simulation"** button
   - A terminal will open showing SFDMU output
   - Review the simulation results
   - Respond to any interactive prompts in the terminal

2. **Real Migration**:
   - After successful simulation, click **"Run Migration"** button
   - Monitor progress in the terminal
   - Respond to any prompts

### CPQ Migration Mode

CPQ mode provides pre-configured phases optimized for Salesforce CPQ (SteelBrick) migrations.

#### Step 1: Configure CPQ Migration Settings

1. **Select Migration Mode**: Choose "CPQ" from the mode selector
2. **Configure Orgs**: Same as Standard Mode
3. **Select Phases**:
   - Check/uncheck phases to include/exclude
   - 11 phases are available, organized by dependency
4. **Product2 Option**:
   - Check "Include Product2" if you want to migrate Product2 records
   - If unchecked, Product2 must already exist in target org with ProductCode as External ID
5. **Configure DML Operation**: Same as Standard Mode
6. **Set Query Filters**: Same as Standard Mode
7. **Set Output Directory**: Same as Standard Mode

#### Step 2: Generate CPQ Phase Files

1. Click **"Generate Migration Files"** button
2. The extension will:
   - Create the output directory structure
   - Generate `export.json` files for each selected phase in `Phase N/` folders
   - Populate org connection details
   - Configure SOQL queries with proper external IDs and CPQ-specific filters
   - Set excluded objects (transactional objects are automatically excluded)
3. Review the generated files in your workspace

#### Step 3: Run CPQ Phases

1. **Simulation Mode** (Recommended First Step):
   - Expand "Run Individual Phases" section
   - Click **"Run Simulation"** for Phase 1
   - Review the simulation results
   - Proceed to next phase after successful simulation

2. **Real Migration**:
   - After successful simulation, click **"Run"** for Phase 1
   - Monitor progress in the terminal
   - Mark the phase as complete when finished
   - Proceed to the next phase
   - Repeat until all phases are complete

#### CPQ Phase Descriptions

- **Phase 1**: Pricebook & Product Configuration - Foundation objects (Pricebook, Product Features, Product Options, Configuration Attributes, Dimensions, Costs)
- **Phase 2**: Product Rules - Product rules with child objects (Error Conditions, Lookup Queries, Product Actions)
- **Phase 3**: Configuration Rules & Price Rules - Configuration and price rules with conditions and actions
- **Phase 4**: Template Contents & Quote Templates - Template content and quote template structure
- **Phase 5**: Line Columns & Template Sections - Line columns and template sections
- **Phase 6**: Additional Product Configuration - Option constraints, upgrade sources, summary variables
- **Phase 7**: Discounts & Block Pricing - Discount tiers and block prices
- **Phase 8**: Quote Process Configuration - Quote process and related input objects
- **Phase 9**: Custom Actions & Filters - Custom actions and their related objects
- **Phase 10**: Import/Export Configuration - Import format and column definitions
- **Phase 11**: Localization - Translations and localized content (Final Phase)

### Configuration Management

The extension provides a powerful configuration management system through the Explorer sidebar.

#### Configuration Tree View

The "SFDMU Migration" tree view appears in the Explorer sidebar and shows all saved configurations organized in folders.

**Tree View Features**:
- **Hierarchical Structure**: Organize configurations in nested folders
- **Visual Indicators**: 
  - Folders show with folder icon
  - Configuration files show with file-code icon (blue)
- **Auto-expand**: Root folders are automatically expanded
- **Hover Tooltips**: Show full path on hover

#### Creating Configurations

1. **From Migration Panel**:
   - Configure your migration settings
   - Enter a configuration name
   - Optionally select a folder path (e.g., `ClientName/ProjectName`)
   - Click "Save"

2. **From Tree View**:
   - Right-click on a folder
   - Select "New Configuration"
   - Migration panel opens with folder path pre-filled

#### Organizing Configurations

1. **Create Folders**:
   - Click the folder icon in tree view title bar (creates at root)
   - Or right-click a folder → "New Folder" (creates inside that folder)

2. **Move Configurations**:
   - Drag and drop a configuration file to a folder
   - Or use context menu (right-click → move options)

3. **Rename**:
   - Right-click on configuration or folder
   - Select "Rename"
   - Enter new name

4. **Delete**:
   - Right-click on configuration or folder
   - Select "Delete"
   - Confirm deletion

#### Loading Configurations

1. **From Tree View**:
   - Double-click a configuration file
   - Or right-click → "Open Configuration"
   - Migration panel opens with configuration loaded

2. **From Migration Panel**:
   - Use "Load Configuration" dropdown
   - Select a saved configuration
   - All settings are restored

#### Exporting/Importing Configurations

1. **Export**:
   - Click "Export" button in migration panel
   - Configuration JSON is copied to clipboard
   - Paste into a file or share with team

2. **Import**:
   - Paste JSON into the import field
   - Click "Import"
   - Configuration is loaded into the panel

## Advanced Features

### Auto-detect External IDs

The extension can automatically detect external ID fields from your Salesforce org:

1. Click "Auto-detect" button next to External ID field
2. Extension queries org metadata for external ID fields
3. If multiple external IDs found, you can select one
4. If none found, you'll need to enter manually

**Note**: Auto-detect works best for single-field external IDs. For composite external IDs, you may need to enter manually.

### Custom SOQL Queries

For advanced use cases, you can write custom SOQL queries:

1. Toggle "Use Custom SOQL" for an object
2. Enter your SOQL query in the text area
3. The extension will still apply filters (LastModifiedDate, custom WHERE clauses) if possible
4. Ensure your query includes:
   - All fields needed for external ID matching
   - Relationship fields if using relationship-based external IDs
   - The `Id` field

**Example Custom Query**:
```sql
SELECT Id, Name, Account.Name, CustomField__c, CustomField__r.Name 
FROM Opportunity 
WHERE StageName = 'Closed Won'
```

### Field Selection

Instead of migrating all fields, you can select specific fields:

1. Click "Select Fields" button for an object
2. Browse available fields from the org
3. Select fields to include
4. Selected fields are included in the generated SOQL query
5. External ID fields and relationship fields are automatically included

### Relationship Fields in External IDs

The extension supports relationship traversal in external IDs:

- **Standard Relationships**: `Account.Name` (requires `AccountId` in query)
- **Custom Relationships**: `SBQQ__Product__r.ProductCode` (requires `SBQQ__Product__c` in query)
- **Composite with Relationships**: `Account.Name;ProductCode` (combines relationship and direct field)

The extension automatically includes necessary relationship fields in SOQL queries.

### Incremental Migrations

Use the "Last Modified Date" filter for incremental migrations:

1. Set "Modified Since" date
2. Only records modified on or after that date will be migrated
3. Useful for:
   - Syncing changes between orgs
   - Re-running migrations with only new/changed data
   - Reducing migration time for large datasets

### Custom Filters

Add object-specific WHERE clauses:

1. Click "Add Filter" in Query Filters section
2. Select object name
3. Enter WHERE clause (without "WHERE" keyword)
4. Multiple filters can be added for the same or different objects

**Example Filters**:
- `LastModifiedBy.Name = 'John Doe'`
- `SBQQ__Active__c = true`
- `StageName IN ('Closed Won', 'Closed Lost')`

### Phase Completion Tracking

Track migration progress by marking phases complete:

1. Check the checkbox next to a phase
2. Completed phases show with checkmark and strikethrough
3. Run buttons are disabled for completed phases
4. Completion status is saved with configuration
5. Useful for:
   - Tracking progress across multiple sessions
   - Preventing accidental re-runs
   - Documenting migration status

## Migration Phases

### Understanding Phases

Phases organize objects into execution groups. Objects in Phase 1 are migrated first, then Phase 2, and so on. This ensures dependencies are respected.

### Phase Dependencies

**Master-Detail Relationships**:
- Child objects must be in the same or later phase than their parent
- Example: `OpportunityLineItem` (child) should be in Phase 2 or later if `Opportunity` (parent) is in Phase 1

**Lookup Relationships**:
- Objects with lookups to other objects should be in later phases
- Example: `Contact` with lookup to `Account` should be in Phase 2 or later if `Account` is in Phase 1

**Composite External IDs**:
- Objects using relationship fields in external IDs must be in later phases
- Example: Object with external ID `Account.Name` should be in Phase 2 or later if `Account` is in Phase 1

### Organizing Objects into Phases

**Standard Mode**:
1. Identify foundation objects (no dependencies)
2. Assign them to Phase 1
3. Identify objects that depend on Phase 1 objects
4. Assign them to Phase 2
5. Continue until all objects are assigned

**CPQ Mode**:
- Phases are pre-configured based on CPQ best practices
- Simply select which phases to include
- Dependencies are already handled

### Example Phase Organization

**Standard Migration Example**:
- **Phase 1**: `Account`, `Product2`, `Pricebook2`
- **Phase 2**: `Contact`, `Opportunity`, `PricebookEntry`
- **Phase 3**: `OpportunityLineItem`, `Quote`, `QuoteLineItem`

**CPQ Migration**:
- Follows the 11 pre-configured phases (see [CPQ Phase Descriptions](#cpq-phase-descriptions))

## External IDs and Relationships

### Understanding External IDs

External IDs are fields used to match records between source and target orgs. They must be:
- Unique identifiers
- Present in both orgs
- Marked as External ID in the target org (for standard fields)

### Types of External IDs

1. **Single Field**: `Name`, `Id`, `ProductCode`
2. **Composite**: `Field1;Field2` (semicolon-separated, both fields together form unique identifier)
3. **Relationship**: `Account.Name`, `SBQQ__Product__r.ProductCode` (uses related object's field)
4. **Composite with Relationships**: `Account.Name;ProductCode` (combines relationship and direct field)

### Composite External IDs

Many objects use composite external IDs (multiple fields combined):

**Examples**:
- `Field1;Field2` - Both fields together form a unique identifier
- `Account.Name;ProductCode` - Combines account name and product code
- `Parent__r.Name;ChildField;AnotherField` - Mixes relationships and direct fields

**Important**: All fields in a composite external ID must be included in the SOQL query. The extension handles this automatically.

### Relationship Traversal

The extension automatically includes relationship fields in SOQL queries:

**Example**: External ID `Account.Name` requires:
- `AccountId` field (base lookup field)
- `Account.Name` field (relationship traversal)

The extension includes both automatically.

### Master-Detail Relationships

Objects with Master-Detail relationships must be migrated after their parent:
- Place child objects in the same or later phase than their parent
- Ensure parent objects exist before migrating children
- Use phase numbers to control the order

### Setting External IDs in Target Org

Before migrating, ensure external ID fields are marked as External ID in the target org:

1. Go to Object Manager in target org
2. Select the object
3. Go to Fields & Relationships
4. Find the field(s) used as external ID
5. Edit the field
6. Check "External ID" checkbox
7. Save

**Note**: Standard fields like `Name` and `ProductCode` may already be external IDs. Custom fields must be explicitly marked.

## Best Practices

### 1. Always Start with Simulation
- Run each phase in simulation mode first
- Review the results before executing real migrations
- Check for missing parent records or relationship issues
- Verify record counts match expectations

### 2. Migrate Phases in Order
- Phases should be run sequentially (1, 2, 3, etc.)
- Each phase may depend on previous phases
- Skipping phases may cause relationship errors
- Use phase completion tracking to prevent mistakes

### 3. Use Auto-detect for External IDs
- Use the "Auto-detect" button to find external ID fields automatically
- Verify detected external IDs match your requirements
- Manually adjust if needed for composite external IDs
- Test external ID matching in target org before migration

### 4. Organize Objects by Dependencies
- Place parent objects in earlier phases
- Place child objects (Master-Detail) in later phases
- Consider lookup relationships when assigning phase numbers
- Review object relationships before assigning phases

### 5. Use Incremental Migrations
- Set "Last Modified Date" filter for incremental updates
- Only migrate records changed since last migration
- Reduces migration time and risk
- Useful for syncing changes between orgs

### 6. Exclude Unwanted Objects
- Add objects to the excluded objects list to prevent accidental migration
- Exclude transactional objects, system objects, or test data
- Customize excluded objects list as needed
- CPQ mode automatically excludes transactional objects

### 7. Mark Phases as Complete
- Mark phases as complete after successful migration
- Completion status is saved with configurations
- Helps track migration progress
- Prevents accidental re-runs

### 8. Save Configurations
- Save configurations with descriptive names
- Include environment names (e.g., "Prod to Sandbox")
- Organize in folders by client/project
- Makes it easy to repeat migrations or migrate to multiple targets

### 9. Test in Sandbox First
- Always test migrations in a sandbox before production
- Use simulation mode extensively
- Verify data integrity after each phase
- Test with a subset of data first

### 10. Monitor Terminal Output
- Watch for SFDMU warnings and errors
- Respond to interactive prompts (e.g., "Parent records not found, run anyways?")
- Review record counts and processing statistics
- Check for relationship errors

### 11. Handle Missing Parent Records
- SFDMU may prompt about missing parent records
- Review the list carefully
- Some missing parents may be expected (e.g., Product2 if excluded)
- Use "run anyways" only if you understand the implications

### 12. Custom SOQL Queries
- Use custom SOQL when you need specific field selection or complex WHERE clauses
- Remember that filters (LastModifiedDate, custom filters) may still be applied
- Test custom queries in the Salesforce Query Editor first
- Ensure all external ID fields are included

### 13. Configuration Organization
- Use folders to organize configurations by client, project, or environment
- Use descriptive configuration names
- Keep related configurations together
- Export important configurations for backup

### 14. CPQ-Specific Best Practices
- Use CPQ mode for CPQ migrations (don't try to recreate phases manually)
- Ensure ProductCode is marked as External ID in target org (if not migrating Product2)
- Review excluded objects list (transactional objects are automatically excluded)
- Migrate phases in order (1-11)
- Consider including Product2 if products don't exist in target org

## Troubleshooting

### Common Issues

#### "Missing parent records" Error
**Problem**: SFDMU reports missing parent records for lookups.

**Solutions**:
- Verify parent objects were migrated in earlier phases
- Check that Product2 records exist in target org (if Product2 is excluded)
- Ensure ProductCode is marked as External ID in target org
- Review the missing records list - some may be expected
- Check that external IDs match between source and target orgs

#### "Didn't understand relationship" Error
**Problem**: SOQL query fails with relationship field error.

**Solutions**:
- The extension should handle this automatically
- Ensure both the lookup field and relationship traversal are in the query
- Example: Both `SBQQ__Product__c` and `SBQQ__Product__r.ProductCode` must be selected
- Check that relationship field names are correct (custom fields use `__r` suffix)

#### Org Dropdowns Are Empty
**Problem**: Source/Target org dropdowns show no orgs.

**Solutions**:
- Verify orgs are authorized: `sf org list`
- Re-authorize orgs if needed: `sf org login web --alias <alias>`
- Check Salesforce CLI is installed: `sf --version`
- Try refreshing the extension (close and reopen panel)
- Check VS Code Output panel for errors

#### Phase Files Not Generated
**Problem**: Clicking "Generate Migration Files" doesn't create files.

**Solutions**:
- Check for error notifications in VS Code
- Verify output directory path is valid
- Ensure you have write permissions to the output directory
- Check VS Code Output panel for detailed error messages
- Verify at least one object is configured (Standard Mode) or at least one phase is selected (CPQ Mode)

#### Product2 Matching Fails
**Problem**: Configuration records can't match to Product2 in target org.

**Solutions**:
- Verify ProductCode is marked as External ID in target org
- Check that ProductCode values match between source and target
- Review ProductCode formula fields (e.g., `SBQQ__ProductCode__c` on Product Option)
- Consider including Product2 in migration if matching is problematic
- Ensure Product2 records exist in target org

#### Terminal Doesn't Show Output
**Problem**: Terminal opens but shows no SFDMU output.

**Solutions**:
- Wait a few seconds - SFDMU may take time to start
- Check that SFDMU plugin is installed: `sf plugins list`
- Verify org credentials are correct
- Try running SFDMU manually from command line to test
- Check terminal for error messages

#### Configuration Not Saving
**Problem**: Saved configuration doesn't appear in dropdown or tree view.

**Solutions**:
- Ensure configuration name is not empty
- Check VS Code workspace is open (configurations are workspace-specific)
- Try refreshing: close and reopen the panel
- Check VS Code Output panel for errors
- Verify `.vscode/sfdmu/configs` directory exists and is writable

#### "Command in progress" Stuck
**Problem**: Migration appears stuck on "Command in progress...".

**Solutions**:
- Check the terminal window - SFDMU may be waiting for input
- Look for interactive prompts in the terminal
- Large migrations may take time - be patient
- Check SFDMU logs for detailed progress
- Try canceling and re-running if truly stuck

#### Auto-detect External ID Fails
**Problem**: Auto-detect button doesn't find external IDs.

**Solutions**:
- Verify object name is correct (case-sensitive)
- Check that you have access to the object in the source org
- Ensure Salesforce CLI can query the org
- Try manually entering external ID
- Check VS Code Output panel for error details

#### Tree View Not Showing Configurations
**Problem**: Configurations don't appear in tree view.

**Solutions**:
- Refresh the tree view (right-click → "Refresh Configurations")
- Verify configurations are saved in `.vscode/sfdmu/configs` directory
- Check that workspace folder is open
- Try closing and reopening VS Code
- Check file system permissions

#### Drag and Drop Not Working
**Problem**: Can't drag configurations to move them.

**Solutions**:
- Ensure you're dragging a configuration file (not a folder)
- Drop target must be a folder or another configuration file
- Try refreshing the tree view
- Check VS Code Output panel for errors

### Getting Help

1. **Check SFDMU Documentation**: https://help.sfdmu.com/
2. **Review Terminal Output**: Most errors include detailed messages
3. **Enable Debug Logging**: Set `SF_LOG_LEVEL=DEBUG` in terminal
4. **Test Manually**: Try running SFDMU from command line to isolate issues
5. **Check Salesforce CLI**: Ensure CLI and SFDMU plugin are up to date
6. **VS Code Output Panel**: Check "Output" panel and select "SFDMU All-Purpose Migration" from dropdown
7. **Extension Logs**: Check VS Code Developer Tools (Help → Toggle Developer Tools) for extension errors

## Development

### Project Structure

```
vscode-extension-all-purpose/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── webview/
│   │   ├── migrationPanel.ts     # Webview panel management
│   │   └── ui/
│   │       ├── index.html        # Webview HTML structure
│   │       ├── styles.css        # UI styles
│   │       └── js/               # Webview JavaScript modules
│   ├── services/
│   │   ├── migrationGenerator.ts # Standard mode file generation
│   │   ├── cpqPhaseGenerator.ts  # CPQ mode phase generation
│   │   ├── sfdmuRunner.ts        # SFDMU execution
│   │   ├── orgService.ts         # Salesforce CLI org integration
│   │   ├── objectService.ts      # Object metadata queries
│   │   ├── queryGenerator.ts     # SOQL query generation
│   │   └── configTreeProvider.ts # Tree view provider
│   ├── models/
│   │   └── migrationConfig.ts    # TypeScript interfaces and types
│   └── utils/
│       └── fileUtils.ts          # Configuration file operations
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

### Building

```bash
npm run compile
```

### Watching for Changes

```bash
npm run watch
```

### Testing

1. Press `F5` to launch Extension Development Host
2. In the new window, open Command Palette
3. Run "SFDMU: Open Migration Panel"
4. Test all features with sample orgs

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Acknowledgments

- Migration phase structure based on Salto CPQ migration best practices
- Built on SFDMU (Salesforce Data Move Utility)
- Uses Salesforce CLI for org management
- Inspired by the need for better Salesforce data migration tooling
