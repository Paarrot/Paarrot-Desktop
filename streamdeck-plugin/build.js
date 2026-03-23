/**
 * Build script for Paarrot Stream Deck Plugin
 * Creates a distributable .streamDeckPlugin file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_DIR = 'com.paarrot.streamdeck.sdPlugin';
const OUTPUT_DIR = 'dist';

console.log('Building Paarrot Stream Deck Plugin...');

// Create dist directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Check if plugin directory exists
if (!fs.existsSync(PLUGIN_DIR)) {
  console.error(`Error: Plugin directory '${PLUGIN_DIR}' not found!`);
  process.exit(1);
}

// Read manifest to get version
const manifest = JSON.parse(
  fs.readFileSync(path.join(PLUGIN_DIR, 'manifest.json'), 'utf8')
);

const version = manifest.Version || '1.0.0.0';
const uuid = manifest.UUID || 'com.paarrot.streamdeck';
const outputPath = path.join(OUTPUT_DIR, `${uuid}-v${version}.streamDeckPlugin`);

console.log(`Creating plugin archive: ${outputPath}`);

try {
  // Clean up old archive
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  if (fs.existsSync(`${outputPath}.zip`)) {
    fs.unlinkSync(`${outputPath}.zip`);
  }

  // Use PowerShell's Compress-Archive on Windows
  // IMPORTANT: Archive must contain the .sdPlugin folder at root level
  if (process.platform === 'win32') {
    const command = `powershell -Command "Compress-Archive -Path '${PLUGIN_DIR}' -DestinationPath '${outputPath}.zip' -Force"`;
    execSync(command);
    
    // Rename .zip to .streamDeckPlugin
    if (fs.existsSync(`${outputPath}.zip`)) {
      fs.renameSync(`${outputPath}.zip`, outputPath);
    }
  } else {
    // Use zip command on macOS/Linux - include the folder itself
    execSync(`zip -r "${outputPath}" "${PLUGIN_DIR}"`);
  }

  console.log('✓ Plugin built successfully!');
  console.log(`  Output: ${outputPath}`);
  console.log(`  Version: ${version}`);
  console.log('\nInstallation:');
  console.log(`  Double-click ${path.basename(outputPath)} to install`);
} catch (error) {
  console.error('Error building plugin:', error.message);
  process.exit(1);
}
