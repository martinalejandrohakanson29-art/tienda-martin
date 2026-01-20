import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Ship, 
  ReceiptText, 
  Package, 
  ArrowLeft, 
  ArrowRight 
} from "lucide-react";
import Link from "next/link";

export default function GestionInternaPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gestión Interna</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: IMPORTACIONES */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-indigo-500 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-700">
              <Ship className="h-6 w-6" />
              Gestión de Importaciones
            </CardTitle>
            <CardDescription>
              Control de Stock, Ventas y Carritos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/importaciones">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                Ver Tablero Maestro <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: Costos Kits */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-cyan-500 bg-cyan-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-700">
              <ReceiptText className="h-6 w-6" />
              Tabla Comparador (Kits)
            </CardTitle>
            <CardDescription>
              Composición y rentabilidad de combos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/costos">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-2">
                Ver Análisis de Costos <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: Costos Base */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-amber-500 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <Package className="h-6 w-6" />
              Tabla de Costos Base
            </CardTitle>
            <CardDescription>
              Mantenimiento de precios de artículos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/articulos">
              <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2">
                Ver Tabla Maestra <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
