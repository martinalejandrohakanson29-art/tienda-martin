'use server'

import prisma from '@/lib/prisma';

// 1. Función para conectarnos a tu servidor local de LM Studio
async function obtenerEmbedding1536Local(texto: string): Promise<number[]> {
  try {
    // LM Studio por defecto corre en el puerto 1234 de tu PC
    const response = await fetch('http://localhost:1234/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texto,
        // En LM Studio, si tienes un solo modelo cargado, suele ignorar el nombre, 
        // pero por convención ponemos "local-model".
        model: "local-model", 
      }),
    });

    if (!response.ok) {
      throw new Error('Fallo al conectar con el servidor local de IA');
    }

    const data = await response.json();
    
    // La estructura de respuesta de LM Studio es un clon de OpenAI
    // Esto te devolverá tus 1536 números exactos
    return data.data[0].embedding; 
  } catch (error) {
    console.error("Error obteniendo embedding local:", error);
    throw error;
  }
}

// 2. Función para inyectar el conocimiento en tu base de datos
export async function guardarConocimientoLocal() {
  // Preparamos un texto de ejemplo súper útil para tus clientes
  const texto = "En Revolución Motos realizamos envíos en 24 horas a toda la provincia de Córdoba mediante cadetería propia. Para el resto del país, despachamos por Correo Argentino.";
  const metadata = { categoria: "envios", tipo: "informacion_general" };

  try {
    // Le pedimos a tu GPU de 16GB que convierta el texto en los 1536 números
    const embeddingVector = await obtenerEmbedding1536Local(texto);

    // Convertimos el array a un formato de texto que PostgreSQL entienda
    const vectorString = `[${embeddingVector.join(',')}]`;

    // Guardamos en la base de datos (¡Tu schema en Prisma ya dice vector(1536) así que entra perfecto!)
    await prisma.$executeRaw`
      INSERT INTO document_sections (content, metadata, embedding)
      VALUES (
        ${texto}, 
        ${metadata}::jsonb, 
        ${vectorString}::vector
      )
    `;

    console.log("¡Conocimiento guardado gratis utilizando tu hardware!");
    return { success: true };

  } catch (error) {
    console.error("Error al intentar guardar el conocimiento:", error);
    return { success: false, error: "Fallo en el servidor local" };
  }
}
