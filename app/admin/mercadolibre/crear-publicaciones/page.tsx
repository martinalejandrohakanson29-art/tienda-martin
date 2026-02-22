"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Send, Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function CrearPublicacionesPage() {
  // 1. ESTADOS DEL FORMULARIO BASE (Lo que le enviamos a la IA)
  const [producto, setProducto] = useState("");
  const [marca, setMarca] = useState("");
  const [caracteristicas, setCaracteristicas] = useState("");
  const [costo, setCosto] = useState("");
  const [rentabilidad, setRentabilidad] = useState("60");
  const [urlFoto, setUrlFoto] = useState("");

  // 2. ESTADOS DE LOS RESULTADOS EDITABLES (Lo que nos devuelve la IA y podemos modificar)
  const [resTitulo, setResTitulo] = useState("");
  const [resPrecio, setResPrecio] = useState("");
  const [resMarca, setResMarca] = useState("");
  const [resDescripcion, setResDescripcion] = useState("");
  const [resCategoria, setResCategoria] = useState(""); // Ej: MLA3530
  const [nombreCategoria, setNombreCategoria] = useState(""); // Ej: Cilindros
  const [resStock, setResStock] = useState("1"); // Por defecto 1 unidad

  // 3. ESTADOS DE CONTROL DE PANTALLA
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [iaTermino, setIaTermino] = useState(false);
  const [publicacionExitosa, setPublicacionExitosa] = useState(false);

  // --- FUNCIÓN 1: PEDIRLE A LA IA QUE REDACTE ---
  const handleGenerarConIA = async () => {
    setIsLoading(true);
    setIaTermino(false);
    setPublicacionExitosa(false);

    // URL de tu n8n en Railway para la Fase 1 (Generador)
    const WEBHOOK_GENERAR = "https://n8n-on-render-production-52f0.up.railway.app/webhook/generar-publicacion"; 

    const borrador_titulo = `${producto} ${marca}. Características: ${caracteristicas}`;
    const payload = {
      borrador_titulo: borrador_titulo,
      costo_producto: Number(costo),
      rentabilidad_esperada_porcentaje: Number(rentabilidad),
      url_foto: urlFoto,
    };

    try {
      const response = await fetch(WEBHOOK_GENERAR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Error al conectar con n8n");

      const data = await response.json();
      
      // Guardamos los datos de la IA en variables que el usuario puede editar
      setResTitulo(data.title || "");
      setResPrecio(data.price || "");
      setResMarca(data.brand || "");
      setResDescripcion(data.description || "");
      setResCategoria(data.category_id || ""); // Se llena con el código MLA de la API
      setNombreCategoria(data.category_name || ""); // Se llena con el nombre de la categoría
      
      setIaTermino(true); // Cambiamos la pantalla para mostrar los inputs

    } catch (error) {
      console.error("Hubo un error:", error);
      alert("Error al generar los textos. Revisa n8n.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNCIÓN 2: ENVIAR A MERCADO LIBRE ---
  const handlePublicar = async () => {
    // Validación básica antes de publicar
    if (!resCategoria) {
      alert("Por favor, ingresa el ID de la Categoría (Ej: MLA3530) antes de publicar.");
      return;
    }

    setIsPublishing(true);

    // URL de tu n8n en Railway para la Fase 3 (Publicador)
    const WEBHOOK_PUBLICAR = "https://n8n-on-render-production-52f0.up.railway.app/webhook/subir_publicaciones";

    // Empaquetamos los datos finales, ya revisados y corregidos por ti
    const payloadFinal = {
      title: resTitulo,
      price: Number(resPrecio),
      brand: resMarca,
      description: resDescripcion,
      category_id: resCategoria,
      available_quantity: Number(resStock),
      pictures: [{ source: urlFoto }] // Pasamos la URL de la foto original
    };

    try {
      const response = await fetch(WEBHOOK_PUBLICAR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFinal),
      });

      if (!response.ok) throw new Error("Error al enviar a publicar");

      // Si todo salió bien, mostramos mensaje de éxito
      setPublicacionExitosa(true);

    } catch (error) {
      console.error("Error al publicar:", error);
      alert("Hubo un problema al enviar la publicación a n8n.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
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
        Ingresa los datos del producto para que el agente genere la publicación. Revisa, edita y publica.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        
        {/* === COLUMNA IZQUIERDA: FORMULARIO BASE === */}
        <Card className="border-t-4 border-t-rose-500 shadow-md h-fit">
          <CardHeader>
            <CardTitle>1. Datos Base del Producto</CardTitle>
            <CardDescription>Información cruda para la IA.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            
            <div className="space-y-2">
              <Label>¿Qué producto es?</Label>
              <Input placeholder="Ej: Casco Moto Integral..." className="h-12" value={producto} onChange={(e) => setProducto(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <Label>Marca y Modelo</Label>
              <Input placeholder="Ej: LS2 FF352..." className="h-12" value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Costo de compra ($)</Label>
                <Input type="number" placeholder="Ej: 50000" className="h-12" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Rentabilidad (%)</Label>
                <Input type="number" placeholder="Ej: 60" className="h-12" value={rentabilidad} onChange={(e) => setRentabilidad(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>URL de la Imagen Pública</Label>
              <Input placeholder="Ej: https://misitio.com/foto.jpg" className="h-12" value={urlFoto} onChange={(e) => setUrlFoto(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Características Claves / Extras</Label>
              <Textarea placeholder="Ej: Color negro mate, talle L..." rows={3} className="resize-none" value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} />
            </div>

            <Button 
              onClick={handleGenerarConIA}
              disabled={isLoading || !producto || !costo || !urlFoto}
              className="w-full bg-gray-800 hover:bg-gray-900 text-white gap-2 h-12 text-lg mt-4 disabled:bg-gray-400"
            >
              {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Pensando...</> : <><Sparkles className="h-5 w-5" /> Redactar con IA</>}
            </Button>
            
          </CardContent>
        </Card>

        {/* === COLUMNA DERECHA: REVISIÓN Y PUBLICACIÓN === */}
        <Card className="shadow-md border-gray-200">
          <CardHeader>
            <CardTitle>2. Revisión y Aprobación</CardTitle>
            <CardDescription>Corrige los textos generados y envíalos a Mercado Libre.</CardDescription>
          </CardHeader>
          <CardContent>
            
            {/* ESTADO VACÍO */}
            {!iaTermino && !isLoading && !publicacionExitosa && (
              <div className="flex flex-col items-center justify-center h-[500px] text-gray-400 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                <Sparkles className="h-14 w-14 mb-4 text-gray-300" />
                <p className="text-center px-8 text-lg">Completa los datos a la izquierda para generar el borrador.</p>
              </div>
            )}

            {/* ESTADO CARGANDO IA */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-[500px] text-gray-500 bg-gray-50/50 rounded-lg border border-gray-100">
                <Loader2 className="h-14 w-14 mb-4 animate-spin text-rose-500" />
                <p className="text-center px-8 text-lg">Optimizando publicación...</p>
              </div>
            )}

            {/* ESTADO ÉXITO PUBLICACIÓN */}
            {publicacionExitosa && (
              <div className="flex flex-col items-center justify-center h-[500px] text-green-600 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 className="h-16 w-16 mb-4 text-green-500" />
                <h3 className="text-2xl font-bold mb-2">¡Datos enviados!</h3>
                <p className="text-center px-8 text-lg text-green-700">
                  La publicación fue enviada exitosamente a n8n para ser subida a Mercado Libre.
                </p>
                <Button variant="outline" className="mt-6 border-green-600 text-green-700 hover:bg-green-100" onClick={() => window.location.reload()}>
                  Crear otra publicación
                </Button>
              </div>
            )}

            {/* ESTADO REVISIÓN (INPUTS EDITABLES) */}
            {iaTermino && !isLoading && !publicacionExitosa && (
              <div className="space-y-5 animate-in fade-in zoom-in duration-300">
                
                {urlFoto && (
                  <div className="flex justify-center mb-2">
                    <img src={urlFoto} alt="Preview" className="h-24 object-contain rounded-md border p-1 bg-white shadow-sm" />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Título (Máx 60 car.)</Label>
                  <Input className="font-medium text-blue-900 bg-blue-50/50 border-blue-200" value={resTitulo} onChange={(e) => setResTitulo(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Precio Final Sugerido</Label>
                    <Input type="number" className="font-bold text-green-700 bg-green-50/50 border-green-200" value={resPrecio} onChange={(e) => setResPrecio(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Marca Extraída</Label>
                    <Input className="font-medium text-gray-900 bg-gray-50" value={resMarca} onChange={(e) => setResMarca(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-orange-600 uppercase">
                      ID Categoría ML * {nombreCategoria && <span className="text-gray-500 normal-case ml-2">({nombreCategoria})</span>}
                    </Label>
                    <Input placeholder="Ej: MLA3530" className="border-orange-200 focus-visible:ring-orange-500 font-medium" value={resCategoria} onChange={(e) => setResCategoria(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Stock Inicial</Label>
                    <Input type="number" value={resStock} onChange={(e) => setResStock(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-gray-500 uppercase">Descripción Vendedora</Label>
                  <Textarea rows={6} className="bg-gray-50 resize-y" value={resDescripcion} onChange={(e) => setResDescripcion(e.target.value)} />
                </div>

                {/* BOTÓN DE PUBLICACIÓN */}
                <Button 
                  onClick={handlePublicar}
                  disabled={isPublishing || !resTitulo || !resPrecio}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-14 text-xl mt-4 shadow-lg disabled:bg-rose-300 transition-all"
                >
                  {isPublishing ? (
                    <><Loader2 className="h-6 w-6 animate-spin" /> Conectando con Mercado Libre...</>
                  ) : (
                    <><UploadCloud className="h-6 w-6" /> Aprobar y Publicar</>
                  )}
                </Button>

              </div>
            )}

          </CardContent>
        </Card>

      </div>
    </div>
  );
}
