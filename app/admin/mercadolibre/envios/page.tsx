import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  ArrowRight, 
  PackageSearch, 
  MapPin, 
  Clock 
} from "lucide-react";
import Link from "next/link";

export default function GestionEnviosPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Envíos (Colecta y Flex)</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: Seguimiento de Colecta */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Clock className="h-6 w-6" />
              Control de Colectas
            </CardTitle>
            <CardDescription>
              Monitoreo de horarios y bultos entregados al transporte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/envios/colecta">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
                Ver Colectas <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: Gestión Mercado Envios Flex */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-sky-500 bg-sky-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sky-700">
              <MapPin className="h-6 w-6" />
              Rutas y Flex
            </CardTitle>
            <CardDescription>
              Gestión de envíos rápidos en el día y mensajería propia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/envios/flex">
              <Button className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2 shadow-sm">
                Gestionar Flex <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: Auditoría de Etiquetas */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-slate-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-700">
              <PackageSearch className="h-6 w-6" />
              Control de Paquetes
            </CardTitle>
            <CardDescription>
              Escaneo y verificación antes de despachar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/envios/verificacion">
              <Button className="w-full bg-slate-600 hover:bg-slate-700 text-white gap-2 shadow-sm">
                Verificar Salidas <ArrowRight size={16} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
