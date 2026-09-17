/**
 * Pruebas de "la ficha no espera a la variante" en `resolver_variante`.
 *
 * Pega contra la base (catálogo y compatibilidad reales), no contra la API del
 * modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-ficha-no-espera-variante.ts
 *
 * Contexto (conv 4401, 17/09): el cliente entró por dos anuncios, el bot le
 * preguntó cuál kit le interesaba, le listó los tres combos con 120 y el
 * cliente contestó "El primero / Cuanto cuesta". El modelo fue derecho a
 * `resolver_variante` — nunca volvió a `consultar_catalogo_y_precios`, que era
 * el único lugar donde vivía el PASO 2 — y lo único que salió fue "Sabés si tu
 * moto es recorrido corto o largo?". La ficha con la foto y los precios no se
 * mandó nunca: al turno siguiente el combo ya figuraba como YA PRESENTADO y
 * quedó prohibido mandarla.
 *
 * Criterio de la casa: elegido el kit, la presentación sale YA, sin esperar el
 * recorrido. Lo que cuidan estas pruebas además del caso: que la ficha NO se
 * repita cuando el cliente ya la recibió, y que no se cuele en los caminos que
 * derivan en silencio.
 */
import { resolverVariante } from "../herramientas/resolver-variante"

interface Caso {
    titulo: string
    ok: boolean
}

const COMBO_120 = "Combo 110 a 120 + Codo y carburador"
const GRUPO_120 = 1

function embudo(extra: Record<string, unknown> = {}) {
    return {
        charlaEnCurso: true,
        grupoPineadoId: null,
        motoConfirmada: null,
        motoDelMensaje: null,
        motoMencionada: null,
        repreguntasMoto: 0,
        packPresentadoId: null,
        varianteResuelta: null,
        varianteResueltaEnTurno: null,
        ...extra
    }
}

async function main() {
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── El caso de la conv 4401: eligió el combo del menú, falta el recorrido ──
    const elegido: any = await resolverVariante({
        combo: COMBO_120,
        mensaje_cliente: "El primero (Combo 110 a 120 + Codo y carburador)",
        modelo_moto: "DLX 110",
        __embudo: embudo() as never
    } as never)

    agregar(
        "con el combo recién elegido, la guía manda la ficha antes que nada",
        typeof elegido.mensaje_para_agente === "string" &&
            elegido.mensaje_para_agente.includes("FICHA TODAVÍA NO ENTREGADA")
    )
    agregar(
        "la ficha que viaja es la oficial del catálogo (sus viñetas y precios)",
        typeof elegido.mensaje_para_agente === "string" &&
            elegido.mensaje_para_agente.includes("👉🏼 Recorrido corto: $99.000")
    )
    agregar("la foto de la ficha viaja en el resultado", !!elegido.foto_url)
    agregar(
        "los precios viajan para que el motor confirme que el mensaje es de este kit",
        Array.isArray(elegido.precios_ficha) && elegido.precios_ficha.includes(99000)
    )
    agregar(
        "y el paso sigue pidiendo el recorrido (la ficha no reemplaza la pregunta)",
        typeof elegido.pregunta_directa === "string" && elegido.pregunta_directa.length > 0
    )

    // ── Ya la vio: no se repite ni vuelve a salir la foto ────────────────────
    const yaPresentado: any = await resolverVariante({
        combo: COMBO_120,
        mensaje_cliente: "El primero",
        modelo_moto: "DLX 110",
        __embudo: embudo({ grupoPineadoId: GRUPO_120 }) as never
    } as never)

    agregar(
        "con el combo ya presentado NO se vuelve a mandar la ficha",
        !yaPresentado.mensaje_para_agente?.includes("FICHA TODAVÍA NO ENTREGADA")
    )
    agregar("con el combo ya presentado no sale la foto de nuevo", !yaPresentado.foto_url)

    // -- Ya se la mostro a mano (sin pinear): tampoco se repite --------------
    const dichaSinPinear: any = await resolverVariante({
        combo: COMBO_120,
        mensaje_cliente: "recorrido corto",
        modelo_moto: "DLX 110",
        __embudo: embudo({
            textoPreviosDelBot:
                "Dale! El combo 110 a 120 + codo y carburador:\n\u{1F449}\u{1F3FC} Recorrido corto\n\u{1F449}\u{1F3FC} Recorrido largo\n\nA que moto se lo queres poner?"
        }) as never
    } as never)

    agregar(
        "si el bot ya le mostro las dos opciones, la ficha no se repite aunque nada este pineado",
        !dichaSinPinear.mensaje_para_agente?.includes("FICHA TODAVÍA NO ENTREGADA") && !dichaSinPinear.foto_url
    )

    // ── La variante resuelta en el mismo mensaje también estrena la ficha ────
    const conVariante: any = await resolverVariante({
        combo: COMBO_120,
        mensaje_cliente: "recorrido corto",
        modelo_moto: "DLX 110",
        __embudo: embudo() as never
    } as never)

    agregar(
        "si resuelve la variante y la ficha nunca salió, igual la manda",
        conVariante.resuelta === true &&
            conVariante.mensaje_para_agente?.includes("FICHA TODAVÍA NO ENTREGADA")
    )

    // ── Camino que deriva en silencio: la ficha no se cuela ──────────────────
    const derivado: any = await resolverVariante({
        combo: COMBO_120,
        mensaje_cliente: "para una vespa primavera 946",
        modelo_moto: "vespa primavera 946",
        __embudo: embudo() as never
    } as never)

    agregar(
        "un camino que escala no arrastra la ficha ni la foto",
        derivado.resuelta === false &&
            !derivado.foto_url &&
            !derivado.mensaje_para_agente?.includes("FICHA TODAVÍA NO ENTREGADA")
    )

    let fallos = 0
    for (const c of casos) {
        console.log(`${c.ok ? "✅" : "❌"} ${c.titulo}`)
        if (!c.ok) fallos++
    }
    console.log(`\n${casos.length - fallos}/${casos.length} OK`)
    process.exit(fallos > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
