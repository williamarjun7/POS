#!/usr/bin/env node
// Execute SQL via insforge CLI without shell expansion
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/apply-sql-direct.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(filePath, 'utf-8');

// Strip comments and collapse whitespace
const minified = sql
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .map(l => l.trim())
  .filter(l => l.length > 0)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

console.log(`SQL size: ${sql.length} → ${minified.length} chars`);

// Use spawnSync with explicit args to avoid shell parsing
const result = spawnSync('npx', ['@insforge/cli', 'db', 'query', minified], {
  cwd: process.cwd(),
  shell: true,
  timeout: 120_000,
  maxBuffer: 50 * 1024 * 1024,
});

if (result.error) {
  console.error('Error:', result.error.message);
  process.exit(1);
}

console.log(result.stdout?.toString() || '');
if (result.stderr?.toString()) {
  console.error(result.stderr.toString());
}
