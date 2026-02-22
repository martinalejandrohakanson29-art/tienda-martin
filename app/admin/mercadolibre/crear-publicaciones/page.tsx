"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Send, Loader2 } from "lucide-react";
import Link from "next/link";

export default function CrearPublicacionesPage() {
  // 1. ESTADOS DEL FORMULARIO: Aquí guardamos lo que el usuario escribe
  const [producto, setProducto] = useState("");
  const [marca, setMarca] = useState("");
  const [caracteristicas, setCaracteristicas] = useState("");
  const [costo, setCosto] = useState("");
  const [rentabilidad, setRentabilidad] = useState("40"); // 40% por defecto
  const [urlFoto, setUrlFoto] = useState("");

  // 2. ESTADOS DE LA APLICACIÓN: Para saber si está cargando y guardar el resultado
  const [isLoading, setIsLoading] = useState(false);
  const [resultadoIa, setResultadoIa] = useState<any>(null);

  // 3. LA FUNCIÓN QUE SE CONECTA CON n8n
  const handleGenerarConIA = async () => {
    setIsLoading(true);
    setResultadoIa(null);

    // Reemplaza esto con la URL real de tu Webhook de n8n
    const WEBHOOK_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/generar-publicacion"; 

    // Unimos los textos del formulario para armar el "Borrador" que n8n espera
    const borrador_titulo = `${producto} ${marca}. Características: ${caracteristicas}`;

    // Armamos el paquete exacto con los nombres de variables que configuramos en n8n
    const payload = {
      borrador_titulo: borrador_titulo,
      costo_producto: Number(costo),
      rentabilidad_esperada_porcentaje: Number(rentabilidad),
      url_foto: urlFoto,
    };

    try {
      // Enviamos los datos a n8n
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Error al conectar con n8n");

      // Recibimos la respuesta de OpenRouter a través de n8n
      const data = await response.json();
      setResultadoIa(data);

    } catch (error) {
      console.error("Hubo un error:", error);
      alert("Hubo un error al generar la publicación. Verifica que n8n esté activo.");
    } finally {
      setIsLoading(false);
    }
  };

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
      </div>
      
      <div className="flex items-center gap-4 mt-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-rose-500" />
          Crear Publicaciones con IA
        </h1>
      </div>

      <p className="text-gray-500 text-lg">
        Ingresa los datos del producto para que el agente genere la publicación optimizada.
      </p>

      {/* Contenedor principal dividido en 2 columnas */}
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
                placeholder="Ej: Casco Moto Integral..." 
                className="h-12"
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="marca" className="text-base font-medium">Marca y Modelo</Label>
              <Input 
                id="marca" 
                placeholder="Ej: LS2 FF352..." 
                className="h-12"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costo" className="text-base font-medium">Costo de compra ($)</Label>
                <Input 
                  id="costo" 
                  type="number"
                  placeholder="Ej: 25000" 
                  className="h-12"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rentabilidad" className="text-base font-medium">Rentabilidad (%)</Label>
                <Input 
                  id="rentabilidad" 
                  type="number"
                  placeholder="Ej: 40" 
                  className="h-12"
                  value={rentabilidad}
                  onChange={(e) => setRentabilidad(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="urlFoto" className="text-base font-medium">URL de la Imagen Pública</Label>
              <Input 
                id="urlFoto" 
                placeholder="Ej: https://misitio.com/foto.jpg" 
                className="h-12"
                value={urlFoto}
                onChange={(e) => setUrlFoto(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="caracteristicas" className="text-base font-medium">Características Claves / Extras</Label>
              <Textarea 
                id="caracteristicas" 
                placeholder="Ej: Color negro mate, talle L..." 
                rows={3}
                className="resize-none"
                value={caracteristicas}
                onChange={(e) => setCaracteristicas(e.target.value)}
              />
            </div>

            <Button 
              onClick={handleGenerarConIA}
              disabled={isLoading || !producto || !costo || !urlFoto}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-12 text-lg mt-4 disabled:bg-gray-400"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Procesando en n8n...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Generar con IA
                </>
              )}
            </Button>
            
          </CardContent>
        </Card>

        {/* COLUMNA DERECHA: Resultados de la IA */}
        <Card className="shadow-md border-gray-200">
          <CardHeader>
            <CardTitle>Resultados Generados</CardTitle>
            <CardDescription>
              Aquí aparecerán los textos listos para copiar y publicar en Mercado Libre.
            </CardDescription>
          </CardHeader>
          <CardContent>
            
            {/* Si NO hay resultados y NO está cargando, mostramos el estado vacío */}
            {!resultadoIa && !isLoading && (
              <div className="flex flex-col items-center justify-center h-[420px] text-gray-400 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                <Sparkles className="h-14 w-14 mb-4 text-gray-300" />
                <p className="text-center px-8 text-lg">
                  Completa los datos a la izquierda y presiona "Generar con IA".
                </p>
              </div>
            )}

            {/* Si ESTÁ cargando, mostramos un indicador */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-[420px] text-gray-500 bg-gray-50/50 rounded-lg">
                <Loader2 className="h-14 w-14 mb-4 animate-spin text-rose-500" />
                <p className="text-center px-8 text-lg">
                  La IA está analizando la imagen y redactando...
                </p>
              </div>
            )}

            {/* Si HAY resultados, los mostramos */}
            {resultadoIa && !isLoading && (
              <div className="space-y-6">
                
                {urlFoto && (
                  <div className="flex justify-center mb-4">
                    <img src={urlFoto} alt="Preview" className="h-32 object-contain rounded-md border p-1" />
                  </div>
                )}

                <div>
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Título (Máx 60 car.)</Label>
                  <div className="p-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-md font-medium text-lg mt-1">
                    {resultadoIa.title}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Precio Final Sugerido</Label>
                    <div className="p-3 bg-green-50 text-green-900 border border-green-200 rounded-md font-bold text-xl mt-1">
                      $ {resultadoIa.price?.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Marca</Label>
                    <div className="p-3 bg-gray-50 text-gray-900 border border-gray-200 rounded-md font-medium text-lg mt-1">
                      {resultadoIa.brand}
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción Vendedora</Label>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md whitespace-pre-wrap text-gray-700 mt-1 h-48 overflow-y-auto">
                    {resultadoIa.description}
                  </div>
                </div>

              </div>
            )}

          </CardContent>
        </Card>

      </div>
    </div>
  );
}
