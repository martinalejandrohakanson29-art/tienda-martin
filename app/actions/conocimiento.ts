'use server'

import prisma from '@/lib/prisma';

// 1. Definimos la estructura de nuestros metadatos para tener autocompletado
interface MetadatosProducto {
  tipo: string;
  categoria: string;
  marca: string;
  sku?: string;
  link_compra?: string;
}

export async function guardarConocimientoCasco() {
  try {
    // 2. Preparamos los datos exactos del ejemplo
    const texto = "El casco LS2 FF352 es un casco integral fabricado en policarbonato de alta resistencia. Cuenta con visor anti-rayas, interior hipoalergénico, desmontable y lavable. Tiene certificación DOT. En Revolución Motos ofrecemos envío gratis para este producto a todo el país a través de Correo Argentino.";
    
    const metadata: MetadatosProducto = {
      tipo: "producto",
      categoria: "cascos",
      marca: "LS2",
      sku: "LS2-FF352",
      link_compra: "https://tutienda.com/productos/ls2-ff352"
    };

    // 3. Simulamos el vector que te devolvería OpenAI (en la realidad, aquí llamarías a la API de OpenAI)
    // Rellenamos un array con 1536 números aleatorios solo para que el código funcione en este ejemplo
    const vectorOpenAI = Array.from({ length: 1536 }, () => Math.random() * 0.1); 

    // 4. Transformamos el array de números a un formato de texto [0.1, 0.2, ...] para PostgreSQL
    const vectorString = `[${vectorOpenAI.join(',')}]`;

    // 5. Insertamos en la base de datos usando SQL puro debido a que es un campo Unsupported en Prisma
    await prisma.$executeRaw`
      INSERT INTO document_sections (content, metadata, embedding)
      VALUES (
        ${texto}, 
        ${metadata}::jsonb, 
        ${vectorString}::vector
      )
    `;

    console.log("¡Conocimiento del casco LS2 guardado exitosamente!");
    return { success: true };

  } catch (error) {
    console.error("Error guardando el documento:", error);
    return { success: false, error: "No se pudo guardar el conocimiento" };
  }
}
