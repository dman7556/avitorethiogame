import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Use REST API to create user in Supabase Auth (avoids WebSocket issue on Node 20)
async function supabaseAuthRequest(endpoint: string, body: any) {
  const res = await fetch(`${supabaseUrl}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  console.log('Seeding database with Supabase Auth...');

  // 1. Create admin user in Supabase Auth via REST API
  const authResult = await supabaseAuthRequest('admin/users', {
    email: 'admin@aviator.com',
    password: 'admin123',
    email_confirm: true,
    user_metadata: {
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  let userId: string;

  if (authResult.id) {
    userId = authResult.id;
    console.log('Admin user created in Supabase Auth:', userId);
  } else if (authResult.msg && authResult.msg.includes('already been registered')) {
    console.log('Admin user already exists in Supabase Auth');
    // List users to find the admin
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });
    const listData = await listRes.json();
    const adminUser = listData.users?.find((u: any) => u.email === 'admin@aviator.com');
    if (!adminUser) {
      console.error('Could not find admin user in Supabase');
      process.exit(1);
    }
    userId = adminUser.id;
    console.log('Found existing admin user:', userId);
  } else {
    console.error('Auth error:', authResult);
    process.exit(1);
  }

  // 2. Create local user + wallet using Supabase Auth UUID
  const user = await prisma.user.upsert({
    where: { email: 'admin@aviator.com' },
    update: {
      id: userId,
      name: 'Admin User',
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
    },
    create: {
      id: userId,
      name: 'Admin User',
      email: 'admin@aviator.com',
      phone: '+251900000000',
      password: 'supabase-auth',
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      balance: 0,
      reserved: 0,
    },
  });

  // Initialize system settings
  const settings = [
    { key: 'minimumDeposit', value: '200' },
    { key: 'maximumDeposit', value: '50000' },
    { key: 'minimumRemainingBalance', value: '500' },
    {
      key: 'paymentMethods',
      value: JSON.stringify({
        TELEBIRR: {
          enabled: true,
          displayName: 'Telebirr',
          instructions: 'Send payment to the account below and upload your transaction screenshot.',
          accountInfo: '0912345678 - Aviator Gaming',
        },
        CBE: {
          enabled: true,
          displayName: 'Commercial Bank of Ethiopia (CBE)',
          instructions: 'Transfer to the account below and upload your transaction screenshot.',
          accountInfo: 'Account: 1000123456789 - Aviator Gaming - CBE',
        },
      }),
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('');
  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('Admin login:');
  console.log('  Email: admin@aviator.com');
  console.log('  Password: admin123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
