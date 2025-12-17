"use client";

import { useState, useRef, useEffect, useTransition } from "react"; // 👈 1. Agregamos useTransition
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, Minimize2, ArrowUpDown, ArrowUp, ArrowDown, Save, Loader2 } from "lucide-react";
import { sendPlanningToN8N } from "@/app/actions/planning"; // 👈 2. Importamos la acción

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

  // Estado para manejar el loading del envío
  const [isPending, startTransition] = useTransition(); 

  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // ... (MANTENER LAS FUNCIONES startResizing, handleMouseMove, handleMouseUp IGUAL QUE ANTES) ...
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
    setColumnWidths((prev) => ({ ...prev, [index]: Math.max(50, startWidth + diff) }));
    var diff = e.clientX - startX; // (Corrección menor de referencia)
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
  // ... (FIN FUNCIONES RESIZE) ...


  const handleSort = (index: number) => {
    setSortConfig((current) => ({
      index,
      direction: current.index === index && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const parseValue = (value: string) => {
    const cleanValue = value.replace(/[$.]/g, "").replace(",", ".");
    const num = parseFloat(cleanValue);
    return isNaN(num) ? value.toLowerCase() : num;
  };

  const rowsWithIndex = body.map((row, index) => ({ row, originalIndex: index }));

  const sortedRows = rowsWithIndex.sort((a, b) => {
    if (sortConfig.index === null) return 0;
    const valA = parseValue(a.row[sortConfig.index]);
    const valB = parseValue(b.row[sortConfig.index]);
    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const handleInputChange = (originalIndex: number, value: string) => {
    setInputValues(prev => ({ ...prev, [originalIndex]: value }));
  };

  // 👇 3. LÓGICA DE PROCESADO
  const handleProcess = () => {
    if (!confirm("¿Estás seguro de enviar la planificación a n8n para generar el pedido?")) return;

    startTransition(async () => {
      // Mapeamos los datos para enviarlos más limpios
      // ASUMIMOS TU ESTRUCTURA ACTUAL SEGÚN 'COLUMNAS_ELEGIDAS' EN page.tsx:
      // Index 0: SKU/ID?
      // Index 1: Título
      // Index 2: Stock
      // Index 3: Ventas?
      // Index 4 (Origen 9): Sugerido/A enviar?
      
      const itemsToSend = body.map((row, index) => {
        const suggestionRaw = row[4]; // Ajusta este índice si cambió tu array COLUMNAS_ELEGIDAS
        const suggestionQty = parseFloat(suggestionRaw) || 0;
        const note = inputValues[index] || "";

        return {
          sku: row[0],
          title: row[1],
          current_stock: row[2],
          sales_last_month: row[3],
          quantity_to_send: suggestionQty,
          note: note
        };
      })
      // FILTRO IMPORTANTE: Solo enviamos lo que tenga cantidad > 0 O una nota escrita
      .filter(item => item.note.trim() !== "");

      if (itemsToSend.length === 0) {
        alert("No hay ítems con sugerencia de envío (>0) ni notas para procesar.");
        return;
      }

      const result = await sendPlanningToN8N(itemsToSend);

      if (result.success) {
        alert(`✅ Éxito: ${result.message}\nSe enviaron ${itemsToSend.length} líneas.`);
        // Opcional: Limpiar notas o redirigir
        // setInputValues({});
      } else {
        alert("❌ Error: " + result.message);
      }
    });
  };

  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
      <CardHeader className="flex flex-row items-center justify-between pb-4 px-0">
        <CardTitle className="text-xl font-bold text-gray-800">
            Planificación ({body.length} filas)
        </CardTitle>
        <div className="flex gap-2">
            {/* 👇 BOTÓN ACTUALIZADO */}
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
      
      {/* ... (EL RESTO DEL CONTENIDO - CardContent, Tabla, etc. SE MANTIENE IGUAL) ... */}
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
                                    {/* (El div para resize sigue aquí igual) */}
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
