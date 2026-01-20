import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Truck, 
  Settings2, 
  ArrowLeft, 
  ArrowRight,
  MapPinned // Icono para Colecta y Flex
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

      {/* Grid de 3 columnas para las carpetas principales */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: GESTIÓN FULL */}
        <Card className="hover:shadow-lg transition-all border-l-4 border-l-purple-500 bg-purple-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-purple-700 text-2xl">
              <Truck className="h-8 w-8" />
              Gestión Full
            </CardTitle>
            <CardDescription className="text-base font-medium">
              Envíos a depósitos de ML.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/full">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white h-12 text-lg gap-2">
                Entrar <ArrowRight size={20} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: GESTIÓN DE ENVÍOS (COLECTA Y FLEX) */}
        <Card className="hover:shadow-lg transition-all border-l-4 border-l-blue-600 bg-blue-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-blue-800 text-2xl">
              <MapPinned className="h-8 w-8" />
              Envíos Colecta y Flex
            </CardTitle>
            <CardDescription className="text-base font-medium">
              Gestion de envios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/envios">
              <Button className="w-full bg-blue-700 hover:bg-blue-800 text-white h-12 text-lg gap-2">
                Entrar <ArrowRight size={20} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: GESTIÓN INTERNA */}
        <Card className="hover:shadow-lg transition-all border-l-4 border-l-indigo-500 bg-indigo-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-indigo-700 text-2xl">
              <Settings2 className="h-8 w-8" />
              Gestión Interna
            </CardTitle>
            <CardDescription className="text-base font-medium">
              Stock, Costos y Rentabilidad.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/mercadolibre/interna">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-lg gap-2">
                Entrar <ArrowRight size={20} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
