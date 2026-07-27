#!/usr/bin/env node
// Read SQL from file and execute via insforge CLI
// Avoids Windows command-line length limits
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/apply-sql-standalone.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(filePath, 'utf-8');

// Write to a temp file without comments
const lines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
const cleanSql = lines.join('\n').trim();

const tmpFile = `/tmp/_insforge_tmp_sql_${Date.now()}.sql`;
writeFileSync(tmpFile, cleanSql, 'utf-8');

try {
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
