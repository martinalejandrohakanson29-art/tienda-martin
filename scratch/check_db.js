const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.proveedor.count();
  console.log('Total proveedores:', count);
  
  const sample = await prisma.proveedor.findFirst({
    where: {
      total: { not: 0 }
    }
  });
  
  if (sample) {
    console.log('Sample with total != 0:', JSON.stringify(sample, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    , 2));
  } else {
    console.log('No sample found with total != 0');
    const first = await prisma.proveedor.findFirst();
    console.log('First record:', JSON.stringify(first, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    , 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
