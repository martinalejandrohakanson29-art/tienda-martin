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
  Plus,
  ArrowLeft,
  ExternalLink,
  Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
          {u.toLocaleString("es-AR", { minimumFractionDigits: u % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })} un.
        </span>
      );
    }
  },
  {
    id: "facturacion",
    label: "Facturación Bruta",
    icon: <DollarSign className="h-3.5 w-3.5 text-emerald-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const f = item.health?.facturacionReal ?? 0;
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      return (
        <span className="font-bold font-mono text-emerald-700 text-xs sm:text-sm">
          ${f.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  },
  {
    id: "pctGastoVenta",
    label: "% Gasto s/ Venta",
    icon: <Percent className="h-3.5 w-3.5 text-amber-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const facturacion = item.health?.facturacionReal ?? 0;
      if (facturacion === 0) {
        return item.spend > 0 ? (
          <div className="flex flex-col items-end">
            <span className="font-mono font-bold text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              Sin ventas
            </span>
            <span className="text-[9px] text-slate-400 font-mono mt-0.5">
              Gasto: ${item.spend.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        ) : <span className="text-slate-400 font-mono text-xs">0,00%</span>;
      }
      const pct = (item.spend / facturacion) * 100;
      return (
        <div className="flex flex-col items-end">
          <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded border ${
            pct <= 15 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : pct <= 30 
                ? "bg-amber-50 text-amber-700 border-amber-200" 
                : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {pct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
            Venta: ${facturacion.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      );
    }
  },
  {
    id: "margenBruto",
    label: "Ganancia Bruta",
    icon: <DollarSign className="h-3.5 w-3.5 text-blue-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const bruto = item.health?.margenBruto ?? 0;
      return (
        <span className="font-bold font-mono text-xs sm:text-sm text-blue-700">
          ${bruto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
  },
  {
    id: "pctGastoMargen",
    label: "% Gasto s/ Ganancia",
    icon: <Percent className="h-3.5 w-3.5 text-indigo-600" />,
    defaultVisible: true,
    align: "right",
    render: (item) => {
      const hasItems = (item.items || []).length > 0;
      if (!hasItems) return <span className="text-slate-300">-</span>;
      const bruto = item.health?.margenBruto ?? 0;
      if (bruto <= 0) {
        return item.spend > 0 ? (
          <div className="flex flex-col items-end">
            <span className="font-mono font-bold text-[10px] text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">
              {bruto === 0 ? "Sin ganancia" : "Margen neg."}
            </span>
          </div>
        ) : <span className="text-slate-400 font-mono text-xs">0,00%</span>;
      }
      const pct = (item.spend / bruto) * 100;
      return (
        <div className="flex flex-col items-end">
          <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded border ${
            pct <= 40 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : pct <= 75 
                ? "bg-amber-50 text-amber-700 border-amber-200" 
                : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {pct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
            Bruto: ${bruto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      );
    }
  },
  {
    id: "margenNeto",
    label: "Margen Neto (Bolsillo)",
    icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />,
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
          {neto < 0 ? "-$" : "$"}{Math.abs(neto).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          ${cpa.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          {val > 0 ? `$${val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
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

const STORAGE_KEY = "marketing_visible_columns_v9";

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
  const [globalHealth, setGlobalHealth] = useState<any>(initial.globalHealth || {});
  const [catalogArticulos] = useState(articulosDisponibles);
  
  // Campaña seleccionada (null = vista general, string ID = pantalla dedicada de campaña)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

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

  // Expansión en la pantalla de la campaña: por adset y por anuncio
  const [expandedAdSets, setExpandedAdSets] = useState<Record<string, boolean>>({});
  const [expandedAds, setExpandedAds] = useState<Record<string, boolean>>({});

  // Columnas visibles inicializadas desde localStorage si están disponibles
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {}
    }
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

  const handleSelectCampaign = (campId: string | null) => {
    setSelectedCampaignId(campId);
    if (campId) {
      const camp = campaigns.find(c => c.id === campId);
      if (camp?.adSets) {
        const newAdSets: Record<string, boolean> = {};
        camp.adSets.forEach(as => {
          newAdSets[as.id] = true;
        });
        setExpandedAdSets(newAdSets);
      }
    }
  };

  useEffect(() => {
    if (selectedCampaignId) {
      const camp = campaigns.find(c => c.id === selectedCampaignId);
      if (camp?.adSets) {
        setExpandedAdSets(prev => {
          const next = { ...prev };
          camp.adSets?.forEach(as => {
            if (next[as.id] === undefined) {
              next[as.id] = true;
            }
          });
          return next;
        });
      }
    }
  }, [selectedCampaignId, campaigns]);

  const toggleAdSet = (id: string) => {
    setExpandedAdSets(prev => {
      const current = prev[id] !== false;
      return { ...prev, [id]: !current };
    });
  };

  const toggleAd = (id: string) => {
    setExpandedAds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllAdSets = (expand: boolean) => {
    if (!selectedCampaign) return;
    const newAdSet: Record<string, boolean> = {};
    selectedCampaign.adSets?.forEach(as => {
      newAdSet[as.id] = expand;
    });
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
      setGlobalHealth(res.globalHealth);
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
        if (res.data.globalHealth) {
          setGlobalHealth(res.data.globalHealth);
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

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find(c => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  const activeCols = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(col => visibleColumns.includes(col.id));
  }, [visibleColumns]);

  const currentPresetObj = DATE_PRESETS.find(p => p.id === datePreset) || DATE_PRESETS[0];
  const activePvNombres = puntosVenta.filter(p => p.active).map(p => p.nombre).join(" + ") || "Instagram y Mostrador";

  // DATOS DE SALUD GLOBAL MACRO (del período para los canales seleccionados, sin depender de artículos asignados)
  const macroHealth = useMemo(() => {
    const totalSpend = globalHealth?.totalSpend ?? campaigns.reduce((acc, c) => acc + c.spend, 0);
    const totalFacturacion = globalHealth?.totalFacturacion ?? 0;
    const totalVentas = globalHealth?.totalVentas ?? 0; // Tickets de venta
    const totalUnidades = globalHealth?.totalUnidades ?? 0; // Unidades físicas
    const totalMargenBruto = globalHealth?.totalMargenBruto ?? (totalFacturacion - (globalHealth?.totalCosto ?? 0));
    const totalMargenNeto = globalHealth?.totalMargenNeto ?? (totalMargenBruto - totalSpend);
    const globalRoas = totalSpend > 0 ? totalFacturacion / totalSpend : (totalFacturacion > 0 ? 999 : 0);
    const totalMessages = globalHealth?.totalMessages ?? campaigns.reduce((acc, c) => acc + c.messages, 0);
    const costoPorLead = totalMessages > 0 ? totalSpend / totalMessages : 0;
    const globalConversionRate = totalMessages > 0 ? (totalVentas / totalMessages) * 100 : 0;

    return {
      totalSpend,
      totalFacturacion,
      totalVentas,
      totalUnidades,
      totalMargenBruto,
      totalMargenNeto,
      globalRoas,
      totalMessages,
      costoPorLead,
      globalConversionRate
    };
  }, [globalHealth, campaigns]);

  return (
    <div className="w-full space-y-6">
      {/* ========================================================================= */}
      {/* VISTA 1: PANTALLA DEDICADA DE CAMPAÑA SELECCIONADA */}
      {/* ========================================================================= */}
      {selectedCampaign ? (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* HEADER DE LA PANTALLA DE CAMPAÑA */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSelectCampaign(null)}
                  className="h-8 gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver a Campañas
                </Button>
                <StatusBadge status={selectedCampaign.status} type="camp" />
                <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-mono">
                  ID: {selectedCampaign.id}
                </Badge>
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {selectedCampaign.name}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Período de análisis: <strong className="text-slate-700 font-semibold">{currentPresetObj.label}</strong></span>
                  <span>•</span>
                  <span>Canales de cierre: <strong className="text-slate-700 font-semibold">{activePvNombres}</strong></span>
                  <span>•</span>
                  <span>{selectedCampaign.adSets?.length || 0} Conjuntos de anuncios</span>
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetParaAsignar({
                  campaignId: selectedCampaign.id,
                  name: selectedCampaign.name,
                  type: "camp",
                  initialItemIds: (selectedCampaign.items || []).map(it => it.articuloId)
                })}
                className="h-9 px-3 text-xs font-bold gap-1.5 text-purple-700 bg-purple-50/80 hover:bg-purple-100 border-purple-200 shadow-2xs"
              >
                <Boxes className="h-4 w-4 text-purple-600" />
                <span>Asignar Artículos a la Campaña</span>
                {(selectedCampaign.items || []).length > 0 && (
                  <Badge className="ml-1 bg-purple-600 text-white text-[10px] px-1.5 py-0">
                    {(selectedCampaign.items || []).length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* TARJETAS DE SALUD ESPECÍFICAS DE ESTA CAMPAÑA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            <StatCard 
              title="Inversión Campaña" 
              value={`$${selectedCampaign.spend.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<DollarSign className="h-4 w-4 text-blue-600" />}
              subtitle={currentPresetObj.label}
              borderColor="border-l-blue-500"
            />

            <StatCard 
              title="Facturación Atribuida" 
              value={`$${(selectedCampaign.health?.facturacionReal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              subtitle={`${(selectedCampaign.health?.unidadesVendidas || 0).toLocaleString('es-AR', { minimumFractionDigits: (selectedCampaign.health?.unidadesVendidas || 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })} unidades asignadas`}
              borderColor="border-l-emerald-500"
            />

            <StatCard 
              title="Margen Neto Campaña" 
              value={`${(selectedCampaign.health?.margenNeto || 0) < 0 ? "-$" : "$"}${Math.abs(selectedCampaign.health?.margenNeto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<TrendingUp className={`h-4 w-4 ${(selectedCampaign.health?.margenNeto || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`} />}
              subtitle="Facturación - Costo de Artículos - Pauta"
              borderColor={(selectedCampaign.health?.margenNeto || 0) >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
              badge={
                (selectedCampaign.health?.margenNeto || 0) >= 0 ? (
                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0 hover:bg-emerald-100">+Rentable</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0 hover:bg-rose-100">Déficit</Badge>
                )
              }
            />

            <StatCard 
              title="POAS (Margen/Pauta)" 
              value={selectedCampaign.spend > 0 ? `${(selectedCampaign.health?.poasMargen || 0).toFixed(2)}x` : "0,00x"} 
              icon={<Target className="h-4 w-4 text-purple-600" />}
              subtitle={(selectedCampaign.health?.poasMargen || 0) >= 1.5 ? "🟢 Saludable (>1.5x)" : (selectedCampaign.health?.poasMargen || 0) >= 1.0 ? "🟡 Ajustado (1.0-1.5x)" : "🔴 Crítico (<1.0x)"}
              borderColor="border-l-purple-500"
            />

            <StatCard 
              title="ROAS & CPA Campaña" 
              value={selectedCampaign.spend > 0 ? `${(selectedCampaign.health?.roasFacturacion || 0).toFixed(2)}x` : "0,00x"} 
              icon={<Percent className="h-4 w-4 text-teal-600" />}
              subtitle={`CPA: $${(selectedCampaign.health?.cpaReal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / venta`}
              borderColor="border-l-teal-500"
            />

            <StatCard 
              title="Leads & Conversión" 
              value={selectedCampaign.messages.toLocaleString('es-AR')} 
              icon={<MessageSquare className="h-4 w-4 text-indigo-600" />}
              subtitle={`Cierre: ${(selectedCampaign.health?.conversionRate || 0).toFixed(2)}% (${(selectedCampaign.health?.unidadesVendidas || 0).toLocaleString('es-AR', { minimumFractionDigits: (selectedCampaign.health?.unidadesVendidas || 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })} un.)`}
              borderColor="border-l-indigo-500"
            />
          </div>

          {/* TABLA DE CONJUNTOS Y ANUNCIOS DE LA CAMPAÑA */}
          <Card className="w-full bg-white shadow-xs overflow-hidden flex flex-col border-slate-200">
            <CardHeader className="border-b bg-slate-50/60 pb-3 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-pink-100 text-pink-700">
                      <Layers className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      Estructura de la Campaña: Conjuntos y Anuncios
                    </CardTitle>
                    <Badge variant="outline" className="bg-slate-100 text-slate-700 text-xs font-semibold">
                      {selectedCampaign.adSets?.length || 0} Conjuntos
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    Desglosá los conjuntos para ver anuncios individuales y asignar qué artículos o packs promociona cada uno.
                  </CardDescription>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  {/* SELECTOR DE COLUMNAS */}
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="h-8 gap-1.5 text-xs font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
                    >
                      <Columns3 className="h-3.5 w-3.5 text-blue-600" />
                      <span>Columnas ({activeCols.length})</span>
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    </Button>

                    {isDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                        <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                            <span className="text-[11px] font-bold uppercase text-slate-400">Columnas Visibles</span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <button onClick={() => setAllColumns(true)} className="text-blue-600 font-semibold hover:underline">Todas</button>
                              <span>•</span>
                              <button onClick={() => setAllColumns(false)} className="text-slate-500 hover:underline">Reset</button>
                            </div>
                          </div>
                          <div className="space-y-0.5 max-h-60 overflow-y-auto">
                            {AVAILABLE_COLUMNS.map(col => {
                              const isChecked = visibleColumns.includes(col.id);
                              return (
                                <button
                                  key={col.id}
                                  onClick={() => toggleColumn(col.id)}
                                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                                    isChecked ? "bg-blue-50 text-blue-900 font-semibold" : "text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {col.icon}
                                    {col.label}
                                  </span>
                                  {isChecked && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allOpen = (selectedCampaign.adSets || []).every(as => expandedAdSets[as.id] !== false);
                      toggleAllAdSets(!allOpen);
                    }}
                    className="h-8 gap-1.5 text-xs font-medium bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-xs"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                    {(selectedCampaign.adSets || []).every(as => expandedAdSets[as.id] !== false) 
                      ? "Colapsar todos los conjuntos" 
                      : "Desglosar todos los conjuntos"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8 px-2 text-center"></TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs min-w-[240px]">Conjunto / Anuncio</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-center min-w-[280px]">Artículos Promocionados</TableHead>
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
                  {(selectedCampaign.adSets || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={activeCols.length + 4} className="h-32 text-center">
                        <div className="space-y-1.5">
                          <Layers className="h-8 w-8 text-slate-300 mx-auto" />
                          <p className="text-sm font-medium text-slate-600">No se encontraron conjuntos de anuncios para esta campaña</p>
                          <p className="text-xs text-slate-400">Probá sincronizando nuevamente con Meta.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (selectedCampaign.adSets || []).map(adSet => {
                      const isAdSetExpanded = expandedAdSets[adSet.id] !== false;
                      const childAds = adSet.ads || [];

                      return (
                        <React.Fragment key={adSet.id}>
                          {/* FILA DE ADSET */}
                          <TableRow className="bg-slate-50/70 hover:bg-slate-100/70 transition-colors border-l-4 border-l-blue-400 font-medium">
                            <TableCell className="px-2 text-center">
                              {childAds.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleAdSet(adSet.id)}
                                  className="p-1 hover:bg-slate-200 rounded text-blue-600 transition-colors"
                                  title={isAdSetExpanded ? "Colapsar anuncios" : "Desglosar anuncios"}
                                >
                                  {isAdSetExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : (
                                <span className="w-4 inline-block" />
                              )}
                            </TableCell>

                            {/* NOMBRE ADSET */}
                            <TableCell>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                  <StatusBadge status={adSet.status} type="adset" />
                                  <span className="font-bold text-xs text-slate-900">
                                    {adSet.name}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2 pl-5">
                                  <span>Conjunto</span>
                                  <span>• {childAds.length} anuncios</span>
                                  <span>• ID: {adSet.id}</span>
                                </div>
                              </div>
                            </TableCell>

                            {/* ARTÍCULOS EN ADSET */}
                            <TableCell className="text-center">
                              {(adSet.items || []).length > 0 ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold px-2 py-0.5">
                                  {(adSet.items || []).length} prods. en anuncios
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Asignar por anuncio ⬇️</span>
                              )}
                            </TableCell>

                            {/* SALUD ADSET */}
                            <TableCell className="text-center">
                              <SemasforoSaludBadge estado={adSet.health?.estadoSalud} />
                            </TableCell>

                            {/* COLUMNAS ADSET */}
                            {activeCols.map(col => (
                              <TableCell 
                                key={col.id} 
                                className={`text-xs py-2.5 ${
                                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                }`}
                              >
                                {col.render(adSet)}
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* ANUNCIOS (ADS) */}
                          {isAdSetExpanded && childAds.map(ad => {
                            const isAdExpanded = !!expandedAds[ad.id];
                            const adItems = ad.items || [];

                            return (
                              <React.Fragment key={ad.id}>
                                <TableRow className="bg-white hover:bg-pink-50/20 transition-colors border-l-4 border-l-pink-500">
                                  <TableCell className="px-2 text-center pl-6">
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

                                  {/* BOTÓN ASIGNAR ARTÍCULOS A ESTE ANUNCIO */}
                                  <TableCell className="text-center py-2.5">
                                    <div className="flex flex-col items-center gap-1.5 max-w-[340px] mx-auto">
                                      {adItems.length > 0 ? (
                                        <>
                                          <div className="flex flex-wrap items-center justify-center gap-1.5 w-full">
                                            {adItems.map(it => (
                                              <Badge 
                                                key={it.id} 
                                                variant="secondary" 
                                                title={it.articulo.nombre}
                                                className="text-[10px] px-2 py-0.5 font-medium bg-pink-50 text-pink-900 border border-pink-200 text-left whitespace-normal leading-tight shadow-2xs"
                                              >
                                                <span>{it.articulo.nombre}</span>
                                                {it.articulo.esPack && (
                                                  <span className="ml-1 text-[8px] font-bold bg-purple-100 text-purple-700 px-1 py-0.2 rounded border border-purple-200">
                                                    Pack
                                                  </span>
                                                )}
                                              </Badge>
                                            ))}
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTargetParaAsignar({
                                              campaignId: selectedCampaign.id,
                                              adId: ad.id,
                                              name: ad.name,
                                              type: "ad",
                                              initialItemIds: adItems.map(it => it.articuloId)
                                            })}
                                            className="h-5 px-2 text-[10px] font-bold text-pink-700 hover:text-pink-900 hover:bg-pink-100/70"
                                          >
                                            <Plus className="h-3 w-3 mr-0.5" />
                                            Editar asignación ({adItems.length})
                                          </Button>
                                        </>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setTargetParaAsignar({
                                            campaignId: selectedCampaign.id,
                                            adId: ad.id,
                                            name: ad.name,
                                            type: "ad",
                                            initialItemIds: []
                                          })}
                                          className="h-6 px-2.5 text-[11px] font-semibold text-slate-600 bg-white border-dashed border-slate-300 hover:bg-pink-50 hover:text-pink-700 hover:border-pink-300 shadow-2xs transition-all"
                                        >
                                          <Plus className="h-3 w-3 mr-1 text-slate-400" />
                                          + Asignar al Anuncio
                                        </Button>
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
                                              campaignId: selectedCampaign.id,
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
                                                <th className="text-right px-2 py-1.5 font-bold text-emerald-800 bg-emerald-50">Facturación (Bruto)</th>
                                                <th className="text-right px-2 py-1.5 font-bold text-blue-800 bg-blue-50">Ganancia Bruta</th>
                                                <th className="text-right px-2 py-1.5 font-bold text-amber-800 bg-amber-50">% Gasto s/ Venta</th>
                                                <th className="text-right px-2 py-1.5 font-bold text-indigo-800 bg-indigo-50">% Gasto s/ Ganancia</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {adItems.map(it => {
                                                const isShared = (it.anunciosCompartidosCount || 1) > 1;
                                                const totalFactAd = ad.health?.facturacionReal || 0;
                                                const propGasto = totalFactAd > 0 ? (it.facturacion / totalFactAd) : (1 / adItems.length);
                                                const gastoProd = ad.spend * propGasto;
                                                const pctVenta = it.facturacion > 0 ? (gastoProd / it.facturacion) * 100 : (gastoProd > 0 ? 999 : 0);
                                                const pctGanancia = it.gananciaBruta > 0 ? (gastoProd / it.gananciaBruta) * 100 : (gastoProd > 0 ? 999 : 0);

                                                return (
                                                  <tr key={it.id} className="hover:bg-slate-50">
                                                    <td className="px-2 py-1.5 font-medium text-slate-800">
                                                      <div className="space-y-0.5">
                                                        <div className="flex items-center gap-1">
                                                          <span>{it.articulo.nombre}</span>
                                                          {it.articulo.esPack && (
                                                            <Badge variant="outline" className="bg-purple-50 text-purple-700 text-[8px] px-1 py-0">Pack</Badge>
                                                          )}
                                                        </div>
                                                        {isShared && (
                                                          <div className="text-[9px] text-amber-700 font-normal flex items-center gap-1">
                                                           <span>Compartido en {it.anunciosCompartidosCount} anuncios ({Math.round((it.pesoAtribucion || 0) * 100)}% atrib.)</span>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-center">
                                                      <span className={it.articulo.stock > 0 ? "text-emerald-700" : "text-red-600 font-semibold"}>
                                                        {it.articulo.stock}
                                                      </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-mono">${it.articulo.precio.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="px-2 py-1.5 text-right font-mono text-slate-500">${it.articulo.costo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="px-2 py-1.5 text-center font-bold font-mono text-purple-900 bg-purple-50/50">
                                                      <div>{it.unidadesVendidas.toLocaleString("es-AR", { minimumFractionDigits: it.unidadesVendidas % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })} un.</div>
                                                      {isShared && <div className="text-[9px] text-slate-400 font-normal">de {it.totalVentasArticulo?.toLocaleString("es-AR", { maximumFractionDigits: 2 })} tot.</div>}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono text-emerald-700 bg-emerald-50/50">
                                                      <div>${it.facturacion.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                      {isShared && <div className="text-[9px] text-slate-400 font-normal">de ${it.totalFacturacionArticulo?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono text-blue-700 bg-blue-50/50">
                                                      ${it.gananciaBruta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono bg-amber-50/30">
                                                      {it.facturacion > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                          <span className={`text-[11px] px-1.5 py-0.2 rounded border ${
                                                            pctVenta <= 15 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : pctVenta <= 30 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                                          }`}>
                                                            {pctVenta.toFixed(2)}%
                                                          </span>
                                                          <span className="text-[9px] text-slate-400 font-normal">Pauta: ${gastoProd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                      ) : (
                                                        <span className="text-slate-400 font-normal">-</span>
                                                      )}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-bold font-mono bg-indigo-50/30">
                                                      {it.gananciaBruta > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                          <span className={`text-[11px] px-1.5 py-0.2 rounded border ${
                                                            pctGanancia <= 40 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : pctGanancia <= 75 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                                          }`}>
                                                            {pctGanancia.toFixed(2)}%
                                                          </span>
                                                          <span className="text-[9px] text-slate-400 font-normal">Bruto: ${it.gananciaBruta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                      ) : (
                                                        <span className="text-slate-400 font-normal">-</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
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
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* DESGLOSE GENERAL DE ARTÍCULOS DE LA CAMPAÑA */}
          {(selectedCampaign.items || []).length > 0 && (
            <Card className="w-full bg-white shadow-xs border-slate-200">
              <CardHeader className="border-b bg-slate-50/60 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                      <Boxes className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900">
                        Artículos y Packs Vinculados a la Campaña ({(selectedCampaign.items || []).length})
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Ventas totales registradas en el período para los productos promocionados en esta campaña.
                      </CardDescription>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTargetParaAsignar({
                      campaignId: selectedCampaign.id,
                      name: selectedCampaign.name,
                      type: "camp",
                      initialItemIds: (selectedCampaign.items || []).map(it => it.articuloId)
                    })}
                    className="h-7 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200"
                  >
                    Editar Artículos
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-bold">Artículo / Pack</th>
                        <th className="text-center px-3 py-2.5 font-bold">Stock</th>
                        <th className="text-right px-3 py-2.5 font-bold">Precio Regular</th>
                        <th className="text-right px-3 py-2.5 font-bold">Costo Unitario</th>
                        <th className="text-center px-3 py-2.5 font-bold text-purple-900 bg-purple-50/50">Unidades Vendidas</th>
                        <th className="text-right px-3 py-2.5 font-bold text-emerald-900 bg-emerald-50/50">Facturación (Bruto)</th>
                        <th className="text-right px-3 py-2.5 font-bold text-blue-900 bg-blue-50/50">Ganancia Bruta</th>
                        <th className="text-right px-3 py-2.5 font-bold text-amber-900 bg-amber-50/50">% Gasto s/ Venta</th>
                        <th className="text-right px-3 py-2.5 font-bold text-indigo-900 bg-indigo-50/50">% Gasto s/ Ganancia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedCampaign.items || []).map(it => {
                        const totalFactCamp = selectedCampaign.health?.facturacionReal || 0;
                        const propGasto = totalFactCamp > 0 ? (it.facturacion / totalFactCamp) : (1 / (selectedCampaign.items || []).length);
                        const gastoProd = selectedCampaign.spend * propGasto;
                        const pctVenta = it.facturacion > 0 ? (gastoProd / it.facturacion) * 100 : (gastoProd > 0 ? 999 : 0);
                        const pctGanancia = it.gananciaBruta > 0 ? (gastoProd / it.gananciaBruta) * 100 : (gastoProd > 0 ? 999 : 0);

                        return (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              <div className="flex items-center gap-2">
                                <span>{it.articulo.nombre}</span>
                                {it.articulo.esPack && (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-700 text-[9px] px-1.5 py-0">Pack</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={it.articulo.stock > 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-bold"}>
                                {it.articulo.stock} un.
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-800">${it.articulo.precio.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-500">${it.articulo.costo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-center font-bold font-mono text-purple-800 bg-purple-50/30">
                              {it.unidadesVendidas.toLocaleString("es-AR", { minimumFractionDigits: it.unidadesVendidas % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })} un.
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-emerald-700 bg-emerald-50/30">
                              ${it.facturacion.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-blue-700 bg-blue-50/30">
                              ${it.gananciaBruta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono bg-amber-50/30">
                              {it.facturacion > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className={`text-[11px] px-1.5 py-0.2 rounded border ${
                                    pctVenta <= 15 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : pctVenta <= 30 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                  }`}>
                                    {pctVenta.toFixed(2)}%
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-normal">Pauta: ${gastoProd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono bg-indigo-50/30">
                              {it.gananciaBruta > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className={`text-[11px] px-1.5 py-0.2 rounded border ${
                                    pctGanancia <= 40 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : pctGanancia <= 75 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                  }`}>
                                    {pctGanancia.toFixed(2)}%
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-normal">Bruto: ${it.gananciaBruta.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* VISTA 2: TABLERO GENERAL Y LISTADO DE CAMPAÑAS SELECCIONABLES */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* TARJETAS DEL TABLERO DE SALUD GLOBAL MACRO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            <StatCard 
              title="Inversión Meta Ads" 
              value={`$${macroHealth.totalSpend.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<DollarSign className="h-4 w-4 text-blue-600" />}
              subtitle={currentPresetObj.label}
              borderColor="border-l-blue-500"
            />

            <StatCard 
              title="Facturación Total Período" 
              value={`$${macroHealth.totalFacturacion.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              subtitle={`${macroHealth.totalVentas} ventas / ${macroHealth.totalUnidades.toLocaleString('es-AR', { maximumFractionDigits: 2 })} un. (${activePvNombres})`}
              borderColor="border-l-emerald-500"
            />

            <StatCard 
              title="Margen Neto Global" 
              value={`${macroHealth.totalMargenNeto < 0 ? "-$" : "$"}${Math.abs(macroHealth.totalMargenNeto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<TrendingUp className={`h-4 w-4 ${macroHealth.totalMargenNeto >= 0 ? "text-emerald-600" : "text-rose-600"}`} />}
              subtitle="Ganancia del período menos pauta publicitaria"
              borderColor={macroHealth.totalMargenNeto >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
              badge={
                macroHealth.totalMargenNeto >= 0 ? (
                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0 hover:bg-emerald-100">+Rentable</Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0 hover:bg-rose-100">Déficit</Badge>
                )
              }
            />

            <StatCard 
              title="ROAS Facturación General" 
              value={macroHealth.totalSpend > 0 ? `${macroHealth.globalRoas.toFixed(2)}x` : "0,00x"} 
              icon={<Percent className="h-4 w-4 text-teal-600" />}
              subtitle={`Facturación total / Inversión pauta`}
              borderColor="border-l-teal-500"
            />

            <StatCard 
              title="Leads Totales Meta" 
              value={macroHealth.totalMessages.toLocaleString('es-AR')} 
              icon={<MessageSquare className="h-4 w-4 text-indigo-600" />}
              subtitle={`Costo por lead: $${macroHealth.costoPorLead.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              borderColor="border-l-indigo-500"
            />

            <StatCard 
              title="Conversión Global Canales" 
              value={`${macroHealth.globalConversionRate.toFixed(2)}%`} 
              icon={<Target className="h-4 w-4 text-purple-600" />}
              subtitle={`${macroHealth.totalVentas} cierres / ${macroHealth.totalMessages} leads`}
              borderColor="border-l-purple-500"
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

          {/* LISTADO PRINCIPAL DE CAMPAÑAS */}
          <Card className="w-full bg-white shadow-xs overflow-hidden flex flex-col border-slate-200">
            <CardHeader className="border-b bg-slate-50/60 pb-3 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-pink-100 text-pink-700">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      Campañas Publicitarias de Meta Ads ({filteredCampaigns.length})
                    </CardTitle>
                    {isRecalculating && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1">
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Recalculando ventas...
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Hacé clic en cualquier campaña para abrir su análisis y desglose detallado.</span>
                    <span>•</span>
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
                    placeholder="Buscar campaña o artículo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white border-slate-200"
                  />
                </div>
              </div>
            </CardHeader>

            {/* TABLA DE CAMPAÑAS */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-bold text-slate-900 text-xs min-w-[280px]">Campaña</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-right">Inversión</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-center">Leads (Mensajes)</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-right">Costo / Lead</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-center">Estructura</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-center">Artículos</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-center">Rendimiento</TableHead>
                    <TableHead className="font-bold text-slate-900 text-xs text-right pr-6">Acción</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-36 text-center">
                        <div className="space-y-1.5">
                          <BarChart3 className="h-8 w-8 text-slate-300 mx-auto" />
                          <p className="text-sm font-medium text-slate-600">No se encontraron campañas</p>
                          <p className="text-xs text-slate-400">Probá ajustando los filtros o sincronizando con Meta.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCampaigns.map(camp => {
                      const campItems = camp.items || [];
                      const childAdSets = camp.adSets || [];
                      const totalAds = childAdSets.reduce((acc, as) => acc + (as.ads?.length || 0), 0);
                      const costPerMsg = camp.costPerMsg ?? (camp.messages > 0 ? camp.spend / camp.messages : 0);

                      return (
                        <TableRow 
                          key={camp.id} 
                          onClick={() => handleSelectCampaign(camp.id)}
                          className="hover:bg-purple-50/40 transition-colors cursor-pointer group"
                        >
                          {/* NOMBRE Y DETALLE */}
                          <TableCell className="py-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <StatusBadge status={camp.status} type="camp" />
                                <span className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-purple-700 transition-colors">
                                  {camp.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-50 border-slate-200 font-mono">
                                  ID: {camp.id}
                                </Badge>
                                {camp.startTime && <span>Iniciada: {new Date(camp.startTime).toLocaleDateString("es-AR")}</span>}
                              </div>
                            </div>
                          </TableCell>

                          {/* INVERSIÓN */}
                          <TableCell className="text-right py-3.5">
                            <span className="font-bold font-mono text-sm text-slate-900">
                              ${camp.spend.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </TableCell>

                          {/* LEADS */}
                          <TableCell className="text-center py-3.5">
                            <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 border border-green-200 font-mono">
                              {camp.messages.toLocaleString("es-AR")}
                            </span>
                          </TableCell>

                          {/* COSTO POR LEAD */}
                          <TableCell className="text-right py-3.5">
                            <span className={`font-mono text-xs font-semibold ${costPerMsg > 0 && costPerMsg < 300 ? "text-emerald-700 font-bold" : "text-slate-700"}`}>
                              {costPerMsg > 0 ? `$${costPerMsg.toFixed(2)}` : "-"}
                            </span>
                          </TableCell>

                          {/* ESTRUCTURA */}
                          <TableCell className="text-center py-3.5">
                            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <Layers className="h-3 w-3 text-blue-600" />
                              <span>{childAdSets.length} conj.</span>
                              <span>•</span>
                              <span>{totalAds} ads</span>
                            </div>
                          </TableCell>

                          {/* ARTÍCULOS ASIGNADOS */}
                          <TableCell className="text-center py-3.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-center gap-1.5 max-w-[260px] mx-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTargetParaAsignar({
                                  campaignId: camp.id,
                                  name: camp.name,
                                  type: "camp",
                                  initialItemIds: campItems.map(it => it.articuloId)
                                })}
                                className={`h-6 px-2 text-[11px] font-bold gap-1 shadow-2xs transition-all ${
                                  campItems.length > 0 
                                    ? "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100" 
                                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50 border-dashed"
                                }`}
                              >
                                <Boxes className="h-3 w-3 text-purple-600" />
                                <span>{campItems.length > 0 ? `${campItems.length} asignados` : "+ Asignar"}</span>
                              </Button>

                              {campItems.length > 0 && (
                                <div className="flex flex-wrap items-center justify-center gap-1 w-full">
                                  {campItems.slice(0, 2).map(it => (
                                    <Badge key={it.id} variant="secondary" title={it.articulo.nombre} className="text-[9px] px-1.5 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 whitespace-normal text-left max-w-[200px] leading-tight">
                                      {it.articulo.nombre}
                                    </Badge>
                                  ))}
                                  {campItems.length > 2 && (
                                    <span className="text-[9px] font-bold text-purple-700 bg-purple-100/80 px-1.5 py-0.5 rounded border border-purple-200">
                                      +{campItems.length - 2} más
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* SEMÁFORO DE SALUD */}
                          <TableCell className="text-center py-3.5">
                            <SemasforoSaludBadge estado={camp.health?.estadoSalud} />
                          </TableCell>

                          {/* ACCIÓN: VER CAMPAÑA */}
                          <TableCell className="text-right py-3.5 pr-6">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs font-bold text-purple-700 hover:text-purple-900 hover:bg-purple-100/60 gap-1 group-hover:translate-x-0.5 transition-all"
                            >
                              <span>Ver Campaña</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

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
