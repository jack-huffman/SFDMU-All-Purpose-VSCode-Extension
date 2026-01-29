/**
 * RCA Metadata Prerequisites
 * Functions for managing metadata deployment and status checking
 */

(function() {
    'use strict';

    window.SFDMU = window.SFDMU || {};
    window.SFDMU.Rca = window.SFDMU.Rca || {};
    
    // Access dependencies with defensive checks (they may not be loaded yet)
    const State = window.SFDMU.State;

    /**
     * Check metadata status
     */
    window.SFDMU.Rca.checkMetadataStatus = function() {
        // This would check metadata status - for now, just show "Checking..."
        // In a full implementation, this would query the target org
        const decisionMatrixBadge = document.getElementById('metadata-status-decisionmatrix');
        const expressionSetBadge = document.getElementById('metadata-status-expressionset');
        
        if (decisionMatrixBadge) {
            decisionMatrixBadge.textContent = 'Not Deployed';
            decisionMatrixBadge.className = 'metadata-status-badge metadata-status-not-deployed';
        }
        if (expressionSetBadge) {
            expressionSetBadge.textContent = 'Not Deployed';
            expressionSetBadge.className = 'metadata-status-badge metadata-status-not-deployed';
        }
    };

    /**
     * Deploy metadata prerequisites
     */
    window.SFDMU.Rca.deployMetadata = function(metadataType) {
        if (!State.currentConfig.sourceOrg.username || !State.currentConfig.targetOrg.username) {
            const vscode = window.SFDMU.vscode;
            if (vscode) {
                vscode.postMessage({ command: 'showError', message: 'Error: Source and target orgs are required' });
            }
            return;
        }

        const vscode = window.SFDMU.vscode;
        if (vscode) {
            vscode.postMessage({
                command: 'deployMetadataPrerequisites',
                config: State.currentConfig
            });
        }
    };
})();
