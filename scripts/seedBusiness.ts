import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const phoneNumber = process.env.TEST_BUSINESS_PHONE || '+12602869696';
  const name = process.env.TEST_BUSINESS_NAME || 'Ciccio Matto';
  const timezone = process.env.TEST_BUSINESS_TZ || 'Europe/Rome';

  const existing = await prisma.business.findUnique({
    where: { phoneNumber },
  });
  if (existing) {
    console.log('Business already exists:', existing.id, existing.phoneNumber);
    await prisma.$disconnect();
    return;
  }
  const created = await prisma.business.create({
    data: {
      name,
      phoneNumber,
      timezone,
      description: 'Seeded test business',
    },
  });
  console.log('Seeded business:', created.id, created.phoneNumber);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});


