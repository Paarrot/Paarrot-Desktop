import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceIcon = path.join(rootDir, 'appicon-square.png');

// Tauri desktop icons
const tauriIcons = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

// Android mipmap sizes
const androidMipmaps = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// Android adaptive icon foreground sizes (with padding for safe zone)
const androidForegroundSizes = [
  { folder: 'mipmap-mdpi', size: 108 },
  { folder: 'mipmap-hdpi', size: 162 },
  { folder: 'mipmap-xhdpi', size: 216 },
  { folder: 'mipmap-xxhdpi', size: 324 },
  { folder: 'mipmap-xxxhdpi', size: 432 },
];

async function generateTauriIcons() {
  const iconsDir = path.join(rootDir, 'src-tauri', 'icons');
  
  for (const icon of tauriIcons) {
    const outputPath = path.join(iconsDir, icon.name);
    await sharp(sourceIcon)
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${icon.name}`);
  }

  // Generate ICO file (Windows)
  const icoPath = path.join(iconsDir, 'icon.ico');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    sizes.map(size => 
      sharp(sourceIcon)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );
  // For ICO, we'll just use the 256x256 as the main icon
  await sharp(sourceIcon)
    .resize(256, 256)
    .png()
    .toFile(icoPath.replace('.ico', '.ico.png'));
  // Copy as ico (sharp doesn't support ico directly, need to use png2ico or similar)
  console.log('Note: ICO file needs manual conversion or use png2ico tool');
  
  // Generate ICNS file (macOS) - sharp doesn't support icns directly
  console.log('Note: ICNS file needs manual conversion or use iconutil on macOS');
}

async function generateAndroidIcons() {
  const androidResDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
  
  for (const mipmap of androidMipmaps) {
    const outputDir = path.join(androidResDir, mipmap.folder);
    
    // Standard launcher icon
    await sharp(sourceIcon)
      .resize(mipmap.size, mipmap.size)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher.png'));
    console.log(`Generated: ${mipmap.folder}/ic_launcher.png`);
    
    // Round launcher icon
    const roundSize = mipmap.size;
    const roundIcon = await sharp(sourceIcon)
      .resize(roundSize, roundSize)
      .png()
      .toBuffer();
    
    // Create circular mask
    const circleMask = Buffer.from(
      `<svg><circle cx="${roundSize/2}" cy="${roundSize/2}" r="${roundSize/2}" fill="white"/></svg>`
    );
    
    await sharp(roundIcon)
      .composite([{
        input: circleMask,
        blend: 'dest-in'
      }])
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_round.png'));
    console.log(`Generated: ${mipmap.folder}/ic_launcher_round.png`);
  }
  
  // Generate adaptive icon foregrounds
  for (const fg of androidForegroundSizes) {
    const outputDir = path.join(androidResDir, fg.folder);
    const iconSize = Math.floor(fg.size * 0.66); // Icon should be ~66% of the foreground
    const padding = Math.floor((fg.size - iconSize) / 2);
    
    await sharp(sourceIcon)
      .resize(iconSize, iconSize)
      .extend({
        top: padding,
        bottom: fg.size - iconSize - padding,
        left: padding,
        right: fg.size - iconSize - padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_foreground.png'));
    console.log(`Generated: ${fg.folder}/ic_launcher_foreground.png`);
  }
}

async function main() {
  console.log('Generating icons from:', sourceIcon);
  console.log('');
  
  console.log('=== Tauri Desktop Icons ===');
  await generateTauriIcons();
  console.log('');
  
  console.log('=== Android Icons ===');
  await generateAndroidIcons();
  console.log('');
  
  console.log('Done! Note: ICO and ICNS files may need manual conversion.');
}

main().catch(console.error);
