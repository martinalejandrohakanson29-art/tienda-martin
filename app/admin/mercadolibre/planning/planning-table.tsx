"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // 👈 Necesitamos este componente
import { Maximize2, Minimize2, ArrowUpDown, ArrowUp, ArrowDown, Save } from "lucide-react";

interface PlanningTableProps {
  headers: string[];
  body: string[][];
}

export default function PlanningTable({ headers, body }: PlanningTableProps) {
  const [expandText, setExpandText] = useState(false);
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  
  // 1. Estado para guardar los datos que ingreses a mano
  // Usamos un objeto donde la clave es el índice original de la fila
  const [inputValues, setInputValues] = useState<{ [rowIndex: number]: string }>({});

  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({
    index: null,
    direction: "asc",
  });

  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // --- Lógica de Redimensionado (Igual que antes) ---
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

  // --- Lógica de Ordenamiento ---
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

  // ⚠️ TRUCO CLAVE: Mapeamos las filas a objetos con su índice original
  // Esto permite que al ordenar, sepamos cuál era la fila original para buscar su input
  const rowsWithIndex = body.map((row, index) => ({ row, originalIndex: index }));

  const sortedRows = rowsWithIndex.sort((a, b) => {
    if (sortConfig.index === null) return 0;
    const valA = parseValue(a.row[sortConfig.index]);
    const valB = parseValue(b.row[sortConfig.index]);
    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Función para manejar cuando escribes en los inputs
  const handleInputChange = (originalIndex: number, value: string) => {
    setInputValues(prev => ({
        ...prev,
        [originalIndex]: value
    }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg text-gray-600">
            Datos Importados ({body.length} filas)
        </CardTitle>
        <div className="flex gap-2">
            {/* Botón visual (aún no hace nada, es para la próxima etapa) */}
            <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-2">
                <Save className="h-4 w-4" />
                Procesar con n8n
            </Button>
            
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExpandText(!expandText)}
                className="gap-2 text-xs"
            >
                {expandText ? <><Minimize2 className="h-3 w-3" /> Compacta</> : <><Maximize2 className="h-3 w-3" /> Ver Todo</>}
            </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse table-fixed">
                <thead className="bg-gray-100 text-gray-700 uppercase font-medium border-b">
                    <tr>
                        {headers.map((header, i) => (
                            <th 
                                key={i} 
                                className="px-4 py-3 border-r relative overflow-hidden select-none hover:bg-gray-200 cursor-pointer transition-colors"
                                style={{ width: columnWidths[i] || 150 }}
                                onClick={() => handleSort(i)}
                            >
                                <div className="flex items-center justify-between gap-2 h-full">
                                    <span className="truncate flex items-center gap-2">
                                        {header || `Col ${i+1}`}
                                        {sortConfig.index === i && (
                                            sortConfig.direction === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                                        )}
                                    </span>
                                    <div 
                                        className="w-4 h-full absolute right-0 top-0 cursor-col-resize flex items-center justify-center hover:bg-blue-100/50 transition-colors group z-10"
                                        onMouseDown={(e) => startResizing(i, e)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="w-1 h-4 bg-gray-300 rounded group-hover:bg-blue-500" />
                                    </div>
                                </div>
                            </th>
                        ))}
                        {/* 👇 COLUMNA EXTRA PARA INPUTS MANUALES */}
                        <th className="px-4 py-3 w-[150px] bg-blue-50 border-l border-blue-100 text-blue-800">
                            Notas / Acción
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {sortedRows.length > 0 ? (
                        sortedRows.map((item) => (
                            // Usamos item.originalIndex como key para que React no se pierda al ordenar
                            <tr key={item.originalIndex} className="hover:bg-gray-50/50 transition-colors group">
                                {item.row.map((cell, cellIndex) => (
                                    <td 
                                        key={cellIndex} 
                                        className={`px-4 py-3 border-r overflow-hidden ${
                                            expandText ? "whitespace-normal break-words" : "whitespace-nowrap truncate"
                                        }`}
                                        title={cell}
                                    >
                                        {cell}
                                    </td>
                                ))}
                                {/* 👇 CELDA DEL INPUT */}
                                <td className="px-2 py-2 border-l bg-blue-50/30">
                                    <Input 
                                        placeholder="Escribir..." 
                                        className="h-8 bg-white"
                                        value={inputValues[item.originalIndex] || ""}
                                        onChange={(e) => handleInputChange(item.originalIndex, e.target.value)}
                                    />
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={headers.length + 1} className="px-4 py-8 text-center text-gray-500">
                                Sin datos
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
