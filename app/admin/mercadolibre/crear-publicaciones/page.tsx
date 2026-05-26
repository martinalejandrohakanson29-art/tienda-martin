"use client";

import { useState, useEffect } from "react";
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
  Layers,
  Calculator,
  DollarSign,
  Percent,
  Search,
  Trash2,
  Database,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { getArticulosParaPrecio } from "@/app/actions/costos";
import { createProductWithRecipe } from "@/app/actions/kits";
import { createManualProduct } from "@/app/actions/ml-maestros";

interface Articulo {
  id: number | string;
  id_articulo: string;
  descripcion: string | null;
  costo_final_ars: number;
  isKit: boolean;
  fuente: "catalogo" | "mostrador";
}

interface SelectedItem extends Articulo {
  cantidad: number;
}

interface MLResponseData {
  id: string;
  family_id: string;
  user_product_id: string;
  permalink: string;
}

export default function CrearPublicacionesPage() {
  // ==========================================
  // CONTROL DE PASOS
  // ==========================================
  const [currentStep, setCurrentStep] = useState(1);

  // ==========================================
  // PASO 1: IMÁGENES
  // ==========================================
  const [foto1, setFoto1] = useState("");
  const [foto2, setFoto2] = useState("");
  const [urlFoto, setUrlFoto] = useState("");
  const [fotoExtra1, setFotoExtra1] = useState("");
  const [fotoExtra2, setFotoExtra2] = useState("");
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // ==========================================
  // PASO 2: DATOS DEL PRODUCTO
  // ==========================================
  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState("");
  const [descripcionCompatibilidad, setDescripcionCompatibilidad] = useState("");
  const [componentesTexto, setComponentesTexto] = useState("");
  const [articuloPrincipal, setArticuloPrincipal] = useState<Articulo | null>(null);
  const [articuloPrincipalSearch, setArticuloPrincipalSearch] = useState("");

  // ==========================================
  // PASO 3: COMPOSICIÓN + PRECIO
  // ==========================================
  const [articulosDb, setArticulosDb] = useState<Articulo[]>([]);
  const [loadingArticulos, setLoadingArticulos] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [costo, setCosto] = useState<number>(0);
  const [ganancia, setGanancia] = useState<number>(50);
  const [cargoML, setCargoML] = useState<number>(14.54);
  const [cargoCuotas, setCargoCuotas] = useState<number>(4);
  const [impuesto, setImpuesto] = useState<number>(2);
  const [envio, setEnvio] = useState<number>(8000);
  const [descuento, setDescuento] = useState<number>(5);

  // ==========================================
  // PASO 4: REVISIÓN + PUBLICACIÓN
  // ==========================================
  const [resTitulo, setResTitulo] = useState("");
  const [resPrecio, setResPrecio] = useState("");
  const [resMarca, setResMarca] = useState("");
  const [resDescripcion, setResDescripcion] = useState("");
  const [resCategoria, setResCategoria] = useState("");
  const [nombreCategoria, setNombreCategoria] = useState("");
  const [resStock, setResStock] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [iaTermino, setIaTermino] = useState(false);
  const [publicacionExitosa, setPublicacionExitosa] = useState(false);

  // ==========================================
  // POST-PUBLICACIÓN: REGISTRO EN BD
  // ==========================================
  const [mlData, setMlData] = useState<MLResponseData>({ id: "", family_id: "", user_product_id: "", permalink: "" });
  const [isRegistering, setIsRegistering] = useState(false);
  const [registradoEnBD, setRegistradoEnBD] = useState(false);

  // Cargar artículos al montar (se usan en paso 2 y paso 3)
  useEffect(() => {
    setLoadingArticulos(true);
    getArticulosParaPrecio()
      .then((data) => setArticulosDb(data as Articulo[]))
      .finally(() => setLoadingArticulos(false));
  }, []);

  // ==========================================
  // CÁLCULOS DE PRECIO (Paso 3)
  // ==========================================
  const subtotalSeleccionados = selectedItems.reduce(
    (acc, item) => acc + item.costo_final_ars * item.cantidad,
    0
  );
  const gananciaNetaTeorica = costo * (1 + ganancia / 100);
  const gananciaEnPesos = gananciaNetaTeorica - costo;
  const retencionesPct = (cargoML + cargoCuotas + impuesto) / 100;
  const divisor = 1 - retencionesPct;
  const precioFinalSinDescuento = divisor > 0 ? (gananciaNetaTeorica + envio) / divisor : 0;
  const precioListaConDescuento = descuento < 100 ? precioFinalSinDescuento / (1 - descuento / 100) : 0;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  // ==========================================
  // MANEJADORES ARTÍCULOS (Paso 3)
  // ==========================================
  const syncCostoTotal = (items: SelectedItem[]) => {
    setCosto(items.reduce((acc, i) => acc + i.costo_final_ars * i.cantidad, 0));
  };

  const handleAddItem = (art: Articulo) => {
    setSelectedItems((prev) => {
      const existing = prev.find((p) => p.id_articulo === art.id_articulo && p.fuente === art.fuente);
      const next = existing
        ? prev.map((p) => (p.id_articulo === art.id_articulo && p.fuente === art.fuente ? { ...p, cantidad: p.cantidad + 1 } : p))
        : [...prev, { ...art, cantidad: 1 }];
      syncCostoTotal(next);
      return next;
    });
    setSearchTerm("");
  };

  const handleRemoveItem = (sku: string, fuente: string) => {
    setSelectedItems((prev) => {
      const next = prev.filter((p) => !(p.id_articulo === sku && p.fuente === fuente));
      syncCostoTotal(next);
      return next;
    });
  };

  const handleUpdateQty = (sku: string, fuente: string, delta: number) => {
    setSelectedItems((prev) => {
      const next = prev.map((p) =>
        p.id_articulo === sku && p.fuente === fuente ? { ...p, cantidad: Math.max(1, p.cantidad + delta) } : p
      );
      syncCostoTotal(next);
      return next;
    });
  };

  const handleUpdateCosto = (sku: string, fuente: string, newCosto: number) => {
    setSelectedItems((prev) => {
      const next = prev.map((p) =>
        p.id_articulo === sku && p.fuente === fuente ? { ...p, costo_final_ars: newCosto } : p
      );
      syncCostoTotal(next);
      return next;
    });
  };

  const filteredArticulos =
    searchTerm.trim() === ""
      ? []
      : articulosDb
          .filter(
            (art) =>
              art.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              art.id_articulo.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 10);

  // ==========================================
  // FUNCIÓN: PROCESAR FOTOS
  // ==========================================
  const handleProcesarFotos = async () => {
    setIsProcessingImage(true);
    try {
      const res = await fetch("https://n8n.revolucionmotos.tech/webhook/prueba-imagenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_1: foto1, foto_2: foto2 }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.url_final) {
        setUrlFoto(data.url_final);
        alert("¡Foto procesada con éxito!");
      } else {
        alert("n8n no devolvió la URL final.");
      }
    } catch {
      alert("Error al editar las fotos.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  // ==========================================
  // FUNCIÓN: GENERAR CON IA (Paso 3→4)
  // ==========================================
  const handleGenerarConIA = async () => {
    setCurrentStep(4);
    setIsLoading(true);
    setIaTermino(false);
    setPublicacionExitosa(false);
    // Precio calculado en paso 3 → se pre-llena; la IA no determina el precio
    setResPrecio(String(Math.round(precioFinalSinDescuento)));

    try {
      const res = await fetch("https://n8n.revolucionmotos.tech/webhook/generar-publicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          descripcion_compatibilidad: descripcionCompatibilidad,
          marca,
          componentes: componentesTexto,
          url_foto: urlFoto,
          articulo_principal: articuloPrincipal
            ? (articuloPrincipal.descripcion || articuloPrincipal.id_articulo)
            : "",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      setResTitulo(data.title || "");
      setResMarca(data.brand || marca);
      setResDescripcion(data.description || "");
      setResCategoria(data.category_id || "");
      setNombreCategoria(data.category_name || "");
      // resPrecio ya fue seteado con el valor calculado; no lo pisamos con data.price
      setIaTermino(true);
    } catch {
      alert("Error al generar los textos. Revisa n8n.");
      setCurrentStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // FUNCIÓN: PUBLICAR EN ML
  // ==========================================
  const handlePublicar = async () => {
    if (!resCategoria) {
      alert("Por favor ingresa el ID de Categoría (Ej: MLA3530) antes de publicar.");
      return;
    }
    setIsPublishing(true);

    const imagenes = [{ source: urlFoto }];
    if (fotoExtra1.trim()) imagenes.push({ source: fotoExtra1.trim() });
    if (fotoExtra2.trim()) imagenes.push({ source: fotoExtra2.trim() });

    try {
      const res = await fetch("https://n8n.revolucionmotos.tech/webhook/subir_publicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resTitulo,
          price: Number(resPrecio),
          brand: resMarca,
          description: resDescripcion,
          category_id: resCategoria,
          available_quantity: Number(resStock),
          pictures: imagenes,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // n8n devuelve los datos del item de ML si está configurado con "Respond to Webhook"
      setMlData({
        id: data.id || data.item_id || "",
        family_id: data.family_id || "",
        user_product_id: data.user_product_id || "",
        permalink: data.permalink || "",
      });
      setPublicacionExitosa(true);
    } catch {
      alert("Hubo un problema al enviar la publicación a n8n.");
    } finally {
      setIsPublishing(false);
    }
  };

  // ==========================================
  // FUNCIÓN: REGISTRAR EN BASE DE DATOS
  // ==========================================
  const handleRegistrarEnBD = async () => {
    const mla = mlData.id.trim().toUpperCase();
    if (!mla) {
      alert("El MLA es obligatorio para registrar en la base de datos.");
      return;
    }

    setIsRegistering(true);
    try {
      let result;
      if (selectedItems.length > 0) {
        result = await createProductWithRecipe({
          mla,
          titulo: resTitulo,
          family_id: mlData.family_id || undefined,
          user_product_id: mlData.user_product_id || undefined,
          es_nuevo: true,
          componentes: selectedItems.map((item) => ({
            id_articulo: item.id_articulo,
            cantidad: item.cantidad,
            nombre_articulo: item.descripcion || item.id_articulo,
          })),
        });
      } else {
        result = await createManualProduct({
          mla,
          titulo: resTitulo,
          family_id: mlData.family_id || undefined,
          user_product_id: mlData.user_product_id || undefined,
          es_nuevo: true,
        });
      }

      if (result.success) {
        setRegistradoEnBD(true);
      } else {
        alert("Error al registrar: " + result.error);
      }
    } catch {
      alert("Error de conexión al registrar en base de datos.");
    } finally {
      setIsRegistering(false);
    }
  };

  // ==========================================
  // STEPPER CONFIG
  // ==========================================
  const steps = [
    { label: "Imágenes", color: "blue" },
    { label: "Datos", color: "rose" },
    { label: "Precio", color: "purple" },
    { label: "Publicar", color: "green" },
  ];

  const stepColors: Record<string, string> = {
    blue: "border-blue-600 bg-blue-50 text-blue-600",
    rose: "border-rose-600 bg-rose-50 text-rose-600",
    purple: "border-purple-600 bg-purple-50 text-purple-600",
    green: "border-green-600 bg-green-50 text-green-600",
  };

  const lineColors: Record<string, string> = {
    blue: "bg-blue-600",
    rose: "bg-rose-600",
    purple: "bg-purple-600",
    green: "bg-green-600",
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* CABECERA */}
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
        <p className="text-gray-500 text-lg mt-2">Paso {currentStep} de 4</p>
      </div>

      {/* STEPPER */}
      <div className="flex items-center justify-center mb-10">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const active = currentStep >= stepNum;
          return (
            <div key={step.label} className="flex items-center">
              <div className={`flex items-center ${active ? `text-${step.color}-600 font-bold` : "text-gray-400"}`}>
                <div
                  className={`rounded-full h-8 w-8 flex items-center justify-center border-2 ${
                    active ? stepColors[step.color] : "border-gray-300 text-gray-400"
                  }`}
                >
                  {stepNum}
                </div>
                <span className="ml-2 hidden sm:block">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 sm:w-16 h-1 mx-2 ${currentStep > stepNum ? lineColors[step.color] : "bg-gray-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ============================================================
          PASO 1: IMÁGENES
          ============================================================ */}
      {currentStep === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-t-4 border-t-blue-500 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-500" />
                Paso 1: Preparar las Imágenes
              </CardTitle>
              <CardDescription>Pega una URL lista, procesá con n8n, y agregá fotos extra.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                <Label className="text-blue-800 font-semibold">Herramienta: Unir 2 Fotos</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input placeholder="URL Foto 1..." value={foto1} onChange={(e) => setFoto1(e.target.value)} />
                  <Input placeholder="URL Foto 2..." value={foto2} onChange={(e) => setFoto2(e.target.value)} />
                </div>
                <Button
                  onClick={handleProcesarFotos}
                  disabled={isProcessingImage || (!foto1 && !foto2)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {isProcessingImage ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Procesando en n8n...</>
                  ) : (
                    <><Layers className="h-4 w-4" /> Unir fotos con n8n</>
                  )}
                </Button>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-800 text-base">Foto de Portada (Principal) *</Label>
                  <p className="text-sm text-gray-500">Si uniste fotos, esto se llenará solo. Sino, pegá tu URL aquí.</p>
                  <Input
                    placeholder="https://misitio.com/foto-portada.jpg"
                    className="h-12 border-blue-200 focus-visible:ring-blue-500 font-medium text-lg"
                    value={urlFoto}
                    onChange={(e) => setUrlFoto(e.target.value)}
                  />
                </div>

                <div className="space-y-3 bg-gray-50 p-4 rounded-md border border-gray-200">
                  <Label className="font-semibold text-gray-700">Fotos Adicionales (Opcionales)</Label>
                  <div className="grid grid-cols-1 gap-3">
                    <Input placeholder="URL Foto extra 1..." className="bg-white h-12" value={fotoExtra1} onChange={(e) => setFotoExtra1(e.target.value)} />
                    <Input placeholder="URL Foto extra 2..." className="bg-white h-12" value={fotoExtra2} onChange={(e) => setFotoExtra2(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-6">
                <Button onClick={() => setCurrentStep(2)} className="bg-gray-900 hover:bg-gray-800 text-white h-12 px-8 text-lg">
                  Siguiente: Datos del Producto <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================
          PASO 2: DATOS DEL PRODUCTO
          ============================================================ */}
      {currentStep === 2 && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
          <Card className="border-t-4 border-t-rose-500 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-rose-500" />
                Paso 2: Datos del Producto
              </CardTitle>
              <CardDescription>Información que la IA usará para armar el listing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-base">Título</Label>
                <Input placeholder="Ej: Casco Moto Integral LS2 FF352 Negro Mate Talle L" className="h-12 text-lg" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label className="text-base">Descripción y Compatibilidad</Label>
                <Textarea placeholder="Ej: Casco homologado DOT. Compatible con Honda CB300, Yamaha MT-03..." rows={4} className="resize-none text-lg" value={descripcionCompatibilidad} onChange={(e) => setDescripcionCompatibilidad(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label className="text-base">Marca</Label>
                <Input placeholder="Ej: LS2" className="h-12 text-lg" value={marca} onChange={(e) => setMarca(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label className="text-base">Artículo Principal (referencia de categoría para n8n)</Label>
                <p className="text-xs text-gray-500">Buscá el artículo que mejor representa la categoría de esta publicación. Se enviará al workflow para ayudar a determinar la categoría de ML.</p>
                {articuloPrincipal ? (
                  <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                    <div>
                      <span className="font-bold text-rose-800">{articuloPrincipal.id_articulo}</span>
                      <p className="text-sm text-rose-600">{articuloPrincipal.descripcion}</p>
                    </div>
                    <button
                      onClick={() => { setArticuloPrincipal(null); setArticuloPrincipalSearch(""); }}
                      className="text-rose-400 hover:text-rose-600 ml-4 text-sm underline"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar artículo por nombre o SKU..."
                      value={articuloPrincipalSearch}
                      onChange={(e) => setArticuloPrincipalSearch(e.target.value)}
                      className="pl-9 h-12 text-base"
                    />
                    {articuloPrincipalSearch.trim().length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-56 overflow-y-auto">
                        {articulosDb
                          .filter(
                            (art) =>
                              art.descripcion?.toLowerCase().includes(articuloPrincipalSearch.toLowerCase()) ||
                              art.id_articulo.toLowerCase().includes(articuloPrincipalSearch.toLowerCase())
                          )
                          .slice(0, 8)
                          .map((art) => (
                            <div
                              key={`principal-${art.fuente}-${art.id_articulo}`}
                              onClick={() => { setArticuloPrincipal(art); setArticuloPrincipalSearch(""); }}
                              className="p-3 hover:bg-rose-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center"
                            >
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-800">{art.id_articulo}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${art.fuente === "mostrador" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                    {art.fuente === "mostrador" ? "Mostrador" : "Catálogo"}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-500 line-clamp-1">{art.descripcion}</span>
                              </div>
                            </div>
                          ))}
                        {articulosDb.filter(
                          (art) =>
                            art.descripcion?.toLowerCase().includes(articuloPrincipalSearch.toLowerCase()) ||
                            art.id_articulo.toLowerCase().includes(articuloPrincipalSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="p-3 text-sm text-slate-400 text-center">Sin resultados</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-base">Componentes del Producto</Label>
                <Textarea placeholder="Ej: Casco exterior ABS, visera antirayos UVA/UVB, interior desmontable..." rows={3} className="resize-none text-lg" value={componentesTexto} onChange={(e) => setComponentesTexto(e.target.value)} />
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="h-12 px-6">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
                </Button>
                <Button
                  onClick={() => setCurrentStep(3)}
                  disabled={!titulo || !urlFoto}
                  className="bg-rose-600 hover:bg-rose-700 text-white h-12 px-8 text-lg disabled:bg-gray-300"
                >
                  Siguiente: Composición y Precio <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================
          PASO 3: COMPOSICIÓN + CÁLCULO DE PRECIO
          ============================================================ */}
      {currentStep === 3 && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
          <Card className="border-t-4 border-t-purple-500 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-500" />
                Paso 3: Composición y Cálculo de Precio
              </CardTitle>
              <CardDescription>Agregá los artículos del catálogo para calcular el costo y determinar el precio correcto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* BUSCADOR DE ARTÍCULOS */}
              <div className="p-4 bg-slate-50 border rounded-lg space-y-3">
                <Label className="text-slate-700 font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4 text-purple-600" />
                  Componer costo con artículos del catálogo
                </Label>
                {loadingArticulos && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo...
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por descripción o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-white"
                  />
                  {filteredArticulos.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto">
                      {filteredArticulos.map((art) => (
                        <div
                          key={`${art.fuente}-${art.id_articulo}`}
                          onClick={() => handleAddItem(art)}
                          className="p-3 hover:bg-purple-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{art.id_articulo}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${art.fuente === "mostrador" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                {art.fuente === "mostrador" ? "Mostrador" : "Catálogo"}
                              </span>
                            </div>
                            <span className="text-xs text-slate-500 line-clamp-1">{art.descripcion}</span>
                          </div>
                          <span className="text-sm font-bold text-emerald-600 whitespace-nowrap ml-2">
                            {formatCurrency(art.costo_final_ars)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedItems.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedItems.map((item) => (
                      <div key={`${item.fuente}-${item.id_articulo}`} className="bg-white p-3 rounded-md border shadow-sm text-sm space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700 truncate">{item.id_articulo}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${item.fuente === "mostrador" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                {item.fuente === "mostrador" ? "Mostrador" : "Catálogo"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">{item.descripcion}</p>
                          </div>
                          <button onClick={() => handleRemoveItem(item.id_articulo, item.fuente)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 font-medium">Costo&nbsp;c/u&nbsp;$</span>
                            <input
                              type="number"
                              min="0"
                              className="w-28 h-8 px-2 text-sm font-bold text-emerald-700 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 bg-emerald-50"
                              value={item.costo_final_ars === 0 ? "" : item.costo_final_ars}
                              onChange={(e) => handleUpdateCosto(item.id_articulo, item.fuente, Number(e.target.value) || 0)}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-center bg-slate-100 rounded-md border">
                            <button onClick={() => handleUpdateQty(item.id_articulo, item.fuente, -1)} className="px-3 py-1 hover:bg-slate-200 rounded-l-md">-</button>
                            <span className="px-3 font-semibold text-slate-700">{item.cantidad}</span>
                            <button onClick={() => handleUpdateQty(item.id_articulo, item.fuente, 1)} className="px-3 py-1 hover:bg-slate-200 rounded-r-md">+</button>
                          </div>
                          <span className="text-sm font-bold text-slate-600 ml-auto">
                            = {formatCurrency(item.costo_final_ars * item.cantidad)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm text-slate-600 font-medium">Subtotal artículos:</span>
                      <span className="text-lg font-bold text-blue-600">{formatCurrency(subtotalSeleccionados)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* VARIABLES DE PRECIO */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Costo del Artículo ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                      type="number"
                      min="0"
                      className="pl-9 font-bold text-lg text-slate-800"
                      value={costo === 0 ? "" : costo}
                      onChange={(e) => setCosto(Number(e.target.value))}
                      placeholder="Costo o suma de artículos"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Ganancia Esperada (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    <Input type="number" min="0" className="pl-9" value={ganancia || ""} onChange={(e) => setGanancia(Number(e.target.value))} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-600">Cargo Venta ML (%)</Label>
                  <Input type="number" step="0.01" value={cargoML || ""} onChange={(e) => setCargoML(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-600">Cargo Cuotas (%)</Label>
                  <Input type="number" step="0.01" value={cargoCuotas || ""} onChange={(e) => setCargoCuotas(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-600">Impuestos (%)</Label>
                  <Input type="number" step="0.01" value={impuesto || ""} onChange={(e) => setImpuesto(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Costo Envío ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    <Input type="number" min="0" className="pl-9" value={envio || ""} onChange={(e) => setEnvio(Number(e.target.value))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Descuento a Ofrecer (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    <Input type="number" min="0" className="pl-9" value={descuento || ""} onChange={(e) => setDescuento(Number(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* RESULTADOS DE PRECIO */}
              {costo > 0 && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="p-4 bg-slate-50 border rounded-lg">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Precio sin Descuento</p>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(precioFinalSinDescuento)}</p>
                    <p className="text-xs text-slate-500 mt-1">Ganancia pura: {formatCurrency(gananciaEnPesos)}</p>
                  </div>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-bold text-blue-700 uppercase mb-1 flex items-center justify-between">
                      Con Descuento {descuento}%
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-bold">RECOMENDADO</span>
                    </p>
                    <p className="text-2xl font-bold text-blue-700">{formatCurrency(precioListaConDescuento)}</p>
                    <p className="text-xs text-slate-500 mt-1">Precio final pagado: {formatCurrency(precioFinalSinDescuento)}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="h-12 px-6">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
                </Button>
                <Button
                  onClick={handleGenerarConIA}
                  disabled={!costo || costo <= 0}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12 px-8 text-lg shadow-md disabled:bg-gray-300"
                >
                  <Sparkles className="h-5 w-5" /> Generar con IA y Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================
          PASO 4: REVISIÓN Y PUBLICACIÓN
          ============================================================ */}
      {currentStep === 4 && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
          <Card className="shadow-md border-t-4 border-t-green-500">
            <CardHeader className="pb-3 border-b border-gray-100 mb-4 bg-gray-50 rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-green-600" />
                Paso 4: Revisión y Publicación
              </CardTitle>
              <CardDescription>Corregí los textos generados y publicá en ML.</CardDescription>
            </CardHeader>
            <CardContent>

              {/* ESTADO: CARGANDO IA */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
                  <Loader2 className="h-14 w-14 mb-4 animate-spin text-rose-500" />
                  <h3 className="text-xl font-bold mb-2">La IA está trabajando...</h3>
                  <p className="text-center px-8">Redactando título, descripción y buscando categoría. El precio ya fue calculado.</p>
                </div>
              )}

              {/* ESTADO: PUBLICACIÓN EXITOSA → REGISTRO EN BD */}
              {publicacionExitosa && (
                <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                  <div className="flex flex-col items-center text-center p-6 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 className="h-14 w-14 text-green-500 mb-3" />
                    <h3 className="text-2xl font-bold text-green-700 mb-1">¡Publicación enviada a ML!</h3>
                    <p className="text-green-600">El artículo está siendo procesado en MercadoLibre.</p>
                  </div>

                  {/* PANEL DE REGISTRO EN BD */}
                  {!registradoEnBD ? (
                    <div className="border border-slate-200 rounded-lg p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-slate-600" />
                        <h4 className="font-bold text-slate-800 text-lg">Registrar en la Base de Datos</h4>
                      </div>
                      <p className="text-sm text-slate-500">
                        Completá los datos del item creado en ML para registrarlo. Si n8n está configurado para retornar los datos del item, estos campos se completarán automáticamente.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-slate-600 uppercase">MLA (ID del Item) *</Label>
                          <Input
                            placeholder="Ej: MLA1234567890"
                            value={mlData.id}
                            onChange={(e) => setMlData((prev) => ({ ...prev, id: e.target.value }))}
                            className="font-mono font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Family ID</Label>
                          <Input
                            placeholder="Ej: MLAFAM12345"
                            value={mlData.family_id}
                            onChange={(e) => setMlData((prev) => ({ ...prev, family_id: e.target.value }))}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-slate-600 uppercase">User Product ID</Label>
                          <Input
                            placeholder="Ej: MLAUPI12345"
                            value={mlData.user_product_id}
                            onChange={(e) => setMlData((prev) => ({ ...prev, user_product_id: e.target.value }))}
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-slate-600 uppercase">Permalink</Label>
                          <Input
                            placeholder="https://articulo.mercadolibre.com.ar/..."
                            value={mlData.permalink}
                            onChange={(e) => setMlData((prev) => ({ ...prev, permalink: e.target.value }))}
                          />
                        </div>
                      </div>

                      {selectedItems.length > 0 && (
                        <div className="bg-slate-50 rounded-md p-3 border">
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2">Composición que se guardará</p>
                          <div className="space-y-1">
                            {selectedItems.map((item) => (
                              <div key={item.id_articulo} className="flex justify-between text-sm">
                                <span className="text-slate-700">{item.id_articulo} — {item.descripcion}</span>
                                <span className="font-semibold text-slate-800">×{item.cantidad}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 pt-2">
                        <Button
                          onClick={handleRegistrarEnBD}
                          disabled={isRegistering || !mlData.id.trim()}
                          className="bg-slate-800 hover:bg-slate-900 text-white gap-2 h-12 px-6 disabled:bg-gray-300"
                        >
                          {isRegistering ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</>
                          ) : (
                            <><Database className="h-4 w-4" /> Aceptar y Registrar en BD</>
                          )}
                        </Button>
                        <Button variant="ghost" className="text-slate-500" onClick={() => window.location.reload()}>
                          Omitir y crear nueva
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-lg border border-slate-200">
                      <CheckCircle2 className="h-10 w-10 text-slate-600 mb-3" />
                      <h4 className="text-xl font-bold text-slate-800 mb-1">¡Registrado en la BD!</h4>
                      <p className="text-slate-500 text-sm mb-1">
                        La publicación fue creada con el flag <span className="font-bold text-purple-600">es_nuevo = true</span> para que puedas rastrear su rendimiento.
                      </p>
                      {mlData.permalink && (
                        <a href={mlData.permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm flex items-center gap-1 mt-2 hover:underline">
                          <ExternalLink className="h-4 w-4" /> Ver en MercadoLibre
                        </a>
                      )}
                      <Button className="mt-4 bg-green-600 text-white hover:bg-green-700" onClick={() => window.location.reload()}>
                        Crear nueva publicación
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ESTADO: RESULTADOS DE IA (editables) */}
              {iaTermino && !isLoading && !publicacionExitosa && (
                <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                  {urlFoto && (
                    <div className="flex justify-center mb-4">
                      <img src={urlFoto} alt="Preview" className="h-36 object-contain rounded-md border p-1 bg-white shadow-sm" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Título (Máx 60 car.)</Label>
                    <Input className="h-12 text-lg font-medium text-blue-900 bg-blue-50/50 border-blue-200" value={resTitulo} onChange={(e) => setResTitulo(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-green-700 uppercase">
                        Precio Final ($) <span className="text-slate-400 font-normal normal-case">— calculado en paso 3</span>
                      </Label>
                      <Input type="number" className="h-12 text-lg font-bold text-green-700 bg-green-50/50 border-green-200" value={resPrecio} onChange={(e) => setResPrecio(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Marca</Label>
                      <Input className="h-12 text-lg bg-gray-50" value={resMarca} onChange={(e) => setResMarca(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-orange-600 uppercase">
                        Categoría ML *{nombreCategoria && <span className="text-gray-500 normal-case font-normal ml-2">({nombreCategoria})</span>}
                      </Label>
                      <Input placeholder="Ej: MLA3530" className="h-12 text-lg border-orange-200 focus-visible:ring-orange-500 font-medium" value={resCategoria} onChange={(e) => setResCategoria(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-gray-500 uppercase">Stock Inicial</Label>
                      <Input type="number" className="h-12 text-lg" value={resStock} onChange={(e) => setResStock(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase">Descripción</Label>
                    <Textarea rows={10} className="bg-gray-50 resize-y text-base p-4" value={resDescripcion} onChange={(e) => setResDescripcion(e.target.value)} />
                  </div>

                  <div className="flex items-center justify-between pt-6 mt-4 border-t border-gray-200">
                    <Button variant="outline" onClick={() => setCurrentStep(3)} className="h-14 px-6 text-lg">
                      <ArrowLeft className="mr-2 h-5 w-5" /> Volver a Precio
                    </Button>
                    <Button
                      onClick={handlePublicar}
                      disabled={isPublishing || !resTitulo || !resPrecio || !resCategoria}
                      className="bg-green-600 hover:bg-green-700 text-white gap-2 h-14 px-8 text-xl shadow-lg disabled:bg-green-300"
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
  );
}
