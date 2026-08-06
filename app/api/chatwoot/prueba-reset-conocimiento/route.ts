import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

// Botón "Reiniciar conocimiento" en /admin/chatwoot/prueba: borra TODO lo que
// el bot fue aprendiendo/guardando en Postgres, para poder repetir un mismo
// caso de prueba (escalar -> el equipo responde -> el bot aprende) desde cero,
// en vez de que la segunda vez la respuesta salga de la caché de conocimiento.
//
// OJO: esto usa la MISMA base que el bot en producción (no hay una separada
// para pruebas), así que además del historial de conversaciones también borra
// compatibilidades/info_negocio/precios_stock enteros, sin distinguir qué fila
// vino de una prueba y cuál de un cliente real. Mientras esa distinción no
// exista, este botón es "todo o nada".
export async function DELETE() {
    try {
        await requireAdmin();

        const resultados = await prisma.$transaction([
            prisma.$executeRaw`DELETE FROM compatibilidades`,
            prisma.$executeRaw`DELETE FROM info_negocio`,
            prisma.$executeRaw`DELETE FROM precios_stock`,
            prisma.$executeRaw`DELETE FROM preguntas_tecnicas_pendientes`,
            prisma.$executeRaw`DELETE FROM preguntas_negocio_pendientes`,
            prisma.$executeRaw`DELETE FROM preguntas_precio_pendientes`,
            prisma.$executeRaw`DELETE FROM conversaciones_historial`,
        ]);

        return NextResponse.json({ success: true, filasBorradas: resultados.reduce((a, b) => a + b, 0) });
    } catch (error) {
        const noAutorizado = error instanceof Error && error.message === "No autorizado";
        return NextResponse.json(
            { error: noAutorizado ? "No autorizado" : error instanceof Error ? error.message : "Error interno del servidor" },
            { status: noAutorizado ? 401 : 500 }
        );
    }
}
