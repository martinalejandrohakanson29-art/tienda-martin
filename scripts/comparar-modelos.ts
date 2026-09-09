/**
 * ¿El modelo barato está saliendo barato de verdad?
 *
 * Compara, por día y por modelo, las DOS caras del costo:
 *   - lo que se paga al proveedor (tokens)
 *   - lo que se paga en horas de mostrador (turnos escalados a un humano)
 *
 * Existe porque el costo de API es la métrica engañosa. En la evaluación del
 * 09/09, gpt-5-mini salía 5x más barato que gpt-5 pero escalaba consultas que
 * gpt-5 resolvía solo: cada una de esas es alguien del equipo contestando a
 * mano. Un modelo que ahorra USD 3/día y agrega 20 escalados diarios es un mal
 * negocio, y eso NO se ve en la factura.
 *
 *   npx tsx scripts/comparar-modelos.ts        # últimos 7 días
 *   npx tsx scripts/comparar-modelos.ts 30     # últimos 30 días
 *
 * Cómo leerlo: buscar el día del cambio de proveedor y comparar `escal%` antes
 * y después. Si subió, el ahorro se está pagando en trabajo humano — y hay que
 * mirar `motivos` para ver qué tipo de consulta empezó a caerse.
 */
import { prisma } from "../lib/prisma"

const DIAS = parseInt(process.argv[2] || "7", 10) || 7

/** USD por token. Misma tabla que scripts/costo-bot.ts — mantener en sync. */
const PRECIOS: Record<string, { entrada: number; cacheada: number; salida: number }> = {
    "gpt-5": { entrada: 1.25e-6, cacheada: 0.125e-6, salida: 10e-6 },
    "gpt-5-mini": { entrada: 0.25e-6, cacheada: 0.025e-6, salida: 2e-6 },
    "gpt-5-nano": { entrada: 0.05e-6, cacheada: 0.005e-6, salida: 0.4e-6 },
    "deepseek-v4-flash": { entrada: 0.28e-6, cacheada: 0.028e-6, salida: 0.42e-6 },
}

type Fila = {
    dia: Date
    modelo: string
    turnos: bigint
    escalados: bigint
    fallbacks: bigint
    prompt: bigint
    cacheados: bigint
    completion: bigint
}

async function main() {
    // Solo turnos que REALMENTE llamaron al modelo: los resueltos por camino
    // determinista (saludo, plantilla de anuncio) no dicen nada del modelo y
    // diluirían la tasa de escalados.
    const filas = await prisma.$queryRaw<Fila[]>`
        SELECT
            date_trunc('day', creado_en)::date        AS dia,
            COALESCE(tokens->>'modelo', 'sin-dato')   AS modelo,
            count(*)                                  AS turnos,
            count(*) FILTER (WHERE escalado_humano)   AS escalados,
            count(*) FILTER (WHERE tokens->>'fallback' = 'true') AS fallbacks,
            sum(COALESCE((tokens->>'prompt')::numeric, 0))     AS prompt,
            sum(COALESCE((tokens->>'cacheados')::numeric, 0))  AS cacheados,
            sum(COALESCE((tokens->>'completion')::numeric, 0)) AS completion
        FROM bot_agente_turnos_reales
        WHERE creado_en > now() - (${DIAS} || ' days')::interval
          AND tokens IS NOT NULL
          AND (tokens->>'total')::numeric > 0
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
    `

    if (filas.length === 0) {
        console.log(
            `Sin turnos con tokens registrados en los ultimos ${DIAS} dias.\n` +
                `(La columna \`tokens\` se empezo a llenar el 09/09; antes de eso no hay con que comparar.)`
        )
        return
    }

    console.log(`\n=== COSTO DE API vs COSTO HUMANO (ultimos ${DIAS} dias) ===`)
    console.table(
        filas.map((f) => {
            const p = PRECIOS[f.modelo] || PRECIOS["gpt-5"]
            const prompt = Number(f.prompt)
            const cacheados = Number(f.cacheados)
            const completion = Number(f.completion)
            const turnos = Number(f.turnos)
            const escalados = Number(f.escalados)
            const costo = (prompt - cacheados) * p.entrada + cacheados * p.cacheada + completion * p.salida

            return {
                dia: f.dia.toISOString().slice(0, 10),
                modelo: f.modelo,
                turnos,
                USD: Number(costo.toFixed(3)),
                "USD/turno": Number((costo / turnos).toFixed(5)),
                escalados,
                // LA métrica: cada punto de más acá es trabajo que vuelve al equipo.
                "escal%": Math.round((escalados / turnos) * 100),
                fallbacks: Number(f.fallbacks),
            }
        })
    )

    // Por qué se escala, partido por modelo: si un modelo nuevo dispara un
    // motivo que el anterior casi no usaba, ahí está la regresión concreta.
    const motivos = await prisma.$queryRaw<{ modelo: string; motivo: string; veces: bigint }[]>`
        SELECT COALESCE(tokens->>'modelo', 'sin-dato') AS modelo,
               COALESCE(motivo_escalado, 'sin-motivo') AS motivo,
               count(*)                                AS veces
        FROM bot_agente_turnos_reales
        WHERE creado_en > now() - (${DIAS} || ' days')::interval
          AND escalado_humano
          AND tokens IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1, 3 DESC
    `
    if (motivos.length > 0) {
        console.log("\n=== POR QUE ESCALA CADA MODELO ===")
        console.table(motivos.map((m) => ({ modelo: m.modelo, motivo: m.motivo, veces: Number(m.veces) })))
    }

    // Resumen por modelo, que es como se toma la decision de dejarlo o volver atras.
    const porModelo = new Map<string, { turnos: number; escalados: number; costo: number; fallbacks: number }>()
    for (const f of filas) {
        const p = PRECIOS[f.modelo] || PRECIOS["gpt-5"]
        const costo =
            (Number(f.prompt) - Number(f.cacheados)) * p.entrada +
            Number(f.cacheados) * p.cacheada +
            Number(f.completion) * p.salida
        const acc = porModelo.get(f.modelo) || { turnos: 0, escalados: 0, costo: 0, fallbacks: 0 }
        acc.turnos += Number(f.turnos)
        acc.escalados += Number(f.escalados)
        acc.costo += costo
        acc.fallbacks += Number(f.fallbacks)
        porModelo.set(f.modelo, acc)
    }

    console.log("\n=== RESUMEN POR MODELO ===")
    console.table(
        [...porModelo.entries()].map(([modelo, a]) => ({
            modelo,
            turnos: a.turnos,
            "USD total": Number(a.costo.toFixed(3)),
            "USD/turno": Number((a.costo / a.turnos).toFixed(5)),
            "escal%": Math.round((a.escalados / a.turnos) * 100),
            "turnos cubiertos por el suplente": a.fallbacks,
        }))
    )

    console.log(
        "\nComo decidir: si el modelo barato tiene `escal%` parecido al caro, el ahorro es real.\n" +
            "Si escala varios puntos mas, cada punto son turnos que vuelven al equipo y el\n" +
            "ahorro de API se paga en horas de mostrador. `fallbacks` alto = el principal se\n" +
            "esta cayendo y lo esta cubriendo el caro."
    )
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
