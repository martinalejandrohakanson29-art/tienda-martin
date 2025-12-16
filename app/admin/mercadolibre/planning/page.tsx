import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// BORRADA LA LÍNEA DEL IMPORT DE TABLE QUE DABA ERROR
import { ArrowLeft, RefreshCw, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

// 1. URL de tu hoja (versión CSV para poder leer los datos)
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

// 👇 CONFIGURACIÓN: Aquí eliges qué columnas ver (A=0, B=1, C=2, etc.)
// Por ejemplo: [0, 1, 2, 9] mostraría solo las columnas A, B, C y J.
const COLUMNAS_ELEGIDAS = [0, 1, 2, 3, 9, 10]; 

async function getSheetData() {
  try {
    const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
    const text = await res.text();
    
    const rows = text.split("\n").map(row => {
        return row.split(",").map(cell => cell.replace(/^"|"$/g, '').trim()); 
    });

    return rows
      .filter(row => row.length > 1)
      // 👇 MAGIA: En lugar de cortar (slice), mapeamos solo las columnas que elegiste arriba
      .map(row => COLUMNAS_ELEGIDAS.map(index => row[index] || "")); 
      
  } catch (error) {
    console.error("Error al leer Sheets:", error);
    return [];
  }
}



export default async function PlanningPage() {
  const data = await getSheetData();
  const headers = data[0] || []; 
  const body = data.slice(1);    

  return (
    <div className="space-y-6">
      
      {/* Header de navegación */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/mercadolibre">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-800">Planificación de Pedido</h1>
        </div>
        <div className="flex gap-2">
            <Link href={SHEETS_CSV_URL.replace("output=csv", "html")} target="_blank">
                <Button variant="outline" size="sm" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Ver Original
                </Button>
            </Link>
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCw className="h-4 w-4" />
                Actualizar Datos
            </Button>
        </div>
      </div>

      {/* Tabla de Datos */}
      <Card>
        <CardHeader className="pb-2">
            <CardTitle className="text-lg text-gray-600">Datos Importados de Sheets</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border overflow-x-auto">
                {/* Tabla HTML estándar */}
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-700 uppercase font-medium border-b">
                        <tr>
                            {headers.map((header, i) => (
                                <th key={i} className="px-4 py-3 whitespace-nowrap">
                                    {header || `Columna ${i+1}`}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {body.length > 0 ? (
                            body.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-4 py-3 max-w-[200px] truncate" title={cell}>
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                    No se encontraron datos o la hoja está vacía.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="mt-4 text-xs text-gray-400 text-center">
                Mostrando columnas A - J desde Google Sheets
            </div>
        </CardContent>
      </Card>
    </div>
  );
        }
