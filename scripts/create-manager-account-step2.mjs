/**
 * Step 2: Verify email with the code from email and set role to manager
 *
 * Run: node scripts/create-manager-account-step2.mjs <VERIFICATION_CODE>
 *
 * Example: node scripts/create-manager-account-step2.mjs 639975
 */

import { createClient } from '@insforge/sdk'

const client = createClient({
  baseUrl: 'https://659pq3pb.us-east.insforge.app',
  anonKey: 'anon_4b74cc35c99160bc644f9faca7944a27f53d031e05dadb283385e0134f340a17',
})

const code = process.argv[2]

if (!code) {
  console.error('❌ Please provide the verification code from your email')
  console.error('   Usage: node scripts/create-manager-account-step2.mjs <CODE>')
  process.exit(1)
}

const email = 'williamarjun7@gmail.com'
const password = 'Arjun@369!'
const fullName = 'William Arjun'

async function main() {
  // Step 1: Reset password with OTP (this verifies the email and sets the new password)
  console.log('🔄 Resetting password with OTP...')
  const resetResult = await client.auth.resetPassword({ newPassword: password, otp: code })
  
  if (resetResult.error) {
    console.error('❌ Password reset failed:', resetResult.error.message)
    // Try exchangeResetPasswordToken as fallback
    console.log('  Trying alternate method (exchangeResetPasswordToken)...')
    const exchangeResult = await client.auth.exchangeResetPasswordToken({ email, token: code, newPassword: password })
    if (exchangeResult.error) {
      console.error('❌ Exchange also failed:', exchangeResult.error.message)
      process.exit(1)
    }
    console.log('✅ Password reset via exchange succeeded!')
  } else {
    console.log('✅ Password reset successful!')
  }

  // Step 2: Sign in
  console.log('🔄 Signing in...')
  const signInResult = await client.auth.signInWithPassword({ email, password })
  
  if (signInResult.error) {
    console.error('❌ Sign in failed:', signInResult.error.message)
    process.exit(1)
  }

  const userId = signInResult.data.user.id
  console.log('✅ Signed in! User ID:', userId)

  // Step 3: Set profile name
  console.log('🔄 Setting profile name...')
  const profileResult = await client.auth.setProfile({ full_name: fullName })
  if (profileResult.error) {
    console.log('  Note:', profileResult.error.message)
  } else {
    console.log('✅ Profile name set!')
  }

  // Step 4: Create/update user_profiles with manager role
  console.log('🔄 Setting role to manager in user_profiles...')
  
  const { data: existingProfile } = await client.database
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (existingProfile) {
    const upRes = await client.database
      .from('user_profiles')
      .update({ name: fullName, email, role: 'manager', active: true })
      .eq('id', userId)
    if (upRes.error) {
      console.error('❌ Update profile error:', upRes.error.message)
    } else {
      console.log('✅ Profile updated with manager role!')
    }
  } else {
    const insRes = await client.database
      .from('user_profiles')
      .insert([{
        id: userId,
        email,
        name: fullName,
        phone: '',
        role: 'manager',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
    if (insRes.error) {
      console.error('❌ Insert profile error:', insRes.error.message)
    } else {
      console.log('✅ Profile created with manager role!')
    }
  }

  console.log('')
  console.log('🎉 Account setup complete! You can now log in:')
  console.log('   Email: williamarjun7@gmail.com')
  console.log('   Password: Arjun@369!')
  console.log('   Name: William Arjun')
  console.log('   Role: manager')
  
  // Store user info for later cleanup
  const fs = await import('fs')
  fs.writeFileSync('scripts/.manager-temp.json', JSON.stringify({ userId, email, password, fullName }, null, 2))
}

main().catch(err => {
  console.error('❌ Error:', err.message || err)
  process.exit(1)
})
