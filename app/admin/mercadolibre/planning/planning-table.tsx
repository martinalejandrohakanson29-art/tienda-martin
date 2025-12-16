"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, Minimize2, ArrowUpDown, ArrowUp, ArrowDown, Save } from "lucide-react";

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

  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

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

  return (
    <Card className="h-full flex flex-col shadow-none border-0"> 
    {/* 👆 Cambiamos Card para que ocupe altura completa si es necesario */}
      
      <CardHeader className="flex flex-row items-center justify-between pb-4 px-0">
        <CardTitle className="text-xl font-bold text-gray-800">
            Planificación ({body.length} filas)
        </CardTitle>
        <div className="flex gap-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-2 shadow-sm">
                <Save className="h-4 w-4" />
                Procesar
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
        {/* 👇 AQUÍ LA MAGIA: h-[75vh] define la altura de la ventana de scroll */}
        <div className="overflow-auto h-[75vh] w-full relative">
            <table className="w-full text-sm text-left border-collapse table-fixed">
                {/* 👇 sticky top-0 y z-20 hacen que se pegue arriba */}
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
                                {/* 👇 Columna de inputs con fondo sólido para tapar lo que pasa por debajo si hubiera scroll horizontal */}
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
