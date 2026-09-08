"use client"

import React, { useState, useTransition } from "react"
import {
  DollarSign,
  TrendingUp,
  MessageSquare,
  PackageCheck,
  Calendar,
  RefreshCw,
  Award,
  BarChart3,
  Sparkles,
  ShoppingBag,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  Clock
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  getInstagramGeneralDashboard,
  InstagramDashboardResult
} from "@/app/actions/instagram-dashboard"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts"

interface Props {
  initialData: InstagramDashboardResult
}

const PRESETS = [
  { id: "last_15d", label: "Últimos 15 días", days: 15 },
  { id: "last_30d", label: "Últimos 30 días", days: 30 },
  { id: "last_7d", label: "Últimos 7 días", days: 7 },
  { id: "this_month", label: "Este mes", days: null },
  { id: "last_month", label: "Mes pasado", days: null },
  { id: "today", label: "Hoy", days: 1 },
  { id: "yesterday", label: "Ayer", days: 1 },
  { id: "custom", label: "Personalizado", days: null }
]

export function InstagramGeneralClient({ initialData }: Props) {
  const [data, setData] = useState<InstagramDashboardResult>(initialData)
  const [preset, setPreset] = useState<string>(initialData.filtros.preset || "last_15d")
  const [fechaDesde, setFechaDesde] = useState<string>(initialData.filtros.fechaDesde || "")
  const [fechaHasta, setFechaHasta] = useState<string>(initialData.filtros.fechaHasta || "")
  const [isPending, startTransition] = useTransition()
  const [isCustomMode, setIsCustomMode] = useState<boolean>(initialData.filtros.preset === "custom")

  const handleSelectPreset = (selectedPreset: string) => {
    setPreset(selectedPreset)
    if (selectedPreset === "custom") {
      setIsCustomMode(true)
      return
    }
    setIsCustomMode(false)

    startTransition(async () => {
      const res = await getInstagramGeneralDashboard({ preset: selectedPreset })
      if (res.success) {
        setData(res)
        setFechaDesde(res.filtros.fechaDesde)
        setFechaHasta(res.filtros.fechaHasta)
      }
    })
  }

  const handleFiltrarPersonalizado = () => {
    if (!fechaDesde || !fechaHasta) return
    startTransition(async () => {
      const res = await getInstagramGeneralDashboard({
        preset: "custom",
        fechaDesde,
        fechaHasta
      })
      if (res.success) {
        setData(res)
      }
    })
  }

  const handleRefresh = () => {
    startTransition(async () => {
      const res = await getInstagramGeneralDashboard({
        preset,
        fechaDesde: isCustomMode ? fechaDesde : undefined,
        fechaHasta: isCustomMode ? fechaHasta : undefined
      })
      if (res.success) {
        setData(res)
      }
    })
  }

  const { metricas, topArticulos, evolucionDiaria, ventasRecientes, filtros } = data

  // Formato de fechas para el encabezado
  const formatearFechaLegible = (strFecha: string) => {
    if (!strFecha) return ""
    const [y, m, d] = strFecha.split("-")
    return `${d}/${m}/${y}`
  }

  const fechaDesdeLegible = formatearFechaLegible(filtros.fechaDesde)
  const fechaHastaLegible = formatearFechaLegible(filtros.fechaHasta)

  // Medallas para el ranking
  const getMedal = (index: number) => {
    switch (index) {
      case 0:
        return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-black ring-2 ring-amber-400">1°</span>
      case 1:
        return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-xs font-black ring-2 ring-slate-400">2°</span>
      case 2:
        return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-700/20 text-amber-900 text-xs font-black ring-2 ring-amber-600/50">3°</span>
      default:
        return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{index + 1}°</span>
    }
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in-50 duration-200">
      {/* ========================================================================= */}
      {/* HEADER & BARRA DE FILTROS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 text-white shadow-xs">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">Panel General Instagram</h3>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs">
                    Canal: {filtros.puntoVentaNombre || "Instagram + Mostrador"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Resumen unificado de ventas reales, pauta publicitaria Meta Ads y artículos más demandados.
                </p>
              </div>
            </div>
          </div>

          {/* ESTADO DEL RANGO Y BOTÓN DE ACTUALIZAR */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 font-medium">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>
                {fechaDesdeLegible} al {fechaHastaLegible}
              </span>
            </div>

            <Button
              onClick={handleRefresh}
              disabled={isPending}
              variant="outline"
              size="sm"
              className="gap-2 font-semibold text-xs text-slate-700 bg-white hover:bg-slate-50 border-slate-300 shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin text-pink-600" : "text-slate-500"}`} />
              {isPending ? "Sincronizando..." : "Actualizar"}
            </Button>
          </div>
        </div>

        {/* SELECTOR DE PRESETS RÁPIDOS */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1">
            <Filter className="h-3.5 w-3.5" />
            Período:
          </span>
          {PRESETS.map((p) => {
            const isActive = preset === p.id
            return (
              <Button
                key={p.id}
                onClick={() => handleSelectPreset(p.id)}
                variant={isActive ? "default" : "outline"}
                size="sm"
                disabled={isPending}
                className={`h-8 px-3 text-xs font-semibold rounded-lg transition-all ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs hover:bg-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {p.label}
              </Button>
            )
          })}
        </div>

        {/* SELECTOR PERSONALIZADO DE FECHAS (siempre visible o desplegable) */}
        {isCustomMode && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs animate-in slide-in-from-top-2 duration-150">
            <span className="font-semibold text-slate-700">Rango a medida:</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Desde:</span>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-8 w-36 text-xs bg-white border-slate-300"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Hasta:</span>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-8 w-36 text-xs bg-white border-slate-300"
              />
            </div>
            <Button
              onClick={handleFiltrarPersonalizado}
              disabled={isPending || !fechaDesde || !fechaHasta}
              size="sm"
              className="h-8 px-4 text-xs font-semibold bg-pink-600 hover:bg-pink-700 text-white shadow-xs"
            >
              Aplicar Rango
            </Button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* LAS 4 MÉTRICAS PRINCIPALES PEDIDAS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. VENTAS BRUTAS */}
        <Card className="bg-white shadow-xs border-l-4 border-l-emerald-500 hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ventas Brutas Artículos Pautados
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              ${metricas.ventasBrutas.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600 inline" />
              Facturación de artículos en pauta en {filtros.puntoVentaNombre || "Instagram + Mostrador"}
            </p>
          </CardContent>
        </Card>

        {/* 2. PUBLICIDAD TOTAL GASTADA EN META */}
        <Card className="bg-white shadow-xs border-l-4 border-l-blue-500 hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Inversión Meta Ads
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-blue-700 font-mono tracking-tight">
              ${metricas.gastoMeta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Gasto total en campañas Meta en el período
            </p>
          </CardContent>
        </Card>

        {/* 3. MENSAJES TOTALES RECIBIDOS */}
        <Card className="bg-white shadow-xs border-l-4 border-l-indigo-500 hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Mensajes Totales
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-700 font-mono tracking-tight">
              {metricas.mensajesTotales.toLocaleString("es-AR")}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Leads y conversaciones iniciadas por pauta
            </p>
          </CardContent>
        </Card>

        {/* 4. CANTIDAD DE VENTAS */}
        <Card className="bg-white shadow-xs border-l-4 border-l-purple-500 hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ventas de Artículos Pautados
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <PackageCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-700 font-mono tracking-tight">
              {metricas.cantidadVentas}{" "}
              <span className="text-sm font-semibold text-purple-600">pedidos</span>
            </div>
            <p className="text-[11px] text-purple-800/80 font-medium mt-1 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/50 inline-block">
              Pedidos con productos de pauta (1 pack = 1 venta)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* KPIS DE RENDIMIENTO Y EFICIENCIA COMERCIAL */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Ticket Promedio</div>
            <div className="text-base font-bold text-slate-800 font-mono mt-0.5">
              ${metricas.ticketPromedio.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">Facturación pautada / Total pedidos</div>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
            <ShoppingBag className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Costo por Mensaje</div>
            <div className="text-base font-bold text-indigo-700 font-mono mt-0.5">
              ${metricas.costoPorMensaje.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500">Costo por lead generado</div>
          </div>
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
            <MessageSquare className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Conversión a Venta</div>
            <div className="text-base font-bold text-purple-700 font-mono mt-0.5">
              {metricas.tasaConversion.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-500">
              {metricas.cantidadVentas} cierres / {metricas.mensajesTotales} mensajes
            </div>
          </div>
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CUERPO PRINCIPAL: TOP 5 ARTÍCULOS Y GRÁFICO EVOLUCIÓN */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* TOP 5 ARTÍCULOS MÁS VENDIDOS (5 columnas) */}
        <Card className="lg:col-span-5 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  Top 5 Artículos Pautados Más Vendidos
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Combos y artículos en pauta publicitaria con mayor rotación en el período.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-[10px] font-semibold">
                Ranking Oficial
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 flex-1 space-y-3">
            {topArticulos.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                <ShoppingBag className="h-8 w-8 mb-2 text-slate-300" />
                No se registraron artículos vendidos en este período.
              </div>
            ) : (
              topArticulos.map((art, idx) => (
                <div
                  key={art.nombre}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{getMedal(idx)}</div>
                      <div>
                        <div className="font-bold text-xs text-slate-800 line-clamp-1" title={art.nombre}>
                          {art.nombre}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Recaudado:{" "}
                          <span className="font-bold text-emerald-700 font-mono">
                            ${art.recaudado.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 font-mono">
                        {art.cantidad} un.
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(
                          Math.max(topArticulos[0] ? (art.cantidad / topArticulos[0].cantidad) * 100 : 0, 10),
                          100
                        )}%`
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* GRÁFICO EVOLUCIÓN DIARIA (7 columnas) */}
        <Card className="lg:col-span-7 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-pink-600" />
                  Evolución Diaria: Ventas vs Pauta Publicitaria
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Comparativa de facturación diaria y gasto publicitario promedio por jornada.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-500 font-mono">
                {evolucionDiaria.length} días
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {evolucionDiaria.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
                Sin datos suficientes para graficar en este rango.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evolucionDiaria} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(val: any, name: string) => {
                        const num = Number(val) || 0
                        const label = name === "ventasBrutas" ? "Ventas Brutas" : "Gasto Meta Ads"
                        return [`$${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, label]
                      }}
                      labelFormatter={(label) => `Fecha: ${label}`}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                      formatter={(value) => (value === "ventasBrutas" ? "Ventas Artículos Pautados" : "Gasto Meta Ads")}
                    />
                    <Bar dataKey="ventasBrutas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={35} />
                    <Bar dataKey="gastoMeta" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={35} opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* AUDITORÍA DE PEDIDOS DEL PERÍODO */}
      {/* ========================================================================= */}
      <Card className="bg-white border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Ventas con Artículos Pautados ({metricas.cantidadVentas} pedidos)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Listado transparente de los pedidos con productos pautados que componen las ventas brutas.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono text-slate-600 bg-slate-50">
              Mostrando últimas {ventasRecientes.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ventasRecientes.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No hay ventas registradas en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4"># Venta</th>
                    <th className="py-2.5 px-4">Fecha</th>
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">Artículos</th>
                    <th className="py-2.5 px-4">Método de Pago</th>
                    <th className="py-2.5 px-4">Estado</th>
                    <th className="py-2.5 px-4 text-right">Total Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventasRecientes.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-700">
                        #{v.numeroVenta}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{v.fecha}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{v.cliente}</td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={v.resumenItems}>
                        {v.resumenItems}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{v.metodoPago}</td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold capitalize bg-slate-50 text-slate-700 border-slate-200"
                        >
                          {v.estadoPedido.toLowerCase().replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        ${v.totalFinal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
