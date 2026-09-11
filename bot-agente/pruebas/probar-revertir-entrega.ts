/**
 * Pruebas de la reversión de estado cuando un turno NO llega al cliente.
 *
 * Pega contra la base (usa una clave de prueba propia y la borra al final), no
 * contra el modelo ni contra Chatwoot:
 *
 *   npx tsx bot-agente/pruebas/probar-revertir-entrega.ts
 *
 * Contexto (conv 3997, 11/09): el cliente entró por el anuncio, contestó "Ah una
 * keller 110" y mandó "soy de Santiago del Estero" mientras el bot esperaba la
 * cadencia humana. El turno se descartó para recalcularse con la ráfaga entera,
 * pero `moto_confirmada` ya estaba escrita: el recálculo leyó "moto ya
 * confirmada compatible, no consultes compatibilidad de nuevo" y contestó SOLO
 * el envío. La compatibilidad y la pregunta de la leva no volvieron a salir.
 *
 * Lo que se cuida acá: que un turno descartado no deje al estado afirmando que
 * el cliente vio algo que nunca salió, y que el único caso con otro tramo del
 * bot hablando en paralelo (lote reencolado) no pise lo aprendido.
 */
import {
    cargarEstadoConversacion,
    fotoEntrega,
    guardarEstadoConversacion,
    limpiarEstadoConversacion,
    revertirEntregaNoEnviada
} from "../nucleo/estado-persistente"

const CLAVE = "prueba:revertir-entrega"

interface Caso {
    titulo: string
    ok: boolean
}

async function main() {
    const casos: Caso[] = []

    // ── Turno descartado: lo que aprendió ese turno vuelve atrás ──────────────
    await limpiarEstadoConversacion(CLAVE)
    await guardarEstadoConversacion(CLAVE, {
        grupoPineado: { id: 4, nombre: "Kit 120 corto + Leva 6.40" }
    })
    const antes = fotoEntrega(await cargarEstadoConversacion(CLAVE))

    // El motor resuelve la moto y la variante, y redacta… pero el turno no sale.
    await guardarEstadoConversacion(CLAVE, {
        motoConfirmada: "Keller 110",
        varianteResuelta: { packId: 7, etiqueta: "leva corta", precio: 99000 },
        temasRespondidos: ["envios"]
    })
    await revertirEntregaNoEnviada(CLAVE, antes)
    const revertido = await cargarEstadoConversacion(CLAVE)

    casos.push(
        {
            titulo: "la moto que resolvió el turno descartado no queda como confirmada",
            ok: !revertido.motoConfirmada
        },
        {
            titulo: "la variante que resolvió el turno descartado no queda como resuelta",
            ok: !revertido.varianteResuelta
        },
        {
            titulo: "el tema de envíos que nunca salió no queda como respondido",
            ok: (revertido.temasRespondidos || []).length === 0
        },
        {
            titulo: "el combo pineado en un turno ANTERIOR que sí salió se conserva",
            ok: revertido.grupoPineado?.id === 4
        }
    )

    // ── Lo aprendido en un turno anterior que SÍ salió no se pierde ───────────
    await limpiarEstadoConversacion(CLAVE)
    await guardarEstadoConversacion(CLAVE, {
        grupoPineado: { id: 4, nombre: "Kit 120 corto + Leva 6.40" },
        motoConfirmada: "Keller 110"
    })
    const conMoto = fotoEntrega(await cargarEstadoConversacion(CLAVE))
    await guardarEstadoConversacion(CLAVE, {
        varianteResuelta: { packId: 7, etiqueta: "leva corta", precio: 99000 }
    })
    await revertirEntregaNoEnviada(CLAVE, conMoto)
    const conservado = await cargarEstadoConversacion(CLAVE)

    casos.push(
        {
            titulo: "la moto confirmada en un turno que sí salió sigue confirmada",
            ok: conservado.motoConfirmada === "Keller 110"
        },
        {
            titulo: "la variante del turno descartado sí vuelve atrás",
            ok: !conservado.varianteResuelta
        }
    )

    // ── Lote reencolado: otro tramo del bot le habló al cliente en paralelo ───
    await limpiarEstadoConversacion(CLAVE)
    const vacio = fotoEntrega(await cargarEstadoConversacion(CLAVE))
    await guardarEstadoConversacion(CLAVE, {
        grupoPineado: { id: 4, nombre: "Kit 120 corto + Leva 6.40" },
        motoConfirmada: "Keller 110",
        packPresentado: { id: 9, nombre: "Kit 120 corto", precio: 99000 },
        temasRespondidos: ["envios"]
    })
    await revertirEntregaNoEnviada(CLAVE, vacio, { incluirAprendido: false })
    const parcial = await cargarEstadoConversacion(CLAVE)

    casos.push(
        {
            titulo: "con otro tramo del bot en el aire, lo aprendido queda quieto",
            ok: parcial.grupoPineado?.id === 4 && parcial.motoConfirmada === "Keller 110"
        },
        {
            titulo: "…pero la entrega de ESTE turno igual vuelve atrás",
            ok: !parcial.packPresentado && (parcial.temasRespondidos || []).length === 0
        }
    )

    await limpiarEstadoConversacion(CLAVE)

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
