import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import PlanningTable from "./planning-table"; // 👈 Importamos nuestro nuevo componente

// URL y Configuración
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";
const COLUMNAS_ELEGIDAS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; 

async function getSheetData() {
  try {
    const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
    const text = await res.text();
    
    const rows = text.split("\n").map(row => {
        return row.split(",").map(cell => cell.replace(/^"|"$/g, '').trim()); 
    });

    return rows
      .filter(row => row.length > 1)
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
      
      {/* Header (Igual que antes) */}
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

      {/* 👇 AQUÍ ESTÁ EL CAMBIO: Usamos el componente interactivo */}
      <PlanningTable headers={headers} body={body} />

    </div>
  );
}
