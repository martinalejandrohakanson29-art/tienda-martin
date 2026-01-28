"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; 
import { 
  Maximize2, Minimize2, ArrowUp, ArrowDown, Save, Loader2, 
  Check, Copy, Truck, Hash, RefreshCw, PlayCircle 
} from "lucide-react";
import { sendPlanningToN8N, runN8nSalesWorkflow, fetchSheetData } from "@/app/actions/planning";

// --- COMPONENTE DE CELDA COPIABLE ---
const CopyableCell = ({ text, className = "" }: { text: string | number, className?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error("Error al copiar", err); }
  };
  return (
    <div onClick={handleCopy} className={`relative group cursor-pointer flex items-center justify-between gap-2 p-2 rounded hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 ${copied ? "bg-green-50/50" : ""} ${className}`} title="Click para copiar">
      <span className={`truncate ${copied ? "text-green-700 font-medium" : "text-gray-700"}`}>{text}</span>
      <div className="flex-shrink-0">
        {copied ? <Check className="h-4 w-4 text-green-600 animate-in zoom-in duration-300" /> : <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    </div>
  );
};

export default function PlanningTable({ initialHeaders = [], initialBody = [] }: { initialHeaders?: string[], initialBody?: string[][] }) {
  const [headers, setHeaders] = useState<string[]>(initialHeaders);
  const [body, setBody] = useState<string[][]>(initialBody);
  const [isProcessingWorkflow, setIsProcessingWorkflow] = useState(false);
  const [expandText, setExpandText] = useState(true); // Lo activamos por defecto para aprovechar el ancho
  const [inputValues, setInputValues] = useState<{ [rowIndex: number]: string }>({});
  const [shipmentId, setShipmentId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({ index: null, direction: "asc" });
  const [summaryData, setSummaryData] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition(); 

  // Columnas visibles: A(0), B(1), C(2) - Título, D(3), I(8), J(9), K(10), L(11)
  const VISIBLE_INDICES = [0, 1, 2, 3, 8, 9, 10, 11]; 

  const cleanNumber = (value: string) => {
    if (!value) return 0;
    const cleanValue = value.replace(/[^\d.,-]/g, "").replace(/[.]/g, "").replace(",", ".");
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
  };

  const totalQuantity = useMemo(() => {
    return Object.values(inputValues).reduce((acc, val) => acc + cleanNumber(val), 0);
  }, [inputValues]);

  // Cálculo de la columna L (Sugerido) basado en D y K
  const displayBody = useMemo(() => {
    return body.map(row => {
      const newRow = [...row];
      const valD = cleanNumber(row[3]);
      const valK = cleanNumber(row[10]);
      newRow[11] = (valD - valK).toString(); 
      return newRow;
    });
  }, [body]);

  // Función para arrancar el proceso de n8n
  const handleStartProcess = async () => {
    setIsProcessingWorkflow(true);
    try {
      const workflowRes = await runN8nSalesWorkflow();
      if (workflowRes.success) {
          const dataRes = await fetchSheetData();
          if (dataRes.success) {
              setHeaders(dataRes.headers || []);
              setBody(dataRes.body || []);
          } else { alert("⚠️ Error al leer la planilla: " + dataRes.message); }
      } else { alert("❌ Error en n8n: " + workflowRes.message); }
    } catch (err) { alert("❌ Error inesperado."); } finally { setIsProcessingWorkflow(false); }
  };

  const handleSort = (index: number) => {
    setSortConfig((current) => ({
      index, direction: current.index === index && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedRows = useMemo(() => {
    const rowsWithIndex = displayBody.map((row, index) => ({ row, originalIndex: index }));
    return rowsWithIndex.sort((a, b) => {
      if (sortConfig.index === null) return 0;
      const valA = cleanNumber(a.row[sortConfig.index]);
      const valB = cleanNumber(b.row[sortConfig.index]);
      if (valA === 0 && valB === 0) return a.row[sortConfig.index].localeCompare(b.row[sortConfig.index]) * (sortConfig.direction === "asc" ? 1 : -1);
      return (valA - valB) * (sortConfig.direction === "asc" ? 1 : -1);
    });
  }, [displayBody, sortConfig]);

  const handleProcess = () => {
    if (!shipmentId.trim()) return alert("⚠️ Ingresa el Número de Envío.");
    if (!confirm(`¿Procesar #${shipmentId} con ${totalQuantity} unidades?`)) return;

    startTransition(async () => {
      const itemsToSend = displayBody.map((row, index) => {
        const noteQty = cleanNumber(inputValues[index] || "");
        return {
          sku: row[0],
          seller_sku: row[1],
          title: row[2],
          colJ: row[9] || "",
          quantity_to_send: noteQty,
          agregado1: row[13] || "",
          agregado2: row[14] || "",
          agregado3: row[15] || "",
          agregado4: row[16] || "",
          variation_label: row[9] || ""
        };
      }).filter(item => item.quantity_to_send > 0);

      const result = await sendPlanningToN8N(itemsToSend, shipmentId);
      if (result.success) {
        setSummaryData(itemsToSend);
      } else {
        alert("❌ Error: " + result.message);
      }
    });
  };

  if (summaryData) {
    const totalUnitsSummary = summaryData.reduce((sum, item) => sum + item.quantity_to_send, 0);
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl h-[85vh] flex flex-col bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="bg-green-50 border-b py-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl text-green-800 flex items-center gap-2">
                <Check className="h-6 w-6" /> Pedido Procesado
              </CardTitle>
              <p className="text-sm text-green-700">Envío: #{shipmentId}</p>
            </div>
            <div className="bg-green-600 text-white px-4 py-2 rounded-lg text-center shadow-md">
              <p className="text-[10px] uppercase font-bold opacity-80">Total Unidades</p>
              <p className="text-2xl font-black">{totalUnitsSummary}</p>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3">MLA</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3 text-right">Cant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-1 py-1"><CopyableCell text={item.sku} /></td>
                    <td className="px-1 py-1"><CopyableCell text={item.seller_sku} /></td>
                    <td className="px-1 py-1"><CopyableCell text={item.title} className="max-w-[400px]" /></td>
                    <td className="px-4 py-2 text-right font-bold text-green-700">{item.quantity_to_send}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <Button className="bg-green-600 w-32" onClick={() => setSummaryData(null)}>Aceptar</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (body.length === 0 && !isProcessingWorkflow) {
    return (
      <Card className="flex flex-col items-center justify-center p-20 border-dashed border-2 bg-gray-50/50">
        <div className="text-center space-y-6">
          <div className="bg-blue-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-blue-600">
            <RefreshCw className="h-12 w-12" />
          </div>
          <Button onClick={handleStartProcess} className="bg-blue-600 h-16 px-10 text-xl font-black shadow-xl gap-3">
            <PlayCircle className="h-6 w-6" /> PROCESAR HISTORIAL DE VENTAS Y STOCK
          </Button>
        </div>
      </Card>
    );
  }

  if (isProcessingWorkflow) {
    return (
      <Card className="flex flex-col items-center justify-center p-20 h-[60vh]">
        <div className="flex flex-col items-center gap-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
            <Loader2 className="h-24 w-24 animate-spin text-blue-600 relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Truck className="h-8 w-8 text-blue-400" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-800 animate-pulse">Sincronizando planillas...</h3>
            <p className="text-gray-500 italic">n8n está trabajando en los datos de Mercado Libre.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
      <CardHeader className="flex flex-col gap-2 pb-4 px-0">
        <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold">Planificación ({body.length} filas)</CardTitle>
            <div className="flex items-center gap-4">
                {totalQuantity > 0 && (
                  <div className="flex flex-col items-end px-3 py-1 bg-blue-50 border border-blue-100 rounded-md">
                    <span className="text-[9px] uppercase font-bold text-blue-600">Total a enviar</span>
                    <span className="text-lg font-black text-blue-800 flex items-center gap-1"><Hash className="h-3 w-3" />{totalQuantity}</span>
                  </div>
                )}
                <div className="flex gap-2">
                    <Button size="sm" className={`${!shipmentId ? 'bg-gray-400' : 'bg-green-600'} gap-2`} onClick={handleProcess} disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} Procesar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExpandText(!expandText)}>{expandText ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}</Button>
                </div>
            </div>
        </div>
        <div className="flex justify-center w-full py-2">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4 flex flex-col items-center gap-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider">Número de Envío Full (Req.)</Label>
                <Input value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} placeholder="#123456" className="text-center text-lg font-bold h-9 w-40 border-yellow-300" />
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden border rounded-lg bg-white">
        <div className="overflow-auto h-[65vh] w-full">
            <table className="w-full text-sm text-left border-collapse table-fixed">
                <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
                    <tr>
                        {headers.map((header, i) => {
                            if (!VISIBLE_INDICES.includes(i)) return null;
                            const displayHeader = i === 11 ? "Sugerido (D-K)" : (header || `Col ${i+1}`);
                            
                            // MODIFICACIÓN DE ANCHOS: 500px para Título (i=2), 110px para el resto
                            const columnWidth = i === 2 ? 500 : 110;

                            return (
                                <th key={i} className="px-4 py-3 border-r border-b relative select-none cursor-pointer hover:bg-gray-200" style={{ width: columnWidth }} onClick={() => handleSort(i)}>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate font-bold text-xs">{displayHeader}</span>
                                      {sortConfig.index === i && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />)}
                                    </div>
                                </th>
                            );
                        })}
                        <th className="sticky right-0 top-0 z-30 px-4 py-3 w-[110px] bg-blue-50 border-l border-b border-blue-100 text-blue-800 font-bold text-xs">Cant. a Enviar</th>
                    </tr>
                </thead>
                <tbody className="divide-y">{sortedRows.map((item) => (
                    <tr key={item.originalIndex} className="hover:bg-blue-50/30 transition-colors">
                        {item.row.map((cell, cellIndex) => {
                            if (!VISIBLE_INDICES.includes(cellIndex)) return null;
                            return (
                              <td key={cellIndex} 
                                  className={`px-4 py-2 border-r text-gray-600 ${expandText || cellIndex === 2 ? "whitespace-normal break-words" : "whitespace-nowrap truncate"}`}
                              >
                                {cell}
                              </td>
                            );
                        })}
                        <td className="sticky right-0 px-2 py-1 border-l bg-blue-50/10 backdrop-blur-sm">
                            <Input placeholder="0" className="h-8 bg-white border-blue-100" value={inputValues[item.originalIndex] || ""} onChange={(e) => setInputValues(prev => ({ ...prev, [item.originalIndex]: e.target.value }))} />
                        </td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
      </CardContent>
    </Card>
  );
}
