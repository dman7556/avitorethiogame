import prisma from './src/lib/prisma.js';

async function resetAllBalances() {
  console.log('Resetting all user balances to 0...');
  
  const result = await prisma.wallet.updateMany({
    data: {
      balance: 0n,
      reserved: 0n,
    },
  });
  
  console.log(✓ Updated  wallets);
  process.exit(0);
}

resetAllBalances().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
