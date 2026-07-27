#!/usr/bin/env node

/**
 * release-tag.mjs
 *
 * Creates a git tag from the current package.json version and pushes it.
 * This triggers the GitHub Actions release workflows (android-release.yml,
 * windows-release.yml).
 *
 * Usage:
 *   npm run release:patch   # 1.0.1 → 1.0.2 + tag v1.0.2 + push
 *   npm run release:minor   # 1.0.1 → 1.1.0 + tag v1.1.0 + push
 *   npm run release:major   # 1.0.1 → 2.0.0 + tag v2.0.0 + push
 *
 * Prerequisites:
 *   - Working directory must be a git repository
 *   - Origin remote must be configured
 *   - You must have push access
 *
 * The version bump itself is done by `npm version` before this script runs
 * (see the npm scripts in package.json).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── 1. Read package.json version ─────────────────────────────────
const pkgPath = resolve(root, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('❌ package.json not found at', pkgPath);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`❌ Invalid version: "${version}"`);
  process.exit(1);
}

const tag = `v${version}`;

console.log('📦 Version :', version);
console.log('🏷️  Tag    :', tag);

// ─── 2. Check git status ──────────────────────────────────────────
try {
  const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
  if (status) {
    console.warn('⚠️  There are uncommitted changes:');
    console.warn(status);
    console.warn('   The tag will reference the latest committed state.');
    console.warn('   Run `git add . && git commit -m "..."` first if needed.');
  }
} catch {
  // Not a git repo or git not available
  console.error('❌ Not a git repository. Cannot create tag.');
  process.exit(1);
}

// ─── 3. Create and push tag ───────────────────────────────────────
try {
  // Create the tag
  execSync(`git tag -a "${tag}" -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' });
  console.log(`✅ Tag created: ${tag}`);

  // Push the tag
  execSync(`git push origin "${tag}"`, { cwd: root, stdio: 'inherit' });
  console.log(`✅ Tag pushed: ${tag}`);

  // Push the version commit from the current branch
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf-8' }).trim();
  execSync(`git push origin "${branch}"`, { cwd: root, stdio: 'inherit' });
  console.log(`✅ Version commit pushed to ${branch}`);

  console.log('\n🚀 Release triggered!');
  console.log('   Monitor progress at:');
  console.log('   https://github.com/williamarjun7/POS/actions');
} catch (err) {
  console.error('❌ Failed to create or push tag:', err.message);
  console.error('   You may need to push manually:');
  console.error('   git push origin --tags');
  process.exit(1);
}
