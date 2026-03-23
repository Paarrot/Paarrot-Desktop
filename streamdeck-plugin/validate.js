/**
 * Validation script for Paarrot Stream Deck Plugin
 * Checks plugin structure and manifest
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_DIR = 'com.paarrot.streamdeck.sdPlugin';

let errors = 0;
let warnings = 0;

function error(message) {
  console.error(`❌ ERROR: ${message}`);
  errors++;
}

function warn(message) {
  console.warn(`⚠️  WARNING: ${message}`);
  warnings++;
}

function success(message) {
  console.log(`✓ ${message}`);
}

console.log('Validating Paarrot Stream Deck Plugin...\n');

// Check plugin directory exists
if (!fs.existsSync(PLUGIN_DIR)) {
  error(`Plugin directory '${PLUGIN_DIR}' not found`);
  process.exit(1);
}

// Check manifest.json
const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  error('manifest.json not found');
} else {
  success('manifest.json exists');
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Validate required fields
    const requiredFields = ['Actions', 'Author', 'CodePath', 'Description', 'Name', 'Version', 'SDKVersion'];
    requiredFields.forEach(field => {
      if (!manifest[field]) {
        error(`manifest.json missing required field: ${field}`);
      }
    });
    
    if (manifest.Actions && Array.isArray(manifest.Actions)) {
      success(`Found ${manifest.Actions.length} actions`);
      
      // Validate each action
      manifest.Actions.forEach((action, index) => {
        const actionName = action.Name || `Action ${index}`;
        
        if (!action.UUID) {
          error(`${actionName}: Missing UUID`);
        }
        
        if (!action.Icon) {
          error(`${actionName}: Missing Icon`);
        } else {
          // Check if icon file exists
          const iconPath = path.join(PLUGIN_DIR, `${action.Icon}.svg`);
          const iconPathPng = path.join(PLUGIN_DIR, `${action.Icon}.png`);
          if (!fs.existsSync(iconPath) && !fs.existsSync(iconPathPng)) {
            warn(`${actionName}: Icon file not found: ${action.Icon}`);
          }
        }
        
        if (!action.States || !Array.isArray(action.States) || action.States.length === 0) {
          error(`${actionName}: Missing or invalid States`);
        } else {
          action.States.forEach((state, stateIndex) => {
            if (!state.Image) {
              warn(`${actionName} State ${stateIndex}: Missing Image`);
            } else {
              const imagePath = path.join(PLUGIN_DIR, `${state.Image}.svg`);
              const imagePathPng = path.join(PLUGIN_DIR, `${state.Image}.png`);
              if (!fs.existsSync(imagePath) && !fs.existsSync(imagePathPng)) {
                warn(`${actionName} State ${stateIndex}: Image file not found: ${state.Image}`);
              }
            }
          });
        }
        
        if (action.PropertyInspectorPath) {
          const piPath = path.join(PLUGIN_DIR, action.PropertyInspectorPath);
          if (!fs.existsSync(piPath)) {
            error(`${actionName}: PropertyInspector file not found: ${action.PropertyInspectorPath}`);
          }
        }
      });
    }
  } catch (e) {
    error(`manifest.json parse error: ${e.message}`);
  }
}

// Check plugin files
const pluginPath = path.join(PLUGIN_DIR, 'plugin', 'index.html');
if (!fs.existsSync(pluginPath)) {
  error('plugin/index.html not found');
} else {
  success('plugin/index.html exists');
}

const pluginJsPath = path.join(PLUGIN_DIR, 'plugin', 'index.js');
if (!fs.existsSync(pluginJsPath)) {
  error('plugin/index.js not found');
} else {
  success('plugin/index.js exists');
}

// Check property inspectors
const piDir = path.join(PLUGIN_DIR, 'propertyinspector');
if (fs.existsSync(piDir)) {
  const piFiles = fs.readdirSync(piDir);
  success(`Found ${piFiles.length} property inspector file(s)`);
} else {
  warn('propertyinspector directory not found');
}

// Check images directory
const imagesDir = path.join(PLUGIN_DIR, 'images');
if (fs.existsSync(imagesDir)) {
  const imageFiles = fs.readdirSync(imagesDir);
  success(`Found ${imageFiles.length} image file(s)`);
  
  if (imageFiles.length === 0) {
    warn('images directory is empty');
  }
} else {
  error('images directory not found');
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('✓ Plugin validation passed!');
  process.exit(0);
} else {
  console.log(`Found ${errors} error(s) and ${warnings} warning(s)`);
  if (errors > 0) {
    console.log('\nPlease fix errors before building the plugin.');
    process.exit(1);
  } else {
    console.log('\nPlugin can be built, but consider fixing warnings.');
    process.exit(0);
  }
}
