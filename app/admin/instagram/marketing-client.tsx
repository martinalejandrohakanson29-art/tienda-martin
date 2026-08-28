"use client"

import React, { useState, useEffect, useMemo } from "react"
import { 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  DollarSign, 
  Eye, 
  ShoppingCart, 
  ChevronRight, 
  ChevronDown, 
  RefreshCw, 
  Columns3, 
  Search, 
  MousePointerClick, 
  Percent, 
  Layers, 
  Check, 
  RotateCcw, 
  Target, 
  FolderTree, 
  ChevronsUpDown,
  Calendar,
  Clock,
  Sparkles
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { sincronizarMarketingWorkflow, MarketingCampaignData, MarketingAdSetData, MarketingAdData } from "@/app/actions/marketing"

export type { MarketingCampaignData, MarketingAdSetData, MarketingAdData }

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

interface GenericMetricRow {
  id: string
  name: string
  status?: string
  spend: number
  reach: number
  impressions?: number
  clicks?: number
  cpc?: number
  cpm?: number
  ctr?: number
  frequency?: number
  messages: number
  carts: number
  costPerMsg: number
  createdTime?: string
  startTime?: string
  updatedTime?: string
  dateStart?: string
  dateStop?: string
}

interface ColumnConfig {
  id: string
  label: string
  icon?: React.ReactNode
  defaultVisible: boolean
  align?: "left" | "center" | "right"
  render: (item: GenericMetricRow) => React.ReactNode
}

export const DATE_PRESETS = [
  { id: "last_30d", label: "Últimos 30 días" },
  { id: "last_7d", label: "Últimos 7 días" },
  { id: "last_14d", label: "Últimos 14 días" },
  { id: "this_month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "maximum", label: "Histórico completo (Máximo)" },
] as const;

export type DatePresetId = typeof DATE_PRESETS[number]["id"];

const AVAILABLE_COLUMNS: ColumnConfig[] = [
  {
    id: "spend",
    label: "Gasto / Inversión",
    icon: <DollarSign className="h-3.5 w-3.5 text-blue-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => (
      <span className="font-semibold font-mono text-slate-800">
        ${item.spend.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    )
  },
  {
    id: "cpm",
    label: "CPM (Costo/Mil)",
    icon: <Layers className="h-3.5 w-3.5 text-purple-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const val = item.cpm !== undefined && item.cpm !== null 
        ? item.cpm 
        : (item.impressions && item.impressions > 0 ? (item.spend / item.impressions) * 1000 : 0);
      return (
        <span className="font-mono text-sm font-semibold text-purple-900 bg-purple-50/70 px-1.5 py-0.5 rounded border border-purple-100">
          {val > 0 ? `$${val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
        </span>
      )
    }
  },
  {
    id: "messages",
    label: "Mensajes (Leads)",
    icon: <MessageSquare className="h-3.5 w-3.5 text-green-600" />,
    defaultVisible: true,
    align: "center",
    render: (item) => (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 border border-green-200">
        {item.messages.toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "costPerMsg",
    label: "Costo / Mensaje",
    icon: <TrendingUp className="h-3.5 w-3.5 text-orange-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const isGood = item.costPerMsg > 0 && item.costPerMsg < 300;
      return (
        <span className={`font-semibold font-mono text-sm ${isGood ? "text-emerald-600" : "text-slate-700"}`}>
          {item.costPerMsg > 0 ? `$${item.costPerMsg.toFixed(2)}` : "-"}
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
    render: (item) => (
      <div className="flex items-center justify-center gap-1 font-semibold text-blue-600 text-sm">
        <ShoppingCart className="h-3.5 w-3.5" />
        {item.carts}
      </div>
    )
  },
  {
    id: "reach",
    label: "Alcance",
    icon: <Eye className="h-3.5 w-3.5 text-indigo-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => (
      <span className="text-slate-600 font-mono text-sm">
        {item.reach.toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "impressions",
    label: "Impresiones",
    icon: <Layers className="h-3.5 w-3.5 text-slate-500" />,
    defaultVisible: false,
    align: "right",
    render: (item) => (
      <span className="text-slate-600 font-mono text-sm">
        {(item.impressions || 0).toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "clicks",
    label: "Clics en Enlace",
    icon: <MousePointerClick className="h-3.5 w-3.5 text-cyan-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => (
      <span className="text-slate-700 font-semibold font-mono text-sm">
        {(item.clicks || 0).toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "ctr",
    label: "CTR (Clics %)",
    icon: <Percent className="h-3.5 w-3.5 text-amber-600" />,
    defaultVisible: false,
    align: "right",
    render: (item) => (
      <span className="text-slate-700 font-mono text-sm font-medium">
        {item.ctr !== undefined && item.ctr !== null ? `${item.ctr.toFixed(2)}%` : "-"}
      </span>
    )
  },
  {
    id: "cpc",
    label: "CPC (Costo/Clic)",
    icon: <DollarSign className="h-3.5 w-3.5 text-rose-600" />,
    defaultVisible: false,
    align: "right",
    render: (item) => (
      <span className="text-slate-700 font-mono text-sm">
        {item.cpc !== undefined && item.cpc !== null && item.cpc > 0 ? `$${item.cpc.toFixed(2)}` : "-"}
      </span>
    )
  },
  {
    id: "frequency",
    label: "Frecuencia",
    icon: <RotateCcw className="h-3.5 w-3.5 text-teal-600" />,
    defaultVisible: false,
    align: "right",
    render: (item) => (
      <span className="text-slate-600 font-mono text-sm">
        {item.frequency !== undefined && item.frequency !== null && item.frequency > 0 ? item.frequency.toFixed(2) : "-"}
      </span>
    )
  },
  {
    id: "createdTime",
    label: "Fecha Creación",
    icon: <Calendar className="h-3.5 w-3.5 text-slate-500" />,
    defaultVisible: false,
    align: "center",
    render: (item) => {
      const formatted = formatItemDate(item.createdTime);
      if (!formatted) return <span className="text-slate-400 text-xs">-</span>;
      return (
        <span className="text-slate-600 font-mono text-xs" title={formatted.full}>
          {formatted.dateStr}
        </span>
      );
    }
  }
];

const STORAGE_KEY = "marketing_visible_columns_v3";

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED";

function isItemActive(status?: string): boolean {
  if (!status) return true;
  const s = status.toUpperCase();
  return s === "ACTIVE" || s === "ACTIVO" || s === "1";
}

function StatusBadge({ status, type = "camp" }: { status?: string; type?: "camp" | "adset" | "ad" }) {
  const active = isItemActive(status);
  const labelActive = type === "camp" ? "Activa" : "Activo";
  const labelPaused = type === "camp" ? "Pausada" : "Pausado";

  if (active) {
    return (
      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 shrink-0 shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
        {labelActive}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 border-slate-200 gap-1.5 shrink-0 shadow-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
      {labelPaused}
    </Badge>
  );
}

function formatItemDate(isoString?: string | Date | null) {
  if (!isoString) return null;
  const d = typeof isoString === "string" ? new Date(isoString) : isoString;
  if (isNaN(d.getTime())) return null;

  const dateStr = d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative = "";
  if (diffDays <= 0) relative = "hoy";
  else if (diffDays === 1) relative = "ayer";
  else if (diffDays < 30) relative = `hace ${diffDays} d`;
  else if (diffDays < 365) relative = `hace ${Math.floor(diffDays / 30)} m`;
  else relative = `hace ${Math.floor(diffDays / 365)} a`;

  return { 
    dateStr, 
    relative, 
    full: d.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" }) 
  };
}

function formatDateRange(dateStart?: string, dateStop?: string) {
  if (!dateStart || !dateStop) return null;
  const parseD = (s: string) => {
    const parts = s.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return s;
  };
  return `${parseD(dateStart)} al ${parseD(dateStop)}`;
}

export function MarketingClient({ data, initialData }: MarketingClientProps) {
  const initial = data || initialData || { campaigns: [], autoResponses: [] };
  const [campaigns, setCampaigns] = useState<MarketingCampaignData[]>(initial.campaigns || []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [datePreset, setDatePreset] = useState<DatePresetId>("last_30d");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);

  // Fechas activas de los datos actuales
  const [activeDateRange, setActiveDateRange] = useState<{ start?: string; stop?: string }>(() => {
    const firstWithDates = initial.campaigns?.find(c => c.dateStart && c.dateStop);
    return {
      start: firstWithDates?.dateStart,
      stop: firstWithDates?.dateStop
    };
  });

  // Estados de expansión por ID
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>({});

  // Columnas visibles
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    return AVAILABLE_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.includes("cpm")) parsed.push("cpm");
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
        if (prev.length <= 1) return prev;
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

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (expand: boolean) => {
    const newCamp: Record<string, boolean> = {};
    const newAdSet: Record<string, boolean> = {};
    if (expand) {
      campaigns.forEach(c => {
        newCamp[c.id] = true;
        c.adSets?.forEach(as => {
          newAdSet[as.id] = true;
        });
      });
    }
    setExpandedCampaigns(newCamp);
    setExpandedAdSets(newAdSet);
  };

  // Manejador de consulta directa a Meta con período
  const handleSyncWithPreset = async (preset: DatePresetId = datePreset) => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await sincronizarMarketingWorkflow(preset);
      if (res.success && res.data) {
        setCampaigns(res.data.campaigns);
        if (res.dateStart && res.dateStop) {
          setActiveDateRange({ start: res.dateStart, stop: res.dateStop });
        }
        setDatePreset(preset);
        const presetLabel = DATE_PRESETS.find(p => p.id === preset)?.label || preset;
        setSyncStatus({ 
          type: "success", 
          message: `¡Datos actualizados desde Meta para: "${presetLabel}" (${formatDateRange(res.dateStart, res.dateStop) || "Período actual"})!` 
        });
      } else {
        setSyncStatus({ type: "error", message: res.error || "Error al consultar la API de Meta" });
      }
    } catch (err: any) {
      setSyncStatus({ type: "error", message: err.message || "Error inesperado al conectar con Meta" });
    } finally {
      setIsSyncing(false);
      setIsPresetDropdownOpen(false);
      setTimeout(() => setSyncStatus(null), 8000);
    }
  };

  // Conteos globales para filtros
  const counts = useMemo(() => {
    let total = campaigns.length;
    let active = 0;
    let paused = 0;
    campaigns.forEach(c => {
      if (isItemActive(c.status)) active++;
      else paused++;
    });
    return { total, active, paused };
  }, [campaigns]);

  // Filtrado de campañas (por estado y búsqueda)
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(camp => {
      // Filtro de estado
      if (statusFilter === "ACTIVE" && !isItemActive(camp.status)) return false;
      if (statusFilter === "PAUSED" && isItemActive(camp.status)) return false;

      // Filtro de búsqueda (nombre o ID de campaña, conjunto o anuncio)
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCamp = camp.name.toLowerCase().includes(q) || camp.id.toLowerCase().includes(q);
        if (matchCamp) return true;

        const matchAdSet = camp.adSets?.some(as => 
          as.name.toLowerCase().includes(q) || 
          as.id.toLowerCase().includes(q) ||
          as.ads?.some(ad => ad.name.toLowerCase().includes(q) || ad.id.toLowerCase().includes(q))
        );
        if (matchAdSet) return true;

        return false;
      }

      return true;
    });
  }, [campaigns, statusFilter, search]);

  // Totales de KPI basados en las campañas filtradas actualmente
  const totalSpend = useMemo(() => filteredCampaigns.reduce((acc, curr) => acc + curr.spend, 0), [filteredCampaigns]);
  const totalMessages = useMemo(() => filteredCampaigns.reduce((acc, curr) => acc + curr.messages, 0), [filteredCampaigns]);
  const totalReach = useMemo(() => filteredCampaigns.reduce((acc, curr) => acc + curr.reach, 0), [filteredCampaigns]);
  const totalClicks = useMemo(() => filteredCampaigns.reduce((acc, curr) => acc + (curr.clicks || 0), 0), [filteredCampaigns]);
  const totalImpressions = useMemo(() => filteredCampaigns.reduce((acc, curr) => acc + (curr.impressions || 0), 0), [filteredCampaigns]);
  const averageCpm = useMemo(() => {
    return totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  }, [totalSpend, totalImpressions]);

  const activeCols = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(col => visibleColumns.includes(col.id));
  }, [visibleColumns]);

  const isAllExpanded = useMemo(() => {
    if (filteredCampaigns.length === 0) return false;
    return filteredCampaigns.every(c => expandedCampaigns[c.id]);
  }, [filteredCampaigns, expandedCampaigns]);

  const currentPresetObj = DATE_PRESETS.find(p => p.id === datePreset) || DATE_PRESETS[0];
  const dateRangeFormatted = formatDateRange(activeDateRange.start, activeDateRange.stop);

  return (
    <div className="w-full space-y-6">
      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="Inversión Total" 
          value={`$${totalSpend.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} 
          icon={<DollarSign className="h-4 w-4 text-blue-600" />}
          subtitle={dateRangeFormatted ? `${dateRangeFormatted}` : currentPresetObj.label}
          borderColor="border-l-blue-500"
        />
        <StatCard 
          title="Mensajes Iniciados" 
          value={totalMessages.toLocaleString('es-AR')} 
          icon={<MessageSquare className="h-4 w-4 text-green-600" />}
          subtitle="Leads totales en período"
          borderColor="border-l-green-500"
        />
        <StatCard 
          title="Costo / Mensaje" 
          value={totalMessages > 0 ? `$${(totalSpend / totalMessages).toFixed(2)}` : "$0.00"} 
          icon={<TrendingUp className="h-4 w-4 text-orange-600" />}
          subtitle="Promedio por lead"
          borderColor="border-l-orange-500"
        />
        <StatCard 
          title="CPM Promedio" 
          value={`$${averageCpm.toFixed(2)}`} 
          icon={<Layers className="h-4 w-4 text-purple-600" />}
          subtitle="Costo por 1.000 impresiones"
          borderColor="border-l-purple-500"
        />
        <StatCard 
          title="Alcance & Clics" 
          value={totalClicks.toLocaleString('es-AR')} 
          icon={<MousePointerClick className="h-4 w-4 text-cyan-600" />}
          subtitle={`${totalReach > 1000 ? (totalReach / 1000).toFixed(1) + "k" : totalReach} personas alcanzadas`}
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
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>{syncStatus.message}</span>
          </div>
          <button onClick={() => setSyncStatus(null)} className="text-xs font-bold underline ml-4 hover:opacity-80">
            Cerrar
          </button>
        </div>
      )}

      {/* TABLA PRINCIPAL DE CAMPAÑAS Y DESGLOSE */}
      <Card className="w-full bg-white shadow-sm overflow-hidden flex flex-col">
        <CardHeader className="border-b bg-slate-50/50 pb-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">
                  Rendimiento y Desglose ({filteredCampaigns.length})
                </CardTitle>
              </div>
              {dateRangeFormatted && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Período de métricas: <strong className="text-slate-700">{dateRangeFormatted}</strong> ({currentPresetObj.label})</span>
                </div>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* SELECTOR DE PERÍODO META */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
                  disabled={isSyncing}
                  className="h-8 gap-1.5 text-xs font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
                >
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  <span>{currentPresetObj.label}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>

                {isPresetDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsPresetDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                      <div className="px-2 py-1.5 text-[11px] font-bold uppercase text-slate-400 border-b border-slate-100 mb-1">
                        Consultar Período en Meta
                      </div>
                      <div className="space-y-0.5">
                        {DATE_PRESETS.map((preset) => {
                          const isSelected = datePreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleSyncWithPreset(preset.id)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
                                isSelected 
                                  ? "bg-blue-50 text-blue-800 font-semibold" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              <span>{preset.label}</span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* BOTÓN EXPANDIR / COLAPSAR TODOS */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(!isAllExpanded)}
                className="h-8 gap-1.5 text-xs font-medium bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                {isAllExpanded ? "Colapsar todo" : "Desglosar todo"}
              </Button>

              {/* BOTÓN SELECTOR DE COLUMNAS */}
              <div className="relative">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="h-8 gap-1.5 text-xs font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
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

              {/* BOTÓN ACTUALIZAR DIRECTO DESDE META */}
              <Button 
                onClick={() => handleSyncWithPreset(datePreset)}
                disabled={isSyncing}
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Consultando Meta..." : "Consultar a Meta"}
              </Button>
            </div>
          </div>

          {/* BARRA DE FILTROS POR ESTADO Y BUSCADOR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            {/* FILTRO DE ESTADO (TODAS / ACTIVAS / PAUSADAS) */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === "ALL" 
                    ? "bg-white text-slate-900 shadow-xs" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todas ({counts.total})
              </button>
              <button
                onClick={() => setStatusFilter("ACTIVE")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === "ACTIVE" 
                    ? "bg-white text-emerald-700 shadow-xs" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Activas ({counts.active})
              </button>
              <button
                onClick={() => setStatusFilter("PAUSED")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === "PAUSED" 
                    ? "bg-white text-slate-700 shadow-xs" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                Pausadas ({counts.paused})
              </button>
            </div>

            {/* BUSCADOR */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar campaña, conjunto o anuncio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white border-slate-200"
              />
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto flex-1">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                <TableHead className="min-w-[320px] text-xs font-bold text-slate-700">
                  Campaña / Conjunto / Anuncio
                </TableHead>
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
                filteredCampaigns.map((camp) => {
                  const isCampExpanded = !!expandedCampaigns[camp.id];
                  const adSets = camp.adSets || [];
                  const totalAdsCount = adSets.reduce((acc, as) => acc + (as.ads?.length || 0), 0);
                  const createdDate = formatItemDate(camp.createdTime);

                  return (
                    <React.Fragment key={camp.id}>
                      {/* FILA DE CAMPAÑA (NIVEL 1) */}
                      <TableRow 
                        className={`group hover:bg-slate-50/80 transition-colors border-b border-slate-200/80 ${
                          isCampExpanded ? "bg-slate-50/50" : ""
                        }`}
                      >
                        <TableCell className="py-2.5">
                          <div className="flex items-start gap-2">
                            {/* BOTÓN TOGGLE EXPANDIR */}
                            <button
                              onClick={() => toggleCampaign(camp.id)}
                              className="mt-0.5 p-1 rounded hover:bg-slate-200/70 text-slate-500 transition-colors shrink-0"
                              title={isCampExpanded ? "Colapsar conjuntos de anuncios" : "Desglosar conjuntos de anuncios"}
                            >
                              {isCampExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-700 font-bold" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700" />
                              )}
                            </button>

                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm tracking-tight hover:underline cursor-pointer" onClick={() => toggleCampaign(camp.id)}>
                                  {camp.name}
                                </span>
                                <StatusBadge status={camp.status} type="camp" />
                              </div>

                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                                <span>ID: {camp.id}</span>
                                {createdDate && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded" title={createdDate.full}>
                                    <Clock className="h-2.5 w-2.5 text-slate-400" />
                                    Creada: {createdDate.dateStr} ({createdDate.relative})
                                  </span>
                                )}
                                {adSets.length > 0 && (
                                  <span className="inline-flex items-center gap-1 font-sans text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                    <FolderTree className="h-3 w-3 text-slate-400" />
                                    {adSets.length} {adSets.length === 1 ? "conjunto" : "conjuntos"} · {totalAdsCount} {totalAdsCount === 1 ? "anuncio" : "anuncios"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {activeCols.map(col => (
                          <TableCell 
                            key={col.id} 
                            className={`py-2.5 ${
                              col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                            }`}
                          >
                            {col.render(camp)}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* SUB-FILAS DE CONJUNTOS DE ANUNCIOS (NIVEL 2) */}
                      {isCampExpanded && adSets.length > 0 && (
                        adSets.map((adSet) => {
                          const isAdSetExpanded = !!expandedAdSets[adSet.id];
                          const ads = adSet.ads || [];
                          const adSetCreated = formatItemDate(adSet.createdTime);

                          return (
                            <React.Fragment key={adSet.id}>
                              <TableRow className="bg-slate-50/70 hover:bg-slate-100/70 transition-colors border-b border-slate-100">
                                <TableCell className="py-2 pl-8 sm:pl-10">
                                  <div className="flex items-start gap-2">
                                    {/* BOTÓN TOGGLE ANUNCIOS */}
                                    <button
                                      onClick={() => toggleAdSet(adSet.id)}
                                      className="mt-0.5 p-1 rounded hover:bg-slate-200/80 text-slate-500 transition-colors shrink-0"
                                      title={isAdSetExpanded ? "Colapsar anuncios" : "Desglosar anuncios"}
                                    >
                                      {isAdSetExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-blue-700" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 hover:text-blue-700" />
                                      )}
                                    </button>

                                    <div className="space-y-0.5 flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                          Conjunto
                                        </span>
                                        <span className="font-semibold text-slate-800 text-xs hover:underline cursor-pointer" onClick={() => toggleAdSet(adSet.id)}>
                                          {adSet.name}
                                        </span>
                                        <StatusBadge status={adSet.status} type="adset" />
                                      </div>

                                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                                        <span>ID: {adSet.id}</span>
                                        {adSetCreated && (
                                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500" title={adSetCreated.full}>
                                            <Clock className="h-2.5 w-2.5 text-slate-400" />
                                            {adSetCreated.dateStr}
                                          </span>
                                        )}
                                        <span>·</span>
                                        <span className="text-slate-500 font-sans">{ads.length} {ads.length === 1 ? "anuncio" : "anuncios"}</span>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>

                                {activeCols.map(col => (
                                  <TableCell 
                                    key={col.id} 
                                    className={`py-2 text-xs ${
                                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                    }`}
                                  >
                                    {col.render(adSet)}
                                  </TableCell>
                                ))}
                              </TableRow>

                              {/* SUB-FILAS DE ANUNCIOS PARTICULARES (NIVEL 3) */}
                              {isAdSetExpanded && ads.length > 0 && (
                                ads.map((ad) => {
                                  const adCreated = formatItemDate(ad.createdTime);
                                  return (
                                    <TableRow key={ad.id} className="bg-slate-100/50 hover:bg-slate-200/50 transition-colors border-b border-slate-100">
                                      <TableCell className="py-1.5 pl-14 sm:pl-18">
                                        <div className="flex items-start gap-2">
                                          <Target className="h-3.5 w-3.5 text-rose-500 mt-1 shrink-0" />
                                          <div className="space-y-0.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-[9px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                                Anuncio
                                              </span>
                                              <span className="font-medium text-slate-800 text-xs">
                                                {ad.name}
                                              </span>
                                              <StatusBadge status={ad.status} type="ad" />
                                            </div>

                                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                                              <span>AD ID: {ad.id}</span>
                                              {adCreated && (
                                                <span className="text-slate-500 font-sans inline-flex items-center gap-1" title={adCreated.full}>
                                                  <Clock className="h-2.5 w-2.5 text-slate-400" />
                                                  {adCreated.dateStr}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </TableCell>

                                      {activeCols.map(col => (
                                        <TableCell 
                                          key={col.id} 
                                          className={`py-1.5 text-xs ${
                                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                          }`}
                                        >
                                          {col.render(ad)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  );
                                })
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={activeCols.length + 1} className="h-36 text-center text-slate-400 text-sm">
                    {campaigns.length === 0 
                      ? "No hay datos sincronizados. Haz clic en 'Consultar a Meta' para obtener las métricas de tu cuenta publicitaria."
                      : "No se encontraron campañas coincidentes con los filtros seleccionados."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
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
        <p className="text-xs text-slate-400 mt-1 truncate" title={subtitle}>{subtitle}</p>
      </CardContent>
    </Card>
  )
}
