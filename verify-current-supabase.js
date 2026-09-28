// Verify CURRENT Supabase configuration
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

console.log('\n🔍 CURRENT SUPABASE CONFIGURATION\n');
console.log('=' .repeat(60));
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('Project ID:', SUPABASE_URL?.split('//')[1]?.split('.')[0] || 'N/A');
console.log('ANON_KEY (first 30 chars):', SUPABASE_ANON_KEY?.substring(0, 30) + '...');
console.log('SERVICE_KEY (first 30 chars):', SUPABASE_SERVICE_KEY?.substring(0, 30) + '...');
console.log('=' .repeat(60));

async function checkCurrentSupabase() {
  try {
    console.log('\n📡 Querying Supabase Auth Users...\n');
    
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    
    const statusText = res.ok ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`Response: ${res.status} ${statusText}\n`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Error Response:', errorText);
      console.log('\n⚠️  ISSUE: Cannot connect to Supabase Auth');
      console.log('   This could mean:');
      console.log('   1. Wrong SERVICE_KEY');
      console.log('   2. Wrong SUPABASE_URL');
      console.log('   3. Network issue');
      return;
    }
    
    const data = await res.json();
    
    if (data.users && Array.isArray(data.users)) {
      console.log(`✅ Connected Successfully!`);
      console.log(`📊 Total Users in Auth: ${data.users.length}\n`);
      
      if (data.users.length === 0) {
        console.log('⚠️  This is a FRESH Supabase project with NO users yet.');
        console.log('✨ This is expected for a new account!\n');
      } else {
        console.log('Recent users:');
        data.users.slice(0, 5).forEach((user, idx) => {
          console.log(`  ${idx + 1}. ${user.email} (${user.created_at})`);
        });
        console.log('');
      }
      
      console.log('✅ Your application is correctly configured!');
      console.log('✅ New registrations will appear in THIS Supabase project.');
      
    } else {
      console.log('❌ Unexpected response format:', data);
    }
    
  } catch (error) {
    console.error('\n❌ Connection Error:', error.message);
    console.log('\n⚠️  Cannot connect to Supabase. Please check:');
    console.log('   1. SUPABASE_URL is correct');
    console.log('   2. SUPABASE_SERVICE_KEY is correct');
    console.log('   3. Internet connection is working');
  }
}

checkCurrentSupabase();
