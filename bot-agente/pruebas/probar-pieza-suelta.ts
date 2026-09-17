/**
 * Pruebas del arreglo "vendes levas solas" (conv 4394, 16/09).
 *
 * Pega contra la base real (el catalogo y las piezas sueltas salen de ahi), no
 * contra la API del modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-pieza-suelta.ts
 *
 * Que paso: el cliente entro por el anuncio del Kit 170 y pregunto "Vendes
 * levas solas". El modelo busco `leva`, el termino pego con los TRES combos que
 * llevan leva en el nombre y la herramienta devolvio el menu del PASO 1
 * ("identifica el kit", "PROHIBIDO dar precios"), sin una sola linea de las
 * piezas sueltas. Sin dato, el bot invento la politica de la casa: "Las levas
 * las damos dentro de los kits, no como pieza suelta". Las damos sueltas: hay
 * tres levas activas en chat_articulos con el alias "leva sola" cargado.
 *
 * Se prueban las dos capas:
 *   1. la herramienta ahora le pasa la pieza suelta con precio, envio e ID;
 *   2. el backstop del motor, que veta esa frase aunque la guia falle.
 */
import { consultarCatalogoPrecios } from "../herramientas/catalogo-precios"
import { oracionesQueNieganVentaSuelta, quitarOraciones } from "../guardrails/sanitizador"
import { piezaQueVendemosSuelta } from "../nucleo/venta-suelta"

/** Kit 170 varillero + leva: el pack del anuncio por el que entro el cliente. */
const PACK_170 = 11

let fallaron = 0
const chequear = (ok: boolean, titulo: string, detalle = "") => {
    if (!ok) fallaron++
    console.log(`${ok ? "OK   " : "FALLA"}  ${titulo}${detalle ? `  · ${detalle}` : ""}`)
}

async function probarCatalogo() {
    console.log("\n── La herramienta le pasa la pieza suelta al modelo ──")

    // Tal cual salio el turno real: termino "leva" y el pack 170 ya presentado.
    const r = await consultarCatalogoPrecios({
        termino_busqueda: "leva",
        __embudo: { packPresentadoId: PACK_170 }
    } as any)
    const guia = r.mensaje_para_agente

    chequear(r.encontrado, "el termino 'leva' sigue encontrando los combos")
    chequear(
        /PIEZAS SUELTAS DEL CAT[ÁA]LOGO/.test(guia),
        "aparece el bloque de piezas sueltas",
        "antes el menu de kits era todo lo que recibia el modelo"
    )
    chequear(/Leva de calle 7\.80/.test(guia), "nombra la leva del kit por el que entro el cliente")
    chequear(/\$25\.000/.test(guia), "con su precio")
    chequear(/ID Art\. 18/.test(guia), "con el ID para cotizar_piezas_sueltas")
    chequear(
        /el kit por el que entr[óo] el cliente/.test(guia),
        "marca cual es la del anuncio",
        "para no abrirle las tres levas del catalogo"
    )
    chequear(
        /S[ÍI] se venden por separado/.test(guia),
        "le prohibe explicitamente negar la venta suelta"
    )
    chequear(
        !/Tu [úu]nico objetivo es que elija/.test(guia),
        "el menu deja de ser el unico objetivo del turno"
    )
    // El cilindro esta en el mismo kit, pero el cliente no lo nombro: la palabra
    // distintiva "leva" lo tiene que dejar afuera.
    chequear(!/Cilindro 170 varillero: \$/.test(guia), "no le vuelca las otras piezas del kit")

    // La contracara: quien pregunta por el KIT no tiene que ver precios sueltos.
    const kit = await consultarCatalogoPrecios({ termino_busqueda: "kit 120" } as any)
    chequear(
        !/PIEZAS SUELTAS DEL CAT[ÁA]LOGO/.test(kit.mensaje_para_agente),
        "'kit 120' no abre el bloque de piezas sueltas",
        "una cilindrada sola no es nombrar una pieza"
    )
}

async function probarBackstop() {
    console.log("\n── El backstop veta la frase aunque la guia falle ──")

    const CASOS: { texto: string; veta: boolean; nota: string }[] = [
        {
            texto: "Las levas las damos dentro de los kits, no como pieza suelta.",
            veta: true,
            nota: "la frase exacta de la conv 4394"
        },
        { texto: "No vendemos el cilindro suelto.", veta: true, nota: "negacion directa" },
        { texto: "El escape no se vende por separado.", veta: true, nota: "por separado" },
        { texto: "La leva solo va dentro del kit.", veta: true, nota: "exclusividad en positivo" },
        { texto: "El carburador unicamente en combo.", veta: true, nota: "exclusividad sin verbo" },

        // Lo que NO se puede tocar: verdades sobre la composicion del kit.
        { texto: "El piston viene dentro del kit, no hay que comprarlo aparte.", veta: false, nota: "dice que SI viene incluido" },
        { texto: "La leva ya viene incluida en el combo.", veta: false, nota: "afirmacion positiva" },
        { texto: "El kit no trae la corona de distribucion.", veta: false, nota: "que no venga incluida no es negar venderla sola" },
        { texto: "No tenemos stock de amortiguadores.", veta: false, nota: "no es una pieza del catalogo" },
        { texto: "Dale, te lo mando solo a vos.", veta: false, nota: "'solo' que no habla de venta suelta" }
    ]

    for (const c of CASOS) {
        const oraciones = oracionesQueNieganVentaSuelta(c.texto)
        const vetadas: string[] = []
        for (const o of oraciones) {
            if (await piezaQueVendemosSuelta(o)) vetadas.push(o)
        }
        chequear(vetadas.length > 0 === c.veta, JSON.stringify(c.texto), c.nota)
    }

    const conRelleno = "Las levas las damos dentro de los kits, no como pieza suelta. Hacemos envios a todo el pais."
    const limpio = quitarOraciones(conRelleno, oracionesQueNieganVentaSuelta(conRelleno))
    chequear(
        limpio === "Hacemos envios a todo el pais.",
        "se cae la oracion falsa y sobrevive el resto del mensaje",
        JSON.stringify(limpio)
    )
}

async function main() {
    await probarCatalogo()
    await probarBackstop()
    console.log(`\n${fallaron === 0 ? "TODO OK" : `${fallaron} FALLA(S)`}`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
