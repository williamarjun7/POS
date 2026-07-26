#!/usr/bin/env node
// Apply migration: add p_customer_id to process_payment RPC
// Uses insforge CLI's `db query` command by passing SQL as argument
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const sql = readFileSync('migrations/20260808000100_add-customer-id-to-process-payment.sql', 'utf-8');

// Split into individual statements and execute each one
// The full SQL is too long for a single command-line argument
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const stmt of statements) {
  try {
    const result = execSync(`npx insforge db query "${stmt.replace(/"/g, '\\"')}" 2>&1`, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log(`✓ Executed: ${stmt.substring(0, 60)}...`);
  } catch (err) {
    console.error(`✖ Failed: ${stmt.substring(0, 60)}...`);
    console.error(err.stderr?.toString() || err.message);
  }
}

console.log('\nMigration complete. Verifying...');
try {
  const verify = execSync('npx insforge db query "SELECT proname, pronargs FROM pg_proc WHERE proname = \'process_payment\' AND pronamespace = \'public\'::regnamespace;"', {
    cwd: process.cwd(),
  });
  console.log(verify.stdout.toString());
} catch (err) {
  console.error('Verify failed:', err.message);
}
