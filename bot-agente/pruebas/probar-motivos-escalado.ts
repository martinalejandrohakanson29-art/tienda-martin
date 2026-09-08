/**
 * Chequeo del ruteo motivo -> bandeja de pendientes.
 *
 *   npx tsx bot-agente/pruebas/probar-motivos-escalado.ts
 *
 * Incluye los motivos que el modelo inventó en producción antes de que la
 * herramienta declarara el enum: tienen que seguir cayendo bien.
 */
import { clasificarMotivoEscalado } from "../nucleo/motivos-escalado"
const casos: [string, string][] = [
    ["producto_sin_catalogo", "precio"],
    ["producto_no_encontrado", "precio"],
    ["producto_no_catalogado", "precio"],
    ["consulta_precio", "precio"],
    ["stock", "precio"],
    ["moto_no_registrada", "tecnica"],
    ["moto_no_registrada: Zanella fx150", "tecnica"],
    ["compatibilidad_dudosa", "tecnica"],
    ["consulta_tecnica", "tecnica"],
    ["pieza_no_catalogada", "precio"],
    ["mayorista", "negocio"],
    ["envio", "negocio"],
    ["reclamo", "negocio"],
    ["pago", "negocio"],
    ["horarios", "negocio"],
    ["ambiguo", "sin_match"],
    ["otro", "sin_match"],
    ["respuesta_no_confiable", "sin_match"],
    ["limite_pasos_react_superado", "sin_match"],
    ["escalado_piloto_tiempo_real", "sin_match"],
    ["entrante_pendiente_sin_resolver", "sin_match"],
    ["", "sin_match"],
    ["cualquier_cosa_rara", "sin_match"],
]
let fallos = 0
for (const [motivo, esperado] of casos) {
    const real = clasificarMotivoEscalado(motivo)
    const ok = real === esperado
    if (!ok) fallos++
    console.log(`${ok ? "OK  " : "FALLA"} ${motivo.padEnd(34)} -> ${real}${ok ? "" : ` (esperado ${esperado})`}`)
}
console.log(fallos === 0 ? "\nTodos OK" : `\n${fallos} fallos`)
