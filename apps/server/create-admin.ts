import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@skyrush.com' }
    });

    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('\n📧 Email: admin@skyrush.com');
      console.log('🔑 Password: Admin@123');
      console.log('📱 Phone: +251911111111\n');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        name: 'System Administrator',
        email: 'admin@skyrush.com',
        phone: '+251911111111',
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Create wallet for admin
    await prisma.wallet.create({
      data: {
        userId: admin.id,
        balance: 1000000, // 1 million ETB for testing
        reserved: 0,
        currency: 'ETB',
      },
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: admin@skyrush.com');
    console.log('🔑 Password: Admin@123');
    console.log('📱 Phone: +251911111111');
    console.log('👤 Role: ADMIN');
    console.log('💰 Initial Balance: 1,000,000 ETB');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🌐 Login at: http://localhost:5174/');
    console.log('🎛️ Admin Dashboard: http://localhost:5174/admin\n');

  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
