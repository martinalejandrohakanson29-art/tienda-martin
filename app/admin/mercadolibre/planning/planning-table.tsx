"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; 
import { 
  Maximize2, Minimize2, ArrowUp, ArrowDown, Save, Loader2, 
  Check, Copy, XCircle, Truck 
} from "lucide-react";
import { sendPlanningToN8N } from "@/app/actions/planning";

const CopyableCell = ({ text, className = "" }: { text: string | number, className?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div onClick={handleCopy} className={`relative group cursor-pointer flex items-center justify-between gap-2 p-2 rounded hover:bg-blue-50 transition-all ${copied ? "bg-green-50" : ""} ${className}`}>
      <span className={`truncate ${copied ? "text-green-700 font-medium" : "text-gray-700"}`}>{text}</span>
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />}
    </div>
  );
};

interface PlanningTableProps {
  headers: string[];
  body: string[][];
}

export default function PlanningTable({ headers, body }: PlanningTableProps) {
  const [expandText, setExpandText] = useState(false);
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  const [inputValues, setInputValues] = useState<{ [rowIndex: number]: string }>({});
  const [shipmentId, setShipmentId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({ index: null, direction: "asc" });
  const [summaryData, setSummaryData] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition(); 
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // 👇 CONFIGURACIÓN DE VISIBILIDAD (A=0, B=1, C=2, D=3, I=8, J=9, K=10, L=11)
  const VISIBLE_INDICES = [0, 1, 2, 3, 8, 9, 10, 11];

  const cleanNumber = (value: string) => {
    if (!value) return 0;
    const cleanValue = value.replace(/[^\d.,-]/g, "").replace(/[.]/g, "").replace(",", ".");
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
  };

  const startResizing = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const currentWidth = columnWidths[index] || 150;
    resizingRef.current = { index, startX: e.clientX, startWidth: currentWidth };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { index, startX, startWidth } = resizingRef.current;
    setColumnWidths((prev) => ({ ...prev, [index]: Math.max(50, startWidth + (e.clientX - startX)) }));
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleSort = (index: number) => {
    setSortConfig((current) => ({
      index,
      direction: current.index === index && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedRows = [...body.map((row, index) => ({ row, originalIndex: index }))].sort((a, b) => {
    if (sortConfig.index === null) return 0;
    const valA = cleanNumber(a.row[sortConfig.index]);
    const valB = cleanNumber(b.row[sortConfig.index]);
    if (valA === 0 && valB === 0) return a.row[sortConfig.index].localeCompare(b.row[sortConfig.index]) * (sortConfig.direction === "asc" ? 1 : -1);
    return (valA - valB) * (sortConfig.direction === "asc" ? 1 : -1);
  });

  const handleProcess = () => {
    if (!shipmentId.trim()) return alert("⚠️ Ingresa el Número de Envío.");
    if (!confirm(`¿Procesar envío #${shipmentId}?`)) return;

    startTransition(async () => {
      const itemsToSend = body.map((row, index) => {
        const noteQty = cleanNumber(inputValues[index] || "");
        return {
          shipment_id: shipmentId.trim(),
          sku: row[0], // MLA
          seller_sku: row[1], // SKU interno
          title: row[2],
          quantity_to_send: noteQty,
          // 👇 CAPTURA INVISIBLE DE N, O, P, Q (Índices 13, 14, 15, 16)
          agregado1: row[13] || "",
          agregado2: row[14] || "",
          agregado3: row[15] || "",
          agregado4: row[16] || "",
          variation_label: row[6] || ""
        };
      }).filter(item => item.quantity_to_send > 0);

      if (itemsToSend.length === 0) return alert("No hay cantidades cargadas.");
      const result = await sendPlanningToN8N(itemsToSend, shipmentId.trim());
      if (result.success) setSummaryData(itemsToSend);
      else alert("❌ Error: " + result.message);
    });
  };

  if (summaryData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl h-[85vh] flex flex-col bg-white">
          <CardHeader className="bg-green-50 border-b py-4">
            <CardTitle className="text-xl text-green-800 flex items-center gap-2">
              <Check className="h-6 w-6" /> Pedido Procesado (Envío #{shipmentId})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 sticky top-0">
                <tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Título</th><th className="px-4 py-3 text-right">Cant.</th></tr>
              </thead>
              <tbody className="divide-y">
                {summaryData.map((item, idx) => (
                  <tr key={idx}><td className="px-4 py-2">{item.sku}</td><td className="px-4 py-2">{item.title}</td><td className="px-4 py-2 text-right font-bold text-green-700">{item.quantity_to_send}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          <div className="p-4 border-t flex justify-end"><Button className="bg-green-600" onClick={() => setSummaryData(null)}>Aceptar</Button></div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
      <CardHeader className="flex flex-col gap-2 pb-4 px-0">
        <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold">Planificación ({body.length} filas)</CardTitle>
            <div className="flex gap-2">
                <Button size="sm" className={`${!shipmentId ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'} gap-2`} onClick={handleProcess} disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                    Procesar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setExpandText(!expandText)}>
                    {expandText ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
            </div>
        </div>
        <div className="flex justify-center w-full py-2">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4 flex flex-col items-center gap-1 shadow-sm">
                <div className="flex items-center gap-2 text-yellow-800/90 text-[10px] font-bold uppercase"><Truck className="h-3 w-3" /> Número de Envío Full (Req.)</div>
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
                            return (
                                <th key={i} className="px-4 py-3 border-r border-b relative select-none cursor-pointer hover:bg-gray-200" style={{ width: columnWidths[i] || 150 }} onClick={() => handleSort(i)}>
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="truncate font-bold text-xs">{header || `Col ${i+1}`}</span>
                                        {sortConfig.index === i && (sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />)}
                                    </div>
                                    <div className="w-4 h-full absolute right-0 top-0 cursor-col-resize" onMouseDown={(e) => startResizing(i, e)} onClick={(e) => e.stopPropagation()} />
                                </th>
                            );
                        })}
                        <th className="sticky right-0 top-0 z-30 px-4 py-3 w-[180px] bg-blue-50 border-l border-b border-blue-100 text-blue-800 font-bold text-xs">Cant. a Enviar</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {sortedRows.map((item) => (
                        <tr key={item.originalIndex} className="hover:bg-blue-50/30 transition-colors">
                            {item.row.map((cell, cellIndex) => {
                                if (!VISIBLE_INDICES.includes(cellIndex)) return null;
                                return (
                                    <td key={cellIndex} className={`px-4 py-2 border-r text-gray-600 ${expandText ? "whitespace-normal break-words" : "whitespace-nowrap truncate"}`} title={cell}>
                                        {cell}
                                    </td>
                                );
                            })}
                            <td className="sticky right-0 px-2 py-1 border-l bg-blue-50/10 backdrop-blur-sm">
                                <Input placeholder="0" className="h-8 bg-white border-blue-100 focus:border-blue-400" value={inputValues[item.originalIndex] || ""} onChange={(e) => setInputValues(prev => ({ ...prev, [item.originalIndex]: e.target.value }))} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </CardContent>
    </Card>
  );
}
