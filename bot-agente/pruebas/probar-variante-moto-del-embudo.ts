/**
 * Pruebas del chequeo de moto en `resolver_variante` cuando la moto la trae el
 * EMBUDO y no el argumento del modelo.
 *
 * Pega contra la base (catálogo y compatibilidad reales), no contra la API del
 * modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-variante-moto-del-embudo.ts
 *
 * Contexto (conv 4342, 16/09): el cliente entró por el anuncio del "Combo
 * Escape pwr + Leva 6.40" (un combo para 110) y dijo "Para una moto 150". Eso
 * no es marca ni modelo, así que el modelo dejó `modelo_moto` vacío — pero el
 * motor SÍ la resolvió y la dejó en `__embudo.motoDelMensaje`. El chequeo de la
 * moto miraba solo `args.modelo_moto` y `__embudo.motoConfirmada`: con los dos
 * vacíos no corría, y el bot le preguntó la medida de la leva de un combo que a
 * esa moto no le entra. Lo tuvo que cortar un humano con `/bot off`.
 *
 * Es el fix de la cilindrada sin marca (15/09) que no había llegado a esta
 * rama: el dato ya viajaba en el embudo, esta herramienta no lo leía.
 *
 * Lo que cuidan además del caso: que la moto del embudo NO se invente cuando no
 * hay ninguna, y que una moto que sí es compatible siga resolviendo la variante
 * como antes (el fix no puede volverse un freno para las charlas sanas).
 */
import { resolverVariante } from "../herramientas/resolver-variante"

interface Caso {
    titulo: string
    ok: boolean
}

const COMBO_110 = "Combo Escape pwr + Leva 6.40"

function embudo(extra: Record<string, unknown> = {}) {
    return {
        grupoPineadoId: 2,
        motoConfirmada: null,
        motoDelMensaje: null,
        motoMencionada: null,
        repreguntasMoto: 0,
        packPresentadoId: null,
        varianteResuelta: null,
        ...extra
    }
}

async function main() {
    const casos: Caso[] = []
    const agregar = (titulo: string, ok: boolean) => casos.push({ titulo, ok })

    // ── El caso de la conv 4342 ──────────────────────────────────────────────
    const r150: any = await resolverVariante({
        combo: COMBO_110,
        mensaje_cliente: "Para una moto 150",
        __embudo: embudo({ motoDelMensaje: "150", motoMencionada: "150" })
    } as never)

    agregar(
        "la moto del embudo dispara el chequeo (no se pregunta la leva)",
        !r150.pregunta_directa
    )
    agregar(
        "y ordena escalar en vez de seguir el embudo",
        String(r150.mensaje_para_agente ?? "").includes("escalar_a_humano")
    )
    agregar("el motivo es moto_no_registrada", String(r150.mensaje_para_agente ?? "").includes("moto_no_registrada"))
    agregar("la variante NO queda resuelta", r150.resuelta === false)

    // ── Sin moto por ningún lado: la charla sigue como siempre ───────────────
    const rSinMoto: any = await resolverVariante({
        combo: COMBO_110,
        mensaje_cliente: "cuanto sale?",
        __embudo: embudo()
    } as never)
    agregar(
        "sin moto en el embudo se sigue preguntando la variante",
        Boolean(rSinMoto.pregunta_directa) && !String(rSinMoto.mensaje_para_agente ?? "").includes("escalar_a_humano")
    )

    // ── El argumento explícito del modelo manda igual que antes ──────────────
    const rArg: any = await resolverVariante({
        combo: COMBO_110,
        mensaje_cliente: "tengo una 150",
        modelo_moto: "150",
        __embudo: embudo()
    } as never)
    agregar(
        "con modelo_moto explícito el resultado es el mismo",
        String(rArg.mensaje_para_agente ?? "").includes("escalar_a_humano")
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
