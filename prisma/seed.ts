import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aviator.com' },
    update: { emailVerified: true, password: adminPassword },
    create: {
      email: 'admin@aviator.com',
      phone: '+251900000000',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      isActive: true,
      emailVerified: true, // Admin should be pre-verified
    },
  });

  // Create admin wallet
  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      balance: 0,
      reserved: 0,
    },
  });

  console.log('Admin user created:');
  console.log('  Email: admin@aviator.com');
  console.log('  Password: admin123');
  console.log('  Role: ADMIN');

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

  console.log('System settings initialized');
  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
