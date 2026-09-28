// Test NEW Supabase database connection
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { PrismaClient } = require('@prisma/client');

console.log('\n🔍 Testing NEW Supabase Database Connection\n');
console.log('=' .repeat(60));
console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('=' .repeat(60));

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('\n📡 Attempting to connect to database...\n');
    
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');
    
    // Try a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query test successful:', result);
    
    console.log('\n🎉 NEW Supabase database is working!');
    
  } catch (error) {
    console.error('\n❌ Connection Error:', error.message);
    console.log('\n⚠️  Possible issues:');
    console.log('   1. Database password has special characters');
    console.log('   2. Connection pooling port might be different');
    console.log('   3. Database might not be accessible from your IP');
    console.log('\n💡 Try getting the connection string from:');
    console.log('   Supabase Dashboard → Settings → Database → Connection string');
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
