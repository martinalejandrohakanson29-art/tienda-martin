"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"

import { MENSAJE_INCOMPATIBILIDAD_DEFAULT, type ChatConfig } from "@/lib/chat-config-constants"
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
    }
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
