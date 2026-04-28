import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const config = await prisma.config.findFirst();
  if (config) {
    const currentMethods = config.paymentMethods || "Efectivo,Transferencia,Tarjeta";
    if (!currentMethods.includes("MercadoPago (ML)")) {
      const newMethods = `${currentMethods},MercadoPago (ML)`;
      await prisma.config.update({
        where: { id: config.id },
        data: { paymentMethods: newMethods },
      });
      console.log(`Updated payment methods to: ${newMethods}`);
    } else {
      console.log("MercadoPago (ML) already exists in config.");
    }
  } else {
    await prisma.config.create({
      data: {
        paymentMethods: "Efectivo,Transferencia,Tarjeta,MercadoPago (ML)",
      },
    });
    console.log("Created config with MercadoPago (ML).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
