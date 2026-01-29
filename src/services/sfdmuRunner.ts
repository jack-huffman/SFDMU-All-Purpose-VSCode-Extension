import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { SFDMUResult } from '../models/migrationConfig';

export async function runSFDMU(
  phaseDir: string,
  sourceUsername: string,
  targetUsername: string,
  simulation: boolean = false,
  onOutput?: (data: string) => void,
  onPrompt?: (prompt: string) => Promise<string>
): Promise<SFDMUResult> {
  // Build command arguments
  const args = [
    'sfdmu',
    'run',
    '--sourceusername', sourceUsername,
    '--targetusername', targetUsername
  ];
  
  if (simulation) {
    args.push('--simulation');
  }
  
  return new Promise(async (resolve) => {
    let stdout = '';
    let stderr = '';
    let hasResolved = false;
    let pendingPrompt: { resolve: (value: string) => void; reject: (error: Error) => void } | null = null;
    let outputBuffer = ''; // Buffer to detect prompts across multiple data chunks
    
    // Use 'sf' as command and pass args array
    // Force unbuffered output by setting environment variables
    const env = {
      ...process.env,
      // Disable buffering to get real-time output
      NODE_NO_WARNINGS: '1', // Suppress the deprecation warning
      PYTHONUNBUFFERED: '1', // If SF CLI uses Python
      FORCE_COLOR: '0', // Disable color codes that might cause issues
      // Force line buffering
      SF_LOG_LEVEL: 'DEBUG', // Enable debug logging if available
      // Try to force unbuffered output
      NODE_OPTIONS: '--no-warnings'
    };
    
    // Ensure phaseDir is an absolute path
    const absolutePhaseDir = path.resolve(phaseDir);
    
    // Use shell mode to ensure proper output streaming
    // Enable stdin for interactive prompts
    const childProcess = spawn('sf', args, {
      cwd: absolutePhaseDir, // Use absolute path to ensure we're in the correct directory
      shell: true, // Use shell to get better output streaming
      stdio: ['pipe', 'pipe', 'pipe'], // Enable stdin for interactive prompts
      env: env
    });
    
    // Set encoding to get strings directly
    if (childProcess.stdout) {
      childProcess.stdout.setEncoding('utf8');
    }
    if (childProcess.stderr) {
      childProcess.stderr.setEncoding('utf8');
    }
    if (childProcess.stdin) {
      childProcess.stdin.setDefaultEncoding('utf8');
    }
    
    // Function to detect and handle prompts
    const handleOutput = async (text: string) => {
      stdout += text;
      outputBuffer += text;
      
      // Send output immediately to callback
      if (onOutput) {
        onOutput(text);
      }
      
      // Check for prompts in the output buffer
      // Look for patterns like:
      // "Continue the job (y/n) ? [n]:"
      // "Command in progress... done"
      // Any line ending with "? [y]:" or "? [n]:"
      const promptPatterns = [
        /Continue\s+the\s+job\s+\(y\/n\)\s*\?\s*\[([yn])\]:/i,
        /\(y\/n\)\s*\?\s*\[([yn])\]:/i,
        /\?\s*\[([yn])\]:/i
      ];
      
      // Check each line in the buffer
      const lines = outputBuffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        for (const pattern of promptPatterns) {
          const match = line.match(pattern);
          if (match && !pendingPrompt) {
            // Found a prompt - clear buffer up to this point
            outputBuffer = lines.slice(i + 1).join('\n');
            
            // Get default value from prompt
            const defaultValue = match[1]?.toLowerCase() === 'y' ? 'y' : 'n';
            
            // Show VS Code prompt to user
            pendingPrompt = { resolve: () => {}, reject: () => {} };
            const promptPromise = new Promise<string>((resolvePrompt, rejectPrompt) => {
              if (pendingPrompt) {
                pendingPrompt.resolve = resolvePrompt;
                pendingPrompt.reject = rejectPrompt;
              }
            });
            
            // Show QuickPick for y/n selection
            const response = await vscode.window.showQuickPick(
              [
                { label: 'Yes (y)', value: 'y' },
                { label: 'No (n)', value: 'n' }
              ],
              {
                placeHolder: `SFDMU Prompt: ${line.trim()}`,
                canPickMany: false,
                ignoreFocusOut: true
              }
            );
            
            const answer = response?.value || defaultValue;
            
            // Send answer to stdin
            if (childProcess.stdin && !childProcess.stdin.destroyed) {
              childProcess.stdin.write(answer + '\n');
            }
            
            // Resolve the prompt promise
            if (pendingPrompt) {
              pendingPrompt.resolve(answer);
              pendingPrompt = null;
            }
            
            // Add the answer to output for visibility
            if (onOutput) {
              onOutput(`\n> ${answer}\n`);
            }
            
            break;
          }
        }
      }
    };
    
    // Capture stdout - handle data events
    if (childProcess.stdout) {
      childProcess.stdout.on('data', async (data: string | Buffer) => {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        await handleOutput(text);
      });
    }
    
    // Capture stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', async (data: string | Buffer) => {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        stderr += text;
        if (onOutput) {
          // Send output immediately without filtering
          onOutput(text);
        }
      });
    }
    
    childProcess.on('close', (code) => {
      if (hasResolved) return;
      hasResolved = true;
      
      const output = stdout + (stderr ? '\n' + stderr : '');
      
      // Try to parse output for record counts and errors
      const recordsProcessed = extractRecordCount(output);
      const errors = extractErrors(output);
      
      // Determine success based on exit code and error presence
      const success = code === 0 && errors.length === 0;
      
      resolve({
        success,
        recordsProcessed,
        errors: errors.length > 0 ? errors : undefined,
        output
      });
    });
    
    childProcess.on('error', (error) => {
      if (hasResolved) return;
      hasResolved = true;
      
      const errorOutput = stdout + (stderr ? '\n' + stderr : '') + '\n' + error.message;
      const errors = extractErrors(errorOutput);
      
      resolve({
        success: false,
        errors: errors.length > 0 ? errors : [error.message],
        output: errorOutput
      });
    });
    
    // Handle process exit (in case close doesn't fire)
    childProcess.on('exit', (code) => {
      // Exit is handled by close event
    });
  });
}

function extractRecordCount(output: string): number | undefined {
  // Look for patterns like "Records processed: 123" or "Total records: 456"
  const patterns = [
    /Records?\s+processed[:\s]+(\d+)/i,
    /Total\s+records?[:\s]+(\d+)/i,
    /(\d+)\s+records?\s+processed/i
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return undefined;
}

function extractErrors(output: string): string[] {
  const errors: string[] = [];
  
  // Look for ERROR lines
  const errorLines = output.split('\n').filter(line => 
    line.includes('[ERROR]') || 
    line.includes('ERROR:') ||
    line.match(/^ERROR\s+/i)
  );
  
  for (const line of errorLines) {
    // Extract error message (remove [ERROR] prefix)
    const errorMsg = line
      .replace(/\[ERROR\]/gi, '')
      .replace(/^ERROR:\s*/i, '')
      .replace(/^ERROR\s+/i, '')
      .trim();
    
    if (errorMsg) {
      errors.push(errorMsg);
    }
  }
  
  return errors;
}

/**
 * Check if SFDMU command has completed successfully
 * Looks for the completion message pattern
 */
export function isSFDMUComplete(output: string): boolean {
  // Look for completion patterns:
  // "Command succeeded."
  // "Execution of the command sfdmu:run has been completed. Exit code 0 (SUCCESS)."
  const completionPatterns = [
    /Command\s+succeeded/i,
    /Execution\s+of\s+the\s+command\s+sfdmu:run\s+has\s+been\s+completed/i,
    /Exit\s+code\s+0\s+\(SUCCESS\)/i
  ];
  
  for (const pattern of completionPatterns) {
    if (pattern.test(output)) {
      return true;
    }
  }
  
  return false;
}

