/**
 * VERIFICADOR DE GROUNDING (Jev) — sexto eslabón del sanitizado.
 *
 * Mira el borrador que el bot está por mandar contra los hechos que salieron de
 * las herramientas de ESE turno, y devuelve una probabilidad: "esto afirma un
 * dato duro que nadie le dio". No genera texto, no decide nada comercial, no
 * entra en el contexto del turno (no toca el cacheo del prompt).
 *
 * Por qué no se puede hacer determinista, y por qué esto NO viola la REGLA
 * MADRE: el conjunto de referencia cambia en cada turno. `$175.000` está bien
 * en este mensaje y mal en el siguiente según lo que devolvió el catálogo hace
 * 300 ms. No hay regex posible. Es higiene de texto, igual que
 * `guardrails/sanitizador.ts`, no una regla de negocio.
 *
 * Plan completo, medición y criterios de matar: `bot-agente/PLAN-VERIFICADOR-GROUNDING.md`.
 *
 * LAS DOS REGLAS QUE NO SE ROMPEN:
 *  1. FALLA ABIERTO. Si Jev no contesta, tarda o tira error, devuelve `null` y
 *     el borrador sale tal cual. Un proveedor sin SLA no puede mutear al bot.
 *  2. La ficha oficial del turno VA en el estado. Medido el 19/09: sin ella el
 *     camino de la plantilla del anuncio (55% del tráfico) marca el 39% de los
 *     borradores buenos, porque `match_plantilla_publicidad` no devuelve ni un
 *     hecho: el precio sale de `mensaje_bienvenida`. Con ella, 0,3% sobre 300
 *     turnos reales.
 */

import type { HerramientaEjecutadaInfo } from "../tipos"

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions"

export const VERIFICADOR_DEFAULTS = {
    modo: "off" as ModoVerificador,
    /**
     * 0.80 y no 0.85: con el estado REAL serializado, el caso que costó la conv
     * 3707 ("el pistón no viene incluido", que el `detalle` sí trae) vive en
     * 0.82-0.85 y con 0.85 se escapa. En 0.80 entran los 7 casos malos
     * conocidos (0.84-0.98) y el tráfico real marca 0,3% (1 de 300).
     */
    umbral: 0.8,
    modelo: "typesafe/jev-1.13",
    /**
     * 1500 y no 800: la latencia publicada (p50 246 ms) no incluye el salto por
     * OpenRouter. Medido desde Argentina sobre 300 llamadas: p50 379 ms,
     * p90 508 ms, p99 851 ms, 0 fallas.
     */
    timeoutMs: 1500
}

export type ModoVerificador = "off" | "sombra" | "veto"

export function normalizarModo(valor: string | undefined | null): ModoVerificador {
    const v = (valor || "").trim().toLowerCase()
    return v === "sombra" || v === "veto" ? v : "off"
}

/**
 * La pregunta. Una sola, tipo `noul` (devuelve probabilidad, no booleano).
 *
 * El último renglón no es decorativo: distingue los DOS NIVELES DE NEGACIÓN del
 * §11 de `AGENTS.md`. Negar una pieza ENTERA que el catálogo no vinculó al kit
 * es dato duro y está bien; negar una sub-pieza que un `detalle` sí trae es el
 * error de la conv 3707. Jev separa los dos solo, pero explicitarlo lo sostiene.
 */
export const PREGUNTA =
    "Sos el control de calidad de un vendedor de repuestos de moto por WhatsApp. " +
    "Abajo está TODO lo que el sistema le pasó al vendedor en este turno (los HECHOS: " +
    "el resultado crudo de cada consulta a la base de datos, y la ficha oficial que el " +
    "cliente ya leyó) y el BORRADOR que el vendedor está por mandarle al cliente. " +
    "El borrador afirma algún dato duro (precio, compatibilidad con una moto, qué piezas " +
    "trae el kit, envío, plazo de entrega, política de la casa) que NO esté respaldado por " +
    "los hechos, o que los CONTRADIGA? " +
    "Preguntar, saludar, pedir la moto o no afirmar nada NO es un problema. " +
    "Negar una pieza ENTERA que los hechos muestran no vinculada al kit SÍ está respaldado."

export interface EntradaVerificador {
    /** El borrador ya pasado por los cinco eslabones deterministas. */
    borrador: string
    /** Lo que devolvió cada herramienta de ESTE turno, crudo y sin parsear. */
    herramientasEjecutadas: HerramientaEjecutadaInfo[]
    /**
     * La ficha oficial que el cliente YA leyó en esta misma ráfaga
     * (`opciones.globosYaEmitidos`). Sin esto el verificador es inusable: ver la
     * regla 2 del encabezado.
     */
    fichaOficialDelTurno?: string[]
    mensajeCliente?: string
    /** Si una parte se derivó al equipo, afirmarla es el error de la conv 4525. */
    escaladoParcial?: boolean
    /** Lo que el catálogo no encontró: cotizarlo es el error de la conv 3820. */
    terminosSinMatch?: string[]
}

export interface ResultadoVerificador {
    /** Probabilidad 0-1 de que el borrador afirme algo sin respaldo. */
    noul: number
    ms: number
    costoUsd: number
    /** El estado que se mandó, para poder re-probar el caso sin reconstruirlo. */
    estado: Record<string, unknown>
}

/**
 * Arma el estado. Va deliberadamente SIN parsear: el `detalle` de cada artículo
 * viaja entero (§11 de `AGENTS.md` — cualquier regex que intente extraerle "las
 * piezas" se rompe con la redacción del artículo siguiente).
 */
export function construirEstado(entrada: EntradaVerificador): Record<string, unknown> {
    const estado: Record<string, unknown> = {
        mensaje_del_cliente: entrada.mensajeCliente ?? "",
        hechos_del_turno: (entrada.herramientasEjecutadas || []).map((e) => ({
            herramienta: e.nombre,
            argumentos: e.argumentos,
            resultado: e.resultado
        })),
        borrador_que_el_vendedor_va_a_mandar: entrada.borrador
    }
    const ficha = (entrada.fichaOficialDelTurno || []).filter((t) => (t || "").trim())
    if (ficha.length) estado.ficha_oficial_que_el_cliente_ya_leyo = ficha
    if (entrada.escaladoParcial) estado.parte_derivada_al_equipo = true
    if (entrada.terminosSinMatch?.length) estado.terminos_que_el_catalogo_no_encontro = entrada.terminosSinMatch
    return estado
}

/**
 * Pregunta a Jev. Devuelve `null` ante CUALQUIER falla (sin key, timeout, HTTP
 * != 200, respuesta rara). Sin reintentos: es un guardrail, no el turno.
 */
export async function verificarGrounding(
    entrada: EntradaVerificador,
    config: { apiKey?: string; modelo?: string; timeoutMs?: number } = {}
): Promise<ResultadoVerificador | null> {
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || ""
    if (!apiKey) return null
    if (!entrada.borrador?.trim()) return null

    const estado = construirEstado(entrada)
    const inicio = Date.now()
    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), config.timeoutMs ?? VERIFICADOR_DEFAULTS.timeoutMs)

    try {
        const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: config.modelo || VERIFICADOR_DEFAULTS.modelo,
                state: estado,
                questions: { afirma_sin_respaldo: { type: "noul", instructions: PREGUNTA } }
            }),
            signal: controlador.signal
        })
        const ms = Date.now() - inicio
        if (!res.ok) {
            console.warn(`[verificador-grounding] HTTP ${res.status}, el borrador sale igual`)
            return null
        }
        const json: any = await res.json()
        const noul = json?.answers?.afirma_sin_respaldo?.noul
        if (typeof noul !== "number") {
            console.warn("[verificador-grounding] respuesta sin `noul`, el borrador sale igual")
            return null
        }
        return { noul, ms, costoUsd: typeof json?.usage?.cost === "number" ? json.usage.cost : 0, estado }
    } catch (err: any) {
        // Timeout (AbortError) o red caída. Falla abierto, siempre.
        console.warn(`[verificador-grounding] ${err?.name === "AbortError" ? "timeout" : "falla"}, el borrador sale igual`)
        return null
    } finally {
        clearTimeout(temporizador)
    }
}

/**
 * Deja el chequeo registrado. Nunca tira: si la tabla todavía no existe (el SQL
 * de `n8n-workflows/bot-verificador-grounding.sql` no se corrió) el turno sigue
 * igual, que es lo único que importa.
 */
export async function registrarVerificacion(datos: {
    conversationId?: number | null
    borrador: string
    estado: Record<string, unknown>
    noul: number
    umbral: number
    marcado: boolean
    accion: "sombra" | "vetado_reintento" | "vetado_escalado"
    ms: number
    costoUsd: number
}): Promise<void> {
    try {
        const { prisma } = await import("@/lib/prisma")
        await prisma.$executeRaw`
            INSERT INTO bot_agente_verificador_grounding
                (conversation_id, borrador, estado_tools, noul, umbral, marcado, accion, ms, costo_usd)
            VALUES (${datos.conversationId ?? null}, ${datos.borrador}, ${JSON.stringify(datos.estado)}::jsonb,
                    ${datos.noul}, ${datos.umbral}, ${datos.marcado}, ${datos.accion}, ${datos.ms}, ${datos.costoUsd})
        `
    } catch (err) {
        console.warn("[verificador-grounding] no se pudo registrar el chequeo:", (err as any)?.message)
    }
}
