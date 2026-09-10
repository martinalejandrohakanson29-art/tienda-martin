/**
 * Mide tokens, latencia y costo por turno de uno o más modelos sobre los MISMOS
 * casos del banco.
 *
 *   npx tsx scripts/medir-tokens-modelos.ts [modelo:thinking,...] [caso-a,caso-b]
 *   npx tsx scripts/medir-tokens-modelos.ts deepseek-flash:enabled,deepseek-flash:disabled
 *
 * Por qué existe: el puntaje del banco dice si un modelo responde bien, no qué
 * sale. El 10/09 esto fue lo que mostró que migrar a V4.1 Flash salía 24% MÁS
 * caro que el modelo viejo pese a la baja de precios — porque los Flash de
 * DeepSeek piensan por default y ese razonamiento se cobra a precio de SALIDA
 * (~900 tokens por turno). Sin medirlo, la baja de precios de la web parecía un
 * ahorro y era lo contrario.
 *
 * OJO CON LA CACHÉ: el primer modelo que se mide paga la caché fría del prefijo
 * y sale artificialmente caro. Por eso además del costo real se imprime el
 * costo NORMALIZADO, que aplica cada lista de precios al mismo perfil promedio
 * de tokens: esa es la comparación que vale entre dos modelos.
 */
import "dotenv/config"
import { ejecutarTurnoAgente } from "../bot-agente/motor"
import { CASOS_PRUEBA_REALES } from "../bot-agente/pruebas/casos-reales"
import { limpiarEstadoConversacion, guardarEstadoConversacion } from "../bot-agente/nucleo/estado-persistente"

/**
 * Precio off-peak por 1M de tokens (al 10/09/2026). Off-peak es el que
 * pagamos: el peak de DeepSeek es 22-01 y 03-07 hora Argentina, todo fuera del
 * horario del local. Si DeepSeek vuelve a tocar la lista, se actualiza acá.
 */
const PRECIO: Record<string, { hit: number; miss: number; out: number }> = {
    "deepseek-flash": { hit: 0.003, miss: 0.15, out: 0.6 },
    "deepseek-v4-flash": { hit: 0.007, miss: 0.22, out: 0.66 },
    "gpt-5": { hit: 0.125, miss: 1.25, out: 10 }
}

const CASOS_POR_DEFECTO = [
    "caso-1-compra-diferida",
    "caso-3-compatibilidad-zb",
    "caso-5-envio-general",
    "caso-8-precio-combo-variantes",
    "caso-11-descuento-volumen",
    "caso-9-anuncio-110-pregunta-200"
]

interface Perfil {
    etiqueta: string
    modelo: string
    prompt: number
    cache: number
    completion: number
    razonamiento: number
    ms: number
    turnos: number
}

const costo = (p: Perfil, precio: { hit: number; miss: number; out: number }) =>
    ((p.cache * precio.hit + (p.prompt - p.cache) * precio.miss + p.completion * precio.out) / 1e6 / p.turnos) * 1000

;(async () => {
    const combos = (process.argv[2] || "deepseek-flash:enabled,deepseek-flash:disabled")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const [modelo, thinking] = s.split(":")
            return { modelo, thinking }
        })
    const ids = (process.argv[3] || CASOS_POR_DEFECTO.join(",")).split(",").map((s) => s.trim()).filter(Boolean)

    const perfiles: Perfil[] = []

    for (const { modelo, thinking } of combos) {
        const p: Perfil = { etiqueta: `${modelo}${thinking ? ` thinking=${thinking}` : ""}`, modelo, prompt: 0, cache: 0, completion: 0, razonamiento: 0, ms: 0, turnos: 0 }

        for (const id of ids) {
            const caso = CASOS_PRUEBA_REALES.find((c: { id: string }) => c.id === id)
            if (!caso) {
                console.warn(`(no existe el caso ${id}, se saltea)`)
                continue
            }
            // Clave propia por combo: si dos mediciones comparten la memoria del
            // embudo, la segunda arranca con el estado que dejó la primera.
            const estadoKey = `medir:${modelo}:${thinking}:${id}`
            await limpiarEstadoConversacion(estadoKey)
            if (caso.estadoInicial) await guardarEstadoConversacion(estadoKey, caso.estadoInicial)

            const r = await ejecutarTurnoAgente(
                caso.mensajeCliente,
                (caso.historial || []).map((h: { rol: string; contenido: string }) => ({ rol: h.rol, contenido: h.contenido })) as any,
                { modelo, thinking, baseUrl: modelo.includes("deepseek") ? "https://api.deepseek.com" : undefined, estadoKey } as any
            )
            const t = r.tokensUsados
            if (t) {
                p.prompt += t.prompt
                p.cache += t.cacheados
                p.completion += t.completion
                p.razonamiento += t.razonamiento
            }
            p.ms += r.latenciaMs
            p.turnos++
        }

        perfiles.push(p)
        const precio = PRECIO[modelo]
        const cachePct = p.prompt ? Math.round((p.cache / p.prompt) * 100) : 0
        console.log(`\n### ${p.etiqueta}  (${p.turnos} turnos)`)
        console.log(`  entrada ${p.prompt} (${cachePct}% desde caché) | salida ${p.completion} (razonamiento ${p.razonamiento}) | latencia prom ${Math.round(p.ms / p.turnos)}ms`)
        console.log(`  costo real: US$${precio ? costo(p, precio).toFixed(3) : "?"} cada 1000 turnos${precio ? "" : ` (falta ${modelo} en la tabla PRECIO)`}`)
    }

    // Mismo perfil de tokens para todos: saca de la ecuación la caché fría del
    // primero y deja ver qué parte de la diferencia es la lista de precios.
    if (perfiles.length > 1) {
        const n = perfiles.length
        const promedio: Perfil = {
            etiqueta: "promedio",
            modelo: "",
            prompt: perfiles.reduce((a, p) => a + p.prompt / p.turnos, 0) / n,
            cache: perfiles.reduce((a, p) => a + p.cache / p.turnos, 0) / n,
            completion: perfiles.reduce((a, p) => a + p.completion / p.turnos, 0) / n,
            razonamiento: 0,
            ms: 0,
            turnos: 1
        }
        console.log(`\n--- costo normalizado (mismo perfil de tokens para todos) ---`)
        for (const p of perfiles) {
            const precio = PRECIO[p.modelo]
            if (precio) console.log(`  ${p.etiqueta}: US$${costo(promedio, precio).toFixed(3)} cada 1000 turnos`)
        }
        console.log(`  (ojo: el perfil promedio NO refleja que pensar gasta más salida — eso se ve en el costo real de arriba)`)
    }

    process.exit(0)
})()
