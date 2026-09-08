/**
 * Reordena los pendientes que quedaron en la bandeja equivocada y descarta los
 * duplicados, para que /admin/chatwoot/chats-vivo etiquete bien lo que YA está
 * en la base.
 *
 * Contexto: hasta el fix del 08/09 el `motivo` de `escalar_a_humano` era texto
 * libre y el ruteo comparaba strings exactos, así que motivos inventados por el
 * modelo ("producto_sin_catalogo", "producto_no_encontrado") caían todos en
 * `preguntas_sin_match_pendientes` ("Sin resolver"). Además el piloto en vivo
 * insertaba una SEGUNDA fila por cada escalado.
 *
 *   npx tsx scripts/reclasificar-pendientes-escalados.ts            # simulacro
 *   npx tsx scripts/reclasificar-pendientes-escalados.ts --aplicar  # escribe
 */
import { prisma } from "../lib/prisma"
import { clasificarMotivoEscalado } from "../bot-agente/nucleo/motivos-escalado"

const APLICAR = process.argv.includes("--aplicar")

type FilaSinMatch = {
    id: number
    conversation_id: bigint | null
    pregunta_original: string
}

async function main() {
    console.log(APLICAR ? "== APLICANDO CAMBIOS ==" : "== SIMULACRO (usá --aplicar para escribir) ==")

    const pendientes = await prisma.$queryRaw<FilaSinMatch[]>`
        SELECT id, conversation_id, pregunta_original
        FROM preguntas_sin_match_pendientes
        WHERE estado = 'pendiente' AND conversation_id IS NOT NULL
        ORDER BY id ASC
    `

    // 1. Duplicados: por cada escalado, el consumidor (piloto en vivo, barrido,
    //    reproceso de cola) insertaba una copia con prefijo además de la fila que
    //    ya había creado la herramienta. La copia se borra SOLO si la original
    //    sigue pendiente — puede estar en cualquiera de las 4 bandejas, porque la
    //    original se ruteó por motivo y la copia siempre cayó en sin_match.
    const PREFIJOS_COPIA = ["[Piloto bot-agente en vivo]", "[barrido entrantes pendientes]", "[Reproceso cola con bot-agente]"]
    let duplicados = 0
    for (const fila of pendientes) {
        if (!PREFIJOS_COPIA.some((p) => fila.pregunta_original.startsWith(p))) continue
        const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT (
                (SELECT COUNT(*) FROM preguntas_tecnicas_pendientes WHERE estado = 'pendiente' AND conversation_id = ${fila.conversation_id})
              + (SELECT COUNT(*) FROM preguntas_precio_pendientes   WHERE estado = 'pendiente' AND conversation_id = ${fila.conversation_id})
              + (SELECT COUNT(*) FROM preguntas_negocio_pendientes  WHERE estado = 'pendiente' AND conversation_id = ${fila.conversation_id})
              + (SELECT COUNT(*) FROM preguntas_sin_match_pendientes
                 WHERE estado = 'pendiente' AND conversation_id = ${fila.conversation_id} AND id <> ${fila.id}
                   AND pregunta_original NOT LIKE '[Piloto bot-agente en vivo]%'
                   AND pregunta_original NOT LIKE '[barrido entrantes pendientes]%'
                   AND pregunta_original NOT LIKE '[Reproceso cola con bot-agente]%')
            ) as count
        `
        if (Number(count) === 0) continue // sin original: es el único registro, se respeta
        console.log(`  [dup] conv ${fila.conversation_id} — descarto #${fila.id}`)
        duplicados++
        if (APLICAR) {
            // No se borra: pasa a 'descartada' (estado que el panel ya ignora),
            // así queda rastro y el cambio es reversible.
            await prisma.$executeRaw`
                UPDATE preguntas_sin_match_pendientes SET estado = 'descartada' WHERE id = ${fila.id}
            `
        }
    }

    // 2. Reclasificación: el motivo real del escalado está en el turno del motor.
    const movidos: Record<string, number> = { tecnica: 0, precio: 0, negocio: 0 }
    for (const fila of pendientes) {
        if (PREFIJOS_COPIA.some((p) => fila.pregunta_original.startsWith(p))) continue

        const turnos = await prisma.$queryRaw<{ motivo_escalado: string | null }[]>`
            SELECT motivo_escalado FROM bot_agente_turnos_reales
            WHERE conversation_id = ${fila.conversation_id} AND escalado_humano = true
            ORDER BY id DESC LIMIT 1
        `
        const motivo = turnos[0]?.motivo_escalado
        if (!motivo) continue

        const bandeja = clasificarMotivoEscalado(motivo)
        if (bandeja === "sin_match") continue

        console.log(`  [mover] conv ${fila.conversation_id} — "${motivo}" → ${bandeja}`)
        movidos[bandeja]++
        if (!APLICAR) continue

        if (bandeja === "tecnica") {
            // El motor arma "moto_no_registrada: <modelo>": se recupera el modelo.
            const modelo = motivo.includes(":") ? motivo.split(":").slice(1).join(":").trim() : null
            await prisma.$executeRaw`
                INSERT INTO preguntas_tecnicas_pendientes (conversation_id, modelo_moto, kit, pregunta_original, estado, es_grupo, creado_en)
                VALUES (${fila.conversation_id}, ${modelo || fila.pregunta_original}, NULL, ${fila.pregunta_original}, 'pendiente', false, NOW())
            `
        } else if (bandeja === "precio") {
            await prisma.$executeRaw`
                INSERT INTO preguntas_precio_pendientes (conversation_id, producto, pregunta_original, estado, creado_en)
                VALUES (${fila.conversation_id}, ${fila.pregunta_original}, ${fila.pregunta_original}, 'pendiente', NOW())
            `
        } else {
            await prisma.$executeRaw`
                INSERT INTO preguntas_negocio_pendientes (conversation_id, tema, pregunta_original, estado, creado_en)
                VALUES (${fila.conversation_id}, ${motivo}, ${fila.pregunta_original}, 'pendiente', NOW())
            `
        }
        // La fila original queda como 'descartada' (ya vive en su bandeja real).
        await prisma.$executeRaw`
            UPDATE preguntas_sin_match_pendientes SET estado = 'descartada' WHERE id = ${fila.id}
        `
    }

    console.log(
        `\nDuplicados borrados: ${duplicados} | Movidos → técnica ${movidos.tecnica}, precio ${movidos.precio}, negocio ${movidos.negocio}`
    )
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
