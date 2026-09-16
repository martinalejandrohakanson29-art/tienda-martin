/**
 * Pruebas de "la ficha del producto se mira antes de derivar" (conv 4317, 16/09).
 *
 * Pega contra la base (catálogo real), no contra la API del modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-ficha-antes-de-escalar.ts
 *
 * El caso: el cliente venía comprando el "Combo Tapa CDI + Cilindro 120"
 * (grupo 3), ya con la moto y la variante resueltas, y en la misma ráfaga
 * mandó "Corto / La tapa viene completa armada". El modelo llamó
 * `resolver_variante` para el "corto" y `escalar_a_humano` con motivo
 * `consulta_tecnica` para la tapa: nunca ejecutó `consultar_catalogo_y_precios`.
 * La pregunta se fue a la bandeja del equipo en silencio y el cliente se quedó
 * sin respuesta, cuando el dato estaba cargado hace rato.
 *
 * Dos cosas que cuidan estas pruebas:
 *  1. La PREMISA: la ficha del kit del embudo contesta la pregunta. Si alguien
 *     vacía el detalle de la Tapa CDI, el fix deja de servir y hay que saberlo.
 *  2. El GATE: a quién le sirve la ficha y a quién deja derivar derecho. Un
 *     gate demasiado ancho devuelve al bot a inventar sobre precio o stock.
 */
import { debeServirFichaAntesDeEscalar } from "../motor"
import { consultarCatalogoPrecios } from "../herramientas/catalogo-precios"

interface Caso {
    titulo: string
    ok: boolean
}

/** El combo de la conv 4317. */
const GRUPO_COMBO_TAPA = 3

function args(motivo: string) {
    return JSON.stringify({
        kit: "Combo Tapa CDI + Cilindro 120",
        motivo,
        modelo_moto: "Motomel Blitz 110",
        resumen_consulta: "pregunta si la tapa viene completa armada"
    })
}

function gate(extra: Partial<Parameters<typeof debeServirFichaAntesDeEscalar>[0]> = {}) {
    return debeServirFichaAntesDeEscalar({
        nombreHerramienta: "escalar_a_humano",
        argumentosCrudos: args("consulta_tecnica"),
        yaMiroElCatalogo: false,
        fichaYaServida: false,
        kitEmbudoId: GRUPO_COMBO_TAPA,
        packEmbudoId: null,
        ...extra
    })
}

async function main() {
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── 1. La premisa: el dato está en la ficha del kit del embudo ───────────
    const ficha: any = await consultarCatalogoPrecios({ grupo_id: GRUPO_COMBO_TAPA } as never)
    const texto = String(ficha?.mensaje_para_agente ?? "").toLowerCase()

    agregar("la ficha del combo del embudo se encuentra", ficha?.encontrado !== false)
    agregar("y trae la composición con la Tapa CDI 125", texto.includes("tapa cdi 125"))
    agregar(
        "el detalle contesta la pregunta de la conv 4317 ('viene completa armada?')",
        texto.includes("completa") && texto.includes("lista para colocar")
    )

    // ── 2. El gate: el caso de la conv 4317 ─────────────────────────────────
    agregar("una duda técnica sin catálogo consultado recibe la ficha", gate() === true)
    agregar(
        "el motivo con detalle pegado ('consulta_tecnica: ...') también entra",
        gate({ argumentosCrudos: args("consulta_tecnica: la tapa viene armada?") }) === true
    )
    agregar(
        "con el kit en un pack en vez de un grupo también entra",
        gate({ kitEmbudoId: null, packEmbudoId: 5 }) === true
    )

    // ── 3. El gate: lo que tiene que seguir derivando derecho ────────────────
    agregar(
        "si ya miró el catálogo, deriva (el dato de verdad no está)",
        gate({ yaMiroElCatalogo: true }) === false
    )
    agregar(
        "la ficha se sirve UNA sola vez por turno: la segunda deriva",
        gate({ fichaYaServida: true }) === false
    )
    agregar(
        "sin kit en el embudo no hay ficha que servir: deriva",
        gate({ kitEmbudoId: null, packEmbudoId: null }) === false
    )
    for (const motivo of ["precio", "stock", "envio", "reclamo", "moto_no_registrada", "otro"]) {
        agregar(`motivo '${motivo}' deriva derecho, no se contesta con la ficha`, gate({ argumentosCrudos: args(motivo) }) === false)
    }
    agregar(
        "argumentos rotos no disparan la ficha",
        gate({ argumentosCrudos: "{no es json" }) === false
    )
    agregar(
        "otra herramienta no pasa por acá",
        gate({ nombreHerramienta: "consultar_compatibilidad" }) === false
    )

    let fallaron = 0
    for (const c of casos) {
        console.log(`${c.ok ? "OK  " : "FALLA"}  ${c.titulo}`)
        if (!c.ok) fallaron++
    }
    console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
