"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Sparkles,
  Package,
  Boxes,
  Store,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Megaphone,
  Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  sincronizarMarketingWorkflow, 
  getMarketingPerformance,
  MarketingCampaignData, 
  MarketingAdSetData, 
  MarketingAdData,
  MarketingCampaignItemData,
  CampaignHealthData,
  PuntoVentaFilterItem,
  MarketingPerformanceResult
} from "@/app/actions/marketing";
import { ModalAsignarArticulos, AsignarTargetInfo, ArticuloOpcion } from "./modal-asignar-articulos";

export type { MarketingCampaignData, MarketingAdSetData, MarketingAdData, MarketingCampaignItemData, CampaignHealthData };

export interface MarketingClientProps {
  data?: MarketingPerformanceResult | {
    campaigns: MarketingCampaignData[];
    autoResponses: any[];
    puntosVenta?: PuntoVentaFilterItem[];
    globalHealth?: any;
  };
  initialData?: any;
  articulosDisponibles?: ArticuloOpcion[];
}

interface ColumnConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
  defaultVisible: boolean;
  align?: "left" | "center" | "right";
  render: (item: { spend: number; messages: number; reach?: number; clicks?: number; impressions?: number; cpm?: number; costPerMsg?: number; health?: CampaignHealthData; items?: MarketingCampaignItemData[] }) => React.ReactNode;
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
    id: "messages",
    label: "Mensajes (Leads)",
    icon: <MessageSquare className="h-3.5 w-3.5 text-green-600" />,
    defaultVisible: true,
    align: "center",
    render: (item) => (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 border border-green-200 font-mono">
        {item.messages.toLocaleString("es-AR")}
      </span>
    )
  },
  {
    id: "ventasReales",
    label: "Ventas Reales",
    icon: <Package className="h-3.5 w-3.5 text-purple-600" />,
    defaultVisible: true,
    align: "center",
    render: (item) => {
      const u = item.health?.unidadesVendidas ?? 0;
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) {
        return <span className="text-slate-400 text-xs italic">Sin asignar</span>;
      }
      return (
        <span className={`inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded border ${
          u > 0 
            ? "bg-purple-50 text-purple-700 border-purple-200" 
            : "bg-slate-50 text-slate-400 border-slate-200"
        }`}>
          {u} un.
        </span>
      );
    }
  },
  {
    id: "facturacion",
    label: "Facturación Reales",
    icon: <DollarSign className="h-3.5 w-3.5 text-emerald-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const f = item.health?.facturacionReal ?? 0;
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      return (
        <span className="font-bold font-mono text-emerald-700 text-xs sm:text-sm">
          ${f.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        </span>
      );
    }
  },
  {
    id: "margenNeto",
    label: "Margen Neto (Bolsillo)",
    icon: <TrendingUp className="h-3.5 w-3.5 text-blue-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const neto = item.health?.margenNeto ?? 0;
      const isPos = neto > 0;
      return (
        <span className={`font-bold font-mono text-xs sm:text-sm ${
          isPos ? "text-emerald-600" : neto < 0 ? "text-rose-600" : "text-slate-600"
        }`}>
          {neto < 0 ? "-$" : "$"}{Math.abs(neto).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        </span>
      );
    }
  },
  {
    id: "poas",
    label: "POAS (Margen/Pauta)",
    icon: <Target className="h-3.5 w-3.5 text-indigo-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const poas = item.health?.poasMargen ?? 0;
      if (item.spend === 0) return <span className="text-slate-400 font-mono text-xs">N/A</span>;
      return (
        <span className={`font-bold font-mono text-xs px-1.5 py-0.5 rounded border ${
          poas >= 1.5 
            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
            : poas >= 1.0 
              ? "bg-amber-50 text-amber-700 border-amber-200" 
              : "bg-rose-50 text-rose-700 border-rose-200"
        }`}>
          {poas.toFixed(2)}x
        </span>
      );
    }
  },
  {
    id: "roas",
    label: "ROAS (Fact/Pauta)",
    icon: <Percent className="h-3.5 w-3.5 text-teal-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const roas = item.health?.roasFacturacion ?? 0;
      if (item.spend === 0) return <span className="text-slate-400 font-mono text-xs">N/A</span>;
      return (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {roas.toFixed(2)}x
        </span>
      );
    }
  },
  {
    id: "cpa",
    label: "CPA Real (Costo/Venta)",
    icon: <DollarSign className="h-3.5 w-3.5 text-orange-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const cpa = item.health?.cpaReal ?? 0;
      const u = item.health?.unidadesVendidas ?? 0;
      if (u === 0) return <span className="text-slate-400 text-xs">-</span>;
      return (
        <span className="font-mono text-xs font-semibold text-orange-700 bg-orange-50/70 px-1.5 py-0.5 rounded border border-orange-100">
          ${cpa.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        </span>
      );
    }
  },
  {
    id: "costPerMsg",
    label: "Costo / Mensaje",
    icon: <TrendingUp className="h-3.5 w-3.5 text-orange-600" />,
    defaultVisible: false,
    align: "right",
    render: (item) => {
      const val = item.costPerMsg ?? (item.messages > 0 ? item.spend / item.messages : 0);
      const isGood = val > 0 && val < 300;
      return (
        <span className={`font-semibold font-mono text-xs ${isGood ? "text-emerald-600" : "text-slate-700"}`}>
          {val > 0 ? `$${val.toFixed(2)}` : "-"}
        </span>
      );
    }
  },
  {
    id: "cpm",
    label: "CPM (Costo/Mil)",
    icon: <Layers className="h-3.5 w-3.5 text-purple-600" />,
    defaultVisible: false,
    align: "right",
    render: (item) => {
      const val = item.cpm !== undefined && item.cpm !== null 
        ? item.cpm 
        : (item.impressions && item.impressions > 0 ? (item.spend / item.impressions) * 1000 : 0);
      return (
        <span className="font-mono text-xs font-semibold text-purple-900 bg-purple-50/70 px-1.5 py-0.5 rounded border border-purple-100">
          {val > 0 ? `$${val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
        </span>
      );
    }
  }
];

const STORAGE_KEY = "marketing_visible_columns_v5";

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED";

function isItemActive(status?: string): boolean {
  if (!status) return true;
  const s = status.toUpperCase();
  return s === "ACTIVE" || s === "ACTIVO" || s === "1";
}

function StatusBadge({ status, type = "camp" }: { status?: string; type?: "camp" | "adset" | "ad" }) {
  const active = isItemActive(status);
  const labelActive = type === "camp" ? "Activa" : type === "adset" ? "Activo" : "Activo";
  const labelPaused = type === "camp" ? "Pausada" : type === "adset" ? "Pausado" : "Pausado";

  if (active) {
    return (
      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 shrink-0 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
        {labelActive}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 border-slate-200 gap-1.5 shrink-0 shadow-2xs">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
      {labelPaused}
    </Badge>
  );
}

function SemasforoSaludBadge({ estado }: { estado?: CampaignHealthData["estadoSalud"] }) {
  switch (estado) {
    case "SALUDABLE":
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold px-2 py-0.5 gap-1 hover:bg-emerald-100 shadow-2xs">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Rentable
        </Badge>
      );
    case "NEUTRO":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold px-2 py-0.5 gap-1 hover:bg-amber-100 shadow-2xs">
          <AlertTriangle className="h-3 w-3 text-amber-600" />
          Ajustado
        </Badge>
      );
    case "CRITICO":
      return (
        <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] font-bold px-2 py-0.5 gap-1 hover:bg-rose-100 shadow-2xs">
          <XCircle className="h-3 w-3 text-rose-600" />
          No rentable
        </Badge>
      );
    case "SIN_VENTAS":
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-medium px-2 py-0.5 gap-1">
          Sin ventas
        </Badge>
      );
    case "SIN_ASIGNAR":
    default:
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-medium px-2 py-0.5 gap-1">
          <Boxes className="h-3 w-3 text-purple-500" />
          Sin asignar
        </Badge>
      );
  }
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  borderColor = "border-l-blue-500",
  badge
}: { 
  title: string; 
  value: string | number; 
  subtitle: string; 
  icon: React.ReactNode; 
  borderColor?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card className={`bg-white shadow-xs border-l-4 ${borderColor} hover:shadow-sm transition-shadow`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-3.5 px-4">
        <CardTitle className="text-xs font-semibold text-slate-600">{title}</CardTitle>
        <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="text-xl font-black tracking-tight text-slate-900">{value}</div>
          {badge}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function MarketingClient({ data, initialData, articulosDisponibles = [] }: MarketingClientProps) {
  const initial = data || initialData || { campaigns: [], autoResponses: [], puntosVenta: [], globalHealth: {} };
  
  const [campaigns, setCampaigns] = useState<MarketingCampaignData[]>(initial.campaigns || []);
  const [puntosVenta, setPuntosVenta] = useState<PuntoVentaFilterItem[]>(initial.puntosVenta || []);
  const [catalogArticulos] = useState(articulosDisponibles);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [datePreset, setDatePreset] = useState<DatePresetId>("last_30d");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const [isPvDropdownOpen, setIsPvDropdownOpen] = useState(false);

  // Modal de asignación: soporta asignar a Campaña o a Anuncio (ad)
  const [targetParaAsignar, setTargetParaAsignar] = useState<AsignarTargetInfo | null>(null);

  // Expansión jerárquica: por campaña, por adset, y por anuncio (para ver detalle productos)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, boolean>>({});

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

  const toggleAd = (id: string) => {
    setExpandedAds(prev => ({ ...prev, [id]: !prev[id] }));
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

  // Recalcular métricas cuando cambian los puntos de venta o el preset
  const recargarMetricasLocales = async (preset: DatePresetId, pvs: PuntoVentaFilterItem[]) => {
    setIsRecalculating(true);
    try {
      const activeIds = pvs.filter(p => p.active).map(p => p.id);
      const res = await getMarketingPerformance({
        datePreset: preset,
        puntoVentaIds: activeIds
      });
      setCampaigns(res.campaigns);
      setPuntosVenta(res.puntosVenta);
    } catch (e) {
      console.error("Error al recalcular métricas:", e);
    } finally {
      setIsRecalculating(false);
    }
  };

  const togglePuntoVenta = (pvId: string) => {
    const updated = puntosVenta.map(pv => pv.id === pvId ? { ...pv, active: !pv.active } : pv);
    setPuntosVenta(updated);
    recargarMetricasLocales(datePreset, updated);
  };

  const handleSyncWithPreset = async (preset: DatePresetId = datePreset) => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await sincronizarMarketingWorkflow(preset);
      if (res.success && res.data) {
        setCampaigns(res.data.campaigns);
        if (res.data.puntosVenta) {
          setPuntosVenta(res.data.puntosVenta);
        }
        setDatePreset(preset);
        const presetLabel = DATE_PRESETS.find(p => p.id === preset)?.label || preset;
        setSyncStatus({ 
          type: "success", 
          message: `¡Datos sincronizados desde Meta y ventas cruzadas para: "${presetLabel}"!` 
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

  const handleGuardadoAsignacion = () => {
    recargarMetricasLocales(datePreset, puntosVenta);
  };

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

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(camp => {
      if (statusFilter === "ACTIVE" && !isItemActive(camp.status)) return false;
      if (statusFilter === "PAUSED" && isItemActive(camp.status)) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCamp = camp.name.toLowerCase().includes(q) || camp.id.toLowerCase().includes(q);
        if (matchCamp) return true;

        const matchArticulos = camp.items?.some(it => it.articulo.nombre.toLowerCase().includes(q));
        if (matchArticulos) return true;

        const matchAdSet = camp.adSets?.some(as => 
          as.name.toLowerCase().includes(q) || 
          as.id.toLowerCase().includes(q) ||
          as.ads?.some(ad => ad.name.toLowerCase().includes(q) || ad.id.toLowerCase().includes(q) || ad.items?.some(it => it.articulo.nombre.toLowerCase().includes(q)))
        );
        if (matchAdSet) return true;

        return false;
      }

      return true;
    });
  }, [campaigns, statusFilter, search]);

  const totals = useMemo(() => {
    const totalSpend = filteredCampaigns.reduce((acc, c) => acc + c.spend, 0);
    const totalMessages = filteredCampaigns.reduce((acc, c) => acc + c.messages, 0);
    const totalVentas = filteredCampaigns.reduce((acc, c) => acc + (c.health?.unidadesVendidas || 0), 0);
    const totalFacturacion = filteredCampaigns.reduce((acc, c) => acc + (c.health?.facturacionReal || 0), 0);
    const totalCosto = filteredCampaigns.reduce((acc, c) => acc + (c.health?.costoMercaderia || 0), 0);
    const totalMargenBruto = totalFacturacion - totalCosto;
    const totalMargenNeto = totalMargenBruto - totalSpend;
    const globalRoas = totalSpend > 0 ? totalFacturacion / totalSpend : (totalFacturacion > 0 ? 999 : 0);
    const globalPoas = totalSpend > 0 ? totalMargenBruto / totalSpend : (totalMargenBruto > 0 ? 999 : 0);
    const globalCpa = totalVentas > 0 ? totalSpend / totalVentas : 0;
    const globalConversionRate = totalMessages > 0 ? (totalVentas / totalMessages) * 100 : 0;

    return {
      totalSpend,
      totalMessages,
      totalVentas,
      totalFacturacion,
      totalMargenBruto,
      totalMargenNeto,
      globalRoas,
      globalPoas,
      globalCpa,
      globalConversionRate
    };
  }, [filteredCampaigns]);

  const activeCols = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(col => visibleColumns.includes(col.id));
  }, [visibleColumns]);

  const isAllExpanded = useMemo(() => {
    if (filteredCampaigns.length === 0) return false;
    return filteredCampaigns.every(c => expandedCampaigns[c.id]);
  }, [filteredCampaigns, expandedCampaigns]);

  const currentPresetObj = DATE_PRESETS.find(p => p.id === datePreset) || DATE_PRESETS[0];
  const activePvNombres = puntosVenta.filter(p => p.active).map(p => p.nombre).join(" + ") || "Ningún canal";

  return (
    <div className="w-full space-y-6">
      {/* TARJETAS DEL TABLERO DE SALUD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
        <StatCard 
          title="Inversión Meta Ads" 
          value={`$${totals.totalSpend.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} 
          icon={<DollarSign className="h-4 w-4 text-blue-600" />}
          subtitle={currentPresetObj.label}
          borderColor="border-l-blue-500"
        />

        <StatCard 
          title="Facturación Atribuida" 
          value={`$${totals.totalFacturacion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} 
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          subtitle={`${totals.totalVentas} unidades (${activePvNombres})`}
          borderColor="border-l-emerald-500"
        />

        <StatCard 
          title="Margen Neto Publicitario" 
          value={`${totals.totalMargenNeto < 0 ? "-$" : "$"}${Math.abs(totals.totalMargenNeto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} 
          icon={<TrendingUp className={`h-4 w-4 ${totals.totalMargenNeto >= 0 ? "text-emerald-600" : "text-rose-600"}`} />}
          subtitle="Ganancia real descontando costo y pauta"
          borderColor={totals.totalMargenNeto >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
          badge={
            totals.totalMargenNeto >= 0 ? (
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0 hover:bg-emerald-100">+Rentable</Badge>
            ) : (
              <Badge className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0 hover:bg-rose-100">Déficit</Badge>
            )
          }
        />

        <StatCard 
          title="POAS / Margen s/ Gasto" 
          value={totals.totalSpend > 0 ? `${totals.globalPoas.toFixed(2)}x` : "0.00x"} 
          icon={<Target className="h-4 w-4 text-purple-600" />}
          subtitle={totals.globalPoas >= 1.5 ? "🟢 Saludable (>1.5x)" : totals.globalPoas >= 1.0 ? "🟡 Ajustado (1.0 - 1.5x)" : "🔴 Crítico (<1.0x)"}
          borderColor="border-l-purple-500"
        />

        <StatCard 
          title="ROAS Facturación" 
          value={totals.totalSpend > 0 ? `${totals.globalRoas.toFixed(2)}x` : "0.00x"} 
          icon={<Percent className="h-4 w-4 text-teal-600" />}
          subtitle={`CPA: $${totals.globalCpa.toLocaleString('es-AR', { maximumFractionDigits: 0 })} / venta`}
          borderColor="border-l-teal-500"
        />

        <StatCard 
          title="Leads & Conversión" 
          value={totals.totalMessages.toLocaleString('es-AR')} 
          icon={<MessageSquare className="h-4 w-4 text-indigo-600" />}
          subtitle={`Tasa cierre: ${totals.globalConversionRate.toFixed(1)}%`}
          borderColor="border-l-indigo-500"
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

      {/* TABLA PRINCIPAL JERÁRQUICA */}
      <Card className="w-full bg-white shadow-xs overflow-hidden flex flex-col border-slate-200">
        <CardHeader className="border-b bg-slate-50/60 pb-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-pink-100 text-pink-700">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Tablero de Salud: Campañas, Conjuntos y Anuncios ({filteredCampaigns.length})
                </CardTitle>
                {isRecalculating && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Recalculando ventas...
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Canales: <strong className="text-slate-700 font-semibold">{activePvNombres}</strong></span>
                <span>•</span>
                <span>Período: <strong className="text-slate-700 font-semibold">{currentPresetObj.label}</strong></span>
              </div>
            </div>

            {/* CONTROLES */}
            <div className="flex items-center flex-wrap gap-2">
              {/* SELECTOR DE PUNTOS DE VENTA */}
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPvDropdownOpen(!isPvDropdownOpen)}
                  className="h-8 gap-1.5 text-xs font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
                >
                  <Store className="h-3.5 w-3.5 text-purple-600" />
                  <span>Puntos de Venta ({puntosVenta.filter(p => p.active).length})</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>

                {isPvDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsPvDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                      <div className="px-2 py-1 text-[11px] font-bold uppercase text-slate-400 border-b border-slate-100 mb-1.5">
                        Canales de Cierre de Venta
                      </div>
                      <div className="space-y-1">
                        {puntosVenta.map((pv) => (
                          <button
                            key={pv.id}
                            onClick={() => togglePuntoVenta(pv.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
                              pv.active 
                                ? "bg-purple-50 text-purple-900 font-semibold" 
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: pv.color || "#6b7280" }}
                              />
                              {pv.nombre}
                            </span>
                            {pv.active && <Check className="h-3.5 w-3.5 text-purple-600 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* SELECTOR DE PERÍODO */}
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
                    <div className="fixed inset-0 z-40" onClick={() => setIsPresetDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                      <div className="px-2 py-1.5 text-[11px] font-bold uppercase text-slate-400 border-b border-slate-100 mb-1">
                        Período de Análisis
                      </div>
                      <div className="space-y-0.5">
                        {DATE_PRESETS.map((preset) => {
                          const isSelected = datePreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => {
                                setDatePreset(preset.id);
                                setIsPresetDropdownOpen(false);
                                recargarMetricasLocales(preset.id, puntosVenta);
                              }}
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
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                        <span className="text-xs font-bold text-slate-700">Métricas Visibles</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setAllColumns(true)} className="text-[10px] text-blue-600 hover:underline font-semibold">Todas</button>
                          <span className="text-slate-300 text-xs">|</span>
                          <button onClick={() => setAllColumns(false)} className="text-[10px] text-slate-500 hover:underline">Defecto</button>
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
                                isVisible ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-500 hover:bg-slate-50"
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

              {/* BOTÓN SINCRONIZAR CON META */}
              <Button 
                onClick={() => handleSyncWithPreset(datePreset)}
                disabled={isSyncing}
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold bg-pink-600 hover:bg-pink-700 text-white shadow-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Sincronizando..." : "Sincronizar Meta"}
              </Button>
            </div>
          </div>

          {/* FILTROS Y BUSCADOR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todas ({counts.total})
              </button>
              <button
                onClick={() => setStatusFilter("ACTIVE")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === "ACTIVE" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Activas ({counts.active})
              </button>
              <button
                onClick={() => setStatusFilter("PAUSED")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === "PAUSED" ? "bg-white text-slate-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                Pausadas ({counts.paused})
              </button>
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar campaña, conjunto, anuncio o artículo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white border-slate-200"
              />
            </div>
          </div>
        </CardHeader>

        {/* TABLA JERÁRQUICA */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 px-2 text-center"></TableHead>
                <TableHead className="font-bold text-slate-900 text-xs min-w-[240px]">Estructura Publicitaria</TableHead>
                <TableHead className="font-bold text-slate-900 text-xs text-center min-w-[190px]">Artículos / Packs Promocionados</TableHead>
                <TableHead className="font-bold text-slate-900 text-xs text-center">Salud</TableHead>
                {activeCols.map(col => (
                  <TableHead 
                    key={col.id} 
                    className={`font-bold text-slate-900 text-xs whitespace-nowrap ${
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                    }`}
                  >
                    <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                      {col.icon}
                      <span>{col.label}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={activeCols.length + 4} className="h-32 text-center">
                    <div className="space-y-1.5">
                      <BarChart3 className="h-8 w-8 text-slate-300 mx-auto" />
                      <p className="text-sm font-medium text-slate-600">No se encontraron campañas</p>
                      <p className="text-xs text-slate-400">Probá ajustando los filtros o sincronizando con Meta.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map(camp => {
                  const isCampExpanded = !!expandedCampaigns[camp.id];
                  const campItems = camp.items || [];
                  const childAdSets = camp.adSets || [];

                  return (
                    <React.Fragment key={camp.id}>
                      {/* FILA NIVEL 1: CAMPAÑA */}
                      <TableRow className={`hover:bg-slate-50/80 transition-colors font-medium ${isCampExpanded ? "bg-purple-50/30 border-b-0" : ""}`}>
                        {/* EXPANDIR CAMPAÑA */}
                        <TableCell className="px-2 text-center">
                          {childAdSets.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleCampaign(camp.id)}
                              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors"
                              title={isCampExpanded ? "Colapsar conjuntos" : "Desglosar conjuntos"}
                            >
                              {isCampExpanded ? <ChevronDown className="h-4 w-4 text-purple-700" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="w-4 inline-block" />
                          )}
                        </TableCell>

                        {/* NOMBRE Y TIPO */}
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={camp.status} type="camp" />
                              <span className="font-bold text-xs text-slate-900 leading-tight">
                                {camp.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-50 border-slate-200">
                                Campaña
                              </Badge>
                              <span>• {childAdSets.length} conjuntos</span>
                              <span>• ID: {camp.id}</span>
                            </div>
                          </div>
                        </TableCell>

                        {/* ARTÍCULOS ASIGNADOS A NIVEL CAMPAÑA */}
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTargetParaAsignar({
                                campaignId: camp.id,
                                name: camp.name,
                                type: "camp",
                                initialItemIds: campItems.map(it => it.articuloId)
                              })}
                              className="h-6 px-2 text-[11px] font-semibold gap-1 text-purple-700 bg-purple-50/60 hover:bg-purple-100/80 border-purple-200 shadow-2xs"
                              title="Asignar artículos globales a la campaña"
                            >
                              <Boxes className="h-3 w-3 text-purple-600" />
                              <span>{campItems.length > 0 ? `${campItems.length} asignados` : "+ Asignar"}</span>
                            </Button>
                            
                            {campItems.length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px]">
                                {campItems.slice(0, 2).map(it => (
                                  <Badge key={it.id} variant="secondary" className="text-[9px] px-1.5 py-0 truncate max-w-[95px] bg-slate-100 text-slate-700">
                                    {it.articulo.nombre}
                                  </Badge>
                                ))}
                                {campItems.length > 2 && (
                                  <span className="text-[9px] font-bold text-purple-600">
                                    +{campItems.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* SEMÁFORO SALUD CAMPAÑA */}
                        <TableCell className="text-center">
                          <SemasforoSaludBadge estado={camp.health?.estadoSalud} />
                        </TableCell>

                        {/* MÉTRICAS DE CAMPAÑA */}
                        {activeCols.map(col => (
                          <TableCell 
                            key={col.id} 
                            className={`text-xs py-3 ${
                              col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                            }`}
                          >
                            {col.render(camp)}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* NIVEL 2: CONJUNTOS DE ANUNCIOS (ADSETS) */}
                      {isCampExpanded && childAdSets.map(adSet => {
                        const isAdSetExpanded = !!expandedAdSets[adSet.id];
                        const childAds = adSet.ads || [];

                        return (
                          <React.Fragment key={adSet.id}>
                            {/* FILA DE ADSET */}
                            <TableRow className="bg-slate-50/70 hover:bg-slate-100/70 transition-colors border-l-4 border-l-blue-400">
                              <TableCell className="px-2 text-center pl-4">
                                {childAds.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleAdSet(adSet.id)}
                                    className="p-1 hover:bg-slate-200 rounded text-blue-600 transition-colors"
                                    title={isAdSetExpanded ? "Colapsar anuncios" : "Desglosar anuncios"}
                                  >
                                    {isAdSetExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                ) : (
                                  <span className="w-3.5 inline-block" />
                                )}
                              </TableCell>

                              {/* NOMBRE ADSET */}
                              <TableCell className="pl-4">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                    <StatusBadge status={adSet.status} type="adset" />
                                    <span className="font-semibold text-xs text-slate-800">
                                      {adSet.name}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-2 pl-5">
                                    <span>Conjunto</span>
                                    <span>• {childAds.length} anuncios</span>
                                  </div>
                                </div>
                              </TableCell>

                              {/* ARTÍCULOS EN ADSET */}
                              <TableCell className="text-center">
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {(adSet.items || []).length > 0 ? `${(adSet.items || []).length} prods. en anuncios` : "Asignar por anuncio ⬇️"}
                                </span>
                              </TableCell>

                              {/* SALUD ADSET */}
                              <TableCell className="text-center">
                                <SemasforoSaludBadge estado={adSet.health?.estadoSalud} />
                              </TableCell>

                              {/* COLUMNAS ADSET */}
                              {activeCols.map(col => (
                                <TableCell 
                                  key={col.id} 
                                  className={`text-xs py-2 ${
                                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                  }`}
                                >
                                  {col.render(adSet)}
                                </TableCell>
                              ))}
                            </TableRow>

                            {/* NIVEL 3: ANUNCIOS (ADS) */}
                            {isAdSetExpanded && childAds.map(ad => {
                              const isAdExpanded = !!expandedAds[ad.id];
                              const adItems = ad.items || [];

                              return (
                                <React.Fragment key={ad.id}>
                                  {/* FILA DE ANUNCIO */}
                                  <TableRow className="bg-white hover:bg-pink-50/20 transition-colors border-l-4 border-l-pink-500">
                                    <TableCell className="px-2 text-center pl-7">
                                      {adItems.length > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleAd(ad.id)}
                                          className="p-1 hover:bg-pink-100 rounded text-pink-700 transition-colors"
                                          title={isAdExpanded ? "Ocultar desglose de artículos" : "Ver artículos asignados"}
                                        >
                                          {isAdExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        </button>
                                      ) : (
                                        <span className="w-3.5 inline-block" />
                                      )}
                                    </TableCell>

                                    {/* NOMBRE ANUNCIO */}
                                    <TableCell className="pl-6">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5">
                                          <Megaphone className="h-3.5 w-3.5 text-pink-600 shrink-0" />
                                          <StatusBadge status={ad.status} type="ad" />
                                          <span className="font-semibold text-xs text-slate-900">
                                            {ad.name}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono pl-5">
                                          Ad ID: {ad.id}
                                        </div>
                                      </div>
                                    </TableCell>

                                    {/* BOTÓN ASIGNAR ARTÍCULOS A ESTE ANUNCIO ESPECÍFICO */}
                                    <TableCell className="text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setTargetParaAsignar({
                                            campaignId: camp.id,
                                            adId: ad.id,
                                            name: ad.name,
                                            type: "ad",
                                            initialItemIds: adItems.map(it => it.articuloId)
                                          })}
                                          className={`h-6 px-2 text-[11px] font-bold gap-1 shadow-2xs transition-all ${
                                            adItems.length > 0 
                                              ? "bg-pink-50 text-pink-700 border-pink-300 hover:bg-pink-100" 
                                              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50 border-dashed"
                                          }`}
                                        >
                                          <Plus className="h-3 w-3 text-pink-600" />
                                          <span>{adItems.length > 0 ? `${adItems.length} asignados` : "+ Asignar al Anuncio"}</span>
                                        </Button>

                                        {adItems.length > 0 && (
                                          <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px]">
                                            {adItems.slice(0, 2).map(it => (
                                              <Badge key={it.id} variant="secondary" className="text-[9px] px-1.5 py-0 truncate max-w-[95px] bg-pink-100/60 text-pink-900 border-pink-200">
                                                {it.articulo.nombre}
                                              </Badge>
                                            ))}
                                            {adItems.length > 2 && (
                                              <span className="text-[9px] font-bold text-pink-600">
                                                +{adItems.length - 2}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>

                                    {/* SALUD ANUNCIO */}
                                    <TableCell className="text-center">
                                      <SemasforoSaludBadge estado={ad.health?.estadoSalud} />
                                    </TableCell>

                                    {/* COLUMNAS ANUNCIO */}
                                    {activeCols.map(col => (
                                      <TableCell 
                                        key={col.id} 
                                        className={`text-xs py-2 ${
                                          col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                        }`}
                                      >
                                        {col.render(ad)}
                                      </TableCell>
                                    ))}
                                  </TableRow>

                                  {/* SUB-FILA DESGLOSE DE PRODUCTOS DEL ANUNCIO */}
                                  {isAdExpanded && adItems.length > 0 && (
                                    <TableRow className="bg-pink-50/20 hover:bg-pink-50/20">
                                      <TableCell colSpan={activeCols.length + 4} className="p-3 pl-14">
                                        <div className="rounded-lg border border-pink-200 bg-white p-3 shadow-2xs space-y-2">
                                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                            <span>Artículos / Packs promocionados por este anuncio ({adItems.length}):</span>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => setTargetParaAsignar({
                                                campaignId: camp.id,
                                                adId: ad.id,
                                                name: ad.name,
                                                type: "ad",
                                                initialItemIds: adItems.map(it => it.articuloId)
                                              })}
                                              className="h-5 px-1.5 text-[10px] text-pink-700 bg-pink-50 hover:bg-pink-100 border-pink-200"
                                            >
                                              Editar
                                            </Button>
                                          </div>

                                          <div className="overflow-x-auto rounded border border-slate-100">
                                            <table className="w-full text-xs">
                                              <thead className="bg-slate-50 text-slate-600">
                                                <tr>
                                                  <th className="text-left px-2 py-1.5 font-semibold">Producto / Pack</th>
                                                  <th className="text-center px-2 py-1.5 font-semibold">Stock</th>
                                                  <th className="text-right px-2 py-1.5 font-semibold">Precio</th>
                                                  <th className="text-right px-2 py-1.5 font-semibold">Costo U.</th>
                                                  <th className="text-center px-2 py-1.5 font-bold text-purple-800 bg-purple-50">Ventas</th>
                                                  <th className="text-right px-2 py-1.5 font-bold text-emerald-800 bg-emerald-50">Facturación</th>
                                                  <th className="text-right px-2 py-1.5 font-bold text-blue-800 bg-blue-50">Ganancia Bruta</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {adItems.map(it => (
                                                  <tr key={it.id} className="hover:bg-slate-50">
                                                    <td className="px-2 py-1.5 font-medium text-slate-800">
                                                      <div className="flex items-center gap-1">
                                                        <span>{it.articulo.nombre}</span>
                                                        {it.articulo.esPack && (
                                                          <Badge variant="outline" className="bg-purple-50 text-purple-700 text-[8px] px-1 py-0">Pack</Badge>
                                                        )}
                                                      </div>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-center">
                                                      <span className={it.articulo.stock > 0 ? "text-emerald-700" : "text-red-600 font-semibold"}>
                                                        {it.articulo.stock}
                                                      </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-mono">${it.articulo.precio.toLocaleString("es-AR")}</td>
                                                    <td className="px-2 py-1.5 text-right font-mono text-slate-500">${it.articulo.costo.toLocaleString("es-AR")}</td>
                                                    <td className="px-2 py-1.5 text-center font-bold font-mono text-purple-900 bg-purple-50/50">{it.unidadesVendidas} un.</td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono text-emerald-700 bg-emerald-50/50">${it.facturacion.toLocaleString("es-AR")}</td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono text-blue-700 bg-blue-50/50">${it.gananciaBruta.toLocaleString("es-AR")}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* MODAL DE ASIGNACIÓN (NIVEL CAMPAÑA O NIVEL ANUNCIO) */}
      <ModalAsignarArticulos
        isOpen={!!targetParaAsignar}
        onClose={() => setTargetParaAsignar(null)}
        target={targetParaAsignar}
        articulosDisponibles={catalogArticulos}
        onGuardado={handleGuardadoAsignacion}
      />
    </div>
  );
}
