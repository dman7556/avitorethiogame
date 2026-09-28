// Test user registration
const fetch = require('node-fetch');

const API_URL = 'http://localhost:4000/api';

// Generate unique test user
const timestamp = Date.now();
const testUser = {
  name: 'Test User Kiro',
  email: `testuser${timestamp}@example.com`,
  phone: `0912${String(timestamp).slice(-6)}`, // Ethiopian format
  password: 'TestPass123'
};

async function testRegistration() {
  console.log('\n🧪 TESTING USER REGISTRATION\n');
  console.log('=' .repeat(60));
  console.log('Test User Details:');
  console.log(`  Name:     ${testUser.name}`);
  console.log(`  Email:    ${testUser.email}`);
  console.log(`  Phone:    ${testUser.phone}`);
  console.log(`  Password: ${testUser.password}`);
  console.log('=' .repeat(60));
  
  try {
    console.log('\n📤 Sending registration request...\n');
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser),
    });
    
    const data = await response.json();
    
    console.log(`Response Status: ${response.status} ${response.ok ? '✅' : '❌'}\n`);
    
    if (response.ok && data.success) {
      console.log('✅ REGISTRATION SUCCESSFUL!\n');
      console.log('User Created:');
      console.log(`  ID:    ${data.data.user.id}`);
      console.log(`  Name:  ${data.data.user.name}`);
      console.log(`  Email: ${data.data.user.email}`);
      console.log(`  Phone: ${data.data.user.phone}`);
      console.log(`  Token: ${data.data.token ? '✅ Generated' : '❌ Not generated'}`);
      console.log('');
      console.log('=' .repeat(60));
      console.log('✨ NOW CHECK YOUR SUPABASE DASHBOARD:');
      console.log('=' .repeat(60));
      console.log('1. Go to: https://supabase.com/dashboard');
      console.log('2. Select project: etzhhcncwvnpmrxjxygj');
      console.log('3. Click: Authentication → Users');
      console.log('4. Look for: ' + testUser.email);
      console.log('5. User ID: ' + data.data.user.id);
      console.log('=' .repeat(60));
      
      return data.data.user;
    } else {
      console.log('❌ REGISTRATION FAILED\n');
      console.log('Error:', data.error || 'Unknown error');
      console.log('\nFull response:', JSON.stringify(data, null, 2));
      return null;
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\nMake sure the server is running:');
    console.log('  npm run dev');
    return null;
  }
}

async function verifyInSupabase(userId, email) {
  console.log('\n🔍 Verifying user appears in Supabase Auth...\n');
  
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    
    const data = await res.json();
    
    if (data.users) {
      const user = data.users.find(u => u.email === email);
      
      if (user) {
        console.log('✅ USER FOUND IN SUPABASE AUTH!\n');
        console.log('Supabase User Details:');
        console.log(`  ID:               ${user.id}`);
        console.log(`  Email:            ${user.email}`);
        console.log(`  Email Confirmed:  ${user.email_confirmed_at ? '✅ Yes' : '❌ No'}`);
        console.log(`  Created At:       ${user.created_at}`);
        console.log(`  Updated At:       ${user.updated_at}`);
        console.log('');
        console.log('🎉 SUCCESS! User is in Supabase Authentication!');
        console.log(`📊 Total users in Supabase: ${data.users.length}`);
        return true;
      } else {
        console.log('❌ User not found in Supabase Auth');
        console.log(`   Searched for: ${email}`);
        console.log(`   Total users: ${data.users.length}`);
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Error querying Supabase:', error.message);
    return false;
  }
}

async function main() {
  const user = await testRegistration();
  
  if (user) {
    console.log('\n⏳ Waiting 2 seconds before checking Supabase...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await verifyInSupabase(user.id, user.email);
  }
}

main();
