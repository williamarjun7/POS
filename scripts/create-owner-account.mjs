/**
 * Create an Owner account
 *
 * Usage:
 *   INSFORGE_URL=<url> ANON_KEY=<key> EMAIL=<email> PASSWORD=<password> node scripts/create-owner-account.mjs
 *
 * Required env vars:
 *   INSFORGE_URL  - InsForge project URL
 *   ANON_KEY      - InsForge anon key
 *   EMAIL         - Owner email
 *   PASSWORD      - Owner password
 *
 * Optional:
 *   FULL_NAME     - Display name (default: Owner)
 */

const INSFORGE_URL = process.env.INSFORGE_URL
const ANON_KEY = process.env.ANON_KEY
const EMAIL = process.env.EMAIL
const PASSWORD = process.env.PASSWORD
const FULL_NAME = process.env.FULL_NAME || 'Owner'

if (!INSFORGE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars: INSFORGE_URL, ANON_KEY, EMAIL, PASSWORD')
  process.exit(1)
}

import('@insforge/sdk').then(async ({ createClient }) => {
  const client = createClient({
    baseUrl: INSFORGE_URL,
    anonKey: ANON_KEY,
  })

  console.log(`[1/3] Creating auth account for ${EMAIL}...`)

  const { data, error } = await client.auth.signUp({ email: EMAIL, password: PASSWORD })

  if (error) {
    console.error('✖ SignUp failed:', error.message)
    process.exit(1)
  }

  console.log('✓ Auth account created (verification email sent)')

  if (data?.user) {
    console.log(`USER_ID=${data.user.id}`)
    console.log(`USER_EMAIL=${data.user.email}`)

    // Set display name
    if (FULL_NAME) {
      await client.auth.setProfile({ full_name: FULL_NAME })
      console.log('✓ Display name set')
    }
  } else {
    // If the user already exists, try to find their ID
    console.log('⚠ No user object returned - user may already exist')
    console.log('Run: npx @insforge/cli db query "SELECT id, email FROM auth.users WHERE email=\'' + EMAIL + '\'"')
  }

  console.log('')
  console.log('=== Account Summary ===')
  console.log(`Email:    ${EMAIL}`)
  console.log(`Password: ${PASSWORD}`)
  console.log(`Role:     owner`)
  console.log(`Name:     ${FULL_NAME}`)
  console.log('')
  console.log('A verification email has been sent to the above address.')
  console.log('Please provide the verification code to complete the setup.')
}).catch(err => {
  console.error('Script failed:', err.message)
  process.exit(1)
})
