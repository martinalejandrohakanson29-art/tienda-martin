"use server"

/**
 * Envoltorio con permisos de la prueba de kit. La lógica vive en
 * `lib/prueba-kit.ts` para que también se pueda correr desde la línea de
 * comandos (`npm run kit:probar`), donde no hay sesión.
 */

import { requireAdmin } from "@/lib/auth-guard"
import { probarKitConBot as correrPrueba, type ResultadoPruebaKit, type TurnoPrueba } from "@/lib/prueba-kit"

export type { ResultadoPruebaKit, TurnoPrueba }

export async function probarKitConBot(packId: number): Promise<ResultadoPruebaKit> {
    await requireAdmin()
    return correrPrueba(packId)
}
