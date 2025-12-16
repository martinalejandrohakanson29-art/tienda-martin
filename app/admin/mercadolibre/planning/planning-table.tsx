"use client"; // 👈 Esto le dice a Next.js que aquí podemos usar clicks y estados

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

interface PlanningTableProps {
  headers: string[];
  body: string[][];
}

export default function PlanningTable({ headers, body }: PlanningTableProps) {
  // Estado para controlar si el texto se corta o se ve completo
  const [expandText, setExpandText] = useState(false);

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
        <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-100 text-gray-700 uppercase font-medium border-b">
                    <tr>
                        {headers.map((header, i) => (
                            <th 
                                key={i} 
                                className="px-4 py-3 border-r relative min-w-[100px]"
                                // 👇 TRUCO CSS: Esto permite redimensionar la columna arrastrando
                                style={{ resize: "horizontal", overflow: "hidden" }} 
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span>{header || `Col ${i+1}`}</span>
                                    {/* Indicador visual de que se puede arrastrar */}
                                    <div className="w-1 h-4 bg-gray-300 rounded cursor-col-resize hover:bg-blue-400" />
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
                                        className={`px-4 py-3 border-r ${
                                            expandText 
                                                ? "whitespace-normal min-w-[200px]" // Expandido: texto envuelto
                                                : "whitespace-nowrap max-w-[150px] truncate" // Compacto: cortado
                                        }`}
                                        title={cell} // Tooltip nativo al pasar el mouse
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
            Tip: Arrastra el borde derecho de los títulos para ajustar el ancho de columna.
        </div>
      </CardContent>
    </Card>
  );
                                         }
