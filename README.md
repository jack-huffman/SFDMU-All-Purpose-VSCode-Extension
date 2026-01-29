# SFDMU All-Purpose Migration

A VS Code extension that provides a visual interface for configuring and executing SFDMU (Salesforce Data Move Utility) data migrations between Salesforce orgs—any objects in Standard mode, or pre-configured CPQ (11 phases) and RCA (7 phases) migrations.

## How to Use

1. **Open panel**: `Cmd+Shift+P` / `Ctrl+Shift+P` → **SFDMU: Open Migration Panel**
2. **Orgs**: Select source and target (dropdown or manual username/instance URL/access token).
3. **Mode**: Standard (custom objects/phases), CPQ (11 phases), or RCA (7 phases + metadata deployment).
4. **Configure**: Standard—add objects, external IDs (Auto-detect or manual), phases. CPQ/RCA—select phases, filters; optionally use **Select Records** per phase to choose which master records to migrate.
5. **RCA only**: Deploy metadata prerequisites (DecisionMatrixDefinition, ExpressionSet) before Phase 7 via **Deploy All Metadata Prerequisites**.
6. **Generate**: Click **Generate Migration Files**; re-generate when the UI shows config-change badges.
7. **Run**: **Run Simulation** first, then **Run Migration**. Run phases sequentially in CPQ/RCA; mark phases complete as you go.

**Other actions**: A pre-migration backup is created automatically before Run Migration (optional **Proceed Without Backup** if backup fails). When backups exist, a **Rollback** button appears (header in Standard; per phase in CPQ/RCA)—open it to pick a backup, review the rollback plan, then Run Simulation and Execute Rollback. **Export to Excel** (header in Standard; per phase in CPQ/RCA) runs SOQL against the source org and writes an Excel file. Use **SFDMU: Confirm Migration Complete** to run the completion flow (e.g. post-migration backup).

## Prerequisites

- **Visual Studio Code** 1.80.0 or higher
- **Salesforce CLI (sf)** installed and configured  
  - Install: https://developer.salesforce.com/tools/salesforcecli  
  - Verify: `sf --version`
- **SFDMU Plugin** for Salesforce CLI  
  - Install: `sf plugins install sfdmu`  
  - Verify: `sf plugins list` (should show `@forcedotcom/sfdmu`)
- **Authorized Salesforce Orgs**  
  - Authorize: `sf org login web --alias <alias>`  
  - List: `sf org list`

## Features

- **Visual configuration**: Webview panel for migrations (no manual JSON editing).
- **Three modes**: Standard (any objects, custom phases); CPQ (11 phases); RCA (7 phases + Tooling API metadata deployment).
- **Backup & rollback**: Automatic pre-migration backup; manual backup per phase/config; rollback from backup (simulation then execute); option to skip backup.
- **Excel export**: Export migration data to Excel from Standard (header) or per phase in CPQ/RCA (SOQL against source org).
- **Migration history**: Runs saved to `.vscode/sfdmu/history/` with status, records processed, errors, backup path.
- **Master record selection (CPQ/RCA)**: Per-phase **Select Records** to choose which parent records to migrate; tabs per object, search, filters.
- **Config change detection**: Badges when current UI config differs from last generated config (prompt to re-generate).
- **Configuration tree**: Explorer view—nested folders, drag-and-drop to move configs, context menu (New Folder, New Standard/CPQ/RCA Configuration, Rename, Delete). Rename supports conflict resolution (Keep Both / Replace).
- **Smart automation**: Auto-detect external IDs, validate objects, generate SOQL; relationship and composite external IDs supported.
- **Full SFDMU integration**: Run simulation and migration from VS Code with terminal integration.

## Modes

- **Standard**: Add objects, set external IDs (single, composite, or relationship), phase order, optional custom SOQL/WHERE. DML operation, query filters, excluded objects, output directory.
- **CPQ (11 phases)**: Pricebook & Product → Product Rules → Configuration & Price Rules → Template Contents & Quote Templates → Line Columns & Template Sections → Additional Product Config → Discounts & Block Pricing → Quote Process → Custom Actions & Filters → Import/Export → Localization. Optional Product2; per-phase DML and master record selection.
- **RCA (7 phases)**: Foundation → Product Core → Pricing/Selling Models → Catalog → Product Components → Pricing Rules/Adjustments → Configuration & Fulfillment. Handles composite keys, polymorphic lookups, field overrides, insert-only objects. Product2 excluded by default (match via `StockKeepingUnit` as External ID). **Phase 7 requires** DecisionMatrixDefinition and ExpressionSet metadata deployed to target (Tooling API); use **Deploy All Metadata Prerequisites** in the panel or deploy manually.

## Configuration Management

- **Tree view** (Explorer → SFDMU Migration): Nested folders; drag-and-drop to move configs; right-click → New Folder, New Standard/CPQ/RCA Configuration, Rename, Delete; double-click to open.
- **Save**: Configuration name in panel, optional folder path, click **Save**. Stored under workspace `.vscode/sfdmu/configs/`.
- **Load**: Double-click in tree or use **Load Configuration** in panel.
- **Export/Import**: **Export** copies config JSON to clipboard; paste into import field and **Import**.
- **Change detection**: When the UI differs from the last generated config, badges prompt you to **Generate Migration Files** again.

## Backup & Rollback

- **When**: A pre-migration backup runs automatically before **Run Migration** (Standard and per phase in CPQ/RCA). If backup fails, you can choose **Proceed Without Backup** or cancel.
- **Manual backup**: **Create Backup** in the panel (Standard) or per phase (CPQ/RCA).
- **Where**: Backups are stored under the migration output directory in `backups/<timestamp>/` (metadata + CSV per object).
- **Rollback**: When backups exist, a **Rollback** button appears. Open it → select a backup → review rollback plan (objects and operations) → **Run Rollback Simulation**, then **Execute Rollback**. Rollback reverses the migration using the backup data (e.g. restore pre-migration state or delete inserted records).

## Excel Export & Migration History

- **Excel Export**: **Export to Excel** runs SOQL against the source org for the current config (Standard) or selected phase (CPQ/RCA) and writes an Excel file. Large datasets may take several minutes.
- **Migration History**: Each run is recorded in `.vscode/sfdmu/history/<id>.json` with config name, mode, orgs, timestamp, operation, phase (if applicable), per-object counts, status (completed/failed/partial), backup location, and errors.

## Advanced

- **External IDs**: Single (`Name`, `ProductCode`), composite (`Field1;Field2`), or relationship (`Account.Name`, `CustomField__r.Name`). Use **Auto-detect** where applicable. Mark external ID fields in the target org (Object Manager → field → External ID).
- **Custom SOQL**: Toggle **Use Custom SOQL** per object; include Id, external ID fields, and relationship fields. **Select Fields** limits migrated fields (external ID and relationship fields auto-included).
- **Filters**: Last Modified Date (global); object-specific WHERE in Query Filters; custom WHERE on objects.
- **Phases**: Order objects by dependency (parents in earlier phases). Phase completion checkboxes mark phases complete and disable re-run; status saved with config.
- **Master selection (CPQ/RCA)**: **Select Records** on a phase opens a modal to choose which parent records to migrate; child objects are scoped to those selections. Use search and filters in the modal.

## External IDs & Best Practices

- External IDs must be unique, present in both orgs, and marked as External ID in the target. Composite: semicolon-separated. Relationship: `Parent__r.ExternalField`.
- **Best practices**: Run simulation first; migrate phases in order; use Auto-detect then verify; put parents in earlier phases; use Last Modified Date for incremental runs; exclude unneeded objects; mark phases complete; save configs in folders; test in sandbox; watch terminal for SFDMU output.

## Troubleshooting

- **Missing parent records**: Migrate parent objects in earlier phases; ensure Product2 (or other parents) exist in target if excluded from migration; set ProductCode (CPQ) or StockKeepingUnit (RCA) as External ID in target.
- **Org dropdowns empty**: `sf org list`; authorize with `sf org login web --alias <alias>`; confirm `sf --version`.
- **Phase files not generated**: Check VS Code notifications; valid output path; at least one object (Standard) or one phase selected (CPQ/RCA).
- **Product2 matching fails**: Verify ProductCode (CPQ) or StockKeepingUnit (RCA) is External ID in target; values align between orgs; or include Product2 in migration.
- **RCA metadata deployment fails**: Ensure source has DecisionMatrixDefinition and ExpressionSet; target can deploy Custom Metadata; try manual: `sf project deploy start --metadata DecisionMatrixDefinition,ExpressionSet --target-org <alias>`.
- **Backup/rollback failures**: Check output directory is writable; sufficient disk space; org credentials valid for target (backup queries target).
- **Excel export slow or times out**: Large datasets; reduce scope (e.g. phase or filters) or run from terminal with increased timeout.
- **Config not saving**: Non-empty config name; workspace open (configs are workspace-scoped); `.vscode/sfdmu/configs` exists and is writable.
- **Terminal no output**: Wait a few seconds; confirm `sf plugins list` shows SFDMU; verify org credentials.

**Getting help**: [SFDMU Documentation](https://help.sfdmu.com/); VS Code Output panel → "SFDMU All-Purpose Migration"; `SF_LOG_LEVEL=DEBUG` in terminal; run SFDMU from CLI to isolate issues.

## Development

### Project structure

- **Backend**: `src/extension.ts` (entry, commands, tree view); `src/webview/migrationPanel.ts` (webview host, message handlers); `src/services/` — configTreeProvider, backupService, rollbackGenerator, rollbackRunner, excelExportService, migrationHistoryService, toolingApiService, migrationGenerator, cpqPhaseGenerator, rcaPhaseGenerator, sfdmuRunner, orgService, objectService, queryGenerator; `src/utils/fileUtils.ts`; `src/models/migrationConfig.ts`.
- **Webview**: `src/webview/ui/index.html`, `styles.css`; `js/` — main, state, configManager, configChangeChecker, messageHandler, migrationObjects, migrationExecution, modals, rollbackManager, rollbackModal; `cpq/` (constants, hierarchicalView, masterObjects, masterSelectionModal, mode, phases, state); `rca/` (constants, execution, masterSelectionModal, metadata, mode, phases, state); cpqMode, rcaMode, uiUtils.
- **Scripts**: `scripts/copy-webview.js` (build); `scripts/audit-cpq-relationships.js` (standalone CLI: `node scripts/audit-cpq-relationships.js <org-alias>`); `scripts/verify-external-ids.js`, `scripts/verify-soql-fields.js`.

### Build and test

```bash
npm run compile
```

Press `F5` to launch Extension Development Host; in the new window run **SFDMU: Open Migration Panel**.

## License

MIT

## Acknowledgments

Migration phase structure informed by Salto CPQ migration practices. Built on SFDMU (Salesforce Data Move Utility) and Salesforce CLI.
