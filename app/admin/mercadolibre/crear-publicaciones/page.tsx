"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Loader2, 
  UploadCloud, 
  CheckCircle2, 
  Image as ImageIcon, 
  Layers 
} from "lucide-react";
import Link from "next/link";

export default function CrearPublicacionesPage() {
  // ==========================================
  // ESTADO NUEVO: CONTROL DE PANTALLAS (PASOS)
  // ==========================================
  const [currentStep, setCurrentStep] = useState(1);

  // ==========================================
  // 1. ESTADOS: PASO 1 (IMÁGENES)
  // ==========================================
  const [foto1, setFoto1] = useState("");
  const [foto2, setFoto2] = useState("");
  const [urlFoto, setUrlFoto] = useState(""); // Esta es la foto PRINCIPAL/PORTADA
  
  const [fotoExtra1, setFotoExtra1] = useState(""); 
  const [fotoExtra2, setFotoExtra2] = useState("");

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
    const WEBHOOK_FOTOS = "https://n8n.revolucionmotos.tech/webhook/prueba-imagenes";

    try {
      const response = await fetch(WEBHOOK_FOTOS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_1: foto1, foto_2: foto2 }),
      });

      if (!response.ok) throw new Error("Error al procesar fotos en n8n");

      const data = await response.json();
      
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
    // Al apretar generar, pasamos automáticamente a la pantalla 3 para ver la carga
    setCurrentStep(3); 
    setIsLoading(true);
    setIaTermino(false);
    setPublicacionExitosa(false);

    const WEBHOOK_GENERAR = "https://n8n.revolucionmotos.tech/webhook/generar-publicacion";

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
      setCurrentStep(2); // Si hay error, volvemos al paso 2
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
    const WEBHOOK_PUBLICAR = "https://n8n.revolucionmotos.tech/webhook/subir_publicaciones";

    const arregloImagenes = [{ source: urlFoto }];
    
    if (fotoExtra1.trim() !== "") {
      arregloImagenes.push({ source: fotoExtra1.trim() });
    }
    
    if (fotoExtra2.trim() !== "") {
      arregloImagenes.push({ source: fotoExtra2.trim() });
    }

    const payloadFinal = {
      title: resTitulo,
      price: Number(resPrecio),
      brand: resMarca,
      description: resDescripcion,
      category_id: resCategoria,
      available_quantity: Number(resStock),
      pictures: arregloImagenes 
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
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* CABECERA GENERAL */}
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Gestión Mercado Libre
          </Button>
        </Link>
      </div>
      
      <div className="flex flex-col items-center text-center mt-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 justify-center">
          <Sparkles className="h-8 w-8 text-rose-500" />
          Fábrica de Publicaciones
        </h1>
        <p className="text-gray-500 text-lg mt-2">
          Paso {currentStep} de 3
        </p>
      </div>

      {/* INDICADOR DE PROGRESO (STEPPER) */}
      <div className="flex items-center justify-center mb-10">
        <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
          <div className={`rounded-full h-8 w-8 flex items-center justify-center border-2 ${currentStep >= 1 ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>1</div>
          <span className="ml-2 hidden sm:block">Imágenes</span>
        </div>
        <div className={`w-12 sm:w-24 h-1 mx-2 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
        
        <div className={`flex items-center ${currentStep >= 2 ? 'text-rose-600 font-bold' : 'text-gray-400'}`}>
          <div className={`rounded-full h-8 w-8 flex items-center justify-center border-2 ${currentStep >= 2 ? 'border-rose-600 bg-rose-50' : 'border-gray-300'}`}>2</div>
          <span className="ml-2 hidden sm:block">Datos</span>
        </div>
        <div className={`w-12 sm:w-24 h-1 mx-2 ${currentStep >= 3 ? 'bg-green-600' : 'bg-gray-200'}`}></div>
        
        <div className={`flex items-center ${currentStep >= 3 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
          <div className={`rounded-full h-8 w-8 flex items-center justify-center border-2 ${currentStep >= 3 ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}>3</div>
          <span className="ml-2 hidden sm:block">Revisión</span>
        </div>
      </div>


      {/* CONTENEDOR DE PANTALLAS */}
      <div className="mt-4">
        
        {/* ==============================================
            PANTALLA 1: PREPARAR IMÁGENES
            ============================================== */}
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-t-4 border-t-blue-500 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-blue-500" /> 
                  Paso 1: Preparar las Imágenes
                </CardTitle>
                <CardDescription>Pega una URL lista, procesa con n8n, y agrega fotos extra.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                  <Label className="text-blue-800 font-semibold">Herramienta: Unir 2 Fotos (Workflow 2)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="space-y-2">
                    <Label className="font-bold text-gray-800 text-base">Foto de Portada (Principal) *</Label>
                    <p className="text-sm text-gray-500">Si uniste fotos arriba, esto se llenará solo. Sino, pega tu URL aquí.</p>
                    <Input 
                      placeholder="Ej: https://misitio.com/foto-portada.jpg" 
                      className="h-12 border-blue-200 focus-visible:ring-blue-500 font-medium text-lg" 
                      value={urlFoto} 
                      onChange={(e) => setUrlFoto(e.target.value)} 
                    />
                  </div>

                  <div className="space-y-3 bg-gray-50 p-4 rounded-md border border-gray-200 mt-4">
                    <Label className="font-semibold text-gray-700">Fotos Adicionales (Opcionales)</Label>
                    <p className="text-sm text-gray-500">Mercado Libre pide hasta 3 fotos. Agrega URLs extra aquí para acompañar la portada.</p>
                    <div className="grid grid-cols-1 gap-3">
                      <Input 
                        placeholder="URL Foto extra 1..." 
                        className="bg-white h-12"
                        value={fotoExtra1} 
                        onChange={(e) => setFotoExtra1(e.target.value)} 
                      />
                      <Input 
                        placeholder="URL Foto extra 2..." 
                        className="bg-white h-12"
                        value={fotoExtra2} 
                        onChange={(e) => setFotoExtra2(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <Button 
                    onClick={() => setCurrentStep(2)} 
                    className="bg-gray-900 hover:bg-gray-800 text-white h-12 px-8 text-lg"
                  >
                    Siguiente: Datos del Producto <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>

              </CardContent>
            </Card>
          </div>
        )}

        {/* ==============================================
            PANTALLA 2: DATOS DEL PRODUCTO
            ============================================== */}
        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <Card className="border-t-4 border-t-rose-500 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-rose-500" />
                  Paso 2: Datos del Producto
                </CardTitle>
                <CardDescription>Información detallada para que la IA arme la publicación.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                <div className="space-y-2">
                  <Label className="text-base">¿Qué producto es?</Label>
                  <Input placeholder="Ej: Casco Moto Integral..." className="h-12 text-lg" value={producto} onChange={(e) => setProducto(e.target.value)} />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-base">Marca y Modelo</Label>
                  <Input placeholder="Ej: LS2 FF352..." className="h-12 text-lg" value={marca} onChange={(e) => setMarca(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-base">Costo de compra ($)</Label>
                    <Input type="number" placeholder="Ej: 50000" className="h-12 text-lg" value={costo} onChange={(e) => setCosto(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Rentabilidad (%)</Label>
                    <Input type="number" placeholder="Ej: 60" className="h-12 text-lg" value={rentabilidad} onChange={(e) => setRentabilidad(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base">Características Claves / Extras</Label>
                  <Textarea placeholder="Ej: Color negro mate, talle L..." rows={4} className="resize-none text-lg" value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} />
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                  <Button 
                    variant="outline"
                    onClick={() => setCurrentStep(1)} 
                    className="h-12 px-6"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
                  </Button>

                  <Button 
                    onClick={handleGenerarConIA}
                    disabled={!producto || !costo || !urlFoto}
                    className="bg-rose-600 hover:bg-rose-700 text-white gap-2 h-12 px-8 text-lg shadow-md disabled:bg-gray-300"
                  >
                    <Sparkles className="h-5 w-5" /> Generar con IA y Continuar
                  </Button>
                </div>
                
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==============================================
            PANTALLA 3: REVISIÓN Y PUBLICACIÓN
            ============================================== */}
        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <Card className="shadow-md border-t-4 border-t-green-500 h-full">
              <CardHeader className="pb-3 border-b border-gray-100 mb-4 bg-gray-50 rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-green-600" />
                  Paso 3: Revisión y Publicación
                </CardTitle>
                <CardDescription>Corrige los textos generados y sube a ML (Workflow 3).</CardDescription>
              </CardHeader>
              <CardContent>
                
                {/* ESTADOS DE ESPERA Y ÉXITO */}
                {isLoading && (
                  <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
                    <Loader2 className="h-14 w-14 mb-4 animate-spin text-rose-500" />
                    <h3 className="text-xl font-bold mb-2">La IA está trabajando...</h3>
                    <p className="text-center px-8">Redactando título, descripción y calculando precios. Esto tomará unos segundos.</p>
                  </div>
                )}

                {publicacionExitosa && (
                  <div className="flex flex-col items-center justify-center h-[400px] text-green-600 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 className="h-16 w-16 mb-4 text-green-500" />
                    <h3 className="text-2xl font-bold mb-2">¡Enviado a n8n!</h3>
                    <p className="text-center px-8 text-lg text-green-700">
                      Tu publicación está en camino a Mercado Libre.
                    </p>
                    <Button 
                      className="mt-6 bg-green-600 text-white hover:bg-green-700" 
                      onClick={() => window.location.reload()}
                    >
                      Crear nueva publicación
                    </Button>
                  </div>
                )}

                {/* RESULTADOS (INPUTS EDITABLES) */}
                {iaTermino && !isLoading && !publicacionExitosa && (
                  <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                    
                    {urlFoto && (
                      <div className="flex justify-center mb-6">
                        <img src={urlFoto} alt="Preview Final" className="h-40 object-contain rounded-md border p-1 bg-white shadow-sm" />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Título (Máx 60 car.)</Label>
                      <Input className="h-12 text-lg font-medium text-blue-900 bg-blue-50/50 border-blue-200" value={resTitulo} onChange={(e) => setResTitulo(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-gray-500 uppercase">Precio Final ($)</Label>
                        <Input type="number" className="h-12 text-lg font-bold text-green-700 bg-green-50/50 border-green-200" value={resPrecio} onChange={(e) => setResPrecio(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-gray-500 uppercase">Marca</Label>
                        <Input className="h-12 text-lg font-medium text-gray-900 bg-gray-50" value={resMarca} onChange={(e) => setResMarca(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-orange-600 uppercase">
                          Categoría ML * {nombreCategoria && <span className="text-gray-500 normal-case ml-2">({nombreCategoria})</span>}
                        </Label>
                        <Input placeholder="Ej: MLA3530" className="h-12 text-lg border-orange-200 focus-visible:ring-orange-500 font-medium" value={resCategoria} onChange={(e) => setResCategoria(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-gray-500 uppercase">Stock Inicial</Label>
                        <Input type="number" className="h-12 text-lg" value={resStock} onChange={(e) => setResStock(e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Descripción Vendedora</Label>
                      <Textarea rows={10} className="bg-gray-50 resize-y text-base p-4" value={resDescripcion} onChange={(e) => setResDescripcion(e.target.value)} />
                    </div>

                    <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-200">
                      <Button 
                        variant="outline"
                        onClick={() => setCurrentStep(2)} 
                        className="h-14 px-6 text-lg"
                      >
                        <ArrowLeft className="mr-2 h-5 w-5" /> Volver a Datos
                      </Button>

                      <Button 
                        onClick={handlePublicar}
                        disabled={isPublishing || !resTitulo || !resPrecio}
                        className="bg-green-600 hover:bg-green-700 text-white gap-2 h-14 px-8 text-xl shadow-lg disabled:bg-green-300 transition-all"
                      >
                        {isPublishing ? (
                          <><Loader2 className="h-6 w-6 animate-spin" /> Subiendo a ML...</>
                        ) : (
                          <><UploadCloud className="h-6 w-6" /> Aprobar y Publicar en ML</>
                        )}
                      </Button>
                    </div>

                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
