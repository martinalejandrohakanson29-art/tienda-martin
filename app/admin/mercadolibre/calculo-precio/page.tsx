// app/admin/mercadolibre/calculo-precio/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calculator, DollarSign, Percent, Info, Search, Trash2, Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import { getArticulos, upsertArticulo } from "@/app/actions/costos";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Definimos cómo luce un Artículo para TypeScript
interface Articulo {
  id: number;
  id_articulo: string;
  descripcion: string | null;
  costo_usd: number;
  costo_final_ars: number;
  isKit: boolean;
}

// Un artículo seleccionado incluye también la "cantidad"
interface SelectedItem extends Articulo {
  cantidad: number;
}

export default function CalculoPrecioPage() {
  // --- ESTADOS ORIGINALES ---
  const [costo, setCosto] = useState<number>(0);
  const [ganancia, setGanancia] = useState<number>(50); // 50%
  const [cargoML, setCargoML] = useState<number>(14.54); // 14.54%
  const [cargoCuotas, setCargoCuotas] = useState<number>(4); // 4%
  const [impuesto, setImpuesto] = useState<number>(2); // 2%
  const [envio, setEnvio] = useState<number>(8000); // $8.000
  const [descuento, setDescuento] = useState<number>(5); // 5%

  // --- ESTADOS PARA BÚSQUEDA DE ARTÍCULOS ---
  const [articulosDb, setArticulosDb] = useState<Articulo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // --- ESTADOS PARA EL NUEVO MODAL DE AGREGAR ARTÍCULO ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // NUEVO: Estado para controlar si el SKU se genera automáticamente
  const [autoSku, setAutoSku] = useState(true); 
  const [newSku, setNewSku] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCostoUsd, setNewCostoUsd] = useState<number | "">("");
  const [newEsDolar, setNewEsDolar] = useState(true);

  // 1. Cargamos todos los artículos de la base de datos al abrir la página
  const fetchArticulos = async () => {
    const data = await getArticulos();
    setArticulosDb(data as Articulo[]);
  };

  useEffect(() => {
    fetchArticulos();
  }, []);

  // 2. Filtramos la lista según lo que escribas en el buscador
  const filteredArticulos = searchTerm.trim() === "" 
    ? [] 
    : articulosDb.filter(art => 
        (art.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) || false) || 
        art.id_articulo.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 10);

  // 3. Función para actualizar el COSTO TOTAL en base a lo seleccionado
  const updateCostoTotal = (items: SelectedItem[]) => {
    const total = items.reduce((acc, item) => acc + (item.costo_final_ars * item.cantidad), 0);
    setCosto(total);
  };

  // 4. Agregar un artículo a la lista temporal
  const handleAddItem = (articulo: Articulo) => {
    setSelectedItems(prev => {
      const existing = prev.find(p => p.id_articulo === articulo.id_articulo);
      let newItems;
      if (existing) {
        newItems = prev.map(p => p.id_articulo === articulo.id_articulo ? { ...p, cantidad: p.cantidad + 1 } : p);
      } else {
        newItems = [...prev, { ...articulo, cantidad: 1 }];
      }
      updateCostoTotal(newItems);
      return newItems;
    });
    setSearchTerm("");
  };

  // 5. Quitar un artículo de la lista
  const handleRemoveItem = (sku: string) => {
    setSelectedItems(prev => {
      const newItems = prev.filter(p => p.id_articulo !== sku);
      updateCostoTotal(newItems);
      return newItems;
    });
  };

  // 6. Subir o bajar la cantidad
  const handleUpdateQty = (sku: string, delta: number) => {
    setSelectedItems(prev => {
      const newItems = prev.map(p => {
        if (p.id_articulo === sku) {
          const newQty = Math.max(1, p.cantidad + delta);
          return { ...p, cantidad: newQty };
        }
        return p;
      });
      updateCostoTotal(newItems);
      return newItems;
    });
  };

  // 7. --- FUNCIÓN: GUARDAR ARTÍCULO EN LA BASE DE DATOS ---
  const handleSaveNewArticulo = async () => {
    // Definimos qué SKU vamos a usar (el inventado o el manual)
    let skuToSave = newSku.trim();

    if (autoSku) {
      // Generamos un SKU automático único basado en la fecha/hora. Ej: ART-845123
      const timestampDigits = Date.now().toString().slice(-6);
      skuToSave = `ART-${timestampDigits}`;
    }

    if (!skuToSave) {
      alert("El código (SKU) es obligatorio.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Llamamos a tu función existente para guardar/actualizar
      const result = await upsertArticulo({
        id_articulo: skuToSave,
        descripcion: newDesc,
        costo_usd: Number(newCostoUsd) || 0,
        es_dolar: newEsDolar
      });

      if (result.success) {
        // Recargamos la lista
        await fetchArticulos();
        
        // Cerramos modal y limpiamos todo
        setIsModalOpen(false);
        setNewSku("");
        setNewDesc("");
        setNewCostoUsd("");
        setNewEsDolar(true);
        setAutoSku(true); // Volvemos a dejarlo automático para la próxima vez
        
        // Ponemos el SKU recién creado en el buscador para encontrarlo al toque
        setSearchTerm(skuToSave);
      } else {
        alert("Hubo un error al guardar: " + result.error);
      }
    } catch (error) {
      alert("Error de conexión al guardar el artículo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculamos el subtotal
  const subtotalSeleccionados = selectedItems.reduce((acc, item) => acc + (item.costo_final_ars * item.cantidad), 0);

  // --- LÓGICA DE CÁLCULO ORIGINAL ---
  const gananciaNetaTeorica = costo * (1 + ganancia / 100);
  const gananciaEnPesos = gananciaNetaTeorica - costo;
  const retencionesPorcentaje = (cargoML + cargoCuotas + impuesto) / 100;
  const divisor = 1 - retencionesPorcentaje;
  const precioFinalSinDescuento = divisor > 0 ? (gananciaNetaTeorica + envio) / divisor : 0;
  const precioListaConDescuento = descuento < 100 ? precioFinalSinDescuento / (1 - descuento / 100) : 0;

  // Formateador de moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a Mercado Libre
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Cálculo de Precio ML</h1>
      </div>

      <p className="text-gray-500 text-lg">
        Ingresa tus costos y márgenes para obtener el precio de publicación ideal.
      </p>

      <div className="grid gap-6 md:grid-cols-12">
        {/* PANEL DE VARIABLES */}
        <Card className="md:col-span-7 shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Calculator className="h-5 w-5 text-slate-600" />
              Variables del Artículo
            </CardTitle>
            <CardDescription>Modifica los valores o busca repuestos para armar un costo compuesto</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            
            {/* SECCIÓN: BÚSQUEDA Y ARMADO DE COSTO */}
            <div className="p-4 bg-slate-50 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-700 font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600" /> 
                  Componer Costo con Artículos
                </Label>
                {/* BOTÓN MAGICO PARA AGREGAR NUEVO ARTICULO */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar Artículo
                </Button>
              </div>
              
              <p className="text-xs text-slate-500">
                Busca repuestos para sumarlos. Si no existe, créalo con el botón de arriba.
              </p>
              
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Ej: Carburador CG 125..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-white"
                />
                
                {filteredArticulos.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto">
                    {filteredArticulos.map(art => (
                      <div 
                        key={art.id_articulo} 
                        onClick={() => handleAddItem(art)} 
                        className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{art.id_articulo}</span>
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
                <div className="mt-4 space-y-2">
                  {selectedItems.map(item => (
                    <div key={item.id_articulo} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-md border shadow-sm text-sm gap-2">
                      <div className="flex-1">
                        <span className="font-bold text-slate-700">{item.id_articulo}</span>
                        <p className="text-xs text-slate-500 truncate">{item.descripcion}</p>
                      </div>
                      
                      <div className="flex items-center gap-4 justify-between sm:justify-end">
                        <span className="text-slate-500 font-medium">
                          {formatCurrency(item.costo_final_ars)} <span className="text-xs font-normal">c/u</span>
                        </span>
                        
                        <div className="flex items-center bg-slate-100 rounded-md border">
                          <button onClick={() => handleUpdateQty(item.id_articulo, -1)} className="px-3 py-1 hover:bg-slate-200 rounded-l-md transition-colors">-</button>
                          <span className="px-3 font-semibold text-slate-700">{item.cantidad}</span>
                          <button onClick={() => handleUpdateQty(item.id_articulo, 1)} className="px-3 py-1 hover:bg-slate-200 rounded-r-md transition-colors">+</button>
                        </div>
                        
                        <button onClick={() => handleRemoveItem(item.id_articulo)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex justify-between items-center pt-3 border-t mt-2">
                    <span className="text-sm text-slate-600 font-medium">Suma de repuestos:</span>
                    <span className="text-lg font-bold text-blue-600">{formatCurrency(subtotalSeleccionados)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Fila 1: Costo y Ganancia */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costo" className="text-slate-700 font-semibold">Costo del Artículo ($)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="costo"
                    type="number"
                    min="0"
                    className="pl-9 font-bold text-lg text-slate-800"
                    value={costo === 0 ? "" : costo}
                    onChange={(e) => setCosto(Number(e.target.value))}
                    placeholder="Costo manual o suma"
                  />
                </div>
                {selectedItems.length > 0 && costo !== subtotalSeleccionados && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Costo manual diferente a suma.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ganancia" className="text-slate-700 font-semibold">Ganancia Esperada (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="ganancia"
                    type="number"
                    min="0"
                    className="pl-9"
                    value={ganancia || ""}
                    onChange={(e) => setGanancia(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <hr className="border-dashed" />

            {/* Fila 2: Comisiones ML */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargoML" className="text-xs font-semibold text-slate-600">Cargo Venta (%)</Label>
                <Input id="cargoML" type="number" step="0.01" value={cargoML || ""} onChange={(e) => setCargoML(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargoCuotas" className="text-xs font-semibold text-slate-600">Cargo Cuotas (%)</Label>
                <Input id="cargoCuotas" type="number" step="0.01" value={cargoCuotas || ""} onChange={(e) => setCargoCuotas(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="impuesto" className="text-xs font-semibold text-slate-600">Impuestos (%)</Label>
                <Input id="impuesto" type="number" step="0.01" value={impuesto || ""} onChange={(e) => setImpuesto(Number(e.target.value))} />
              </div>
            </div>

            {/* Fila 3: Fijos y Descuentos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="envio" className="text-slate-700 font-semibold">Costo de Envío ($ Fijo)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input id="envio" type="number" min="0" className="pl-9" value={envio || ""} onChange={(e) => setEnvio(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descuento" className="text-slate-700 font-semibold">Descuento a Ofrecer (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <Input id="descuento" type="number" min="0" className="pl-9" value={descuento || ""} onChange={(e) => setDescuento(Number(e.target.value))} />
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* PANEL DE RESULTADOS */}
        <div className="md:col-span-5 space-y-6">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-1">
                Ganancia Neta Teórica
              </h3>
              <p className="text-4xl font-extrabold text-emerald-600">
                {formatCurrency(gananciaNetaTeorica)}
              </p>
              <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                <Info className="h-4 w-4" />
                Costo recuperado + {formatCurrency(gananciaEnPesos)} de ganancia pura.
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 shadow-md">
            <CardHeader className="bg-blue-600 text-white rounded-t-lg pb-4">
              <CardTitle className="text-xl">Precios a Publicar</CardTitle>
              <CardDescription className="text-blue-100">
                Usa estos valores en Mercado Libre
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-gray-700">Sin Descuento (Normal)</h4>
                </div>
                <p className="text-3xl font-bold text-slate-800">
                  {formatCurrency(precioFinalSinDescuento)}
                </p>
              </div>

              <div className="p-6 bg-slate-50 rounded-b-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-blue-700 flex items-center gap-2">
                    Con Descuento del {descuento}%
                  </h4>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                    RECOMENDADO
                  </span>
                </div>
                <p className="text-3xl font-bold text-blue-700 mb-1">
                  {formatCurrency(precioListaConDescuento)}
                </p>
                <p className="text-sm text-gray-600">
                  Precio final pagado: <span className="font-bold">{formatCurrency(precioFinalSinDescuento)}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* --- MODAL PARA CREAR UN NUEVO ARTÍCULO --- */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Artículo</DialogTitle>
            <CardDescription>
              Agrega rápidamente un repuesto a tu base de datos de costos.
            </CardDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* CAMPO SKU CON CHECKBOX DE AUTO-GENERACIÓN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="newSku">Código / SKU <span className="text-red-500">*</span></Label>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="autoSku" 
                    checked={autoSku} 
                    onChange={(e) => setAutoSku(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="autoSku" className="text-xs text-slate-500 cursor-pointer font-normal">
                    Generar automático
                  </Label>
                </div>
              </div>
              <Input 
                id="newSku" 
                placeholder={autoSku ? "Automático (ej: ART-123456)" : "Ej: M12345"} 
                value={autoSku ? "" : newSku} 
                onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                disabled={autoSku} // Se deshabilita si está en modo automático
                className={autoSku ? "bg-slate-100 text-slate-500" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="newDesc">Descripción</Label>
              <Input 
                id="newDesc" 
                placeholder="Ej: Espejo Derecho" 
                value={newDesc} 
                onChange={(e) => setNewDesc(e.target.value)} 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newCosto">Costo Base</Label>
                <Input 
                  id="newCosto" 
                  type="number" 
                  min="0"
                  step="0.01"
                  placeholder="0.00" 
                  value={newCostoUsd} 
                  onChange={(e) => setNewCostoUsd(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEsDolar">Moneda</Label>
                <select 
                  id="newEsDolar"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={newEsDolar ? "true" : "false"}
                  onChange={(e) => setNewEsDolar(e.target.value === "true")}
                >
                  <option value="true">Dólar (USD)</option>
                  <option value="false">Pesos (ARS)</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            {/* El botón se deshabilita si está cargando, o si NO es automático y el campo está vacío */}
            <Button onClick={handleSaveNewArticulo} disabled={isSubmitting || (!autoSku && !newSku.trim())}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Artículo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* --- FIN MODAL --- */}

    </div>
  );
}
