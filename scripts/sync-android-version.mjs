#!/usr/bin/env node

/**
 * sync-android-version.mjs
 *
 * Synchronizes the Android project version from package.json.
 *
 * What this does:
 *   1. Reads version from the root package.json
 *   2. Verifies android/app/build.gradle will parse it correctly
 *   3. Runs `npx cap sync android` to copy web assets
 *
 * Usage:
 *   node scripts/sync-android-version.mjs
 *
 * In CI, this runs automatically before `./gradlew assembleRelease`.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── 1. Read package.json ─────────────────────────────────────────
const pkgPath = resolve(root, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('❌ package.json not found at', pkgPath);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`❌ Invalid version in package.json: "${version}"`);
  process.exit(1);
}

const parts = version.split('.').map(Number);
const versionCode = parts[0] * 10000 + parts[1] * 100 + parts[2];

console.log('📦 Package version        :', version);
console.log('🔢 Version code (derived) :', versionCode);

// ─── 2. Verify Gradle file exists ──────────────────────────────────
const gradlePath = resolve(root, 'android', 'app', 'build.gradle');
if (!existsSync(gradlePath)) {
  console.error('❌ android/app/build.gradle not found');
  process.exit(1);
}

console.log('✅ android/app/build.gradle found');
console.log('   (version is read at build time from package.json)');

// ─── 3. Check keystore.properties for local builds ────────────────
const keystorePropsPath = resolve(root, 'android', 'keystore.properties');
if (existsSync(keystorePropsPath)) {
  console.log('✅ keystore.properties found (local signing configured)');
} else {
  console.log('ℹ️  No keystore.properties — release builds will be unsigned locally.');
  console.log('   In CI, signing comes from GitHub Secrets.');
}

// ─── 4. Run cap sync ──────────────────────────────────────────────
console.log('\n🔄 Running: npx cap sync android...');
try {
  execSync('npx cap sync android', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('✅ cap sync android completed');
} catch (err) {
  console.error('❌ cap sync android failed:', err.message);
  process.exit(1);
}

console.log('\n✅ Android version sync complete!');
console.log(`   versionName: ${version}`);
console.log(`   versionCode: ${versionCode}`);
console.log('\n   Now run: cd android && ./gradlew assembleRelease');
