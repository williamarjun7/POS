/**
 * Verify email for the owner account using the code from email
 *
 * Usage:
 *   INSFORGE_URL=<url> ANON_KEY=<key> EMAIL=<email> CODE=<code> node scripts/verify-owner-email.mjs
 *
 * Required env vars:
 *   INSFORGE_URL  - InsForge project URL
 *   ANON_KEY      - InsForge anon key
 *   EMAIL         - Owner email
 *   CODE          - Verification code from email
 */

const INSFORGE_URL = process.env.INSFORGE_URL
const ANON_KEY = process.env.ANON_KEY
const EMAIL = process.env.EMAIL
const CODE = process.env.CODE

if (!INSFORGE_URL || !ANON_KEY || !EMAIL || !CODE) {
  console.error('Missing required env vars: INSFORGE_URL, ANON_KEY, EMAIL, CODE')
  process.exit(1)
}

import('@insforge/sdk').then(async ({ createClient }) => {
  const client = createClient({ baseUrl: INSFORGE_URL, anonKey: ANON_KEY })

  console.log(`Verifying email ${EMAIL} with code ${CODE}...`)

  const { data, error } = await client.auth.verifyEmail({ email: EMAIL, otp: CODE })

  if (error) {
    console.error('✖ Verification failed:', error.message)
    process.exit(1)
  }

  console.log('✓ Email verified successfully!')
  console.log('')
  console.log('The account is now fully active:')
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: Kamal2004@`)
  console.log(`  Role:     owner`)
  console.log('')
  console.log(`Login URL: ${INSFORGE_URL}/login`)
}).catch(err => {
  console.error('Script failed:', err.message)
  process.exit(1)
})
