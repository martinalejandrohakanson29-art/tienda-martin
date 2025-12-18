"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Maximize2, Minimize2, ArrowUp, ArrowDown, Save, Loader2, 
  Check, Copy, XCircle 
} from "lucide-react";
import { sendPlanningToN8N } from "@/app/actions/planning";

// --- COMPONENTE DE CELDA COPIABLE ---
const CopyableCell = ({ text, className = "" }: { text: string | number, className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (text === null || text === undefined) return;
    try {
      await navigator.clipboard.writeText(text.toString());
      setCopied(true);
    } catch (err) {
      console.error("Error al copiar", err);
    }
  };

  return (
    <div 
      onClick={handleCopy}
      className={`relative group cursor-pointer flex items-center justify-between gap-2 p-2 rounded hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100 ${copied ? "bg-green-50/50" : ""} ${className}`}
      title="Click para copiar"
    >
      <span className={`truncate ${copied ? "text-green-700 font-medium" : "text-gray-700"}`}>
        {text}
      </span>
      <div className="flex-shrink-0">
        {copied ? (
          <Check className="h-4 w-4 text-green-600 animate-in zoom-in duration-300" />
        ) : (
          <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
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
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({
    index: null,
    direction: "asc",
  });
  
  // Estado para el Resumen (Datos completos enviados)
  const [summaryData, setSummaryData] = useState<any[] | null>(null);

  const [isPending, startTransition] = useTransition(); 
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // --- Helpers ---
  const cleanNumber = (value: string) => {
    if (!value) return 0;
    const cleanValue = value.replace(/[^\d.,-]/g, "").replace(/[.]/g, "").replace(",", ".");
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
  };

  // --- Resize & Sort Logic ---
  const startResizing = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = columnWidths[index] || 150;
    resizingRef.current = { index, startX: e.clientX, startWidth: currentWidth };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { index, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    setColumnWidths((prev) => ({ ...prev, [index]: Math.max(50, startWidth + diff) }));
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };
  
  useEffect(() => {
    return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleSort = (index: number) => {
    setSortConfig((current) => ({
      index,
      direction: current.index === index && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const rowsWithIndex = body.map((row, index) => ({ row, originalIndex: index }));

  const sortedRows = rowsWithIndex.sort((a, b) => {
    if (sortConfig.index === null) return 0;
    const valA = cleanNumber(a.row[sortConfig.index]);
    const valB = cleanNumber(b.row[sortConfig.index]);
    
    if (valA === 0 && valB === 0) {
        return a.row[sortConfig.index].localeCompare(b.row[sortConfig.index]) * (sortConfig.direction === "asc" ? 1 : -1);
    }

    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const handleInputChange = (originalIndex: number, value: string) => {
    setInputValues(prev => ({ ...prev, [originalIndex]: value }));
  };

  // --- PROCESAMIENTO ---
  const handleProcess = () => {
    if (!confirm("¿Estás seguro de enviar la planificación?")) return;

    startTransition(async () => {
      // 1. Construimos los objetos a enviar
      const itemsToSend = body.map((row, index) => {
        // row[4] corresponde a la columna 8.
        // Si la columna 8 es texto (Variation Label), suggestionQty será 0.
        const suggestionQty = cleanNumber(row[4]); 
        const note = inputValues[index] || "";
        const noteQty = cleanNumber(note); // Convertimos la nota en número

        return {
          sku: row[0],
          seller_sku: row[1],
          title: row[2],
          
          current_stock: row[3],
          sales_last_month: row[3], // Se usa row[3] según tu lógica actual
          column_4_info: row[3],
          
          column_9_info: row[5] || "", 
          column_10_info: row[6] || "",
          
          // --- CORRECCIÓN AQUÍ ---
          // Usamos row[4] porque es el índice donde cae la columna 8 en el array filtrado.
          variation_label: row[4] || "", 

          // La cantidad a enviar es lo que pusiste en la NOTA
          quantity_to_send: noteQty, 
          
          // Enviamos el sugerido original por si acaso
          suggested_quantity: suggestionQty, 

          note: note                        
        };
      })
      // 2. Filtramos: Solo enviamos si hay una cantidad válida en la nota ( > 0 )
      .filter(item => item.quantity_to_send > 0);

      if (itemsToSend.length === 0) {
        alert("No hay ítems con notas/cantidades cargadas (>0) para procesar.");
        return;
      }

      const result = await sendPlanningToN8N(itemsToSend);

      if (result.success) {
        setSummaryData(itemsToSend);
      } else {
        alert("❌ Error: " + result.message);
      }
    });
  };

  // --- VISTA DE RESUMEN (MODAL) ---
  if (summaryData) {
    // Como ya filtramos antes, summaryData solo tiene los ítems correctos
    const totalUnits = summaryData.reduce((sum, item) => sum + item.quantity_to_send, 0);

    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="bg-green-50 border-b flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-xl text-green-800 flex items-center gap-2">
                <Check className="h-6 w-6" /> Pedido Procesado
              </CardTitle>
              <p className="text-sm text-green-600 mt-1">
                Se cargaron un total de <b>{totalUnits}</b> unidades para enviar
              </p>
            </div>
            <Button onClick={() => setSummaryData(null)} size="sm" variant="outline" className="border-green-200 hover:bg-green-100 text-green-800">
              <XCircle className="h-4 w-4 mr-2" /> Cerrar
            </Button>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-auto p-0 bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase font-medium sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 w-[150px]">SKU (0)</th>
                  <th className="px-4 py-3 w-[150px]">Variante</th>
                  <th className="px-4 py-3">Título (2)</th>
                  <th className="px-4 py-3 w-[200px]">Nota (Cant.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryData.length > 0 ? (
                  summaryData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-2">
                        <CopyableCell text={item.sku} />
                      </td>
                      <td className="px-2 py-2">
                        <CopyableCell text={item.variation_label} /> 
                      </td>
                      <td className="px-2 py-2">
                        <CopyableCell text={item.title} className="max-w-[300px]" />
                      </td>
                      <td className="px-2 py-2">
                        <CopyableCell text={item.quantity_to_send} className="bg-yellow-50 text-yellow-800 font-bold" />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-gray-400">
                        No hay ítems para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>

          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <Button 
              className="bg-green-600 hover:bg-green-700 w-32" 
              onClick={() => setSummaryData(null)}
            >
              Aceptar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- VISTA NORMAL ---
  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
      <CardHeader className="flex flex-row items-center justify-between pb-4 px-0">
        <CardTitle className="text-xl font-bold text-gray-800">
            Planificación ({body.length} filas)
        </CardTitle>
        <div className="flex gap-2">
            <Button 
                size="sm" 
                className="bg-green-600 hover:bg-green-700 gap-2 shadow-sm"
                onClick={handleProcess}
                disabled={isPending}
            >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isPending ? "Enviando..." : "Procesar"}
            </Button>

            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExpandText(!expandText)}
                className="gap-2 text-xs"
            >
                {expandText ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-hidden relative border rounded-lg shadow-sm bg-white">
        <div className="overflow-auto h-[75vh] w-full relative">
            <table className="w-full text-sm text-left border-collapse table-fixed">
                <thead className="sticky top-0 z-20 bg-gray-100 text-gray-700 uppercase font-medium shadow-sm">
                    <tr>
                        {headers.map((header, i) => (
                            <th 
                                key={i} 
                                className="px-4 py-3 border-r border-b relative select-none hover:bg-gray-200 cursor-pointer transition-colors bg-gray-100"
                                style={{ width: columnWidths[i] || 150 }}
                                onClick={() => handleSort(i)}
                            >
                                <div className="flex items-center justify-between gap-2 h-full">
                                    <span className="truncate flex items-center gap-2 font-bold text-xs">
                                        {header || `Col ${i+1}`}
                                        {sortConfig.index === i && (
                                            sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                                        )}
                                    </span>
                                    <div 
                                        className="w-4 h-full absolute right-0 top-0 cursor-col-resize flex items-center justify-center hover:bg-blue-200/50 transition-colors group z-10"
                                        onMouseDown={(e) => startResizing(i, e)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="w-[2px] h-4 bg-gray-300 rounded group-hover:bg-blue-500" />
                                    </div>
                                </div>
                            </th>
                        ))}
                        <th className="sticky right-0 top-0 z-30 px-4 py-3 w-[180px] bg-blue-50 border-l border-b border-blue-100 text-blue-800 shadow-sm font-bold text-xs">
                            Notas / Acción
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {sortedRows.length > 0 ? (
                        sortedRows.map((item) => (
                            <tr key={item.originalIndex} className="hover:bg-blue-50/30 transition-colors group bg-white">
                                {item.row.map((cell, cellIndex) => (
                                    <td 
                                        key={cellIndex} 
                                        className={`px-4 py-2 border-r border-gray-100 text-gray-600 ${
                                            expandText ? "whitespace-normal break-words" : "whitespace-nowrap truncate"
                                        }`}
                                        title={cell}
                                    >
                                        {cell}
                                    </td>
                                ))}
                                <td className="sticky right-0 px-2 py-1 border-l bg-blue-50/10 backdrop-blur-sm">
                                    <Input 
                                        placeholder="Nota..." 
                                        className="h-8 bg-white/80 focus:bg-white border-blue-100 focus:border-blue-400"
                                        value={inputValues[item.originalIndex] || ""}
                                        onChange={(e) => handleInputChange(item.originalIndex, e.target.value)}
                                    />
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={headers.length + 1} className="px-4 py-10 text-center text-gray-500">
                                No hay datos para mostrar
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </CardContent>
    </Card>
  );
}
