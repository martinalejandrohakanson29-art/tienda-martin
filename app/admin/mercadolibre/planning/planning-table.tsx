"use client";

import { useState, useTransition, useMemo } from "react";
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
  const [expandText, setExpandText] = useState(false);
  const [inputValues, setInputValues] = useState<{ [rowIndex: number]: string }>({});
  const [shipmentId, setShipmentId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({ index: null, direction: "asc" });
  const [summaryData, setSummaryData] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition(); 

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

  const displayBody = useMemo(() => {
    return body.map(row => {
      const newRow = [...row];
      const valD = cleanNumber(row[3]);
      const valK = cleanNumber(row[10]);
      newRow[11] = (valD - valK).toString(); 
      return newRow;
    });
  }, [body]);

  const handleStartProcess = async () => {
    setIsProcessingWorkflow(true);
    try {
      const workflowRes = await runN8nSalesWorkflow();
      if (workflowRes.success) {
          const dataRes = await fetchSheetData();
          if (dataRes.success) {
              setHeaders(dataRes.headers || []);
              setBody(dataRes.body || []);
          }
      }
    } catch (err) { console.error(err); } finally { setIsProcessingWorkflow(false); }
  };

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
        <Card className="w-full max-w-6xl h-[85vh] flex flex-col bg-white shadow-2xl">
          <CardHeader className="bg-green-50 border-b py-4 flex flex-row items-center justify-between">
            <div>
                <CardTitle className="text-xl text-green-800 flex items-center gap-2"><Check className="h-6 w-6" /> Pedido Procesado</CardTitle>
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
                <tr><th className="px-4 py-3">MLA (A)</th><th className="px-4 py-3">SKU (B)</th><th className="px-4 py-3">Título (C)</th><th className="px-4 py-3 text-right">Cant.</th></tr>
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

  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
      <CardHeader className="flex flex-col gap-2 pb-4 px-0">
        <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold">Planificación ({body.length} filas)</CardTitle>
            <div className="flex items-center gap-4">
                <Button size="sm" className="bg-green-600 gap-2" onClick={handleProcess} disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} Procesar
                </Button>
            </div>
        </div>
        <div className="flex justify-center w-full py-2">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4 flex flex-col items-center gap-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider">Número de Envío Full</Label>
                <Input value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} placeholder="#123456" className="text-center text-lg font-bold h-9 w-40 border-yellow-300" />
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto border rounded-lg bg-white">
        <table className="w-full text-sm text-left border-collapse table-fixed">
          <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm">
            <tr>
              {headers.map((header, i) => VISIBLE_INDICES.includes(i) && (
                <th key={i} className="px-4 py-3 border-r border-b text-xs font-bold">{header || `Col ${i+1}`}</th>
              ))}
              <th className="sticky right-0 top-0 z-30 px-4 py-3 w-[150px] bg-blue-50 text-blue-800 font-bold text-xs">Cant. a Enviar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayBody.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-blue-50/30">
                {row.map((cell, cellIndex) => VISIBLE_INDICES.includes(cellIndex) && (
                  <td key={cellIndex} className="px-4 py-2 border-r truncate text-gray-600">{cell}</td>
                ))}
                <td className="sticky right-0 px-2 py-1 border-l bg-blue-50/10">
                  <Input placeholder="0" className="h-8 bg-white" value={inputValues[rowIndex] || ""} onChange={(e) => setInputValues(prev => ({ ...prev, [rowIndex]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
