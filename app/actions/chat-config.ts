"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

import { MENSAJE_INCOMPATIBILIDAD_DEFAULT, COSTO_ENVIO_SUELTAS_DEFAULT, type ChatConfig } from "@/lib/chat-config-constants"
export type { ChatConfig }

const RUTA = "/admin/chatwoot/catalogo"

export async function getChatConfig(): Promise<ChatConfig> {
    await requireAdmin()
    const filas = await prisma.$queryRaw<{ clave: string; valor: string }[]>`
        SELECT clave, valor FROM chat_config
    `
    const mapa = new Map(filas.map((f) => [f.clave, f.valor]))
    return {
        mensajeIncompatibilidad: mapa.get("mensaje_incompatibilidad") ?? MENSAJE_INCOMPATIBILIDAD_DEFAULT,
        costoEnvioSueltas: parsearCostoEnvio(mapa.get("costo_envio_sueltas")),
    }
}

/** "" / basura / <= 0 son todos "sin cargar": el bot no puede decir un monto. */
function parsearCostoEnvio(valor: string | undefined): number | null {
    if (valor == null) return COSTO_ENVIO_SUELTAS_DEFAULT
    const n = Number(String(valor).replace(/[^\d.-]/g, ""))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/**
 * Un único costo de envío para todas las piezas sueltas que no van gratis.
 * Vacío o 0 lo borra: el bot vuelve a decir "el envío corre por tu cuenta" sin
 * monto, que es el estado seguro.
 */
export async function guardarCostoEnvioSueltas(monto: string) {
    const session = await requireAdmin()
    const limpio = monto.trim()
    const valor = limpio === "" ? "" : String(Math.round(Number(limpio.replace(/[^\d.-]/g, ""))))
    if (limpio !== "" && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) {
        throw new Error("El costo de envío tiene que ser un número.")
    }

    const autor = session.user?.email ?? session.user?.name ?? "admin"
    await prisma.$executeRaw`
        INSERT INTO chat_config (clave, valor, actualizado_por, actualizado_en)
        VALUES ('costo_envio_sueltas', ${valor}, ${autor}, now())
        ON CONFLICT (clave)
        DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()
    `
    revalidatePath(RUTA)
    return { ok: true, valor: parsearCostoEnvio(valor) }
}

export async function guardarMensajeIncompatibilidad(texto: string) {
    const session = await requireAdmin()
    const valor = texto.trim()
    if (!valor) throw new Error("El mensaje no puede quedar vacío.")
    if (valor.length > 500) throw new Error("El mensaje es demasiado largo (máx. 500 caracteres).")

    const autor = session.user?.email ?? session.user?.name ?? "admin"
    await prisma.$executeRaw`
        INSERT INTO chat_config (clave, valor, actualizado_por, actualizado_en)
        VALUES ('mensaje_incompatibilidad', ${valor}, ${autor}, now())
        ON CONFLICT (clave)
        DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()
    `
    revalidatePath(RUTA)
    return { ok: true, valor }
}
