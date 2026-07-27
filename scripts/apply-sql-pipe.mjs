#!/usr/bin/env node
// Pipe SQL to insforge CLI via stdin to avoid Windows command-line length limits
import { readFileSync } from 'fs';
import { spawn } from 'child_process';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/apply-sql-pipe.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(filePath, 'utf-8');

// Strip comment lines and collapse whitespace
const cleanSql = sql
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n')
  .trim();

const child = spawn('npx', ['@insforge/cli', 'db', 'query'], {
  cwd: process.cwd(),
  shell: true,
  stdio: ['pipe', 'inherit', 'inherit'],
});

child.stdin.write(cleanSql);
child.stdin.end();

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
