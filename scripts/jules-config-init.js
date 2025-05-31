#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Find the script directory (where this wrapper is located)
const scriptDir = __dirname;

// Path to the TypeScript file we want to execute
const tsFile = path.join(scriptDir, 'config-init.ts');

// Try to find tsx in different locations (matches tsx-utils.ts logic)
function findTsx() {
  const possiblePaths = [
    // When installed as a global package
    path.join(scriptDir, '..', 'node_modules', '.bin', 'tsx'),
    // When running from local development
    path.join(scriptDir, '..', 'node_modules', '.bin', 'tsx'),
    // Check current working directory's node_modules (when used in a project)
    path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
    // Fallback to global tsx
    'tsx'
  ];

  for (const tsxPath of possiblePaths) {
    try {
      if (tsxPath === 'tsx') {
        // Try global tsx
        const { execSync } = require('child_process');
        execSync('which tsx', { stdio: 'ignore' });
        return 'tsx';
      } else {
        // Check if file exists
        if (fs.existsSync(tsxPath)) {
          return tsxPath;
        }
      }
    } catch (error) {
      // Continue to next option
    }
  }

  throw new Error('tsx not found. Please install tsx globally: npm install -g tsx');
}

// Execute the TypeScript file with tsx, passing through all arguments
const args = process.argv.slice(2);

try {
  const tsxPath = findTsx();

  // Use spawn instead of execSync for better TTY/readline support
  const child = spawn(tsxPath, [tsFile, ...args], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (error) => {
    console.error('\n❌ Error executing script:', error.message);
    process.exit(1);
  });

} catch (error) {
  if (error.message && error.message.includes('tsx not found')) {
    console.error('\n❌ Error: tsx not found');
    console.error('Please install tsx globally: npm install -g tsx');
    console.error('Or ensure @ihildy/google-jules-workflow is properly installed with its dependencies.\n');
  } else {
    console.error('\n❌ Error:', error.message);
  }
  process.exit(1);
} 