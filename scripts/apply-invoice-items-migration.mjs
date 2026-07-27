#!/usr/bin/env node
// Apply migration: add invoice_items insertion to process_payment RPC
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const filePath = 'migrations/20260811000200_add-invoice-items-to-process-payment.sql';
const sql = readFileSync(filePath, 'utf-8');

// Filter out comment lines and empty lines
const lines = sql.split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim().length > 0);

// Group lines into statement chunks (terminated by semicolons)
const statements = [];
let currentStmt = '';
for (const line of lines) {
  currentStmt += line + '\n';
  if (line.trim().endsWith(';') || line.trim().endsWith('$$;')) {
    if (currentStmt.trim()) statements.push(currentStmt.trim());
    currentStmt = '';
  } else if (line.includes('$$')) {
    // For dollar-quoted function bodies, keep collecting until the closing $$
    // (already handled by the endsWith check above)
  }
}
if (currentStmt.trim()) statements.push(currentStmt.trim());

// Execute each statement
for (const stmt of statements) {
  if (stmt.length === 0) continue;
  try {
    // Write statement to temp file and execute via stdin pipe
    const fs = await import('fs');
    const tmpFile = `migrations/_tmp_statement_${Date.now()}.sql`;
    fs.writeFileSync(tmpFile, stmt, 'utf-8');
    execSync(`npx @insforge/cli db query "$(type ${tmpFile})" 2>&1`, {
      cwd: process.cwd(),
      maxBuffer: 50 * 1024 * 1024,
    });
    fs.unlinkSync(tmpFile);
    console.log(`✓ ${stmt.substring(0, 60)}...`);
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    // Some statements may already exist (IF NOT EXISTS), that's OK
    if (stderr.includes('already exists')) {
      console.log(`✓ ${stmt.substring(0, 60)}... (already exists)`);
    } else {
      console.error(`✖ Failed: ${stmt.substring(0, 60)}...`);
      console.error(stderr);
    }
  }
}

console.log('\nMigration applied. Verifying...');
try {
  const verify = execSync(`npx @insforge/cli db query "SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'process_payment' AND n.nspname = 'public' ORDER BY pg_catalog.pg_get_function_identity_arguments(p.oid);"`, {
    cwd: process.cwd(),
  });
  console.log(verify.stdout.toString());
} catch (err) {
  console.error('Verify failed:', err.message);
}
