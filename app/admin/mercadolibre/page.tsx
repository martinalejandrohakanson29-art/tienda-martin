import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Truck, 
  ArrowLeft, 
  ArrowRight,
  MapPinned,
  PackageCheck 
} from "lucide-react";
import Link from "next/link";

export default function MercadoLibreDashboard() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al Panel General
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gestión Mercado Libre</h1>
      </div>

      <p className="text-gray-500 text-lg">Selecciona el área de trabajo operativa.</p>

      {/* Grid ajustado a 3 columnas para coincidir con el diseño de /admin */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: GESTIÓN FULL */}
        <Card className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700 text-xl">
              <Truck className="h-6 w-6" />
              Gestión Full
            </CardTitle>
            <CardDescription className="text-purple-600/80 font-medium">
              Envíos a depósitos de ML
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Preparación y seguimiento de stock enviado a las bodegas de Full.
            </p>
            <Link href="/admin/mercadolibre/full">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: GESTIÓN DE ENVÍOS (COLECTA Y FLEX) */}
        <Card className="border-l-4 border-l-blue-600 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-xl">
              <MapPinned className="h-6 w-6" />
              Colecta y Flex
            </CardTitle>
            <CardDescription className="text-blue-700/80 font-medium">
              Logística local y diaria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Gestión de etiquetas y preparación para colectas y envíos Flex.
            </p>
            <Link href="/admin/mercadolibre/envios">
              <Button className="w-full bg-blue-700 hover:bg-blue-800 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* NUEVA TARJETA 3: GESTIÓN DE PEDIDOS DESPACHADOS */}
        <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-emerald-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-800 text-xl">
              <PackageCheck className="h-6 w-6" />
              Pedidos Despachados
            </CardTitle>
            <CardDescription className="text-emerald-700/80 font-medium">
              Control post-despacho
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Seguimiento de órdenes entregadas al correo o transportista.
            </p>
            <Link href="/admin/mercadolibre/despachados">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
