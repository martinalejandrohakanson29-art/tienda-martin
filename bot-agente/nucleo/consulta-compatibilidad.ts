import { normalizarTexto } from "./texto"
import { resolverMoto } from "./motos"
import { composicionDelKitPedido, consultarCompatibilidad } from "../herramientas/compatibilidad"
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

/**
 * ¿Al menos uno de estos productos le va a esa moto? (consulta determinista)
 *
 * El menú del Paso 1 no afirma nada —pregunta cuál de las opciones busca— así
 * que prohibirlo cada vez que hay una moto en juego sin compatibilidad
 * consultada sale carísimo: deriva toda consulta "cuánto sale el kit 120 para
 * mi Smash?" en la que el modelo no chequee primero, y la tasa de escalados es
 * la métrica que decide (ver §10 de AGENTS.md).
 *
 * Lo que sí es una afirmación es el menú cuando NINGUNA de las opciones le
 * entra: invitarlo a elegir entre tres kits que no le van es decirle que
 * alguno le sirve. Y eso el motor no necesita preguntárselo al modelo: es un
 * dato duro, la misma tabla que consulta la herramienta, sin LLM y sin costo.
 *
 * Alcanza con UNO compatible: el Paso 1 es justamente para que elija, y los
 * que no le van se descartan cuando elige (ahí sí corre la compat del combo
 * elegido). "Sin dato" cuenta como que no le va, que es el lado conservador.
 */
export async function algunProductoLeVa(moto: string, productos: string[]): Promise<boolean> {
    const nombres = productos.map((p) => (p || "").trim()).filter(Boolean)
    if (!moto.trim() || nombres.length === 0) return false
    const veredictos = await Promise.all(
        nombres.map((kit) =>
            consultarCompatibilidad({ modelo_moto: moto, kit_nombre_o_id: kit }).catch(() => null)
        )
    )
    return veredictos.some((v) => v?.encontrado === true && v.compatible === true)
}

/** Un veredicto puede ser positivo o negativo; resolver solo un precio no es un veredicto. */
export function tieneVeredictoCompatibilidad(herramientas: HerramientaEjecutadaInfo[]): boolean {
    return herramientas.some((ej) =>
        (ej.nombre === "consultar_compatibilidad" && ej.resultado?.encontrado === true && typeof ej.resultado?.compatible === "boolean") ||
        (ej.nombre === "resolver_variante" && ej.resultado?.escalar !== true && (!!ej.resultado?.moto_confirmada || ej.resultado?.incompatible === true))
    )
}
