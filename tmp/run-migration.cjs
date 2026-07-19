/**
 * Execute the deduplication migration directly via node-postgres.
 * Bypasses the CLI command-line length limit on Windows.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ⚠️ SECURITY: Never hardcode connection strings. Read from environment.
const CONN_STRING = process.env.DATABASE_URL || process.env.INSFORGE_DB_URL;

if (!CONN_STRING) {
  console.error('FATAL: No database connection string found. Set DATABASE_URL or INSFORGE_DB_URL environment variable.');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20260727000100_deduplicate-invoices.sql'),
  'utf8'
);

// Extract only the executable statements (skip comment-only lines between semicolons)
const lines = sql.split('\n');
const executableLines = lines.filter(line => {
  const trimmed = line.trim();
  // Keep lines that have SQL content, or are empty (statement separators)
  // Remove pure comment lines
  if (trimmed.startsWith('--')) return false;
  return true;
});

// Join back and split by semicolons for cleaner error reporting
const cleaned = executableLines.join('\n');
const fullStatements = cleaned.split(';').map(s => s.trim()).filter(s => s.length > 0);

console.log(`Connecting to database...`);
console.log(`Migration file: ${sql.length} bytes`);
console.log(`Found ${fullStatements.length} individual statements.\n`);

async function main() {
  const client = new Client({ connectionString: CONN_STRING });
  
  try {
    await client.connect();
    console.log('Connected successfully.\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < fullStatements.length; i++) {
      const stmt = fullStatements[i] + ';';
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim();
      
      process.stdout.write(`[${i + 1}/${fullStatements.length}] ${preview.substring(0, 70)}... `);
      
      try {
        const result = await client.query(stmt);
        // Show row count or command tag
        const command = result.command || 'EXECUTED';
        const rowCount = result.rowCount != null ? ` (${result.rowCount} rows)` : '';
        if (result.rows && result.rows.length > 0) {
          console.log(`OK${rowCount} — ${JSON.stringify(result.rows[0])}`);
        } else {
          console.log(`OK${rowCount}`);
        }
        successCount++;
      } catch (err) {
        console.error(`ERROR: ${err.message.substring(0, 150)}`);
        errorCount++;
      }
    }

    console.log(`\n--- Done: ${successCount} succeeded, ${errorCount} failed ---`);
    process.exit(errorCount > 0 ? 1 : 0);
    
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
