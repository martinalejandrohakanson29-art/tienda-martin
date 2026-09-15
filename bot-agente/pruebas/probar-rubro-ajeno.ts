/**
 * Pruebas del rubro ajeno: el cliente pide algo que no vendemos y esa consulta
 * se deriva al equipo en silencio, sin que el bot salga a buscar otra cosa.
 *
 * Pega contra la base (el vocabulario sale del catálogo real), no contra la API
 * del modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-rubro-ajeno.ts
 *
 * Contexto (conv 4206, 15/09): "Un kit de potenciación / Y un kit de
 * electricidad tendrías?". El catálogo no matcheó "electricidad", la guía le
 * dejaba al modelo la opción de reintentar y el modelo reintentó SIN término:
 * la llamada que no pasa por el scorer y devuelve todos los kits activos. A una
 * 110 DLX le terminó ofreciendo el kit dakar 200 y el 220.
 *
 * Lo que cuidan además del caso: que "ajeno" no se coma lo que sí vendemos. El
 * rubro del negocio (potenciación, escape, leva, tapa cdi) y los modelos de
 * moto tienen que seguir siendo vocabulario conocido.
 */
import { clasificarTerminoSinMatch, limpiarCacheRubros } from "../nucleo/rubros"
import { consultarCatalogoPrecios } from "../herramientas/catalogo-precios"

interface Caso {
    titulo: string
    ok: boolean
}

async function main() {
    limpiarCacheRubros()
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── El clasificador ───────────────────────────────────────────────────────
    // Rubros que no trabajamos: la consulta es del equipo.
    for (const termino of ["electricidad", "kit de electricidad", "frenos", "suspension", "espejos", "cubiertas"]) {
        agregar(`'${termino}' es de otro rubro`, (await clasificarTerminoSinMatch(termino)) === "ajeno")
    }
    // Lo nuestro, aunque el scorer no lo haya matcheado, conserva el reintento.
    for (const termino of ["kit potenciacion", "potenciacion", "escape", "tapa cdi", "carburador", "leva 6.40"]) {
        agregar(`'${termino}' es vocabulario nuestro`, (await clasificarTerminoSinMatch(termino)) === "conocido")
    }
    // La moto del cliente NUNCA es un rubro ajeno: tiene su propio guard.
    for (const termino of ["wave", "rouser", "smash 110"]) {
        agregar(`'${termino}' (moto) no se declara ajeno`, (await clasificarTerminoSinMatch(termino)) !== "ajeno")
    }
    // Sin nada que clasificar, el detector se abstiene.
    agregar("un número suelto no se clasifica", (await clasificarTerminoSinMatch("200")) === "indefinido")
    agregar("término vacío no se clasifica", (await clasificarTerminoSinMatch("")) === "indefinido")

    // ── La herramienta ────────────────────────────────────────────────────────
    const ajeno = await consultarCatalogoPrecios({ termino_busqueda: "kit de electricidad" })
    agregar("el rubro ajeno no encuentra nada", ajeno.encontrado === false)
    agregar("el rubro ajeno queda marcado para el motor", Boolean(ajeno.rubro_ajeno))
    agregar("la guía ordena escalar", /escalar_a_humano/.test(ajeno.mensaje_para_agente))
    agregar(
        "la guía prohíbe volver a buscar",
        /PROHIBIDO volver a llamar a consultar_catalogo_y_precios/.test(ajeno.mensaje_para_agente)
    )
    agregar(
        "la guía deja contestar el resto de la ráfaga",
        /NO respondas SIN_RESPUESTA/.test(ajeno.mensaje_para_agente)
    )

    // Un término nuestro sin match sigue pudiendo reintentar, pero con término.
    const conocido = await consultarCatalogoPrecios({ termino_busqueda: "cilindro 999 turbo" })
    agregar("el término con vocabulario nuestro no se marca ajeno", !conocido.rubro_ajeno)

    // ── El guard del volcado ──────────────────────────────────────────────────
    const volcado = await consultarCatalogoPrecios({ __hubo_sin_match: true })
    agregar("tras un no-match, el catálogo entero no se lista", volcado.encontrado === false)
    agregar("y no vuelve ni un pack", volcado.packs.length === 0 && volcado.grupos.length === 0)

    // La puerta trasera: un término hecho solo de stop-words ("kit", "combo")
    // limpia a la cadena vacía, que está incluida en TODOS los nombres — le da
    // 500 puntos a cada item y devuelve el catálogo entero esquivando el guard.
    const puertaTrasera = await consultarCatalogoPrecios({ termino_busqueda: "kit", __hubo_sin_match: true })
    agregar("'kit' pelado no esquiva el guard del volcado", puertaTrasera.encontrado === false)
    const puertaTrasera2 = await consultarCatalogoPrecios({ termino_busqueda: "combo kit", __hubo_sin_match: true })
    agregar("'combo kit' tampoco", puertaTrasera2.encontrado === false)
    // Pero sin no-match previo, "kit" sigue siendo un pedido genérico válido.
    const genericoConStopWord = await consultarCatalogoPrecios({ termino_busqueda: "kit" })
    agregar("'kit' sin no-match previo sigue listando el catálogo", genericoConStopWord.encontrado === true)

    // El pedido genérico legítimo (sin no-match previo) sigue funcionando igual.
    const generico = await consultarCatalogoPrecios({})
    agregar(
        "el pedido genérico normal sigue devolviendo el catálogo",
        generico.encontrado === true && generico.packs.length + generico.grupos.length > 0
    )
    // Y un pedido puntual sigue resolviéndose aunque antes hubo un no-match:
    // lo que se cierra es el volcado, no la herramienta.
    const puntual = await consultarCatalogoPrecios({ termino_busqueda: "kit 120", __hubo_sin_match: true })
    agregar("tras un no-match, una búsqueda con término sigue viva", puntual.encontrado === true)

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
