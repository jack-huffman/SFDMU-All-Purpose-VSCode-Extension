# SFDMU All-Purpose Migration VSCode Extension

A Visual Studio Code extension that provides a visual interface for configuring and executing SFDMU (Salesforce Data Move Utility) data migrations for any Salesforce objects between orgs.

## How to Use

**Open the Migration Panel:**
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type **`SFDMU: Open Migration Panel`**
3. Press Enter

**Quick Start:**
1. Select your source and target orgs
2. Choose migration mode (Standard or CPQ)
3. Add objects to migrate (Standard Mode) or select phases (CPQ Mode)
4. Configure external IDs (use "Auto-detect" or enter manually)
5. Click "Generate Migration Files"
6. Run simulation mode first, then execute migrations

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
- **Two Migration Modes**:
  - **Standard Mode**: Configure any Salesforce objects with custom phase organization
  - **CPQ Mode**: Pre-configured phases optimized for Salesforce CPQ migrations
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
- Verify ProductCode is marked as External ID in target org
- Check that ProductCode values match between source and target
- Consider including Product2 in migration if matching is problematic

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
