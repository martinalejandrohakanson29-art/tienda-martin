/**
 * Qué está costando el bot-agente, por día y por conversación.
 *
 * Contexto: hasta el 09/09 `bot_agente_turnos_reales` no guardaba los tokens —
 * el motor ya los calculaba y se descartaban al registrar el turno. El gasto
 * solo se veía en la factura de OpenAI a fin de mes, sin poder atribuirlo a una
 * conversación, un modelo ni un tipo de consulta, y sin forma de verificar si un
 * cambio de configuración lo bajaba de verdad.
 *
 *   npx tsx scripts/costo-bot.ts          # últimos 7 días
 *   npx tsx scripts/costo-bot.ts 30       # últimos 30 días
 *
 * Las tres columnas que hay que mirar:
 *   - `cache%`  cuánto del prompt sirvió el proveedor desde su caché (90% más
 *               barato). Si se desploma, algo variable se coló arriba del prompt
 *               y rompió el prefijo estable.
 *   - `razon%`  qué parte del output son tokens de razonamiento invisible. Es la
 *               partida más cara del turno; la controla `reasoning_effort`.
 *   - `gratis`  turnos resueltos sin llamar al modelo (saludo, plantilla de
 *               anuncio, silencio por escalado pendiente): cuestan cero.
 */
import { prisma } from "../lib/prisma"

const DIAS = parseInt(process.argv[2] || "7", 10) || 7

/**
 * USD por token. Actualizar si cambia la lista de precios del proveedor: es la
 * única parte de este script que envejece.
 */
const PRECIOS: Record<string, { entrada: number; cacheada: number; salida: number }> = {
    "gpt-5": { entrada: 1.25e-6, cacheada: 0.125e-6, salida: 10e-6 },
    "gpt-5-mini": { entrada: 0.25e-6, cacheada: 0.025e-6, salida: 2e-6 },
    "gpt-5-nano": { entrada: 0.05e-6, cacheada: 0.005e-6, salida: 0.4e-6 },
    /**
     * APROXIMADO. No salen de una lista de precios sino de despejarlos contra
     * una medición real: 42 casos del banco costaron USD 0.0400 exactos por
     * diferencia de saldo (09/09), con un perfil de ~9.500 tokens de prompt
     * (~75% cacheado) y ~400 de salida por turno.
     *
     * Para DeepSeek el número que manda es el SALDO de la cuenta, no esta
     * cuenta: https://platform.deepseek.com -> Balance. Si las dos cifras se
     * separan, actualizar estos valores.
     */
    "deepseek-v4-flash": { entrada: 0.28e-6, cacheada: 0.028e-6, salida: 0.42e-6 },
}

/** Ante un modelo que no está en la tabla se usa gpt-5 (el más caro): mejor sobreestimar. */
function precioDe(modelo: string) {
    return PRECIOS[modelo] || PRECIOS["gpt-5"]
}

type FilaTurno = {
    dia: Date
    modelo: string | null
    turnos: bigint
    convs: bigint
    sin_llamada: bigint
    con_fallback: bigint
    prompt: bigint | null
    cacheados: bigint | null
    completion: bigint | null
    razonamiento: bigint | null
}

async function main() {
    const filas = await prisma.$queryRaw<FilaTurno[]>`
        SELECT
            date_trunc('day', creado_en)::date            AS dia,
            COALESCE(tokens->>'modelo', 'sin-dato')       AS modelo,
            count(*)                                      AS turnos,
            count(DISTINCT conversation_id)               AS convs,
            count(*) FILTER (
                WHERE tokens IS NOT NULL AND (tokens->>'total')::numeric = 0
            )                                             AS sin_llamada,
            count(*) FILTER (WHERE tokens->>'fallback' = 'true') AS con_fallback,
            sum(COALESCE((tokens->>'prompt')::numeric, 0))        AS prompt,
            sum(COALESCE((tokens->>'cacheados')::numeric, 0))     AS cacheados,
            sum(COALESCE((tokens->>'completion')::numeric, 0))    AS completion,
            sum(COALESCE((tokens->>'razonamiento')::numeric, 0))  AS razonamiento
        FROM bot_agente_turnos_reales
        WHERE creado_en > now() - (${DIAS} || ' days')::interval
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
    `

    if (filas.length === 0) {
        console.log(`Sin turnos registrados en los ultimos ${DIAS} dias.`)
        return
    }

    const tabla = filas.map((f) => {
        const p = precioDe(f.modelo || "")
        const prompt = Number(f.prompt || 0)
        const cacheados = Number(f.cacheados || 0)
        const completion = Number(f.completion || 0)
        const razonamiento = Number(f.razonamiento || 0)
        const turnos = Number(f.turnos)

        const costo = (prompt - cacheados) * p.entrada + cacheados * p.cacheada + completion * p.salida

        return {
            dia: f.dia.toISOString().slice(0, 10),
            modelo: f.modelo,
            turnos,
            convs: Number(f.convs),
            gratis: Number(f.sin_llamada),
            "fallback": Number(f.con_fallback),
            "tok/turno": turnos ? Math.round((prompt + completion) / turnos) : 0,
            "cache%": prompt ? Math.round((cacheados / prompt) * 100) : 0,
            "razon%": completion ? Math.round((razonamiento / completion) * 100) : 0,
            USD: Number(costo.toFixed(2)),
            "USD/turno": Number((turnos ? costo / turnos : 0).toFixed(4)),
        }
    })

    console.table(tabla)

    const total = tabla.reduce((a, f) => a + f.USD, 0)
    const dias = new Set(tabla.map((f) => f.dia)).size
    console.log(`\nTotal ${DIAS}d: USD ${total.toFixed(2)}  |  promedio USD ${(total / (dias || 1)).toFixed(2)}/dia`)

    const sinDato = tabla.filter((f) => f.modelo === "sin-dato").reduce((a, f) => a + f.turnos, 0)
    if (sinDato > 0) {
        console.log(
            `\n(${sinDato} turnos sin columna \`tokens\`: son anteriores al 09/09, cuando se empezo a registrar. No suman al costo.)`
        )
    }

    // Las conversaciones más caras: sirven para encontrar el patrón que dispara
    // el gasto (ráfagas largas, loops ReAct de 5-6 pasos, clientes que insisten).
    const caras = await prisma.$queryRaw<{ conversation_id: bigint; turnos: bigint; tokens: bigint; pasos: number }[]>`
        SELECT conversation_id,
               count(*)                                              AS turnos,
               sum(COALESCE((tokens->>'total')::numeric, 0))          AS tokens,
               round(avg(COALESCE((tokens->>'pasos')::numeric, 0)), 1) AS pasos
        FROM bot_agente_turnos_reales
        WHERE creado_en > now() - (${DIAS} || ' days')::interval
          AND tokens IS NOT NULL
        GROUP BY 1
        HAVING sum(COALESCE((tokens->>'total')::numeric, 0)) > 0
        ORDER BY 3 DESC
        LIMIT 10
    `
    if (caras.length > 0) {
        console.log("\nConversaciones mas caras del periodo:")
        console.table(
            caras.map((c) => ({
                conversation_id: Number(c.conversation_id),
                turnos: Number(c.turnos),
                tokens: Number(c.tokens),
                "pasos ReAct prom": Number(c.pasos),
            }))
        )
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
