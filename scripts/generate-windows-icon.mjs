#!/usr/bin/env node

/**
 * generate-windows-icon.mjs
 *
 * Generates a 256×256 PNG application icon from the existing favicon.
 * Uses sharp (already a dev dependency).
 *
 * Usage:
 *   node scripts/generate-windows-icon.mjs
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  const inputPath = resolve(root, 'public', 'favicon.png');
  const outputPath = resolve(root, 'public', 'icon.png');

  if (!existsSync(inputPath)) {
    console.error('❌ favicon.png not found at', inputPath);
    process.exit(1);
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌ sharp package not available. Install it: npm install sharp');
    process.exit(1);
  }

  try {
    const metadata = await sharp(inputPath).metadata();
    console.log(`📐 Input: ${metadata.width}x${metadata.height}`);

    const buffer = await sharp(inputPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 26, g: 26, b: 46, alpha: 1 }, // dark bg matching the app theme
      })
      .png()
      .toBuffer();

    await sharp(buffer).toFile(outputPath);
    console.log(`✅ Generated: ${outputPath} (256x256 PNG)`);
  } catch (err) {
    console.error('❌ Failed to generate icon:', err.message);
    process.exit(1);
  }
}

main();
