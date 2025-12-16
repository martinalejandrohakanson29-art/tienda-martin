"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface PlanningTableProps {
  headers: string[];
  body: string[][];
}

export default function PlanningTable({ headers, body }: PlanningTableProps) {
  const [expandText, setExpandText] = useState(false);
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  
  // 1. Estado para el ordenamiento
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({
    index: null,
    direction: "asc",
  });

  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // Lógica de Redimensionado (Igual que antes)
  const startResizing = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 👈 IMPORTANTE: Evita que el click ordene la columna mientras redimensionas
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

  // 2. Lógica de Ordenamiento
  const handleSort = (index: number) => {
    setSortConfig((current) => ({
      index,
      direction: current.index === index && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // Función auxiliar para detectar si un valor es número (ignora signos $ o comas simples)
  const parseValue = (value: string) => {
    const cleanValue = value.replace(/[$.]/g, "").replace(",", "."); // Intenta limpiar formato moneda
    const num = parseFloat(cleanValue);
    return isNaN(num) ? value.toLowerCase() : num;
  };

  // Creamos una copia ordenada de los datos
  const sortedBody = [...body].sort((a, b) => {
    if (sortConfig.index === null) return 0;

    const valA = parseValue(a[sortConfig.index]);
    const valB = parseValue(b[sortConfig.index]);

    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg text-gray-600">
            Datos Importados ({body.length} filas)
        </CardTitle>
        <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setExpandText(!expandText)}
            className="gap-2 text-xs"
        >
            {expandText ? <><Minimize2 className="h-3 w-3" /> Compacta</> : <><Maximize2 className="h-3 w-3" /> Ver Todo</>}
        </Button>
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
                                style={{ width: columnWidths[i] || 150, minWidth: columnWidths[i] || 150 }}
                                onClick={() => handleSort(i)} // 👈 Click en el título ordena
                            >
                                <div className="flex items-center justify-between gap-2 h-full">
                                    <span className="truncate flex items-center gap-2">
                                        {header || `Col ${i+1}`}
                                        {/* Indicador de orden visual */}
                                        {sortConfig.index === i ? (
                                            sortConfig.direction === "asc" ? 
                                                <ArrowUp className="h-3 w-3 text-blue-600" /> : 
                                                <ArrowDown className="h-3 w-3 text-blue-600" />
                                        ) : (
                                            <ArrowUpDown className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-50" />
                                        )}
                                    </span>
                                    
                                    {/* Agarrador para redimensionar */}
                                    <div 
                                        className="w-4 h-full absolute right-0 top-0 cursor-col-resize flex items-center justify-center hover:bg-blue-100/50 transition-colors group z-10"
                                        onMouseDown={(e) => startResizing(i, e)}
                                        onClick={(e) => e.stopPropagation()} // Evita que el click llegue al sort
                                    >
                                        <div className="w-1 h-4 bg-gray-300 rounded group-hover:bg-blue-500" />
                                    </div>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {/* Renderizamos sortedBody en lugar de body */}
                    {sortedBody.length > 0 ? (
                        sortedBody.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                                {row.map((cell, cellIndex) => (
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
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={headers.length} className="px-4 py-8 text-center text-gray-500">
                                Sin datos
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        <div className="mt-4 text-xs text-gray-400 text-center flex justify-center gap-4">
            <span>Click en títulos para ordenar.</span>
            <span>Arrastra bordes para redimensionar.</span>
        </div>
      </CardContent>
    </Card>
  );
}
