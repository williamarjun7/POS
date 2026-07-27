/**
 * Step 1: Create manager account — sends verification email
 *
 * Run: node scripts/create-manager-account-step1.mjs
 * After running, check your email for the verification code,
 * then run: node scripts/create-manager-account-step2.mjs <code>
 */

import { createClient } from '@insforge/sdk'

const client = createClient({
  baseUrl: 'https://659pq3pb.us-east.insforge.app',
  anonKey: 'anon_4b74cc35c99160bc644f9faca7944a27f53d031e05dadb283385e0134f340a17',
})

const email = 'williamarjun7@gmail.com'
const password = 'Arjun@369!'
const fullName = 'William Arjun'

async function main() {
  console.log('🔄 Creating manager account...')
  console.log(`   Email: ${email}`)
  console.log(`   Name: ${fullName}`)
  console.log(`   Role: manager`)
  console.log('')

  // Step 1: Sign up via InsForge Auth (sends verification email)
  const result = await client.auth.signUp({ email, password })
  
  if (result.error) {
    console.error('❌ Signup failed:', result.error.message || result.error)
    process.exit(1)
  }

  console.log('✅ Auth account created successfully!')
  console.log(`   User ID: ${result.data?.user?.id}`)
  console.log('')
  console.log('📧 Verification email sent to: williamarjun7@gmail.com')
  console.log('')
  console.log('⚠️  Please check your email for the verification code.')
  console.log('   Then run the second script:')
  console.log('   node scripts/create-manager-account-step2.mjs <VERIFICATION_CODE>')
  console.log('')

  // Save the user info to a temp file so step 2 can use it
  const fs = await import('fs')
  fs.writeFileSync('scripts/.manager-temp.json', JSON.stringify({
    userId: result.data?.user?.id,
    email,
    password,
    fullName,
  }, null, 2))
}

main().catch(err => {
  console.error('❌ Error:', err.message || err)
  process.exit(1)
})
