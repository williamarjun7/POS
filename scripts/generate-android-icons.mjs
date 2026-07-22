/**
 * Generate Android APK icons from the app logo.
 *
 * Reads src/assets/logo.png and produces:
 *   - ic_launcher.png      — launcher icon at each density
 *   - ic_launcher_round.png — same size, same image (round variant)
 *   - ic_launcher_foreground.png — larger foreground for adaptive icons
 *
 * Density    Launcher  Foreground
 * ─────────────────────────────────
 * mdpi       48×48     108×108
 * hdpi       72×72     162×162
 * xhdpi      96×96     216×216
 * xxhdpi     144×144   324×324
 * xxxhdpi    192×192   432×432
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const LOGO = 'src/assets/logo.png'
const RES_BASE = 'android/app/src/main/res'

const SIZES = [
  { density: 'mdpi',   launcher: 48,  foreground: 108 },
  { density: 'hdpi',   launcher: 72,  foreground: 162 },
  { density: 'xhdpi',  launcher: 96,  foreground: 216 },
  { density: 'xxhdpi', launcher: 144, foreground: 324 },
  { density: 'xxxhdpi',launcher: 192, foreground: 432 },
]

async function resize(input, size, outputPath) {
  await sharp(input)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath)
  console.log(`  ✓ ${path.basename(outputPath)} (${size}×${size})`)
}

async function main() {
  const logo = path.resolve(LOGO)

  if (!fs.existsSync(logo)) {
    console.error(`Logo not found: ${logo}`)
    process.exit(1)
  }

  const meta = await sharp(logo).metadata()
  console.log(`Logo: ${LOGO} (${meta.width}×${meta.height})`)

  for (const { density, launcher, foreground } of SIZES) {
    const dir = path.join(RES_BASE, `mipmap-${density}`)

    // Launcher icon
    await resize(logo, launcher, path.join(dir, 'ic_launcher.png'))
    // Round launcher icon (same image)
    await resize(logo, launcher, path.join(dir, 'ic_launcher_round.png'))
    // Foreground for adaptive icon (larger, padded)
    await resize(logo, foreground, path.join(dir, 'ic_launcher_foreground.png'))
  }

  console.log('\nDone! All Android icons generated from logo.')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
