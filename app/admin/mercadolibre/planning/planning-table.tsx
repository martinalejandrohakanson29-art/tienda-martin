"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; 
import { Badge } from "@/components/ui/badge"; 
import { 
  ArrowUp, ArrowDown, Save, Loader2, 
  Check, Copy, Truck, RefreshCw, PlayCircle, Search,
  TrendingUp, AlertTriangle, CheckCircle2, SlidersHorizontal,
  Download, Sparkles, AlertCircle, Layers, Box
} from "lucide-react";
import { sendPlanningToN8N, runN8nSalesWorkflow, fetchSheetData, PlanningItemData } from "@/app/actions/planning";

// --- COMPONENTE DE CELDA COPIABLE ---
const CopyableCell = ({ text, className = "" }: { text: string | number, className?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error("Error al copiar", err); }
  };
  return (
    <div 
      onClick={handleCopy} 
      className={`relative group cursor-pointer flex items-center justify-between gap-1.5 p-1 rounded hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 ${copied ? "bg-green-50/50" : ""} ${className}`} 
      title="Click para copiar"
    >
      <span className={`truncate ${copied ? "text-green-700 font-medium" : "text-gray-700"}`}>{text}</span>
      <div className="flex-shrink-0">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600 animate-in zoom-in duration-300" />
        ) : (
          <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
};

export default function PlanningTable({ 
  initialHeaders = [], 
  initialBody = [] 
}: { 
  initialHeaders?: string[], 
  initialBody?: string[][] 
}) {
  const [items, setItems] = useState<PlanningItemData[]>([]);
  const [isProcessingWorkflow, setIsProcessingWorkflow] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [inputValues, setInputValues] = useState<{ [itemIdKey: string]: string }>({});
  const [shipmentId, setShipmentId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "suggested", direction: "desc" });
  const [summaryData, setSummaryData] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition(); 

  // --- FILTROS Y PARÁMETROS INTELIGENTES ---
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "quiebre" | "bajo" | "con_ventas" | "con_sugerido" | "en_camino" | "kits">("all");
  const [coverageDays, setCoverageDays] = useState<number>(30); // Días de cobertura deseados
  const [salesPeriodDays, setSalesPeriodDays] = useState<number>(30); // Días de histórico de ventas
  const [leadTimeDays, setLeadTimeDays] = useState<number>(5); // Días de reposición/envío
  const [showConfig, setShowConfig] = useState(false);

  // Inicializar carga de datos
  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const res = await fetchSheetData();
      if (res.success && res.items) {
        setItems(res.items);
      } else {
        alert("⚠️ " + (res.message || "Error al cargar datos"));
      }
    } catch (e: any) {
      alert("❌ Error: " + e.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleStartProcess = async () => {
    setIsProcessingWorkflow(true);
    try {
      const workflowRes = await runN8nSalesWorkflow();
      if (workflowRes.success) {
        await loadData();
      } else { 
        alert("❌ Error en n8n: " + workflowRes.message); 
      }
    } catch (err) { 
      alert("❌ Error inesperado al ejecutar workflow."); 
    } finally { 
      setIsProcessingWorkflow(false); 
    }
  };

  // Generador de clave única para cada fila
  const getItemKey = (item: PlanningItemData) => {
    return `${item.mla}_${item.variationId || item.inventoryId || "main"}`;
  };

  // --- CÁLCULOS DINÁMICOS POR FILA CON STOCK EN CAMINO ---
  const enrichedItems = useMemo(() => {
    return items.map(item => {
      const runRate = salesPeriodDays > 0 ? (item.sales / salesPeriodDays) : 0;
      const targetStock = runRate * (coverageDays + leadTimeDays);
      const totalFullEffective = item.stockFull + (item.inTransitStock || 0);
      const suggested = Math.max(0, Math.ceil(targetStock - totalFullEffective));
      
      let daysOfStock = 0;
      if (runRate > 0) {
        daysOfStock = Math.round(totalFullEffective / runRate);
      } else {
        daysOfStock = totalFullEffective > 0 ? 999 : 0;
      }

      const isQuiebre = item.stockFull === 0 && (item.inTransitStock || 0) === 0 && item.sales > 0;
      const isStockBajo = !isQuiebre && item.sales > 0 && daysOfStock < 10;
      const isSaludable = daysOfStock >= 10 && daysOfStock <= 45;
      const isSobreStock = daysOfStock > 45 && daysOfStock !== 999;
      const isEnCamino = (item.inTransitStock || 0) > 0;

      const itemKey = getItemKey(item);
      const manualQty = parseInt(inputValues[itemKey] || "0", 10) || 0;

      return {
        ...item,
        itemKey,
        runRate,
        totalFullEffective,
        suggested,
        daysOfStock,
        isQuiebre,
        isStockBajo,
        isSaludable,
        isSobreStock,
        isEnCamino,
        manualQty,
        isKit: item.recipeText !== null && item.recipeText.length > 0
      };
    });
  }, [items, coverageDays, salesPeriodDays, leadTimeDays, inputValues]);

  // --- FILTRADO ---
  const filteredItems = useMemo(() => {
    return enrichedItems.filter(item => {
      // 1. Filtro de búsqueda por texto
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(term);
        const matchMla = item.mla.toLowerCase().includes(term);
        const matchSku = item.inventoryId.toLowerCase().includes(term) || (item.userProductId && item.userProductId.toLowerCase().includes(term));
        const matchFam = item.familyId ? item.familyId.toLowerCase().includes(term) : false;
        const matchVar = item.variationLabel ? item.variationLabel.toLowerCase().includes(term) : false;
        if (!matchTitle && !matchMla && !matchSku && !matchFam && !matchVar) {
          return false;
        }
      }

      // 2. Filtro por estado
      if (activeFilter === "quiebre") return item.isQuiebre;
      if (activeFilter === "bajo") return item.isStockBajo;
      if (activeFilter === "con_ventas") return item.sales > 0;
      if (activeFilter === "con_sugerido") return item.suggested > 0;
      if (activeFilter === "en_camino") return item.isEnCamino;
      if (activeFilter === "kits") return item.isKit;

      return true;
    });
  }, [enrichedItems, searchTerm, activeFilter]);

  // --- ORDENAMIENTO ---
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (!sortConfig.key) return list;

    return list.sort((a: any, b: any) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortConfig]);

  // --- AGRUPACIÓN POR FAMILIAS ---
  const groupedFamilies = useMemo(() => {
    const groups: { familyId: string; items: typeof sortedItems }[] = [];
    const groupMap = new Map<string, typeof sortedItems>();

    for (const item of sortedItems) {
      const famKey = item.familyId || "-";
      if (!groupMap.has(famKey)) {
        const arr: typeof sortedItems = [];
        groupMap.set(famKey, arr);
        groups.push({ familyId: famKey, items: arr });
      }
      groupMap.get(famKey)!.push(item);
    }
    return groups;
  }, [sortedItems]);

  // --- KPIS GENERALES ---
  const kpis = useMemo(() => {
    const totalVariantes = items.length;
    const totalVentas = items.reduce((acc, it) => acc + it.sales, 0);
    const totalQuiebres = enrichedItems.filter(it => it.isQuiebre).length;
    const totalStockBajo = enrichedItems.filter(it => it.isStockBajo).length;
    const totalEnCamino = enrichedItems.reduce((acc, it) => acc + (it.inTransitStock || 0), 0);
    const totalSugerido = enrichedItems.reduce((acc, it) => acc + it.suggested, 0);
    const totalAEnviar = Object.values(inputValues).reduce((acc, val) => {
      const num = parseInt(val, 10);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);

    return { totalVariantes, totalVentas, totalQuiebres, totalStockBajo, totalEnCamino, totalSugerido, totalAEnviar };
  }, [items, enrichedItems, inputValues]);

  // Manejo de ordenamiento
  const handleSort = (key: string) => {
    setSortConfig(curr => ({
      key,
      direction: curr.key === key && curr.direction === "asc" ? "desc" : "asc"
    }));
  };

  // Autollenar con sugerido para los ítems filtrados
  const handleFillSuggested = () => {
    const newValues = { ...inputValues };
    for (const it of filteredItems) {
      if (it.suggested > 0) {
        newValues[it.itemKey] = it.suggested.toString();
      }
    }
    setInputValues(newValues);
  };

  // Limpiar cantidades
  const handleClearQuantities = () => {
    if (confirm("¿Deseas resetear todas las cantidades a enviar a 0?")) {
      setInputValues({});
    }
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    const csvRows = [
      ["MLA", "SKU / Inventory", "User Product", "Familia", "Titulo", "Variante", "Stock Full", "En Camino", "Ventas 30d", "Run Rate (d)", "Dias Cobertura", "Stock Taller", "Sugerido", "Cant A Enviar"].join(",")
    ];

    for (const it of enrichedItems) {
      const row = [
        `"${it.mla}"`,
        `"${it.inventoryId}"`,
        `"${it.userProductId || ""}"`,
        `"${it.familyId || ""}"`,
        `"${it.title.replace(/"/g, '""')}"`,
        `"${(it.variationLabel || "").replace(/"/g, '""')}"`,
        it.stockFull,
        it.inTransitStock,
        it.sales,
        it.runRate.toFixed(2),
        it.daysOfStock === 999 ? "Sin ventas" : it.daysOfStock,
        it.localStock ?? "S/D",
        it.suggested,
        it.manualQty
      ];
      csvRows.push(row.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `planificacion_full_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Procesar y enviar a la base de datos / n8n
  const handleProcess = () => {
    if (!shipmentId.trim()) {
      alert("⚠️ Por favor ingresa el Número de Envío (ej. #123456).");
      return;
    }

    const itemsToSend = enrichedItems
      .filter(item => item.manualQty > 0)
      .map(item => ({
        sku: item.mla,
        seller_sku: item.inventoryId || item.userProductId || item.mla,
        title: item.title,
        quantity_to_send: item.manualQty,
        variation_label: item.variationLabel || "",
        imageUrl: item.imageUrl,
        agregados: item.agregados,
        recipeText: item.recipeText,
        inventoryId: item.inventoryId,
        userProductId: item.userProductId
      }));

    if (itemsToSend.length === 0) {
      alert("⚠️ No has cargado ninguna cantidad mayor a 0 para enviar.");
      return;
    }

    if (!confirm(`¿Confirmas procesar el envío ${shipmentId} con ${kpis.totalAEnviar} unidades en ${itemsToSend.length} publicaciones?`)) {
      return;
    }

    startTransition(async () => {
      const result = await sendPlanningToN8N(itemsToSend, shipmentId);
      if (result.success) {
        setSummaryData(itemsToSend);
      } else {
        alert("❌ Error: " + result.message);
      }
    });
  };

  // Modal de resumen luego de procesar
  if (summaryData) {
    const totalUnitsSummary = summaryData.reduce((sum, item) => sum + item.quantity_to_send, 0);
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-5xl h-[85vh] flex flex-col bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-emerald-600 to-green-700 text-white py-5 px-6 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <CheckCircle2 className="h-7 w-7 text-emerald-200" /> Planificación Guardada con Éxito
              </CardTitle>
              <p className="text-emerald-100 text-sm">
                Envío registrado: <span className="font-mono font-black text-white bg-white/20 px-2 py-0.5 rounded">{shipmentId}</span>
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-md text-white px-5 py-2.5 rounded-xl text-center border border-white/30">
              <p className="text-[10px] uppercase font-black tracking-widest text-emerald-100">Total Unidades</p>
              <p className="text-3xl font-black">{totalUnitsSummary}</p>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-700 text-xs font-bold uppercase sticky top-0 z-10 shadow-sm border-b">
                <tr>
                  <th className="px-4 py-3">MLA</th>
                  <th className="px-4 py-3">Cód. FULL / SKU</th>
                  <th className="px-4 py-3">Título & Variante</th>
                  <th className="px-4 py-3 text-right">Cant. a Enviar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs font-bold text-blue-700">
                      <CopyableCell text={item.sku} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">
                      <CopyableCell text={item.seller_sku} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-800 text-sm">{item.title}</div>
                      {item.variation_label && (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 inline-block mt-0.5">
                          {item.variation_label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge className="bg-emerald-600 text-white font-black text-sm px-3 py-1">
                        {item.quantity_to_send}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>

          <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Disponible ahora en <strong className="text-gray-700">Gestión FULL &gt; Preparación</strong> para auditoría con fotos.
            </p>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 shadow-md" onClick={() => setSummaryData(null)}>
              Aceptar y Volver
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Pantalla inicial si aún no se sincronizó
  if (items.length === 0 && !isProcessingWorkflow && !isLoadingData) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 md:p-20 border-dashed border-2 bg-gradient-to-b from-gray-50 to-white rounded-2xl shadow-sm">
        <div className="text-center space-y-6 max-w-lg">
          <div className="bg-blue-100/80 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-blue-600 shadow-inner">
            <Truck className="h-12 w-12 text-blue-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-gray-800">Planificador de Envíos Full</h2>
            <p className="text-sm text-gray-500">
              Sincroniza el inventario en los depósitos de Mercado Libre, el histórico de ventas y la disponibilidad en el taller local para calcular la reposición ideal.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button 
              onClick={handleStartProcess} 
              className="bg-blue-600 hover:bg-blue-700 h-14 px-8 text-base font-black shadow-lg gap-2 text-white rounded-xl"
            >
              <PlayCircle className="h-5 w-5" /> Sincronizar con ML y n8n
            </Button>
            <Button 
              variant="outline" 
              onClick={loadData} 
              className="h-14 px-6 text-sm font-bold gap-2 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" /> Cargar Último Snapshot
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Estado de carga o sincronización
  if (isProcessingWorkflow || isLoadingData) {
    return (
      <Card className="flex flex-col items-center justify-center p-6 md:p-20 h-[60vh] bg-white rounded-2xl shadow-sm">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
            <Loader2 className="h-20 w-20 animate-spin text-blue-600 relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Truck className="h-7 w-7 text-blue-500" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-gray-800">
              {isProcessingWorkflow ? "Sincronizando Stock y Ventas de Full..." : "Procesando Datos y Recetas..."}
            </h3>
            <p className="text-xs text-gray-500 italic">
              Consultando APIs de Mercado Libre y calculando disponibilidad en taller propio.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* --- DASHBOARD DE KPIS SUPERIORES --- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <Card className="p-3.5 bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-sm rounded-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> Variantes
          </p>
          <p className="text-2xl font-black text-blue-900 mt-1">{kpis.totalVariantes}</p>
          <p className="text-[10px] text-blue-500">en catálogo Full</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-purple-50 to-white border-purple-100 shadow-sm rounded-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Ventas ({salesPeriodDays}d)
          </p>
          <p className="text-2xl font-black text-purple-900 mt-1">{kpis.totalVentas}</p>
          <p className="text-[10px] text-purple-500">{(kpis.totalVentas / salesPeriodDays).toFixed(1)} u/día promedio</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-red-50 to-white border-red-100 shadow-sm rounded-xl cursor-pointer hover:border-red-300 transition-colors" onClick={() => setActiveFilter("quiebre")}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> En Quiebre
          </p>
          <p className="text-2xl font-black text-red-900 mt-1">{kpis.totalQuiebres}</p>
          <p className="text-[10px] text-red-500">Stock = 0 con ventas</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-amber-50 to-white border-amber-100 shadow-sm rounded-xl cursor-pointer hover:border-amber-300 transition-colors" onClick={() => setActiveFilter("bajo")}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Stock Bajo
          </p>
          <p className="text-2xl font-black text-amber-900 mt-1">{kpis.totalStockBajo}</p>
          <p className="text-[10px] text-amber-500">&lt; 10 días de cobertura</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-cyan-50 to-white border-cyan-100 shadow-sm rounded-xl cursor-pointer hover:border-cyan-300 transition-colors" onClick={() => setActiveFilter("en_camino")}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" /> En Camino
          </p>
          <p className="text-2xl font-black text-cyan-900 mt-1">{kpis.totalEnCamino}</p>
          <p className="text-[10px] text-cyan-600">en viajes recientes</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-indigo-50 to-white border-indigo-100 shadow-sm rounded-xl cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => setActiveFilter("con_sugerido")}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Sugerido Total
          </p>
          <p className="text-2xl font-black text-indigo-900 mt-1">{kpis.totalSugerido}</p>
          <p className="text-[10px] text-indigo-500">para {coverageDays}d cobertura</p>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md rounded-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" /> A Enviar
          </p>
          <p className="text-3xl font-black text-white mt-0.5">{kpis.totalAEnviar}</p>
          <p className="text-[10px] text-emerald-100">unidades cargadas</p>
        </Card>
      </div>

      {/* --- PANEL DE CONFIGURACIÓN INTELIGENTE (DESPLEGABLE) --- */}
      {showConfig && (
        <Card className="p-4 bg-gray-50/80 border-gray-200 shadow-inner rounded-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-blue-600" /> Parámetros del Algoritmo de Sugerido
            </h4>
            <span className="text-xs text-gray-500">Los cambios recalculan la columna "Sugerido" al instante</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-700">Días de Cobertura Objetivo</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  min={5} 
                  max={120} 
                  value={coverageDays} 
                  onChange={e => setCoverageDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-9 bg-white" 
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">días de stock</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-700">Días de Ventas Analizados</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  min={7} 
                  max={90} 
                  value={salesPeriodDays} 
                  onChange={e => setSalesPeriodDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-9 bg-white" 
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">días base</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-700">Lead Time (Preparación + Enlace)</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  min={0} 
                  max={30} 
                  value={leadTimeDays} 
                  onChange={e => setLeadTimeDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-9 bg-white" 
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">días de margen</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* --- BARRA DE ACCIONES Y FILTROS --- */}
      <Card className="p-4 bg-white border shadow-sm rounded-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Buscar por MLA, SKU, Título, Familia, Variante..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-gray-50/50 border-gray-200 rounded-lg text-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Acciones Rápidas */}
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowConfig(!showConfig)}
              className={`gap-1.5 h-9 rounded-lg ${showConfig ? "bg-blue-50 text-blue-700 border-blue-200" : ""}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Parámetros
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleFillSuggested} 
              className="gap-1.5 h-9 rounded-lg text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-bold"
              title="Copia los valores sugeridos a la columna de envío"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Llenar con Sugerido
            </Button>

            {kpis.totalAEnviar > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearQuantities} 
                className="h-9 text-gray-500 hover:text-red-600 text-xs"
              >
                Limpiar Cantidades
              </Button>
            )}

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportCSV} 
              className="gap-1.5 h-9 rounded-lg text-gray-700"
              title="Descargar tabla en CSV"
            >
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStartProcess} 
              className="gap-1.5 h-9 rounded-lg text-blue-700 hover:bg-blue-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-sincronizar
            </Button>
          </div>
        </div>

        {/* Chips de Filtrado Rápido */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mr-1">Filtros:</span>
          
          <Badge 
            variant={activeFilter === "all" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "all" ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            onClick={() => setActiveFilter("all")}
          >
            Todos ({items.length})
          </Badge>

          <Badge 
            variant={activeFilter === "quiebre" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "quiebre" ? "bg-red-600 text-white" : "text-red-700 border-red-200 hover:bg-red-50"}`}
            onClick={() => setActiveFilter("quiebre")}
          >
            🔴 Quiebres ({kpis.totalQuiebres})
          </Badge>

          <Badge 
            variant={activeFilter === "bajo" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "bajo" ? "bg-amber-500 text-white" : "text-amber-700 border-amber-200 hover:bg-amber-50"}`}
            onClick={() => setActiveFilter("bajo")}
          >
            🟡 Stock Bajo ({kpis.totalStockBajo})
          </Badge>

          <Badge 
            variant={activeFilter === "en_camino" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "en_camino" ? "bg-cyan-600 text-white" : "text-cyan-800 border-cyan-300 hover:bg-cyan-50"}`}
            onClick={() => setActiveFilter("en_camino")}
          >
            🚚 En Camino ({kpis.totalEnCamino} u.)
          </Badge>

          <Badge 
            variant={activeFilter === "con_sugerido" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "con_sugerido" ? "bg-indigo-600 text-white" : "text-indigo-700 border-indigo-200 hover:bg-indigo-50"}`}
            onClick={() => setActiveFilter("con_sugerido")}
          >
            ✨ Con Sugerido &gt; 0
          </Badge>

          <Badge 
            variant={activeFilter === "con_ventas" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "con_ventas" ? "bg-purple-600 text-white" : "text-purple-700 border-purple-200 hover:bg-purple-50"}`}
            onClick={() => setActiveFilter("con_ventas")}
          >
            🔥 Con Ventas
          </Badge>

          <Badge 
            variant={activeFilter === "kits" ? "default" : "outline"}
            className={`cursor-pointer px-3 py-1 text-xs font-semibold ${activeFilter === "kits" ? "bg-emerald-600 text-white" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
            onClick={() => setActiveFilter("kits")}
          >
            📦 Kits Compuestos
          </Badge>
        </div>
      </Card>

      {/* --- SECCIÓN DE ENCABEZADO DEL ENVÍO --- */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2.5 bg-amber-500 text-white rounded-lg shadow-sm">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <Label className="text-[11px] font-black uppercase tracking-wider text-amber-800">
              Número de Envío Mercado Envíos FULL
            </Label>
            <p className="text-xs text-amber-700/80">Código o número de solicitud asignado por ML</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <Input 
            value={shipmentId} 
            onChange={(e) => setShipmentId(e.target.value)} 
            placeholder="#123456" 
            className="text-center text-lg font-black h-11 w-44 bg-white border-amber-300 shadow-inner" 
          />
          <Button 
            size="lg" 
            className={`h-11 px-6 font-black gap-2 text-white shadow-md ${!shipmentId.trim() || kpis.totalAEnviar === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`} 
            onClick={handleProcess} 
            disabled={isPending || !shipmentId.trim() || kpis.totalAEnviar === 0}
          >
            {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />} 
            Procesar Envío ({kpis.totalAEnviar} u.)
          </Button>
        </div>
      </div>

      {/* --- TABLA PRINCIPAL DE PLANIFICACIÓN --- */}
      <Card className="p-0 border rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[65vh] w-full">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-100 text-gray-700 font-bold uppercase tracking-wider shadow-sm border-b">
              <tr>
                <th className="px-3 py-3 w-[140px] cursor-pointer hover:bg-gray-200" onClick={() => handleSort("mla")}>
                  <div className="flex items-center justify-between">
                    <span>MLA / Cód. FULL</span>
                    {sortConfig.key === "mla" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>
                
                <th className="px-3 py-3 min-w-[280px] max-w-[400px]">Publicación / Variante</th>
                
                <th className="px-3 py-3 w-[100px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("familyId")}>
                  <span>Familia</span>
                </th>

                <th className="px-3 py-3 w-[85px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("stockFull")}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Stock Full</span>
                    {sortConfig.key === "stockFull" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>

                <th className="px-3 py-3 w-[90px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("inTransitStock")} title="Unidades enviadas recientemente en camino a Full">
                  <div className="flex items-center justify-center gap-1 text-cyan-800">
                    <Truck className="h-3 w-3 text-cyan-600" />
                    <span>En Camino</span>
                    {sortConfig.key === "inTransitStock" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>

                <th className="px-3 py-3 w-[80px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("sales")}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Ventas</span>
                    {sortConfig.key === "sales" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>

                <th className="px-3 py-3 w-[90px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("daysOfStock")}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Cobertura</span>
                    {sortConfig.key === "daysOfStock" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>

                <th className="px-3 py-3 w-[95px] text-center cursor-pointer hover:bg-gray-200" onClick={() => handleSort("localStock")}>
                  <div className="flex items-center justify-center gap-1" title="Stock disponible en taller/depósito local">
                    <span>Stock Taller</span>
                  </div>
                </th>

                <th className="px-3 py-3 w-[95px] text-center cursor-pointer hover:bg-gray-200 bg-indigo-50/70 text-indigo-900" onClick={() => handleSort("suggested")}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Sugerido</span>
                    {sortConfig.key === "suggested" && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </div>
                </th>

                <th className="sticky right-0 top-0 z-30 px-3 py-3 w-[120px] bg-emerald-600 text-white font-black text-center shadow-md">
                  Cant. a Enviar
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {groupedFamilies.map((group, groupIdx) => {
                const isGroup = group.familyId !== "-";

                return (
                  <React.Fragment key={`fam-${groupIdx}`}>
                    {isGroup && (
                      <tr className="bg-purple-100/70 border-y border-purple-200">
                        <td colSpan={9} className="px-4 py-1.5 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-purple-900 tracking-wider">FAMILIA:</span>
                            <Badge className="font-mono text-xs bg-purple-700 text-white font-bold px-2.5 py-0.5">
                              {group.familyId}
                            </Badge>
                            <span className="text-[10px] font-semibold text-purple-700 bg-white/70 px-2 py-0.5 rounded-full border border-purple-200">
                              {group.items.length} variantes
                            </span>
                          </div>
                        </td>
                        <td className="sticky right-0 bg-purple-100/70 border-l border-purple-200"></td>
                      </tr>
                    )}

                    {group.items.map((item) => {
                      return (
                        <tr 
                          key={item.itemKey} 
                          className={`hover:bg-blue-50/40 transition-colors ${item.isQuiebre ? "bg-red-50/20" : item.isStockBajo ? "bg-amber-50/20" : item.isEnCamino ? "bg-cyan-50/15" : ""}`}
                        >
                          {/* MLA & CÓDIGO FULL */}
                          <td className="px-3 py-2 border-r font-mono text-[11px]">
                            <CopyableCell text={item.mla} className="font-bold text-blue-700" />
                            {item.inventoryId && (
                              <div className="text-[10px] pl-1 flex items-center gap-1 mt-0.5" title="Código ML de FULL (Inventory ID)">
                                <span className="font-black text-amber-800 bg-amber-100/90 px-1 py-0.5 rounded text-[9px]">FULL:</span>
                                <CopyableCell text={item.inventoryId} className="font-black text-gray-900" />
                              </div>
                            )}
                            {item.userProductId && item.userProductId !== item.inventoryId && (
                              <div className="text-[9px] text-gray-400 pl-1 flex items-center gap-1 mt-0.5">
                                <span>UP:</span>
                                <CopyableCell text={item.userProductId} />
                              </div>
                            )}
                          </td>

                          {/* TÍTULO & FOTO & VARIANTE */}
                          <td className="px-3 py-2 border-r">
                            <div className="flex items-start gap-2.5">
                              {item.imageUrl ? (
                                <img 
                                  src={item.imageUrl} 
                                  alt="" 
                                  className="w-9 h-9 rounded-md object-cover border flex-shrink-0 bg-gray-50" 
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-md bg-gray-100 border flex items-center justify-center flex-shrink-0 text-gray-400">
                                  <Box className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-gray-800 leading-tight line-clamp-2" title={item.title}>
                                  {item.title}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {item.variationLabel && (
                                    <Badge variant="outline" className="text-[10px] font-bold text-purple-700 bg-purple-50 border-purple-200 px-1.5 py-0">
                                      {item.variationLabel}
                                    </Badge>
                                  )}
                                  {item.isKit && (
                                    <Badge variant="outline" className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border-emerald-200 px-1.5 py-0" title={item.recipeText || ""}>
                                      📦 Kit
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* FAMILIA */}
                          <td className="px-2 py-2 border-r text-center">
                            {item.familyId ? (
                              <Badge variant="secondary" className="font-mono text-[10px] text-purple-800 bg-purple-50 border-purple-200 max-w-[90px] truncate">
                                {item.familyId}
                              </Badge>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>

                          {/* STOCK FULL */}
                          <td className="px-2 py-2 border-r text-center font-bold">
                            {item.stockFull === 0 ? (
                              <span className="text-red-600 font-black bg-red-50 px-2 py-0.5 rounded border border-red-200">0</span>
                            ) : (
                              <span className="text-gray-800 text-sm">{item.stockFull}</span>
                            )}
                          </td>

                          {/* EN CAMINO */}
                          <td className="px-2 py-2 border-r text-center font-semibold">
                            {item.inTransitStock > 0 ? (
                              <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-[11px] px-1.5 py-0.5 gap-1 shadow-sm" title={`En camino: ${item.inTransitStock} u. (Total virtual: ${item.totalFullEffective} u.)`}>
                                <Truck className="h-3 w-3" /> +{item.inTransitStock}
                              </Badge>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>

                          {/* VENTAS */}
                          <td className="px-2 py-2 border-r text-center font-bold">
                            <span className={item.sales > 0 ? "text-purple-700 text-sm font-black" : "text-gray-400"}>
                              {item.sales}
                            </span>
                          </td>

                          {/* COBERTURA (DÍAS DE STOCK) */}
                          <td className="px-2 py-2 border-r text-center">
                            {item.isQuiebre ? (
                              <Badge className="bg-red-600 text-white font-bold text-[10px] px-1.5 py-0">
                                Quiebre
                              </Badge>
                            ) : item.isStockBajo ? (
                              <Badge className="bg-amber-500 text-white font-bold text-[10px] px-1.5 py-0">
                                {item.daysOfStock}d (Bajo)
                              </Badge>
                            ) : item.daysOfStock === 999 ? (
                              <span className="text-gray-400 text-[10px]">Sin ventas</span>
                            ) : (
                              <span className="text-gray-700 font-semibold">{item.daysOfStock}d</span>
                            )}
                          </td>

                          {/* STOCK DISPONIBLE EN TALLER / DEPÓSITO */}
                          <td className="px-2 py-2 border-r text-center font-semibold">
                            {item.localStock !== null ? (
                              <span 
                                className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${item.localStock >= item.suggested ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"}`}
                                title={item.recipeText ? `Receta: ${item.recipeText}` : "Stock local directo"}
                              >
                                {item.localStock} u.
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>

                          {/* SUGERIDO INTELIGENTE */}
                          <td className="px-2 py-2 border-r text-center bg-indigo-50/40">
                            {item.suggested > 0 ? (
                              <button 
                                onClick={() => setInputValues(prev => ({ ...prev, [item.itemKey]: item.suggested.toString() }))}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-md shadow-sm transition-transform active:scale-95"
                                title="Click para asignar al envío"
                              >
                                +{item.suggested}
                              </button>
                            ) : (
                              <span className="text-gray-400 font-medium">0</span>
                            )}
                          </td>

                          {/* CANTIDAD A ENVIAR */}
                          <td className="sticky right-0 px-2 py-1.5 border-l bg-emerald-50/20 backdrop-blur-sm">
                            <Input 
                              type="number" 
                              min={0}
                              placeholder="0" 
                              className={`h-8 bg-white text-center font-bold text-sm ${item.manualQty > 0 ? "border-emerald-500 text-emerald-800 bg-emerald-50/40 font-black ring-1 ring-emerald-400" : "border-gray-200"}`}
                              value={inputValues[item.itemKey] || ""} 
                              onChange={(e) => {
                                const val = e.target.value;
                                setInputValues(prev => ({ ...prev, [item.itemKey]: val }));
                              }} 
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

