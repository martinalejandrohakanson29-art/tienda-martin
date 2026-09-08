"use server"

import { prisma } from "@/lib/prisma"

const META_ACCESS_TOKEN =
  process.env.META_ACCESS_TOKEN ||
  "Bearer EAAUmeCFZB4bQBQoH2Alcc5LT1yUoSLC3RwjcYjz4H4Rq8PIdUtZCThr9QWkQyWZAwA1LVXOZA2wuELPeEJgkHf9BZCXeY2xHCMVIb8DINOZAJGq3DjgYMk2CTfa1OuMj9xy6uZC6yJBTR1XPY5jxk1ryfCb1qd0i4oLc5xMyhcTMOOpeZAKH695QGS9VS83omYOF7gZDZD"
const META_AD_ACCOUNT = "act_1382686226631627"

export interface TopArticuloDashboard {
  nombre: string
  cantidad: number
  recaudado: number
  porcentaje: number
}

export interface EvolucionDiariaItem {
  fecha: string // YYYY-MM-DD
  etiqueta: string // DD/MM
  ventasBrutas: number
  cantidadVentas: number
  gastoMeta: number
}

export interface VentaRecienteItem {
  id: string
  numeroVenta: number
  fecha: string
  cliente: string
  totalFinal: number
  metodoPago: string
  estadoPedido: string
  itemsCount: number
  resumenItems: string
}

export interface InstagramDashboardResult {
  success: boolean
  error?: string
  filtros: {
    preset: string
    fechaDesde: string
    fechaHasta: string
    puntoVentaId?: string
    puntoVentaNombre?: string
  }
  metricas: {
    ventasBrutas: number
    gastoMeta: number
    mensajesTotales: number
    cantidadVentas: number // 1 pedido con varios articulos es 1 venta
    ticketPromedio: number
    roas: number
    costoPorMensaje: number
    tasaConversion: number
  }
  topArticulos: TopArticuloDashboard[]
  evolucionDiaria: EvolucionDiariaItem[]
  ventasRecientes: VentaRecienteItem[]
}

/** Formatea una fecha local (en zona horaria Argentina) a string YYYY-MM-DD */
function formatISODateArg(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Calcula el rango de fechas en hora local Argentina según el preset */
function calcularRangoFechas(preset: string = "last_15d", fechaDesde?: string, fechaHasta?: string) {
  const now = new Date()
  // Ajustamos a zona horaria de Argentina (UTC-3)
  const argNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }))

  let inicio = new Date(argNow.getFullYear(), argNow.getMonth(), argNow.getDate(), 0, 0, 0, 0)
  let fin = new Date(argNow.getFullYear(), argNow.getMonth(), argNow.getDate(), 23, 59, 59, 999)

  if (fechaDesde && fechaHasta) {
    const [yD, mD, dD] = fechaDesde.split("-").map(Number)
    const [yH, mH, dH] = fechaHasta.split("-").map(Number)
    inicio = new Date(yD, mD - 1, dD, 0, 0, 0, 0)
    fin = new Date(yH, mH - 1, dH, 23, 59, 59, 999)
    return { inicio, fin, strDesde: fechaDesde, strHasta: fechaHasta }
  }

  switch (preset) {
    case "today":
      break
    case "yesterday":
      inicio.setDate(inicio.getDate() - 1)
      fin.setDate(fin.getDate() - 1)
      break
    case "last_7d":
      inicio.setDate(inicio.getDate() - 7)
      break
    case "last_15d":
      inicio.setDate(inicio.getDate() - 15)
      break
    case "this_month":
      inicio = new Date(argNow.getFullYear(), argNow.getMonth(), 1, 0, 0, 0, 0)
      break
    case "last_month":
      inicio = new Date(argNow.getFullYear(), argNow.getMonth() - 1, 1, 0, 0, 0, 0)
      fin = new Date(argNow.getFullYear(), argNow.getMonth(), 0, 23, 59, 59, 999)
      break
    case "last_30d":
    default:
      inicio.setDate(inicio.getDate() - 30)
      break
  }

  return {
    inicio,
    fin,
    strDesde: formatISODateArg(inicio),
    strHasta: formatISODateArg(fin)
  }
}

/**
 * Consulta en tiempo real las métricas de gasto y mensajes de Meta Ads para el rango exacto.
 */
async function consultarMetaAdsRango(strDesde: string, strHasta: string) {
  try {
    const authHeader = META_ACCESS_TOKEN.startsWith("Bearer ")
      ? META_ACCESS_TOKEN
      : `Bearer ${META_ACCESS_TOKEN}`

    const timeRange = JSON.stringify({ since: strDesde, until: strHasta })

    // Consultamos las métricas agregadas de toda la cuenta publicitaria en el período
    const url = `https://graph.facebook.com/v19.0/${META_AD_ACCOUNT}/insights?fields=spend,reach,impressions,actions&time_range=${encodeURIComponent(
      timeRange
    )}&limit=500`

    const res = await fetch(url, {
      headers: { Authorization: authHeader },
      cache: "no-store"
    })

    if (!res.ok) {
      console.warn(`Meta API respondió status ${res.status}: ${res.statusText}`)
      return { totalSpend: 0, totalMessages: 0 }
    }

    const json = await res.json()
    const accData = json.data?.[0]
    const totalSpend = parseFloat(accData?.spend || 0) || 0
    const actions = Array.isArray(accData?.actions) ? accData.actions : []

    // En Meta Ads, los mensajes totales de todas las publicidades corresponden a:
    // 1. onsite_conversion.total_messaging_connection (Conexiones de mensajería totales)
    // 2. onsite_conversion.messaging_conversation_started_7d (Conversaciones iniciadas)
    // 3. onsite_conversion.messaging_first_reply (Primeras respuestas)
    const totalConnObj = actions.find(
      (a: any) => a.action_type === "onsite_conversion.total_messaging_connection"
    )
    const startedObj = actions.find(
      (a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d"
    )
    const firstReplyObj = actions.find(
      (a: any) => a.action_type === "onsite_conversion.messaging_first_reply"
    )

    const totalMessages = totalConnObj
      ? parseInt(totalConnObj.value) || 0
      : (startedObj
          ? parseInt(startedObj.value) || 0
          : (firstReplyObj
              ? parseInt(firstReplyObj.value) || 0
              : 0))

    return {
      totalSpend: Number(totalSpend.toFixed(2)),
      totalMessages
    }
  } catch (err) {
    console.error("Error al consultar Meta Ads para el panel general:", err)
    return { totalSpend: 0, totalMessages: 0 }
  }
}

export async function getInstagramGeneralDashboard(options?: {
  preset?: string
  fechaDesde?: string
  fechaHasta?: string
  puntoVentaId?: string
}): Promise<InstagramDashboardResult> {
  try {
    const preset = options?.preset || "last_15d"
    const { inicio, fin, strDesde, strHasta } = calcularRangoFechas(
      preset,
      options?.fechaDesde,
      options?.fechaHasta
    )

    // 1. Identificamos los Puntos de Venta: siempre sumamos Instagram + Mostrador
    const puntosVenta = await prisma.puntoVenta.findMany({
      orderBy: { nombre: "asc" }
    })

    const defaultPvs = puntosVenta.filter(pv => {
      const nom = pv.nombre.toLowerCase()
      return nom.includes("instagram") || nom.includes("mostrador")
    })

    let targetPvIds = defaultPvs.length > 0 ? defaultPvs.map(p => p.id) : puntosVenta.map(p => p.id)
    let puntoVentaNombre = "Instagram + Mostrador"

    if (options?.puntoVentaId) {
      const found = puntosVenta.find(pv => pv.id === options.puntoVentaId)
      if (found) {
        targetPvIds = [found.id]
        puntoVentaNombre = found.nombre
      }
    }

    // 2. Traemos en paralelo datos de Meta Ads y Ventas de PostgreSQL
    const [metaData, ventas, packsDef, todosArticulos] = await Promise.all([
      consultarMetaAdsRango(strDesde, strHasta),
      prisma.venta.findMany({
        where: {
          estadoPedido: { not: "CANCELADO" },
          createdAt: { gte: inicio, lte: fin },
          puntoVentaId: { in: targetPvIds }
        },
        include: {
          items: true
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.articuloMostrador.findMany({
        where: { esPack: true },
        include: { packItems: true }
      }),
      prisma.articuloMostrador.findMany({
        select: { id: true, nombre: true }
      })
    ])

    // 3. Cálculos de Ventas Brutas y Cantidad de Ventas
    // REGLA CLAVE: "un pack con varios articulos es 1 venta". Cada registro de Venta es exactamente 1 venta/pedido.
    const cantidadVentas = ventas.length

    let ventasBrutas = 0
    for (const v of ventas) {
      const monto = Number(v.totalFinal || v.total || 0)
      ventasBrutas += monto
    }

    // 4. Mapeo y Reconstrucción de Packs / Top Artículos Más Vendidos
    const articuloByNombre = new Map(todosArticulos.map(a => [a.nombre.toLowerCase().trim(), a]))
    const packs = packsDef
      .filter(p => p.packItems.length > 0)
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        componentes: p.packItems.map(pi => ({ componenteId: pi.componenteId, cantidad: pi.cantidad })),
        totalComponentes: p.packItems.reduce((s, pi) => s + pi.cantidad, 0)
      }))
      .sort((a, b) => b.totalComponentes - a.totalComponentes)

    const salesByArticle: Record<string, { cantidad: number; recaudado: number; nombre: string }> = {}

    const acumularVenta = (key: string, nombre: string, cant: number, monto: number) => {
      // Filtrar fletes/envíos y notas
      const nomLower = nombre.toLowerCase().trim()
      if (nomLower === "envio" || nomLower.startsWith("envío") || nomLower.startsWith("costo de envio")) {
        return
      }
      if (!salesByArticle[key]) {
        salesByArticle[key] = { cantidad: 0, recaudado: 0, nombre }
      }
      salesByArticle[key].cantidad += cant
      salesByArticle[key].recaudado += monto
    }

    for (const venta of ventas) {
      const disp: Record<string, { qty: number; monto: number; nombre: string }> = {}

      for (const item of venta.items) {
        if (item.esNota) continue
        const nomLower = item.nombre.toLowerCase().trim()
        if (nomLower === "envio" || nomLower.startsWith("envío") || nomLower.startsWith("costo de envio")) {
          continue
        }

        // Pack registrado directamente
        if (item.productoId?.startsWith("PACK-")) {
          const matchPack = packsDef.find(p => p.nombre.toLowerCase().trim() === nomLower)
          const packKey = matchPack ? matchPack.id : nomLower
          acumularVenta(packKey, item.nombre, item.cantidad, Number(item.subtotal))
          continue
        }

        const pid = item.productoId
        if (!pid) {
          const matchArt = articuloByNombre.get(nomLower)
          const artKey = matchArt ? matchArt.id : nomLower
          acumularVenta(artKey, item.nombre, item.cantidad, Number(item.subtotal))
          continue
        }

        if (!disp[pid]) disp[pid] = { qty: 0, monto: 0, nombre: item.nombre }
        disp[pid].qty += item.cantidad
        disp[pid].monto += Number(item.subtotal)
      }

      // Reconstruir packs vendidos por componentes
      for (const pack of packs) {
        let copias = Infinity
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId]
          const posibles = d ? Math.floor(d.qty / comp.cantidad) : 0
          if (posibles < copias) copias = posibles
          if (copias === 0) break
        }
        if (!isFinite(copias) || copias <= 0) continue

        let montoPack = 0
        for (const comp of pack.componentes) {
          const d = disp[comp.componenteId]
          const consumir = comp.cantidad * copias
          const precioUnit = d.qty > 0 ? d.monto / d.qty : 0
          const montoConsumido = precioUnit * consumir
          d.qty -= consumir
          d.monto -= montoConsumido
          montoPack += montoConsumido
        }
        acumularVenta(pack.id, pack.nombre, copias, montoPack)
      }

      // Componentes individuales restantes
      for (const [pid, d] of Object.entries(disp)) {
        if (d.qty > 0) acumularVenta(pid, d.nombre, d.qty, d.monto)
      }
    }

    const totalUnidadesVendidas = Object.values(salesByArticle).reduce((s, a) => s + a.cantidad, 0)

    const topArticulos: TopArticuloDashboard[] = Object.values(salesByArticle)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
      .map(art => ({
        nombre: art.nombre,
        cantidad: art.cantidad,
        recaudado: Number(art.recaudado.toFixed(2)),
        porcentaje: totalUnidadesVendidas > 0 ? Number(((art.cantidad / totalUnidadesVendidas) * 100).toFixed(1)) : 0
      }))

    // 5. Agrupación de Evolución Diaria (para el gráfico interactivo)
    const mapaDias = new Map<string, { ventasBrutas: number; cantidadVentas: number }>()

    // Inicializamos todos los días del rango para que no queden huecos
    const cursor = new Date(inicio)
    while (cursor <= fin) {
      const yyyyMmDd = formatISODateArg(cursor)
      mapaDias.set(yyyyMmDd, { ventasBrutas: 0, cantidadVentas: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    ventas.forEach(v => {
      const vFecha = new Date(v.createdAt.toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }))
      const yyyyMmDd = formatISODateArg(vFecha)
      const diaObj = mapaDias.get(yyyyMmDd)
      if (diaObj) {
        diaObj.ventasBrutas += Number(v.totalFinal || v.total || 0)
        diaObj.cantidadVentas += 1
      }
    })

    const diasTotales = Math.max(mapaDias.size, 1)
    const gastoPromedioDiario = metaData.totalSpend / diasTotales

    const evolucionDiaria: EvolucionDiariaItem[] = Array.from(mapaDias.entries()).map(([fecha, datos]) => {
      const [, m, d] = fecha.split("-")
      return {
        fecha,
        etiqueta: `${d}/${m}`,
        ventasBrutas: Number(datos.ventasBrutas.toFixed(2)),
        cantidadVentas: datos.cantidadVentas,
        gastoMeta: Number(gastoPromedioDiario.toFixed(2))
      }
    })

    // 6. Resumen de Ventas Recientes para auditoría rápida
    const ventasRecientes: VentaRecienteItem[] = ventas.slice(0, 15).map(v => {
      const vFecha = new Date(v.createdAt.toLocaleString("en-US", { timeZone: "America/Argentina/Cordoba" }))
      const fechaFormateada = `${vFecha.getDate().toString().padStart(2, "0")}/${(vFecha.getMonth() + 1)
        .toString()
        .padStart(2, "0")} ${vFecha.getHours().toString().padStart(2, "0")}:${vFecha
        .getMinutes()
        .toString()
        .padStart(2, "0")} hs`

      const itemsNoEnvio = v.items.filter(it => !it.esNota && !it.nombre.toLowerCase().includes("envio"))
      const resumenItems =
        itemsNoEnvio.map(it => `${it.cantidad}x ${it.nombre}`).slice(0, 3).join(", ") +
        (itemsNoEnvio.length > 3 ? ` (+${itemsNoEnvio.length - 3} más)` : "")

      return {
        id: v.id,
        numeroVenta: v.numeroVenta,
        fecha: fechaFormateada,
        cliente: v.cliente || "Consumidor Final",
        totalFinal: Number(v.totalFinal || v.total || 0),
        metodoPago: v.metodo_pago || "Sin especificar",
        estadoPedido: v.estadoPedido || "PENDIENTE",
        itemsCount: itemsNoEnvio.length,
        resumenItems: resumenItems || "Sin artículos registrados"
      }
    })

    // 7. Métricas derivadas
    const ticketPromedio = cantidadVentas > 0 ? ventasBrutas / cantidadVentas : 0
    const roas = metaData.totalSpend > 0 ? ventasBrutas / metaData.totalSpend : (ventasBrutas > 0 ? 999 : 0)
    const costoPorMensaje = metaData.totalMessages > 0 ? metaData.totalSpend / metaData.totalMessages : 0
    const tasaConversion = metaData.totalMessages > 0 ? (cantidadVentas / metaData.totalMessages) * 100 : 0

    return {
      success: true,
      filtros: {
        preset,
        fechaDesde: strDesde,
        fechaHasta: strHasta,
        puntoVentaId: targetPvIds.length === 1 ? targetPvIds[0] : undefined,
        puntoVentaNombre
      },
      metricas: {
        ventasBrutas: Number(ventasBrutas.toFixed(2)),
        gastoMeta: metaData.totalSpend,
        mensajesTotales: metaData.totalMessages,
        cantidadVentas,
        ticketPromedio: Number(ticketPromedio.toFixed(2)),
        roas: Number(roas.toFixed(2)),
        costoPorMensaje: Number(costoPorMensaje.toFixed(2)),
        tasaConversion: Number(tasaConversion.toFixed(2))
      },
      topArticulos,
      evolucionDiaria,
      ventasRecientes
    }
  } catch (error: any) {
    console.error("Error en getInstagramGeneralDashboard:", error)
    return {
      success: false,
      error: error.message || "Error al cargar el panel general de Instagram",
      filtros: {
        preset: options?.preset || "last_15d",
        fechaDesde: options?.fechaDesde || "",
        fechaHasta: options?.fechaHasta || ""
      },
      metricas: {
        ventasBrutas: 0,
        gastoMeta: 0,
        mensajesTotales: 0,
        cantidadVentas: 0,
        ticketPromedio: 0,
        roas: 0,
        costoPorMensaje: 0,
        tasaConversion: 0
      },
      topArticulos: [],
      evolucionDiaria: [],
      ventasRecientes: []
    }
  }
}
