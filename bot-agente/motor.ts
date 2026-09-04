import { MensajeChat, RespuestaAgente, HerramientaEjecutadaInfo, LlamadaHerramientaLLM } from "./tipos"
import { definicionesHerramientas, ejecutarHerramienta } from "./herramientas"
import { PROMPT_SISTEMA_AGENTE } from "./prompts/sistema"
import { sanitizarMensajeSalida } from "./guardrails/sanitizador"
import { obtenerConfiguracionAgente } from "./configuracion"

export interface OpcionesEjecucion {
    apiKey?: string
    modelo?: string
    temperatura?: number
    baseUrl?: string
}

const DEFAULT_MODEL = "gpt-4o-mini" // Rápido, económico y con excelente soporte de tool calling
const DEFAULT_BASE_URL = "https://api.openai.com/v1"

/**
 * Ejecuta un turno conversacional del agente con soporte de Tool Calling
 */
export async function ejecutarTurnoAgente(
    mensajeUsuario: string,
    historialPrevio: MensajeChat[] = [],
    opciones: OpcionesEjecucion = {}
): Promise<RespuestaAgente> {
    const inicio = Date.now()
    const modelo = opciones.modelo || DEFAULT_MODEL
    const baseUrl = (opciones.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")

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

    // Cargar configuración editable desde base de datos
    const config = await obtenerConfiguracionAgente()

    // 1. Saludo simple o sin intención ("Hola!", "Buenas"): orientar al cliente directo sin costo de IA
    if (historialPrevio.length === 0 && esSaludoSinIntencion(mensajeUsuario)) {
        const saludo = `Hola ${config.permitirBro ? "bro" : "amigo"}! En qué te podemos ayudar?`
        return {
            mensajeFinal: saludo,
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
        if (baseUrl.includes("deepseek.com")) {
            apiKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY
        } else if (baseUrl.includes("openrouter.ai")) {
            apiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY
        } else {
            apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY
        }
    }

    if (!apiKey) {
        throw new Error(
            "Falta la clave de API para este modelo. Podés cargarla y guardarla en la pestaña 'Ajustes de Estilo y Palabras' en la sección 'Claves de API' de esta misma pantalla."
        )
    }

    const herramientasEjecutadas: HerramientaEjecutadaInfo[] = []
    let escaladoHumano = false
    let motivoEscalado: string | undefined

    const promptFinal = config.tonoEstilo
        ? `${PROMPT_SISTEMA_AGENTE}\n\n### PAUTA DE ESTILO CONFIGURADA POR EL DUEÑO:\n${config.tonoEstilo}`
        : PROMPT_SISTEMA_AGENTE

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
    const MAX_PASOS_REACT = 4
    let paso = 0

    while (paso < MAX_PASOS_REACT) {
        paso++

        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelo,
                messages: mensajes,
                tools: definicionesHerramientas,
                tool_choice: "auto",
                temperature: opciones.temperatura ?? 0.2
            })
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
            const sanitizado = sanitizarMensajeSalida(contenido, {
                palabrasProhibidas: config.palabrasProhibidas,
                permitirBro: config.permitirBro
            })

            return {
                mensajeFinal: sanitizado.textoLimpio,
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
                const ejecucion = await ejecutarHerramienta(call.function.name, call.function.arguments)
                herramientasEjecutadas.push(ejecucion)

                // 1. Si la herramienta fue explícitamente escalar_a_humano
                if (call.function.name === "escalar_a_humano") {
                    escaladoHumano = true
                    motivoEscalado = ejecucion.argumentos?.motivo || "escalado_manual"
                }

                // 2. REGLA DETERMINISTA DE ORO: Si consultó compatibilidad y NO se encontró
                if (call.function.name === "consultar_compatibilidad" && ejecucion.resultado?.encontrado === false) {
                    escaladoHumano = true
                    const moto = ejecucion.argumentos?.modelo_moto || "desconocida"
                    motivoEscalado = `moto_no_registrada: ${moto}`
                }

                mensajes.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify(ejecucion.resultado)
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

        // Si se activó escalado a humano (por la herramienta o por regla determinista de compatibilidad):
        // SILENCIO TOTAL: El bot NO envía ningún mensaje al cliente de WhatsApp.
        if (escaladoHumano) {
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
    return {
        mensajeFinal: null,
        herramientasEjecutadas,
        escaladoHumano: true,
        motivoEscalado: "limite_pasos_react_superado",
        latenciaMs: Date.now() - inicio,
        tokensUsados: tokensTotales
    }
}
