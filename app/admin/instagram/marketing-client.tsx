"use client"

import React, { useState, useEffect, useMemo } from "react"
import { 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  DollarSign, 
  Settings, 
  Eye, 
  ShoppingCart, 
  ChevronRight, 
  Zap,
  RefreshCw,
  Columns3,
  Search,
  MousePointerClick,
  Percent,
  Layers,
  Check,
  RotateCcw
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { sincronizarMarketingWorkflow } from "@/app/actions/marketing"

export interface MarketingCampaignData {
  id: string
  name: string
  spend: number
  reach: number
  impressions?: number
  clicks?: number
  cpc?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  status?: string
  updatedAt?: Date | string
}

export interface MarketingClientProps {
  data?: {
    campaigns: MarketingCampaignData[]
    autoResponses: any[]
  }
  initialData?: {
    campaigns: MarketingCampaignData[]
    autoResponses: any[]
  }
}

interface ColumnConfig {
  id: string
  label: string
  icon?: React.ReactNode
  defaultVisible: boolean
  align?: "left" | "center" | "right"
  render: (camp: MarketingCampaignData) => React.ReactNode
}

const AVAILABLE_COLUMNS: ColumnConfig[] = [
  {
    id: "spend",
    label: "Gasto / Inversión",
    icon: <DollarSign className="h-3.5 w-3.5 text-blue-600" />,
    defaultVisible: true,
    align: "right",
    render: (camp) => (
      <span className="font-semibold font-mono text-slate-800">
        ${camp.spend.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    )
  },
  {
    id: "messages",
    label: "Mensajes (Leads)",
    icon: <MessageSquare className="h-3.5 w-3.5 text-green-600" />,
    defaultVisible: true,
    align: "center",
    render: (camp) => (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 border border-green-200">
        {camp.messages.toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "costPerMsg",
    label: "Costo / Mensaje",
    icon: <TrendingUp className="h-3.5 w-3.5 text-orange-600" />,
    defaultVisible: true,
    align: "right",
    render: (camp) => {
      const isGood = camp.costPerMsg > 0 && camp.costPerMsg < 300;
      return (
        <span className={`font-semibold font-mono text-sm ${isGood ? "text-emerald-600" : "text-slate-700"}`}>
          {camp.costPerMsg > 0 ? `$${camp.costPerMsg.toFixed(2)}` : "-"}
        </span>
      )
    }
  },
  {
    id: "carts",
    label: "Carritos",
    icon: <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />,
    defaultVisible: true,
    align: "center",
    render: (camp) => (
      <div className="flex items-center justify-center gap-1 font-semibold text-blue-600 text-sm">
        <ShoppingCart className="h-3.5 w-3.5" />
        {camp.carts}
      </div>
    )
  },
  {
    id: "reach",
    label: "Alcance (Personas)",
    icon: <Eye className="h-3.5 w-3.5 text-purple-600" />,
    defaultVisible: true,
    align: "right",
    render: (camp) => (
      <span className="text-slate-600 font-mono text-sm">
        {camp.reach.toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "impressions",
    label: "Impresiones",
    icon: <Layers className="h-3.5 w-3.5 text-indigo-600" />,
    defaultVisible: false,
    align: "right",
    render: (camp) => (
      <span className="text-slate-600 font-mono text-sm">
        {(camp.impressions || 0).toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "clicks",
    label: "Clics en Enlace",
    icon: <MousePointerClick className="h-3.5 w-3.5 text-cyan-600" />,
    defaultVisible: true,
    align: "right",
    render: (camp) => (
      <span className="text-slate-700 font-semibold font-mono text-sm">
        {(camp.clicks || 0).toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "ctr",
    label: "CTR (Clics %)",
    icon: <Percent className="h-3.5 w-3.5 text-amber-600" />,
    defaultVisible: false,
    align: "right",
    render: (camp) => (
      <span className="text-slate-700 font-mono text-sm font-medium">
        {camp.ctr !== undefined && camp.ctr !== null ? `${camp.ctr.toFixed(2)}%` : "-"}
      </span>
    )
  },
  {
    id: "cpc",
    label: "CPC (Costo/Clic)",
    icon: <DollarSign className="h-3.5 w-3.5 text-rose-600" />,
    defaultVisible: false,
    align: "right",
    render: (camp) => (
      <span className="text-slate-700 font-mono text-sm">
        {camp.cpc !== undefined && camp.cpc !== null && camp.cpc > 0 ? `$${camp.cpc.toFixed(2)}` : "-"}
      </span>
    )
  },
  {
    id: "frequency",
    label: "Frecuencia",
    icon: <RotateCcw className="h-3.5 w-3.5 text-teal-600" />,
    defaultVisible: false,
    align: "right",
    render: (camp) => (
      <span className="text-slate-600 font-mono text-sm">
        {camp.frequency !== undefined && camp.frequency !== null && camp.frequency > 0 ? camp.frequency.toFixed(2) : "-"}
      </span>
    )
  }
];

const STORAGE_KEY = "marketing_visible_columns_v1";

export function MarketingClient({ data, initialData }: MarketingClientProps) {
  const initial = data || initialData || { campaigns: [], autoResponses: [] };
  const [campaigns, setCampaigns] = useState<MarketingCampaignData[]>(initial.campaigns || []);
  const [autoResponses, setAutoResponses] = useState<any[]>(initial.autoResponses || []);
  const [search, setSearch] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Inicializar columnas visibles desde localStorage o por defecto
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    return AVAILABLE_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleColumns(parsed);
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar columnas desde localStorage");
    }
  }, []);

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      let next: string[];
      if (prev.includes(colId)) {
        if (prev.length <= 1) return prev; // Mantener al menos una columna
        next = prev.filter(id => id !== colId);
      } else {
        next = [...prev, colId];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const setAllColumns = (enableAll: boolean) => {
    const next = enableAll ? AVAILABLE_COLUMNS.map(c => c.id) : AVAILABLE_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
    setVisibleColumns(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {}
  };

  // Manejador de sincronización bajo demanda desde n8n
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await sincronizarMarketingWorkflow();
      if (res.success && res.data) {
        setCampaigns(res.data.campaigns);
        setAutoResponses(res.data.autoResponses);
        setSyncStatus({ type: "success", message: "¡Datos de Meta actualizados correctamente!" });
      } else {
        setSyncStatus({ type: "error", message: res.error || "Error al sincronizar con n8n" });
      }
    } catch (err: any) {
      setSyncStatus({ type: "error", message: err.message || "Error inesperado" });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 6000);
    }
  };

  // Totales
  const totalSpend = useMemo(() => campaigns.reduce((acc, curr) => acc + curr.spend, 0), [campaigns]);
  const totalMessages = useMemo(() => campaigns.reduce((acc, curr) => acc + curr.messages, 0), [campaigns]);
  const totalReach = useMemo(() => campaigns.reduce((acc, curr) => acc + curr.reach, 0), [campaigns]);
  const totalClicks = useMemo(() => campaigns.reduce((acc, curr) => acc + (curr.clicks || 0), 0), [campaigns]);
  const totalImpressions = useMemo(() => campaigns.reduce((acc, curr) => acc + (curr.impressions || 0), 0), [campaigns]);

  // Filtrado
  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [campaigns, search]);

  const activeCols = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(col => visibleColumns.includes(col.id));
  }, [visibleColumns]);

  return (
    <div className="w-full space-y-6">
      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="Inversión Total" 
          value={`$${totalSpend.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} 
          icon={<DollarSign className="h-4 w-4 text-blue-600" />}
          subtitle="Últimos 30 días"
          borderColor="border-l-blue-500"
        />
        <StatCard 
          title="Mensajes Iniciados" 
          value={totalMessages.toLocaleString('es-AR')} 
          icon={<MessageSquare className="h-4 w-4 text-green-600" />}
          subtitle="Leads totales"
          borderColor="border-l-green-500"
        />
        <StatCard 
          title="Costo Promedio" 
          value={totalMessages > 0 ? `$${(totalSpend / totalMessages).toFixed(2)}` : "$0.00"} 
          icon={<TrendingUp className="h-4 w-4 text-orange-600" />}
          subtitle="Por mensaje iniciado"
          borderColor="border-l-orange-500"
        />
        <StatCard 
          title="Alcance" 
          value={totalReach > 1000 ? (totalReach / 1000).toFixed(1) + "k" : totalReach.toString()} 
          icon={<Eye className="h-4 w-4 text-purple-600" />}
          subtitle="Personas alcanzadas"
          borderColor="border-l-purple-500"
        />
        <StatCard 
          title="Clics en Enlace" 
          value={totalClicks.toLocaleString('es-AR')} 
          icon={<MousePointerClick className="h-4 w-4 text-cyan-600" />}
          subtitle={`${totalImpressions.toLocaleString('es-AR')} impresiones`}
          borderColor="border-l-cyan-500"
        />
      </div>

      {/* MENSAJE DE ESTADO DE SINCRONIZACIÓN */}
      {syncStatus && (
        <div className={`p-3 rounded-lg border text-sm flex items-center justify-between transition-all ${
          syncStatus.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <span>{syncStatus.message}</span>
          <button onClick={() => setSyncStatus(null)} className="text-xs font-bold underline ml-4">
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TABLA DE CAMPAÑAS */}
        <Card className="lg:col-span-2 bg-white shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="border-b bg-slate-50/50 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-red-600" />
                Rendimiento por Campaña ({campaigns.length})
              </CardTitle>

              <div className="flex items-center gap-2">
                {/* BOTÓN SELECTOR DE COLUMNAS */}
                <div className="relative">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="h-9 gap-1.5 text-xs font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm"
                  >
                    <Columns3 className="h-3.5 w-3.5 text-slate-500" />
                    Columnas ({activeCols.length})
                  </Button>

                  {isDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsDropdownOpen(false)} 
                      />
                      <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                          <span className="text-xs font-bold text-slate-700">Métricas Visibles</span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setAllColumns(true)}
                              className="text-[10px] text-blue-600 hover:underline font-semibold"
                            >
                              Todas
                            </button>
                            <span className="text-slate-300 text-xs">|</span>
                            <button 
                              onClick={() => setAllColumns(false)}
                              className="text-[10px] text-slate-500 hover:underline"
                            >
                              Defecto
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                          {AVAILABLE_COLUMNS.map((col) => {
                            const isVisible = visibleColumns.includes(col.id);
                            return (
                              <button
                                key={col.id}
                                onClick={() => toggleColumn(col.id)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
                                  isVisible 
                                    ? "bg-slate-100 text-slate-900 font-medium" 
                                    : "text-slate-500 hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  {col.icon}
                                  {col.label}
                                </span>
                                {isVisible && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* BOTÓN ACTUALIZAR DESDE N8N / META */}
                <Button 
                  onClick={handleSync}
                  disabled={isSyncing}
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Actualizando..." : "Actualizar datos"}
                </Button>
              </div>
            </div>

            {/* BUSCADOR */}
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar campaña por nombre o ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white border-slate-200"
              />
            </div>
          </CardHeader>

          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-[240px] text-xs font-bold text-slate-700">Campaña</TableHead>
                  {activeCols.map(col => (
                    <TableHead 
                      key={col.id} 
                      className={`text-xs font-bold text-slate-700 ${
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      <div className={`flex items-center gap-1 ${
                        col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"
                      }`}>
                        {col.icon}
                        <span>{col.label}</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.length > 0 ? (
                  filteredCampaigns.map((camp) => (
                    <TableRow key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell className="py-3">
                        <div className="font-medium text-slate-900 text-sm">{camp.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          ID: {camp.id}
                          {camp.status && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-slate-200 text-slate-500 font-normal">
                              {camp.status}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {activeCols.map(col => (
                        <TableCell 
                          key={col.id} 
                          className={`py-3 ${
                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                          }`}
                        >
                          {col.render(camp)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={activeCols.length + 1} className="h-32 text-center text-slate-400 text-sm">
                      {campaigns.length === 0 
                        ? "No hay datos sincronizados. Haz clic en 'Actualizar datos' para consultar Meta."
                        : "No se encontraron campañas coincidentes."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* AGENTE DE RESPUESTAS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-red-500 flex flex-col">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              Agente de IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 flex-1">
            {autoResponses.length > 0 ? (
              autoResponses.map((res: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-slate-200 transition-all cursor-pointer">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">AD ID: {res.adId}</span>
                    <Settings className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
                  </div>
                  <h3 className="font-semibold text-red-600 text-xs mb-1">{res.name}</h3>
                  <p className="text-[11px] text-slate-500 italic line-clamp-2">"{res.response}"</p>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                No hay respuestas automáticas configuradas.
              </div>
            )}
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-5 mt-auto">
              Nueva Respuesta
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, subtitle, borderColor }: any) {
  return (
    <Card className={`bg-white shadow-sm border-l-4 ${borderColor}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</CardTitle>
        <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-slate-900">{value}</div>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

