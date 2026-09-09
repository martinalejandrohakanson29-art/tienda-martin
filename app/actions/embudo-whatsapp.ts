"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { calcularEmbudoWhatsapp, type EmbudoWhatsapp } from "@/lib/embudo-whatsapp"

export type { EmbudoWhatsapp, EtapaCorte, FilaEmbudoKit, ConversacionEmbudo } from "@/lib/embudo-whatsapp"

/**
 * Embudo de las consultas de WhatsApp abierto por kit, para la pestaña de
 * /admin/instagram. Toda la lógica vive en lib/embudo-whatsapp.ts.
 */
export async function obtenerEmbudoWhatsapp(dias = 15): Promise<EmbudoWhatsapp> {
    await requireAdmin()
    return calcularEmbudoWhatsapp(dias)
}
