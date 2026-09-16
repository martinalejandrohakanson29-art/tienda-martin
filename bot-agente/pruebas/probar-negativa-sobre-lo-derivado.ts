/**
 * Pruebas del backstop "no cierro yo el tema que acabo de derivar".
 *
 * Corre sin API del modelo (el guardrail es texto puro) y toca la base solo
 * para el chequeo del catálogo del final:
 *
 *   npx tsx bot-agente/pruebas/probar-negativa-sobre-lo-derivado.ts
 *
 * Contexto (conv 4301, 16/09): el cliente entró por el anuncio del combo Tapa
 * CDI + Cilindro 120 y escribió "quiero saber sobre el combo y aparte todo el
 * kit / con carbu y todos los chinches". El bot hizo bien lo difícil —buscó
 * nueve veces en el catálogo, no encontró un kit con carburador y lo derivó al
 * equipo— y después, en el MISMO mensaje, cerró el tema solo: "El carburador y
 * esos chiches van aparte, no vienen incluidos".
 *
 * Las dos cosas están mal juntas: el escalado existe porque NO sabemos, y el
 * kit con carburador existe (el grupo 1 lo trae). Una búsqueda sin match no es
 * prueba de que no lo vendamos.
 */
import { quitarNegativaSobreLoDerivado } from "../guardrails/sanitizador"
import { consultarCatalogoPrecios } from "../herramientas/catalogo-precios"

interface Caso {
    titulo: string
    ok: boolean
}

async function main() {
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── El caso real ──────────────────────────────────────────────────────────
    const derivados = ["kit con carburador", "carburador", "combo completo"]
    const respuestaReal =
        "El combo trae la Tapa CDI 125 completa (con válvulas, leva tipo wave y las 2 coronitas de distribución de regalo) + el Cilindro 120. El carburador y esos chiches van aparte, no vienen incluidos."
    const limpio = quitarNegativaSobreLoDerivado(respuestaReal, derivados)
    agregar("la negativa sobre el carburador se cae", !/carburador/i.test(limpio))
    agregar("lo que sí sabemos del combo se conserva", /Tapa CDI 125/.test(limpio) && /Cilindro 120/.test(limpio))

    // Variantes de la misma negativa, todas sobre lo derivado.
    for (const frase of [
        "El carburador no viene incluido.",
        "El carburador va aparte.",
        "El carburador se vende por separado.",
        "No tenemos el kit con carburador.",
        "Ese carburador no está incluido en el combo.",
    ]) {
        agregar(`se cae: "${frase}"`, quitarNegativaSobreLoDerivado(frase, derivados) === "")
    }

    // ── Lo que NO se puede comer ──────────────────────────────────────────────
    // Negativa sobre OTRA cosa: es respuesta legítima al resto de la ráfaga.
    agregar(
        "la negativa sobre otra pieza se conserva",
        quitarNegativaSobreLoDerivado("El combo no trae la leva.", ["kit 250"]) === "El combo no trae la leva."
    )
    // Sin nada derivado el guardrail no toca nada (se llama solo con escalado
    // parcial, pero la función tiene que ser inocua igual).
    agregar(
        "sin términos derivados no se toca el texto",
        quitarNegativaSobreLoDerivado("El carburador va aparte.", []) === "El carburador va aparte."
    )
    // Una afirmación en positivo sobre lo derivado tampoco es una negativa.
    agregar(
        "lo afirmativo sobre lo derivado se conserva",
        quitarNegativaSobreLoDerivado("El kit con carburador sale $99.000.", derivados) ===
            "El kit con carburador sale $99.000."
    )
    agregar("texto vacío no rompe", quitarNegativaSobreLoDerivado("", derivados) === "")

    // ── La raíz del caso: ese kit SÍ está en el catálogo ──────────────────────
    // Se llamaba "Kit 120 para 110" y "carburador" le daba cero. Con el nombre
    // nuevo ("Combo 110 a 120 + Codo y carburador") el bot llega solo y ni
    // siquiera necesita derivar.
    for (const termino of ["carburador", "kit con carburador", "todo el kit con carbu y todos los chiches"]) {
        const r = await consultarCatalogoPrecios({ termino_busqueda: termino })
        agregar(
            `'${termino}' encuentra el combo con carburador`,
            r.encontrado === true && (r.grupos || []).some((g) => /carburador/i.test(g.nombre))
        )
    }

    // ── Resultado ─────────────────────────────────────────────────────────────
    let fallaron = 0
    for (const c of casos) {
        console.log(`${c.ok ? "✅" : "❌"} ${c.titulo}`)
        if (!c.ok) fallaron++
    }
    console.log(`\n${casos.length - fallaron}/${casos.length} OK`)
    process.exit(fallaron > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
