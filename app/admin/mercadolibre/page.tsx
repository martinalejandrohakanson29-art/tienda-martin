import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PackageCheck, FileSpreadsheet, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function MercadoLibreDashboard() {
  return (
    <div className="space-y-6">
      {/* Botón para volver atrás */}
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 1: La herramienta externa (Railway) */}
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

        {/* TARJETA 2: La nueva herramienta (Planificación) - Aún vacía */}
        <Card className="hover:shadow-md transition-all border-l-4 border-l-green-600 bg-gray-50/50">
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
            {/* Por ahora deshabilitado hasta que lo creemos */}
            <Button disabled variant="outline" className="w-full border-dashed border-2">
              Próximamente...
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
