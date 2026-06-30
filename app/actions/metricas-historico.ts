"use server"

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"
import { VENTAS_HISTORICAS } from "@/lib/metricas/ventas-historicas-data"
import { CANALES, type Canal, type MesComparativa } from "@/lib/metricas/comparativa-tipos"

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function nuevoAcumulador(): Record<Canal, number> {
  return { MercadoLibre: 0, Mostrador: 0, Instagram: 0, Mayorista: 0 }
}

// Mapea el nombre libre de un PuntoVenta del sistema nuevo a un canal canónico.
// Devuelve null si el punto de venta no es uno de los 4 canales del panel.
function canalDesdePuntoVenta(nombre: string | null | undefined): Canal | null {
  const n = (nombre || "").toLowerCase()
  if (n.includes("mercadolibre") || n.includes("mercado libre")) return "MercadoLibre"
  if (n.includes("mostrador")) return "Mostrador"
  if (n.includes("instagram")) return "Instagram"
  if (n.includes("mayorista")) return "Mayorista"
  return null
}

/**
 * Serie mensual unificada de ventas por canal: datos históricos del sistema viejo
 * (CSV, meses cerrados) + agregación por mes del sistema nuevo (tabla Venta).
 *
 * Para cada mes que el sistema NUEVO ya tiene datos, se ignora el histórico de ese
 * mes (el nuevo es la fuente de verdad y evita doble conteo en el empalme).
 */
export async function obtenerComparativaMensual() {
  await requireAdmin()
  try {
    // ── 1. Agregación del sistema nuevo (tabla Venta) ──────────────────────────
    const ventas = await prisma.venta.findMany({
      where: {
        tipoVenta: { not: "PEDIDO" },
        estadoPedido: { not: "CANCELADO" },
      },
      select: {
        createdAt: true,
        total: true,
        totalFinal: true,
        mlIdVenta: true,
        puntoVenta: { select: { nombre: true } },
      },
    })

    // Para ventas ML: total = neto (comisiones ya descontadas), totalFinal = bruto.
    // Igual que en obtenerResumenVentas, usamos el neto para ML.
    const esML = (v: { mlIdVenta: string | null; puntoVenta?: { nombre: string } | null }) =>
      !!v.mlIdVenta || !!(v.puntoVenta?.nombre?.toLowerCase().includes("mercadolibre"))

    const netoVenta = (v: { total: any; totalFinal: any; mlIdVenta: string | null; puntoVenta?: { nombre: string } | null }) =>
      esML(v) ? Number(v.total) || 0 : Number(v.totalFinal) || Number(v.total) || 0

    // clave "anio-mes" -> canales
    const mapaNuevo = new Map<string, Record<Canal, number>>()
    for (const v of ventas) {
      // Hora local AR para no correr ventas de fin de mes al mes siguiente
      const d = new Date(v.createdAt)
      const anio = d.getFullYear()
      const mes = d.getMonth() + 1
      const clave = `${anio}-${mes}`
      // Detectar canal: primero por mlIdVenta, luego por nombre del punto de venta
      let canal: Canal | null = null
      if (esML(v)) {
        canal = "MercadoLibre"
      } else {
        canal = canalDesdePuntoVenta(v.puntoVenta?.nombre)
      }
      if (canal === null) continue // punto de venta fuera del panel
      if (!mapaNuevo.has(clave)) mapaNuevo.set(clave, nuevoAcumulador())
      mapaNuevo.get(clave)![canal] += netoVenta(v)
    }

    // ── 2. Corte de empalme ────────────────────────────────────────────────────
    // El CSV histórico es la fuente de verdad hasta su último mes completo.
    // El sistema nuevo manda recién DESDE el mes siguiente. Así un mes que el CSV
    // ya trae completo (ej: abr-2026) no se ve pisado por ventas de prueba sueltas
    // que ya existan en el sistema nuevo para ese mismo mes.
    const ordinal = (anio: number, mes: number) => anio * 100 + mes
    const ultimoHistorico = VENTAS_HISTORICAS.reduce(
      (max, h) => Math.max(max, ordinal(h.anio, h.mes)),
      0
    )

    // ── 3. Datos históricos (todos) ────────────────────────────────────────────
    const filas: MesComparativa[] = []

    for (const h of VENTAS_HISTORICAS) {
      const canales = nuevoAcumulador()
      for (const [k, v] of Object.entries(h.canales)) {
        if (!CANALES.includes(k as Canal)) continue // canal fuera del panel
        canales[k as Canal] += v
      }
      filas.push(armarFila(h.anio, h.mes, canales, "historico"))
    }

    // ── 4. Sistema nuevo: solo meses posteriores al último histórico ───────────
    for (const [clave, canales] of mapaNuevo.entries()) {
      const [anio, mes] = clave.split("-").map(Number)
      if (ordinal(anio, mes) <= ultimoHistorico) continue
      filas.push(armarFila(anio, mes, canales, "nuevo"))
    }

    filas.sort((a, b) => a.clave.localeCompare(b.clave, undefined, { numeric: true }))

    return { success: true as const, data: filas }
  } catch (e) {
    console.error("obtenerComparativaMensual:", e)
    return { success: false as const, error: "Error al cargar la comparativa mensual" }
  }
}

function armarFila(
  anio: number,
  mes: number,
  canales: Record<Canal, number>,
  origen: "historico" | "nuevo"
): MesComparativa {
  const total = (Object.values(canales) as number[]).reduce((a, b) => a + b, 0)
  return {
    anio,
    mes,
    clave: `${anio}-${String(mes).padStart(2, "0")}`,
    label: `${MESES_CORTOS[mes - 1]} ${String(anio).slice(2)}`,
    canales,
    total: Math.round(total * 100) / 100,
    origen,
  }
}
