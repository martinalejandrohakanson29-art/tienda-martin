// app/admin/mercadolibre/crear-publicaciones/page.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Send } from "lucide-react";
import Link from "next/link";

export default function CrearPublicacionesPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Encabezado con botón para volver */}
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Gestión Mercado Libre
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-rose-500" />
          Crear Publicaciones con IA
        </h1>
      </div>

      <p className="text-gray-500 text-lg">
        Ingresa los datos del producto para que el agente genere la publicación optimizada.
      </p>

      {/* Contenedor principal dividido en 2 columnas (Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        
        {/* COLUMNA IZQUIERDA: Formulario de entrada */}
        <Card className="border-t-4 border-t-rose-500 shadow-md">
          <CardHeader>
            <CardTitle>Datos Base del Producto</CardTitle>
            <CardDescription>
              Completa esta información. Luego la enviaremos al flujo de n8n.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            
            <div className="space-y-2">
              <Label htmlFor="producto" className="text-base font-medium">¿Qué producto es?</Label>
              <Input 
                id="producto" 
                placeholder="Ej: Casco Moto Integral, Aceite Sintético..." 
                className="h-12"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="marca" className="text-base font-medium">Marca y Modelo</Label>
              <Input 
                id="marca" 
                placeholder="Ej: LS2 FF352, Motul 5100..." 
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caracteristicas" className="text-base font-medium">Características Claves / Extras</Label>
              <Textarea 
                id="caracteristicas" 
                placeholder="Ej: Color negro mate, talle L, incluye visor extra, es para motores 4 tiempos..." 
                rows={5}
                className="resize-none"
              />
            </div>

            <Button className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-12 text-lg mt-4">
              <Send className="h-5 w-5" />
              Generar con IA
            </Button>
            
          </CardContent>
        </Card>

        {/* COLUMNA DERECHA: Resultados de la IA */}
        <Card className="shadow-md bg-gray-50/50 border-gray-200">
          <CardHeader>
            <CardTitle>Resultados Generados</CardTitle>
            <CardDescription>
              Aquí aparecerán los textos listos para copiar y pegar en Mercado Libre.
            </CardDescription>
          </CardHeader>
          <CardContent>
            
            {/* Estado vacío por defecto (hasta que conectemos la lógica) */}
            <div className="flex flex-col items-center justify-center h-[420px] text-gray-400 border-2 border-dashed border-gray-300 rounded-lg bg-white">
              <Sparkles className="h-14 w-14 mb-4 text-gray-300" />
              <p className="text-center px-8 text-lg">
                Completa los datos a la izquierda y presiona "Generar con IA" para ver los títulos y descripciones aquí.
              </p>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}
