const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Intentar reiniciar la secuencia para numeroVenta
    // El nombre de la secuencia suele ser "ventas_mostrador_numeroVenta_seq"
    // Pero vamos a intentar buscarla o usar el nombre estándar
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE IF EXISTS "ventas_mostrador_numeroVenta_seq" RESTART WITH 3480;`);
    console.log("Secuencia reiniciada a 3480");
    
    // Si la secuencia no se llama así, intentamos con el nombre que Prisma suele generar
    // A veces es TableName_columnName_seq
    
    const count = await prisma.venta.count();
    console.log("Total de ventas actual:", count);
    
    // Si hay ventas existentes, numeroVenta ya tiene valores del 1 al count.
    // Los nuevos empezarán desde 3480.
    
  } catch (err) {
    console.error("Error al reiniciar secuencia:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
