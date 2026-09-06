import { MensajeChat, RespuestaAgente, HerramientaEjecutadaInfo, LlamadaHerramientaLLM } from "./tipos"
import { definicionesHerramientas, ejecutarHerramienta } from "./herramientas"
import { escalarAHumano } from "./herramientas/escalar-humano"
import { PROMPT_SISTEMA_AGENTE } from "./prompts/sistema"
import { sanitizarMensajeSalida } from "./guardrails/sanitizador"
import { obtenerConfiguracionAgente } from "./configuracion"
import { detectarSituaciones, formatearBloqueSituaciones } from "./situaciones"
import {
    cargarEstadoConversacion,
    guardarEstadoConversacion,
    formatearMemoriaEstado,
    EstadoConversacion
} from "./nucleo/estado-persistente"

export interface OpcionesEjecucion {
    apiKey?: string
    modelo?: string
    temperatura?: number
    baseUrl?: string
    /** ID de la conversacion de Chatwoot (para linkear los escalados al chat real). */
    conversationId?: number
    /** Clave para la memoria persistente del embudo (session_id en el simulador). */
    estadoKey?: string
}

const DEFAULT_MODEL = "gpt-4o-mini" // Rápido, económico y con excelente soporte de tool calling
const DEFAULT_BASE_URL = "https://api.openai.com/v1"
const MAX_PASOS_REACT = 6
const TIMEOUT_LLM_MS = 30_000

/** fetch a la API del LLM con timeout y un reintento ante error de red. */
async function fetchLLM(url: string, init: RequestInit): Promise<Response> {
    let ultimoError: any = null
    for (let intento = 1; intento <= 2; intento++) {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_LLM_MS)
        try {
            return await fetch(url, { ...init, signal: ctrl.signal })
        } catch (err: any) {
            ultimoError = err
            if (intento === 2) break
        } finally {
            clearTimeout(timer)
        }
    }
    throw new Error(`No se pudo contactar la API de IA (${ultimoError?.name || "error"}): ${ultimoError?.message || ultimoError}`)
}

/**
 * Ejecuta un turno conversacional del agente con soporte de Tool Calling
 */
function esSaludoSinIntencion(msg: string): boolean {
    const texto = (msg || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z\s]/g, "")
        .trim()

    const saludosComunes = new Set([
        "hola",
        "hola buenas",
        "hola buen dia",
        "hola buenas tardes",
        "hola buenas noches",
        "buenas",
        "buen dia",
        "buenas tardes",
        "buenas noches",
        "hola que tal",
        "que tal",
        "hola como andas",
        "hola como va",
        "hola amigo",
        "hola bro",
        "buenas bro",
        "buenas amigo"
    ])

    return saludosComunes.has(texto)
}

/**
 * Si en este turno `consultar_catalogo_y_precios` resolvió a una única opción (pack o
 * combo) que el cliente todavía no tenía pineada, ese es el mensaje de bienvenida del
 * kit: devuelve su `foto_url` para adjuntarla junto al texto (mismo criterio que
 * chatwoot 2.0 vía `lib/chatwoot-bot.ts` -> `enviarImagenChatwoot`).
 */
function extraerFotoDeBienvenida(
    herramientasEjecutadas: HerramientaEjecutadaInfo[],
    estadoConv: EstadoConversacion
): string | undefined {
    for (const ej of herramientasEjecutadas) {
        if (ej.nombre !== "consultar_catalogo_y_precios") continue
        const r = ej.resultado || {}
        if (!r.encontrado) continue

        const grupos = r.grupos || []
        const packs = r.packs || []
        if (grupos.length + packs.length !== 1) continue // paso 1 (varias opciones): todavía no hay bienvenida

        const grupo = grupos[0]
        const pack = packs[0]
        const yaPineadoAntes = grupo && estadoConv.grupoPineado?.id === grupo.id

        if (!yaPineadoAntes) {
            const foto = grupo?.foto_url || pack?.foto_url
            if (foto) return foto
        }
    }
    return undefined
}

/**
 * Detecta situaciones deterministas que requieren escalado inmediato en silencio absoluto (costo $0)
 */
function detectarEscaladoDeterminista(msg: string): { motivo: string; resumen: string } | null {
    const texto = (msg || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()

    if (!texto) return null

    // 1. Pedido explícito e inequívoco de hablar con un humano
    const rxHumano = /\b(pasame|comunicame|quiero hablar|atendeme|derivar(me)?|hablar)\s+(con\s+)?(un\s+|una\s+)?(humano|persona|asesor|alguien\s+real)\b/i
    if (rxHumano.test(texto) || texto === "humano" || texto === "persona real" || texto === "pasame con alguien") {
        return {
            motivo: "cliente_pide_humano",
            resumen: "El cliente solicitó expresamente ser atendido por un asesor o persona humana."
        }
    }

    // 2. Insultos o agresiones graves explícitas
    const rxAgresion = /\b(estafadores?|ladrones?|garcas?|hijos? de puta|concha de tu madre|hdp|sinverguenzas?|chorros?)\b/i
    if (rxAgresion.test(texto)) {
        return {
            motivo: "cliente_agresivo",
            resumen: `Mensaje con agresión o insultos directos: "${msg}"`
        }
    }

    // 3. Reclamo postventa explícito y crítico
    const rxReclamo = /\b(vino rot[ao]|lleg[oó] rot[ao]|vino fallad[ao]|paquete rot[ao]|hacer un reclamo|reclamo por (el |mi )?(envio|pedido|paquete|compra)|no me lleg[oó] (el |mi )?(pedido|paquete|compra))\b/i
    if (rxReclamo.test(texto)) {
        return {
            motivo: "reclamo_postventa",
            resumen: `Reclamo explícito del cliente: "${msg}"`
        }
    }

    // 4. Pedido explícito de link (Mercado Libre, publicación, link de pago)
    const rxLinkML = /\b(link|enlace|publicacion)\s+(de\s+)?(mercadolibre|mercado\s+libre|ml|pago|mercadopago|mercado\s+pago)\b/i
    const rxLinkGenerico = /\b(pasame|mandame|pasa|manda|tenes|comparti(me)?|dame)\s+(el\s+|un\s+)?(link|enlace|publicacion)\b/i
    if (rxLinkML.test(texto) || rxLinkGenerico.test(texto)) {
        return {
            motivo: "pedido_link_externo",
            resumen: `Cliente solicita link externo o de pago: "${msg}"`
        }
    }

    // 5. Pedido explícito de datos bancarios para transferir (CBU, Alias)
    const rxDatosPago = /\b(pasame|mandame|pasa|manda|dame)\s+.*(cbu|alias|cuenta\s+(para|bancaria)|datos\s+para\s+(transferir|el\s+pago|pagar))\b/i
    const rxAliasCbuSolo = /^(pasame\s+)?(el\s+)?(cbu|alias|datos\s+de\s+la\s+cuenta)$/i
    if (rxDatosPago.test(texto) || rxAliasCbuSolo.test(texto)) {
        return {
            motivo: "pedido_datos_pago",
            resumen: `Cliente solicita CBU/Alias o datos bancarios para transferir: "${msg}"`
        }
    }

    // 6. Envío explícito de comprobante de pago
    const rxComprobante = /\b(ya\s+te\s+transferi|ya\s+transferi|te\s+(pase|mande|adjunto)\s+(el\s+)?comprobante|aca\s+(esta\s+)?el\s+comprobante|comprobante\s+de\s+pago)\b/i
    if (rxComprobante.test(texto)) {
        return {
            motivo: "comprobante_pago",
            resumen: `Cliente indica envío de comprobante de transferencia: "${msg}"`
        }
    }

    // 7. Pedido explícito de fotos o videos reales
    const rxFotosVideos = /\b(pasame|mandame|tenes|pasa|manda|comparti(me)?|mostrame)\s+.*(fotos?|videos?)\b/i
    if (rxFotosVideos.test(texto)) {
        return {
            motivo: "pedido_fotos_videos",
            resumen: `Cliente solicita fotos o videos reales del producto: "${msg}"`
        }
    }

    return null
}

/**
 * Ejecuta un turno conversacional del agente con soporte de Tool Calling
 */
export async function ejecutarTurnoAgente(
    mensajeUsuario: string,
    historialPrevio: MensajeChat[] = [],
    opciones: OpcionesEjecucion = {}
): Promise<RespuestaAgente> {
    const inicio = Date.now()

    // Cargar configuración editable desde base de datos
    const config = await obtenerConfiguracionAgente()

    // Resolver modelo y baseUrl efectivos a partir de opciones o de chat_config
    let modelo = opciones.modelo
    let baseUrl = opciones.baseUrl

    if (!modelo || !baseUrl) {
        const prov = config.proveedorActivo || "openai:gpt-4o-mini"
        if (prov.startsWith("deepseek:")) {
            modelo = modelo || prov.replace("deepseek:", "") || "deepseek-v4-flash"
            baseUrl = baseUrl || "https://api.deepseek.com"
        } else if (prov.startsWith("openai:")) {
            modelo = modelo || prov.replace("openai:", "") || "gpt-4o-mini"
            baseUrl = baseUrl || "https://api.openai.com/v1"
        } else if (prov.startsWith("openrouter:")) {
            modelo = modelo || prov.replace("openrouter:", "")
            baseUrl = baseUrl || "https://openrouter.ai/api/v1"
        } else {
            modelo = modelo || DEFAULT_MODEL
            baseUrl = baseUrl || DEFAULT_BASE_URL
        }
    }

    const cleanBaseUrl = baseUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "")

    // 0. Detección determinista de escalado (humano, insulto, reclamo): costo $0, latencia 0ms, silencio total
    const escaladoInmediato = detectarEscaladoDeterminista(mensajeUsuario)
    if (escaladoInmediato) {
        // Persistir el escalado en el panel de pendientes (linkeado a la conversación real).
        const resultado = await escalarAHumano({
            motivo: escaladoInmediato.motivo,
            resumen_consulta: escaladoInmediato.resumen,
            conversation_id: opciones.conversationId
        }).catch((err) => {
            console.error("[motor] fallo al persistir escalado determinista:", err)
            return {
                escalado: true,
                motivo: escaladoInmediato.motivo,
                resumen: escaladoInmediato.resumen,
                mensaje_para_agente: "ESCALADO DETERMINISTA (no se pudo persistir)."
            }
        })

        return {
            mensajeFinal: null, // Silencio total cara al cliente
            herramientasEjecutadas: [
                {
                    nombre: "escalar_a_humano",
                    argumentos: {
                        motivo: escaladoInmediato.motivo,
                        resumen_consulta: escaladoInmediato.resumen
                    },
                    resultado
                }
            ],
            escaladoHumano: true,
            motivoEscalado: escaladoInmediato.motivo,
            latenciaMs: Date.now() - inicio,
            tokensUsados: { prompt: 0, completion: 0, total: 0 }
        }
    }

    // 1. Saludo simple o sin intención ("Hola!", "Buenas"): orientar al cliente directo sin costo de IA
    if (historialPrevio.length === 0 && esSaludoSinIntencion(mensajeUsuario)) {
        const saludo = `Hola ${config.permitirBro ? "bro" : "amigo"}! En qué te podemos ayudar?`
        return {
            mensajeFinal: saludo,
            mensajesFinales: [saludo],
            herramientasEjecutadas: [],
            escaladoHumano: false,
            latenciaMs: Date.now() - inicio,
            tokensUsados: { prompt: 0, completion: 0, total: 0 }
        }
    }

    // Si es el primer mensaje de la conversación, verificar si coincide con una plantilla de anuncio de Instagram
    if (historialPrevio.length === 0) {
        const { detectarPlantillaAnuncio } = await import("./herramientas/catalogo-precios")
        const matchPlantilla = await detectarPlantillaAnuncio(mensajeUsuario)
        if (matchPlantilla && matchPlantilla.mensajeBienvenida) {
            const sanitizado = sanitizarMensajeSalida(matchPlantilla.mensajeBienvenida, {
                palabrasProhibidas: config.palabrasProhibidas,
                permitirBro: config.permitirBro
            })

            return {
                mensajeFinal: sanitizado.textoLimpio,
                mensajesFinales: [sanitizado.textoLimpio],
                fotoUrl: matchPlantilla.fotoUrl || undefined,
                herramientasEjecutadas: [
                    {
                        nombre: "match_plantilla_publicidad",
                        argumentos: {
                            tipo: matchPlantilla.tipo,
                            id: matchPlantilla.id,
                            nombre: matchPlantilla.nombre
                        },
                        resultado: {
                            match_directo: true,
                            origen: "anuncio_instagram",
                            mensaje_para_agente: `Match directo con la plantilla de anuncio de '${matchPlantilla.nombre}'. Se entrega la bienvenida oficial del catálogo instantáneamente (costo \$0).`
                        }
                    }
                ],
                escaladoHumano: false,
                latenciaMs: Date.now() - inicio,
                tokensUsados: { prompt: 0, completion: 0, total: 0 }
            }
        }
    }

    // Determinar la clave de API según el proveedor si no vino en opciones
    let apiKey = opciones.apiKey?.trim()
    if (!apiKey) {
        if (cleanBaseUrl.includes("deepseek.com") || modelo.toLowerCase().includes("deepseek")) {
            apiKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY
        } else if (cleanBaseUrl.includes("openrouter.ai")) {
            apiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY
        } else {
            apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY
        }
    }

    if (!apiKey) {
        throw new Error(
            `Falta la clave de API para el modelo "${modelo}". Podés cargarla y activarla en el modal "Configurar Modelo / API Key" o en la pestaña "Ajustes de Estilo y Palabras".`
        )
    }

    const herramientasEjecutadas: HerramientaEjecutadaInfo[] = []
    let escaladoHumano = false
    let motivoEscalado: string | undefined

    const fechaHoraCordoba = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Cordoba",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date())

    // Bloques que se inyectan SOLO cuando aplican (mantienen el prompt base chico):
    //  - situaciones: reglas de casos puntuales (chat_situaciones) que pegan con este mensaje
    //  - memoria de estado: lo que ya quedó resuelto en la conversación (moto, variante...)
    const estadoKey = opciones.estadoKey || (opciones.conversationId != null ? String(opciones.conversationId) : undefined)
    const [situaciones, estadoConv] = await Promise.all([
        detectarSituaciones(mensajeUsuario).catch(() => []),
        cargarEstadoConversacion(estadoKey)
    ])
    const bloqueSituaciones = formatearBloqueSituaciones(situaciones)
    const bloqueEstado = formatearMemoriaEstado(estadoConv)

    // Patch de estado que se irá llenando con lo que resuelvan las herramientas
    // y se persiste al final del turno.
    const patchEstado: EstadoConversacion = {}
    const persistirEstado = () => guardarEstadoConversacion(estadoKey, patchEstado).catch(() => {})

    const promptFinal = [
        config.tonoEstilo
            ? `${PROMPT_SISTEMA_AGENTE}\n\n### PAUTA DE ESTILO CONFIGURADA POR EL DUEÑO:\n${config.tonoEstilo}`
            : PROMPT_SISTEMA_AGENTE,
        `### CONTEXTO TEMPORAL ACTUAL EN EL LOCAL (Córdoba Capital):\nHoy es ${fechaHoraCordoba} hs.`,
        bloqueEstado,
        bloqueSituaciones
    ].filter(Boolean).join("\n\n")

    // Construir los mensajes para la API
    const mensajes: any[] = [
        { role: "system", content: promptFinal },
        ...historialPrevio.map((m) => {
            if (m.rol === "tool") {
                return {
                    role: "tool",
                    tool_call_id: m.tool_call_id,
                    name: m.nombre,
                    content: m.contenido
                }
            }
            if (m.rol === "assistant" && m.tool_calls) {
                return {
                    role: "assistant",
                    content: m.contenido || null,
                    tool_calls: m.tool_calls
                }
            }
            return {
                role: m.rol,
                content: m.contenido
            }
        }),
        { role: "user", content: mensajeUsuario }
    ]

    let tokensTotales = { prompt: 0, completion: 0, total: 0 }
    let paso = 0

    // Los modelos de razonamiento de OpenAI (gpt-5*, o1*, o3*, o4*) NO aceptan
    // `temperature` distinto del default: mandarlo devuelve 400. Se omite para esos.
    const modeloNorm = modelo.toLowerCase()
    const soportaTemperatura = !/(^|\/)(gpt-5|o1|o3|o4)([.-]|$)/.test(modeloNorm)

    while (paso < MAX_PASOS_REACT) {
        paso++

        const cuerpo: Record<string, any> = {
            model: modelo,
            messages: mensajes,
            tools: definicionesHerramientas,
            tool_choice: "auto"
        }
        if (soportaTemperatura) {
            cuerpo.temperature = opciones.temperatura ?? 0.2
        }

        const res = await fetchLLM(`${cleanBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(cuerpo)
        })

        if (!res.ok) {
            const errorText = await res.text()
            throw new Error(`Error en llamada a API de IA (${res.status}): ${errorText}`)
        }

        const data = await res.json()
        const mensajeAsistente = data.choices?.[0]?.message

        if (data.usage) {
            tokensTotales.prompt += data.usage.prompt_tokens || 0
            tokensTotales.completion += data.usage.completion_tokens || 0
            tokensTotales.total += data.usage.total_tokens || 0
        }

        const llamadasTools: LlamadaHerramientaLLM[] = mensajeAsistente?.tool_calls || []

        // Si el modelo NO llamó a ninguna herramienta, redactó su respuesta final
        if (!llamadasTools || llamadasTools.length === 0) {
            const contenido = mensajeAsistente?.content || ""

            // Separar en múltiples mensajes si el modelo usó el delimitador de ráfaga
            const partesRaw = contenido
                .split(/---MENSAJE---|(?:\r?\n){2,}---(?:\r?\n){2,}/)
                .map((p: string) => p.trim())
                .filter(Boolean)

            const partes = partesRaw.length > 0 ? partesRaw : [contenido.trim()]

            const mensajesFinalesSanitizados: string[] = []
            for (let i = 0; i < partes.length; i++) {
                const parte = partes[i]
                const esEnCurso = historialPrevio.length > 0 || i > 0
                const sanitizado = sanitizarMensajeSalida(parte, {
                    palabrasProhibidas: config.palabrasProhibidas,
                    permitirBro: config.permitirBro,
                    esConversacionEnCurso: esEnCurso
                })
                if (sanitizado.textoLimpio) {
                    mensajesFinalesSanitizados.push(sanitizado.textoLimpio)
                }
            }

            const mensajeFinalUnificado = mensajesFinalesSanitizados.join("\n\n---\n\n")

            await persistirEstado()
            return {
                mensajeFinal: mensajeFinalUnificado || null,
                mensajesFinales: mensajesFinalesSanitizados,
                fotoUrl: extraerFotoDeBienvenida(herramientasEjecutadas, estadoConv),
                herramientasEjecutadas,
                escaladoHumano: false,
                latenciaMs: Date.now() - inicio,
                tokensUsados: tokensTotales
            }
        }

        // Si el modelo solicitó herramientas:
        // IMPORTANTE: Ignoramos cualquier texto intermedio que el modelo haya querido balbucear
        // como "Un momento, voy a consultar...". Las herramientas se ejecutan en silencio absoluto.
        mensajes.push({
            role: "assistant",
            content: null,
            tool_calls: llamadasTools
        })

        // Ejecutar cada herramienta
        for (const call of llamadasTools) {
            try {
                const ejecucion = await ejecutarHerramienta(call.function.name, call.function.arguments, {
                    conversationId: opciones.conversationId
                })
                herramientasEjecutadas.push(ejecucion)

                // 1. Si la herramienta fue explícitamente escalar_a_humano
                if (call.function.name === "escalar_a_humano") {
                    escaladoHumano = true
                    motivoEscalado = ejecucion.argumentos?.motivo || "escalado_manual"
                }

                // 1.b resolver_variante puede pedir escalado (moto no registrada en un
                //     combo con incompatibilidad física real): se honra en el acto.
                if (call.function.name === "resolver_variante" && ejecucion.resultado?.escalar === true) {
                    escaladoHumano = true
                    motivoEscalado = ejecucion.resultado?.motivo || "moto_no_registrada"
                    await escalarAHumano({
                        motivo: ejecucion.resultado?.motivo || "moto_no_registrada",
                        resumen_consulta: `Variante no resuelta para "${ejecucion.argumentos?.modelo_moto || "?"}" en combo "${ejecucion.argumentos?.combo || "?"}".`,
                        modelo_moto: ejecucion.argumentos?.modelo_moto,
                        kit: ejecucion.argumentos?.combo,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir escalado de resolver_variante:", err))
                }

                // 2. REGLA DETERMINISTA DE ORO: Si consultó compatibilidad y NO se encontró,
                //    se escala en silencio Y se persiste el pendiente linkeado a la conversación.
                if (call.function.name === "consultar_compatibilidad" && ejecucion.resultado?.encontrado === false) {
                    escaladoHumano = true
                    const moto = ejecucion.argumentos?.modelo_moto || "desconocida"
                    motivoEscalado = `moto_no_registrada: ${moto}`
                    await escalarAHumano({
                        motivo: "moto_no_registrada",
                        resumen_consulta: `Compatibilidad no confirmada para "${moto}"${ejecucion.argumentos?.kit_nombre_o_id ? ` con "${ejecucion.argumentos.kit_nombre_o_id}"` : ""}.`,
                        modelo_moto: moto,
                        kit: ejecucion.argumentos?.kit_nombre_o_id,
                        conversation_id: opciones.conversationId
                    }).catch((err) => console.error("[motor] fallo al persistir moto_no_registrada:", err))
                }

                // El modelo ve SOLO `mensaje_para_agente`: es el contrato de cada
                // herramienta (qué mostrar y qué NO mostrar en este paso). Los arrays
                // crudos (packs, grupos, variantes...) quedan en el inspector y la base
                // pero NO llegan al modelo, para que no contradiga la guía del paso.
                const contenidoParaModelo =
                    ejecucion.resultado && typeof ejecucion.resultado.mensaje_para_agente === "string"
                        ? ejecucion.resultado.mensaje_para_agente
                        : JSON.stringify(ejecucion.resultado)

                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: contenidoParaModelo
                })
            } catch (err: any) {
                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ error: err.message || "Error al ejecutar herramienta" })
                })
            }
        }

        // Capturar en el patch de estado lo que resolvieron las herramientas de este paso.
        for (const ej of herramientasEjecutadas) {
            const r = ej.resultado || {}
            if (ej.nombre === "consultar_catalogo_y_precios" && Array.isArray(r.grupos) && r.grupos.length === 1 && (r.packs?.length ?? 0) === 0) {
                patchEstado.grupoPineado = { id: r.grupos[0].id, nombre: r.grupos[0].nombre }
            }
            if (ej.nombre === "resolver_variante") {
                if (r.grupo_id && patchEstado.grupoPineado === undefined) {
                    patchEstado.grupoPineado = { id: r.grupo_id, nombre: ej.argumentos?.combo || "" }
                }
                if (r.resuelta && r.variante_pack_id) {
                    patchEstado.varianteResuelta = { packId: r.variante_pack_id, etiqueta: r.etiqueta || "", precio: r.precio || 0 }
                }
            }
            if (ej.nombre === "consultar_compatibilidad" && r.compatible === true && r.modelo_moto_detectado) {
                patchEstado.motoConfirmada = r.modelo_moto_detectado
            }
        }

        // Si se activó escalado a humano (por la herramienta o por regla determinista de compatibilidad):
        // SILENCIO TOTAL: El bot NO envía ningún mensaje al cliente de WhatsApp.
        if (escaladoHumano) {
            await persistirEstado()
            return {
                mensajeFinal: null, // Silencio total cara al cliente
                herramientasEjecutadas,
                escaladoHumano: true,
                motivoEscalado,
                latenciaMs: Date.now() - inicio,
                tokensUsados: tokensTotales
            }
        }

        // Si no escaló, el loop continúa hacia el paso siguiente pasando los resultados de las herramientas
    }

    // Si agotó los pasos máximos sin respuesta, escalar por seguridad
    await persistirEstado()
    return {
        mensajeFinal: null,
        herramientasEjecutadas,
        escaladoHumano: true,
        motivoEscalado: "limite_pasos_react_superado",
        latenciaMs: Date.now() - inicio,
        tokensUsados: tokensTotales
    }
}
