/**
 * Test invoice_items insert by calling PostgREST directly via fetch.
 * This mimics exactly what the frontend SDK does internally.
 */
import { readFileSync } from 'fs'

// Load env manually — trim BOM/quotes
const envRaw = readFileSync('.env', 'utf8')
const env = {}
for (const line of envRaw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  // Remove surrounding quotes if present
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

const BASE_URL = env.VITE_INSFORGE_URL
const ANON_KEY = env.VITE_INSFORGE_ANON_KEY

if (!BASE_URL || !ANON_KEY) {
  console.error('Missing VITE_INSFORGE_URL or VITE_INSFORGE_ANON_KEY in .env')
  process.exit(1)
}

console.log('BASE_URL:', BASE_URL)
console.log('ANON_KEY length:', ANON_KEY.length)

// Step 1: Check if we can connect to PostgREST
async function main() {
  // Try to get the latest invoice first
  const invoiceUrl = `${BASE_URL}/rest/v1/invoices?select=id,invoice_number,customer_name&order=created_at.desc&limit=1`

  console.log('\n--- Fetching latest invoice ---')
  const invResp = await fetch(invoiceUrl, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Accept': 'application/json',
    }
  })

  if (!invResp.ok) {
    console.error('Failed to fetch invoices:', invResp.status, await invResp.text())
    process.exit(1)
  }

  const invoices = await invResp.json()
  console.log('Invoices found:', invoices.length)
  if (invoices.length === 0) {
    console.error('No invoices found')
    process.exit(1)
  }

  const invoice = invoices[0]
  console.log('Using invoice:', JSON.stringify(invoice, null, 2))

  // Step 2: Check existing invoice_items count
  const countUrl = `${BASE_URL}/rest/v1/invoice_items?select=id&invoice_id=eq.${invoice.id}`
  const countResp = await fetch(countUrl, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Accept': 'application/json',
    }
  })
  const existingItems = await countResp.json()
  console.log(`\nExisting items for invoice ${invoice.invoice_number}: ${existingItems.length}`)

  // Step 3: Try to insert invoice_items
  const insertUrl = `${BASE_URL}/rest/v1/invoice_items`
  const rows = [{
    invoice_id: invoice.id,
    menu_item_id: null,
    name: 'Test SDK Insert',
    quantity: 1,
    unit_price: 100,
    total_price: 100,
  }]

  console.log('\n--- Attempting insert ---')
  console.log('POST', insertUrl)
  console.log('Body:', JSON.stringify(rows, null, 2))

  const insertResp = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(rows),
  })

  console.log('Response status:', insertResp.status)
  const respBody = await insertResp.text()
  console.log('Response body:', respBody)

  if (!insertResp.ok) {
    console.error('\nINSERT FAILED!')
    
    // Try to parse the error
    try {
      const parsed = JSON.parse(respBody)
      console.error('Parsed error:', JSON.stringify(parsed, null, 2))
    } catch {
      console.error('Raw error text:', respBody)
    }
  } else {
    console.log('\nINSERT SUCCEEDED!')
    try {
      console.log('Inserted data:', JSON.stringify(JSON.parse(respBody), null, 2))
    } catch {
      console.log('Raw response:', respBody)
    }
  }

  // Step 4: Clean up test data
  if (insertResp.ok) {
    const deleteResp = await fetch(`${BASE_URL}/rest/v1/invoice_items?name=eq.Test%20SDK%20Insert`, {
      method: 'DELETE',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Accept': 'application/json',
      }
    })
    console.log('\nCleanup status:', deleteResp.status)
  }
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})
