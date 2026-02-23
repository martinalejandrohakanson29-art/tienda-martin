"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Send, Loader2, UploadCloud, CheckCircle2, Image as ImageIcon, Layers } from "lucide-react";
import Link from "next/link";

export default function CrearPublicacionesPage() {
  // ==========================================
  // 1. ESTADOS: PASO 1 (IMÁGENES)
  // ==========================================
  const [foto1, setFoto1] = useState("");
  const [foto2, setFoto2] = useState("");
  const [urlFoto, setUrlFoto] = useState(""); // Esta es la foto FINAL que se usará
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // ==========================================
  // 2. ESTADOS: PASO 2 (BORRADOR BASE)
  // ==========================================
  const [producto, setProducto] = useState("");
  const [marca, setMarca] = useState("");
  const [caracteristicas, setCaracteristicas] = useState("");
  const [costo, setCosto] = useState("");
  const [rentabilidad, setRentabilidad] = useState("60");

  // ==========================================
  // 3. ESTADOS: PASO 3 (REVISIÓN DE IA)
  // ==========================================
  const [resTitulo, setResTitulo] = useState("");
  const [resPrecio, setResPrecio] = useState("");
  const [resMarca, setResMarca] = useState("");
  const [resDescripcion, setResDescripcion] = useState("");
  const [resCategoria, setResCategoria] = useState("");
  const [nombreCategoria, setNombreCategoria] = useState("");
  const [resStock, setResStock] = useState("1");

  // ESTADOS DE CONTROL DE PANTALLA
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [iaTermino, setIaTermino] = useState(false);
  const [publicacionExitosa, setPublicacionExitosa] = useState(false);

  // ==========================================
  // FUNCIÓN: WORKFLOW 2 (PROCESAR FOTOS)
  // ==========================================
  const handleProcesarFotos = async () => {
    setIsProcessingImage(true);
    // URL de tu webhook de Edición de Fotos en n8n
    const WEBHOOK_FOTOS = "https://n8n-on-render-production-52f0.up.railway.app/webhook/prueba-imagenes"; 

    try {
      const response = await fetch(WEBHOOK_FOTOS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Enviamos las dos fotos para que n8n las una/procese
        body: JSON.stringify({ foto_1: foto1, foto_2: foto2 }),
      });

      if (!response.ok) throw new Error("Error al procesar fotos en n8n");

      const data = await response.json();
      
      // Asumimos que n8n nos devuelve un JSON con { "url_final": "https://..." }
      // (Asegúrate de configurar el nodo "Respond to Webhook" en n8n para devolver esto)
      if (data.url_final) {
        setUrlFoto(data.url_final);
        alert("¡Foto procesada con éxito!");
      } else {
        alert("n8n no devolvió la URL final. Revisa la respuesta del webhook.");
      }

    } catch (error) {
      console.error("Hubo un error con las fotos:", error);
      alert("Error al editar las fotos.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  // ==========================================
  // FUNCIÓN: WORKFLOW 1 (GENERAR BORRADOR)
  // ==========================================
  const handleGenerarConIA = async () => {
    setIsLoading(true);
    setIaTermino(false);
    setPublicacionExitosa(false);

    const WEBHOOK_GENERAR = "https://n8n-on-render-production-52f0.up.railway.app/webhook/generar-publicacion"; 

    const borrador_titulo = `${producto} ${marca}. Características: ${caracteristicas}`;
    const payload = {
      borrador_titulo: borrador_titulo,
      costo_producto: Number(costo),
      rentabilidad_esperada_porcentaje: Number(rentabilidad),
      url_foto: urlFoto, // Usamos la foto final (ya sea pegada a mano o procesada)
    };

    try {
      const response = await fetch(WEBHOOK_GENERAR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Error al conectar con n8n");

      const data = await response.json();
      
      setResTitulo(data.title || "");
      setResPrecio(data.price || "");
      setResMarca(data.brand || "");
      setResDescripcion(data.description || "");
      setResCategoria(data.category_id || "");
      setNombreCategoria(data.category_name || "");
      
      setIaTermino(true); 

    } catch (error) {
      console.error("Hubo un error:", error);
      alert("Error al generar los textos. Revisa n8n.");
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // FUNCIÓN: WORKFLOW 3 (SUBIR A MERCADO LIBRE)
  // ==========================================
  const handlePublicar = async () => {
    if (!resCategoria) {
      alert("Por favor, ingresa el ID de la Categoría (Ej: MLA3530) antes de publicar.");
      return;
    }

    setIsPublishing(true);
    const WEBHOOK_PUBLICAR = "https://n8n-on-render-production-52f0.up.railway.app/webhook/subir_publicaciones";

    const payloadFinal = {
      title: resTitulo,
      price: Number(resPrecio),
      brand: resMarca,
      description: resDescripcion,
      category_id: resCategoria,
      available_quantity: Number(resStock),
      pictures: [{ source: urlFoto }]
    };

    try {
      const response = await fetch(WEBHOOK_PUBLICAR, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFinal),
      });

      if (!response.ok) throw new Error("Error al enviar a publicar");
      setPublicacionExitosa(true);

    } catch (error) {
      console.error("Error al publicar:", error);
      alert("Hubo un problema al enviar la publicación a n8n.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* CABECERA */}
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
          Fábrica de Publicaciones
        </h1>
      </div>
      <p className="text-gray-500 text-lg">
        Sigue los 3 pasos para procesar tu imagen, generar los textos con IA y publicar en Mercado Libre.
      </p>

      {/* CONTENEDOR PRINCIPAL: GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4">
        
        {/* COLUMNA IZQUIERDA: PASOS 1 Y 2 */}
        <div className="space-y-6">
          
          {/* --- PASO 1: LA IMAGEN --- */}
          <Card className="border-t-4 border-t-blue-500 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-500" /> 
                Paso 1: Preparar la Imagen
              </CardTitle>
              <CardDescription>Pega una URL lista, o procesa dos imágenes con n8n.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                <Label className="text-blue-800 font-semibold">Opción A: Procesar y Unir 2 Fotos (Workflow 2)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input placeholder="URL Foto 1..." value={foto1} onChange={(e) => setFoto1(e.target.value)} />
                  <Input placeholder="URL Foto 2..." value={foto2} onChange={(e) => setFoto2(e.target.value)} />
                </div>
                <Button 
                  onClick={handleProcesarFotos} 
                  disabled={isProcessingImage || (!foto1 && !foto2)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {isProcessingImage ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando en n8n...</> : <><Layers className="h-4 w-4" /> Unir fotos con n8n</>}
                </Button>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <Label className="font-semibold">Opción B: URL Final de la Imagen (Directa)</Label>
                <p className="text-xs text-gray-500">Si procesaste las fotos arriba, este campo se llenará solo. Si ya tienes una foto lista, simplemente pégala aquí.</p>
                <Input 
                  placeholder="Ej: https://misitio.com/foto-lista.jpg" 
                  className="h-12 border-blue-200 focus-visible:ring-blue-500 font-medium" 
                  value={urlFoto} 
                  onChange={(e) => setUrlFoto(e.target.value)} 
                />
              </div>

            </CardContent>
          </Card>

          {/* --- PASO 2: LOS DATOS BASE --- */}
          <Card className="border-t-4 border-t-rose-500 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-rose-500" />
                Paso 2: Datos del Producto
              </CardTitle>
              <CardDescription>Información para crear el borrador (Workflow 1).</CardDescription>
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
                <Label>Características Claves / Extras</Label>
                <Textarea placeholder="Ej: Color negro mate, talle L..." rows={3} className="resize-none" value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} />
              </div>

              <Button 
                onClick={handleGenerarConIA}
                disabled={isLoading || !producto || !costo || !urlFoto}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white gap-2 h-12 text-lg mt-4 disabled:bg-gray-400"
              >
                {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Pensando...</> : <><Sparkles className="h-5 w-5" /> Generar Textos con IA</>}
              </Button>
              
            </CardContent>
          </Card>

        </div>

        {/* COLUMNA DERECHA: PASO 3 (RESULTADOS) */}
        <div>
          <Card className="shadow-md border-gray-200 h-full">
            <CardHeader className="pb-3 border-b border-gray-100 mb-4 bg-gray-50 rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-green-600" />
                Paso 3: Revisión y Publicación
              </CardTitle>
              <CardDescription>Corrige los textos generados y sube a ML (Workflow 3).</CardDescription>
            </CardHeader>
            <CardContent>
              
              {/* ESTADOS DE ESPERA Y ÉXITO */}
              {!iaTermino && !isLoading && !publicacionExitosa && (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  <Sparkles className="h-14 w-14 mb-4 text-gray-300" />
                  <p className="text-center px-8 text-lg">Completa los pasos 1 y 2 para ver los resultados aquí.</p>
                </div>
              )}

              {isLoading && (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-500">
                  <Loader2 className="h-14 w-14 mb-4 animate-spin text-rose-500" />
                  <p className="text-center px-8 text-lg">La IA está redactando tu publicación...</p>
                </div>
              )}

              {publicacionExitosa && (
                <div className="flex flex-col items-center justify-center h-[500px] text-green-600 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="h-16 w-16 mb-4 text-green-500" />
                  <h3 className="text-2xl font-bold mb-2">¡Enviado a n8n!</h3>
                  <p className="text-center px-8 text-lg text-green-700">
                    Tu publicación está en camino a Mercado Libre.
                  </p>
                  <Button variant="outline" className="mt-6 border-green-600 text-green-700 hover:bg-green-100" onClick={() => window.location.reload()}>
                    Crear otra publicación
                  </Button>
                </div>
              )}

              {/* RESULTADOS (INPUTS EDITABLES) */}
              {iaTermino && !isLoading && !publicacionExitosa && (
                <div className="space-y-5 animate-in fade-in zoom-in duration-300">
                  
                  {urlFoto && (
                    <div className="flex justify-center mb-4">
                      <img src={urlFoto} alt="Preview Final" className="h-32 object-contain rounded-md border p-1 bg-white shadow-sm" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Título (Máx 60 car.)</Label>
                    <Input className="font-medium text-blue-900 bg-blue-50/50 border-blue-200" value={resTitulo} onChange={(e) => setResTitulo(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Precio Final ($)</Label>
                      <Input type="number" className="font-bold text-green-700 bg-green-50/50 border-green-200" value={resPrecio} onChange={(e) => setResPrecio(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Marca</Label>
                      <Input className="font-medium text-gray-900 bg-gray-50" value={resMarca} onChange={(e) => setResMarca(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-orange-600 uppercase">
                        Categoría ML * {nombreCategoria && <span className="text-gray-500 normal-case ml-2">({nombreCategoria})</span>}
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
                    <Textarea rows={8} className="bg-gray-50 resize-y" value={resDescripcion} onChange={(e) => setResDescripcion(e.target.value)} />
                  </div>

                  {/* BOTÓN DE PUBLICACIÓN */}
                  <Button 
                    onClick={handlePublicar}
                    disabled={isPublishing || !resTitulo || !resPrecio}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-14 text-xl mt-6 shadow-lg disabled:bg-rose-300 transition-all"
                  >
                    {isPublishing ? (
                      <><Loader2 className="h-6 w-6 animate-spin" /> Subiendo a ML...</>
                    ) : (
                      <><UploadCloud className="h-6 w-6" /> Aprobar y Publicar en ML</>
                    )}
                  </Button>

                </div>
              )}

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
