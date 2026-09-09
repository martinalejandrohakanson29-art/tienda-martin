"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { getInstagramGeneralDashboard, InstagramDashboardResult } from "@/app/actions/instagram-dashboard"
import { getMarketingPerformance, MarketingPerformanceResult } from "@/app/actions/marketing"
import { obtenerConfiguracionAgente } from "@/bot-agente/configuracion"

export interface MensajeChatIA {
  rol: "user" | "assistant"
  contenido: string
  timestamp?: string
}

export interface ConsultaIAParams {
  mensaje: string
  historial?: MensajeChatIA[]
  preset?: string
  fechaDesde?: string
  fechaHasta?: string
}

export interface RespuestaIAConsulta {
  ok: boolean
  respuesta?: string
  error?: string
  datosContexto?: {
    preset: string
    fechaDesde: string
    fechaHasta: string
    ventasBrutas: number
    gastoMeta: number
    roas: number
    totalCampanas: number
  }
}

/**
 * Serializa de forma clara y concisa los datos del Panel General y del Tablero de Salud
 * para inyectarlos en el prompt de DeepSeek.
 */
function serializarDatosParaIA(
  general: InstagramDashboardResult,
  marketing: MarketingPerformanceResult
): string {
  const lineas: string[] = []

  lineas.push(`=== PERÍODO Y FILTROS ===`)
  lineas.push(`Preset: ${general.filtros.preset || "No especificado"}`)
  lineas.push(`Rango de Fechas: ${general.filtros.fechaDesde} hasta ${general.filtros.fechaHasta}`)
  lineas.push(``)

  lineas.push(`=== PANEL GENERAL DE INSTAGRAM ===`)
  lineas.push(`- Ventas Brutas Totales: $${Math.round(general.metricas.ventasBrutas).toLocaleString("es-AR")}`)
  lineas.push(`- Inversión Publicitaria Meta: $${Math.round(general.metricas.gastoMeta).toLocaleString("es-AR")}`)
  lineas.push(`- ROAS General: ${general.metricas.roas.toFixed(2)}x`)
  lineas.push(`- Cantidad de Ventas / Pedidos: ${general.metricas.cantidadVentas}`)
  lineas.push(`- Mensajes Totales Recibidos: ${general.metricas.mensajesTotales}`)
  lineas.push(`- Ticket Promedio: $${Math.round(general.metricas.ticketPromedio).toLocaleString("es-AR")}`)
  lineas.push(`- Costo Promedio por Mensaje: $${Math.round(general.metricas.costoPorMensaje).toLocaleString("es-AR")}`)
  lineas.push(`- Tasa de Conversión a Venta (mensajes -> ventas): ${general.metricas.tasaConversion.toFixed(1)}%`)
  lineas.push(``)

  if (general.topArticulos && general.topArticulos.length > 0) {
    lineas.push(`--- TOP ARTÍCULOS MÁS VENDIDOS (PANEL GENERAL) ---`)
    general.topArticulos.slice(0, 10).forEach((art, i) => {
      lineas.push(
        `${i + 1}. ${art.nombre}: ${art.cantidad} unidades vendidas | Recaudado: $${Math.round(art.recaudado).toLocaleString("es-AR")} (${art.porcentaje.toFixed(1)}% del total)`
      )
    })
    lineas.push(``)
  }

  if (general.evolucionDiaria && general.evolucionDiaria.length > 0) {
    lineas.push(`--- EVOLUCIÓN DIARIA RECIENTE (ÚLTIMOS DÍAS) ---`)
    // Tomamos hasta los últimos 10 días para contexto
    general.evolucionDiaria.slice(-10).forEach((dia) => {
      lineas.push(
        `Fecha ${dia.etiqueta}: Ventas $${Math.round(dia.ventasBrutas).toLocaleString("es-AR")} (${dia.cantidadVentas} pedidos) | Gasto Meta $${Math.round(dia.gastoMeta).toLocaleString("es-AR")}`
      )
    })
    lineas.push(``)
  }

  lineas.push(`=== TABLERO DE SALUD & MARKETING (META ADS) ===`)
  const gh = marketing.globalHealth
  if (gh) {
    lineas.push(`- Inversión Total Meta (Spend): $${Math.round(gh.totalSpend).toLocaleString("es-AR")}`)
    lineas.push(`- Facturación Atribuida: $${Math.round(gh.totalFacturacion).toLocaleString("es-AR")}`)
    lineas.push(`- Ventas Atribuidas: ${gh.totalVentas} (Unidades: ${gh.totalUnidades || 0})`)
    lineas.push(`- Costo de Mercadería: $${Math.round(gh.totalCosto).toLocaleString("es-AR")}`)
    lineas.push(`- Margen Bruto: $${Math.round(gh.totalMargenBruto).toLocaleString("es-AR")}`)
    lineas.push(`- Margen Neto (después de restar inversión en anuncios): $${Math.round(gh.totalMargenNeto).toLocaleString("es-AR")}`)
    lineas.push(`- ROAS Global de Facturación: ${gh.globalRoas.toFixed(2)}x`)
    lineas.push(`- POAS Global de Margen (Margen Bruto / Gasto Ads): ${gh.globalPoas.toFixed(2)}x`)
    lineas.push(`- CPA Real (Costo por Adquisición): $${Math.round(gh.globalCpa).toLocaleString("es-AR")}`)
    lineas.push(`- Mensajes Totales de Campañas: ${gh.totalMessages}`)
    lineas.push(`- Costo por Lead / Mensaje Global: $${Math.round(gh.costoPorLead || 0).toLocaleString("es-AR")}`)
    lineas.push(`- Tasa de Conversión Global: ${gh.globalConversionRate.toFixed(1)}%`)
    lineas.push(``)
  }

  if (marketing.campaigns && marketing.campaigns.length > 0) {
    lineas.push(`--- DETALLE DE CAMPAÑAS ACTIVAS Y SALUD ---`)
    marketing.campaigns.forEach((camp, idx) => {
      const h = camp.health
      const articulosNombres = (camp.items || [])
        .map((it) => `${it.articulo?.nombre || "Artículo"} (${it.unidadesVendidas}u vendidas, $${Math.round(it.facturacion).toLocaleString("es-AR")})`)
        .join(", ")

      lineas.push(`[Campaña ${idx + 1}] "${camp.name}"`)
      lineas.push(`  - Estado: ${camp.status} | Salud: ${h?.estadoSalud || "SIN_DATOS"}`)
      lineas.push(`  - Inversión (Spend): $${Math.round(camp.spend).toLocaleString("es-AR")}`)
      lineas.push(`  - Mensajes generados: ${camp.messages} | Costo por Mensaje: $${Math.round(camp.costPerMsg || 0).toLocaleString("es-AR")}`)
      lineas.push(`  - Métricas de alcance: ${camp.reach} personas, ${camp.impressions} impresiones, ${camp.clicks} clics (CTR: ${(camp.ctr || 0).toFixed(2)}%, CPC: $${Math.round(camp.cpc || 0).toLocaleString("es-AR")})`)
      
      if (h) {
        lineas.push(`  - Unidades vendidas: ${h.unidadesVendidas} | Facturación Real: $${Math.round(h.facturacionReal).toLocaleString("es-AR")}`)
        lineas.push(`  - Margen Bruto: $${Math.round(h.margenBruto).toLocaleString("es-AR")} | Margen Neto: $${Math.round(h.margenNeto).toLocaleString("es-AR")}`)
        lineas.push(`  - ROAS Facturación: ${h.roasFacturacion.toFixed(2)}x | POAS Margen: ${h.poasMargen.toFixed(2)}x`)
        lineas.push(`  - CPA Real: $${Math.round(h.cpaReal).toLocaleString("es-AR")} | Tasa Conversión: ${h.conversionRate.toFixed(1)}%`)
      }

      if (articulosNombres) {
        lineas.push(`  - Artículos asignados y ventas: ${articulosNombres}`)
      } else {
        lineas.push(`  - Artículos asignados: Ninguno vinculado`)
      }
      lineas.push(``)
    })
  } else {
    lineas.push(`No hay campañas activas registradas en el período.`)
  }

  return lineas.join("\n")
}

/**
 * Consulta a la IA de DeepSeek alimentándola con los datos de ambas pestañas.
 */
export async function consultarIAInstagramAction(params: ConsultaIAParams): Promise<RespuestaIAConsulta> {
  try {
    try {
      await requireAdmin()
    } catch (authErr) {
      // Permitir pruebas locales en consola si no hay sesión HTTP
      if (process.env.NODE_ENV === "production") {
        throw authErr
      }
    }

    const { mensaje, historial = [], preset = "last_15d", fechaDesde, fechaHasta } = params

    if (!mensaje || !mensaje.trim()) {
      return { ok: false, error: "El mensaje no puede estar vacío." }
    }

    // 1. Obtener API key de DeepSeek
    const configAgente = await obtenerConfiguracionAgente()
    const apiKey = configAgente.deepseekApiKey || process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return {
        ok: false,
        error: "No se encontró configurada la API Key de DeepSeek en chat_config ni en variables de entorno."
      }
    }

    // 2. Traer en paralelo los datos de ambas pestañas
    const [generalData, marketingData] = await Promise.all([
      getInstagramGeneralDashboard({ preset, fechaDesde, fechaHasta }),
      getMarketingPerformance({ datePreset: preset, fechaDesde, fechaHasta })
    ])

    if (!generalData.success) {
      return {
        ok: false,
        error: `Error al cargar datos del panel general: ${generalData.error || "Desconocido"}`
      }
    }

    // 3. Preparar contexto con los datos
    const datosContextoTexto = serializarDatosParaIA(generalData, marketingData)

    const systemPrompt = `Eres un Asistente Analista Senior de Marketing Digital, Publicidad en Meta Ads y Ventas para Revolución Motos, asesorando directamente a Martín (el dueño de la tienda de repuestos y kits de motos en Córdoba).

TU CONOCIMIENTO SE BASA EXCLUSIVAMENTE EN LOS SIGUIENTES DATOS OFICIALES DE LA TIENDA (PANEL GENERAL DE INSTAGRAM Y TABLERO DE SALUD DE MARKETING):
"""
${datosContextoTexto}
"""

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. GROUNDING ESTRICTO: Responde SIEMPRE apoyándote en los datos de arriba. Si te preguntan sobre un dato, producto o métrica que NO está presente en el informe (por ejemplo, clientes específicos, números de teléfono o periodos ajenos al seleccionado), aclara honestamente que no figura en los datos del tablero actual. CERO inventar cifras o suposiciones no respaldadas.
2. TONO Y ESTILO: Profesional, directo, comercial y al grano. Habla de tú a tú con Martín con claridad y seguridad. Nada de introducciones vacías ("¡Hola Martín! Qué buena pregunta..."). Directo a la respuesta con análisis útil.
3. FORMATO: Utiliza Markdown limpio. Destaca números clave en negrita (ej: **$1.450.000**, **3.8x**, **14 ventas**). Usa viñetas breves cuando compares campañas o productos.
4. MONEDA: Todos los valores monetarios son en pesos argentinos ($) con separador de miles.
5. APORTE DE VALOR: Además de recitar el número frío, explica qué significa y da una recomendación práctica si aplica (por ejemplo: si una campaña tiene estado CRÍTICO o POAS menor a 1, señala que está quemando presupuesto; si tiene POAS alto y bajo costo por mensaje, sugiere que tiene margen para escalar).`

    // 4. Formatear mensajes para DeepSeek
    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...historial.slice(-8).map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.contenido
      })),
      { role: "user", content: mensaje }
    ]

    // 5. Llamada directa a DeepSeek API
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: messagesPayload,
          temperature: 0.3,
          max_tokens: 1500
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        console.error(`[consulta-ia] DeepSeek error ${response.status}:`, errorText)
        return {
          ok: false,
          error: `Error de respuesta del proveedor de IA (${response.status}): ${errorText.slice(0, 150)}`
        }
      }

      const json = await response.json()
      const respuestaTexto = json.choices?.[0]?.message?.content || "No se recibió respuesta de la IA."

      return {
        ok: true,
        respuesta: respuestaTexto,
        datosContexto: {
          preset: generalData.filtros.preset,
          fechaDesde: generalData.filtros.fechaDesde,
          fechaHasta: generalData.filtros.fechaHasta,
          ventasBrutas: generalData.metricas.ventasBrutas,
          gastoMeta: generalData.metricas.gastoMeta,
          roas: generalData.metricas.roas,
          totalCampanas: marketingData.campaigns?.length || 0
        }
      }
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      console.error("[consulta-ia] Error al conectar con DeepSeek:", fetchErr)
      return {
        ok: false,
        error: `No se pudo conectar con el servicio de IA: ${fetchErr?.message || "Timeout o error de red"}`
      }
    }
  } catch (error: any) {
    console.error("[consulta-ia] Error general:", error)
    return {
      ok: false,
      error: error?.message || "Error interno al procesar la consulta."
    }
  }
}

/**
 * Genera el resumen inicial general y simple para el inicio de la charla.
 */
export async function obtenerResumenInicialIAAction(params: {
  preset?: string
  fechaDesde?: string
  fechaHasta?: string
}): Promise<RespuestaIAConsulta> {
  const promptInicial = `Hacé un resumen general, simple y bien estructurado de la situación actual según los datos cargados del Panel General de Instagram y del Tablero de Salud publicitaria.

Estructura el resumen en:
1. **Panorama General**: Facturación total, inversión publicitaria Meta, ROAS y cantidad de pedidos.
2. **Consultas y Costos**: Mensajes totales recibidos, costo por mensaje y tasa de conversión.
3. **Salud de Campañas**: Cuántas campañas están saludables, cuáles están en estado crítico o quemando presupuesto, y cuál es la más rentable (mejor POAS/ROAS).
4. **Productos Top**: Los 2 o 3 repuestos o kits que más traccionaron.
5. **Conclusión / Foco de Hoy**: Una frase simple con la recomendación comercial inmediata más importante.

Mantenelo conciso, visual y fácil de leer para Martín.`

  return consultarIAInstagramAction({
    mensaje: promptInicial,
    historial: [],
    preset: params.preset,
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta
  })
}
