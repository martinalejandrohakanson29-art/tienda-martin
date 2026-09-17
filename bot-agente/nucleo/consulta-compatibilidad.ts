import { normalizarTexto } from "./texto"
import { resolverMoto } from "./motos"
import { composicionDelKitPedido } from "../herramientas/compatibilidad"
import type { HerramientaEjecutadaInfo } from "../tipos"

/** La negativa pertenece a una pareja moto/producto, nunca a toda la moto. */
export async function mismaConsultaCompatibilidad(
    anterior: { moto: string; kit: string } | null | undefined,
    actual: { moto: string; kit: string }
): Promise<boolean> {
    if (!anterior?.moto || !anterior.kit || !actual.moto || !actual.kit) return false
    if (normalizarTexto(anterior.moto) !== normalizarTexto(actual.moto)) {
        const [a, b] = await Promise.all([resolverMoto(anterior.moto), resolverMoto(actual.moto)])
        if (!a.modelo || !b.modelo || a.modelo.id !== b.modelo.id) return false
    }
    if (normalizarTexto(anterior.kit) === normalizarTexto(actual.kit)) return true
    const [a, b] = await Promise.all([composicionDelKitPedido(anterior.kit), composicionDelKitPedido(actual.kit)])
    return a.resuelto && b.resuelto && a.packIds.size > 0 && a.packIds.size === b.packIds.size &&
        [...a.packIds].every((id) => b.packIds.has(id))
}

/** Un veredicto puede ser positivo o negativo; resolver solo un precio no es un veredicto. */
export function tieneVeredictoCompatibilidad(herramientas: HerramientaEjecutadaInfo[]): boolean {
    return herramientas.some((ej) =>
        (ej.nombre === "consultar_compatibilidad" && ej.resultado?.encontrado === true && typeof ej.resultado?.compatible === "boolean") ||
        (ej.nombre === "resolver_variante" && ej.resultado?.escalar !== true && (!!ej.resultado?.moto_confirmada || ej.resultado?.incompatible === true))
    )
}
