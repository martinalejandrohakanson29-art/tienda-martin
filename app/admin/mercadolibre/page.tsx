import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  PackageCheck, 
  FileSpreadsheet, 
  ExternalLink, 
  ArrowLeft, 
  ArrowRight, 
  Truck, 
  ReceiptText,
  Package // <--- Agregamos este ícono
} from "lucide-react";
import Link from "next/link";

export default function MercadoLibreDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gestión Mercado Libre</h1>
      </div>

      <p className="text-gray-500">Selecciona una herramienta para comenzar.</p>

      {/* SECCIÓN 1: Operativa de Envíos */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: Railway */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <PackageCheck className="h-6 w-6" />
              Preparación envíos FULL
            </CardTitle>
            <CardDescription>
              Fotos, etiquetado y evidencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link 
                href="https://guia-pedidos-ml-production.up.railway.app/" 
                target="_blank" 
                rel="noopener noreferrer"
            >
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2">
                Abrir Sistema <ExternalLink size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: Control / Auditoría */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Truck className="h-6 w-6" />
              Control envios Full
            </CardTitle>
            <CardDescription>
              Auditoría y revisión de fotos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/tools/audit">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
                Ir a Control <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: Planificación */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-green-600">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <FileSpreadsheet className="h-6 w-6" />
              Planificación Envíos Full
            </CardTitle>
            <CardDescription>
              Armado de pedidos desde Sheets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/planning">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm">
                Comenzar Planificación <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* SEPARADOR PARA NUEVA SECCIÓN */}
      <hr className="my-10 border-gray-200" />
      
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-gray-700">Análisis y Rentabilidad</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          {/* TARJETA 4: Costos ML */}
          <Card className="hover:shadow-md transition-all border-l-4 border-l-cyan-500 bg-cyan-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-cyan-700">
                <ReceiptText className="h-6 w-6" />
                Costos ML
              </CardTitle>
              <CardDescription>
                Cálculo de costos totales por kit en tiempo real.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/mercadolibre/costos">
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-2 shadow-sm">
                  Ver Análisis de Costos <ArrowRight size={16} />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* NUEVA TARJETA: Lista de Artículos (corregida) */}
          <Card className="hover:shadow-md transition-all border-l-4 border-l-amber-500 bg-amber-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <Package className="h-6 w-6" />
                Tabla de Costos
              </CardTitle>
              <CardDescription>
                Tabla maestra de costos y conversión USD/ARS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/mercadolibre/articulos">
                <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm">
                  Ver Tabla Maestra <ArrowRight size={16} />
                </Button>
              </Link>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
