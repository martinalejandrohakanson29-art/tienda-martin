"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

interface PlanningTableProps {
  headers: string[];
  body: string[][];
}

export default function PlanningTable({ headers, body }: PlanningTableProps) {
  const [expandText, setExpandText] = useState(false);
  
  // 1. Estado para guardar el ancho de cada columna (clave: índice, valor: ancho en px)
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  
  // 2. Referencia para guardar datos mientras arrastras (sin causar re-renderizados lentos)
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // Función que se activa cuando haces CLICK en el borde
  const startResizing = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const currentWidth = columnWidths[index] || 150; // 150px es el ancho por defecto
    
    // Guardamos en la ref: qué columna es, dónde estaba el mouse y cuánto medía
    resizingRef.current = { 
        index, 
        startX: e.clientX, 
        startWidth: currentWidth 
    };

    // Agregamos "escuchadores" a TODA la pantalla para que no se pierda si mueves el mouse rápido
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Función que calcula el nuevo ancho mientras mueves el mouse
  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;

    const { index, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX; // Cuántos pixeles te moviste
    const newWidth = Math.max(50, startWidth + diff); // Calculamos (mínimo 50px para no desaparecerla)

    // Actualizamos el estado visual
    setColumnWidths((prev) => ({
      ...prev,
      [index]: newWidth,
    }));
  };

  // Función para limpiar cuando sueltas el click
  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // Limpieza de seguridad por si el componente se desmonta mientras arrastras
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
            {expandText ? (
                <>
                    <Minimize2 className="h-3 w-3" />
                    Vista Compacta
                </>
            ) : (
                <>
                    <Maximize2 className="h-3 w-3" />
                    Ver Todo el Texto
                </>
            )}
        </Button>
      </CardHeader>
      
      <CardContent>
        {/* Usamos table-fixed para que el navegador respete nuestros anchos a la fuerza */}
        <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse table-fixed">
                <thead className="bg-gray-100 text-gray-700 uppercase font-medium border-b">
                    <tr>
                        {headers.map((header, i) => (
                            <th 
                                key={i} 
                                className="px-4 py-3 border-r relative overflow-hidden"
                                style={{ 
                                    // Aquí aplicamos el ancho dinámico
                                    width: columnWidths[i] || 150,
                                    minWidth: columnWidths[i] || 150 
                                }}
                            >
                                <div className="flex items-center justify-between gap-2 h-full">
                                    <span className="truncate">{header || `Col ${i+1}`}</span>
                                    
                                    {/* Este es el AGARRADOR (Resizer) */}
                                    <div 
                                        className="w-4 h-full absolute right-0 top-0 cursor-col-resize flex items-center justify-center hover:bg-blue-100/50 transition-colors group"
                                        onMouseDown={(e) => startResizing(i, e)}
                                    >
                                        {/* Línea visual pequeña */}
                                        <div className="w-1 h-4 bg-gray-300 rounded group-hover:bg-blue-500" />
                                    </div>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {body.length > 0 ? (
                        body.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                                {row.map((cell, cellIndex) => (
                                    <td 
                                        key={cellIndex} 
                                        className={`px-4 py-3 border-r overflow-hidden ${
                                            expandText 
                                                ? "whitespace-normal break-words" // Expandido: baja de renglón
                                                : "whitespace-nowrap truncate"   // Compacto: corta con ...
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
        
        <div className="mt-4 text-xs text-gray-400 text-center">
            Tip: Ahora sí, arrastra las barritas grises en los títulos para cambiar el tamaño.
        </div>
      </CardContent>
    </Card>
  );
}
