#!/usr/bin/env node
// Minify SQL and execute via CLI (bypass Windows command-line length limits)
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/minify-and-apply-sql.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(filePath, 'utf-8');

// Strip comments and collapse whitespace to one line
const minified = sql
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .map(l => l.trim())
  .filter(l => l.length > 0)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

console.log(`SQL size: ${sql.length} chars → ${minified.length} chars (${((1 - minified.length/sql.length)*100).toFixed(0)}% reduction)`);

// Split into statements at top-level semicolons
// For DO blocks and function bodies with $$, we need to be careful
// Create a single minified statement file
const tmpFile = `migrations/_tmp_minified_${Date.now()}.sql`;
readFileSync(filePath); // just to ensure it's loaded

// Write minified SQL to temp file
import { writeFileSync, unlinkSync } from 'fs';
writeFileSync(tmpFile, minified, 'utf-8');

try {
  // Use $(cat file) to read the minified SQL
  const result = execSync(`npx @insforge/cli db query "$(cat ${tmpFile})" 2>&1`, {
    cwd: process.cwd(),
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120_000,
  });
  console.log(result.stdout?.toString() || 'Query executed successfully.');
} catch (err) {
  console.error('Error:', err.stderr?.toString() || err.message);
} finally {
  try { unlinkSync(tmpFile); } catch {}
}
