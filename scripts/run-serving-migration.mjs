#!/usr/bin/env node
// Run serving type and packaging migrations
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = [
  'migrations/20260820000100_add-serving-type-packaging.sql',
  'migrations/20260820000101_update-process-payment-serving-type.sql',
];

for (const file of files) {
  console.log(`\n── ${file} ──`);
  const sql = readFileSync(file, 'utf-8');

  // Split into individual statements
  // Handle function bodies with $$ by splitting only at top-level semicolons
  const stmts = [];
  let depth = 0;
  let current = '';
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--') || line.trim() === '') continue;
    // Track $$ blocks for function definitions
    for (const ch of line) {
      if (ch === '$') depth++;
      current += ch;
      if (ch === ';' && depth % 2 === 0) {
        stmts.push(current.trim());
        current = '';
      }
    }
    if (!current.endsWith(';')) current += '\n';
  }
  if (current.trim()) stmts.push(current.trim());

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const stmt of stmts) {
    if (stmt.length < 5) continue;
    try {
      const result = execSync(
        `npx @insforge/cli db query "${stmt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        {
          cwd: process.cwd(),
          timeout: 60000,
          maxBuffer: 50 * 1024 * 1024,
          shell: true,
          encoding: 'utf-8',
        }
      );
      console.log(`  ✓ ${stmt.substring(0, 70).replace(/\n/g, ' ').trim()}...`);
      success++;
    } catch (e) {
      const msg = e.stderr?.toString() || e.message || '';
      // "already exists" is fine for IF NOT EXISTS
      if (msg.includes('already exists') || msg.includes('duplicate column')) {
        console.log(`  ∼ ${stmt.substring(0, 70).replace(/\n/g, ' ').trim()}... (exists)`);
        skipped++;
      } else {
        console.log(`  ✗ ${stmt.substring(0, 70).replace(/\n/g, ' ').trim()}...`);
        console.log(`    Error: ${msg.substring(0, 200)}`);
        failed++;
      }
    }
  }

  console.log(`  Result: ${success} executed, ${skipped} skipped, ${failed} failed`);
}

console.log('\n══════════════════════════════════════════');
console.log('Serving type migration complete!');
console.log('══════════════════════════════════════════');
