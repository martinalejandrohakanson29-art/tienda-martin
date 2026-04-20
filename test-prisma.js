const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const result = await prisma.venta.create({
      data: {
        cliente: "Consumidor Final",
        vendedor: "Martin Jakson",
        total: 100,
        interes: 0,
        totalFinal: 100,
        tipoVenta: "PEDIDO",
        metodo_pago: "Efectivo",
        info: "Prueba observaciones",
        items: {
          create: [{
            nombre: "Articulo Prueba",
            cantidad: 1,
            precio_unit: 100,
            subtotal: 100
          }]
        }
      }
    });
    console.log("Success:", result);
  } catch (err) {
    console.error("Prisma Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
