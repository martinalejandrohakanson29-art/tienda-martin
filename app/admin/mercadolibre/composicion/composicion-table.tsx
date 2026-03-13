// app/admin/mercadolibre/composicion/composicion-table.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil, Check, CopyPlus, PackagePlus, Loader2, X, SearchIcon } from "lucide-react"; 
import { upsertKitComponent, deleteKitComponent, saveBulkKitComponents } from "@/app/actions/kits";
import { createManualProduct } from "@/app/actions/ml-maestros";

export function ComposicionTable({ kits, articulos, maestros }: { kits: any[], articulos: any[], maestros: any[] }) {
  const [filter, setFilter] = useState("");
  
  // MODAL EDICIÓN / AGREGAR INDIVIDUAL (Mantenido intacto)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchArticulo, setSearchArticulo] = useState("");

  // NUEVO MODAL: CARGA DE RECETA MASIVA (Por MLA completo)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkMla, setBulkMla] = useState("");
  const [bulkVariantes, setBulkVariantes] = useState<{
    variation_id: string;
    nombre_variante: string;
    componentes: { id_articulo: string; nombre_articulo: string; cantidad: number; search: string }[]
  }[]>([]);
  
  // MODAL: ALTA DE PRODUCTO MAESTRO (MULTIPLE)
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [masterData, setMasterData] = useState({ 
    mla: "", 
    titulo: "", 
    variantes: [{ nombre_variante: "", variation_id: "" }] 
  });
  const [isSubmitting, setIsSubmitting] = useState(false); 

  // --- LÓGICA DE FILTRADO ---
  const filteredKits = kits.filter(k => 
    k.mla.toLowerCase().includes(filter.toLowerCase()) ||
    k.id_articulo.toLowerCase().includes(filter.toLowerCase()) ||
    k.nombre_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  const sugerenciasArticulos = searchArticulo.length > 1 
    ? articulos.filter(a => 
        a.id_articulo.toLowerCase().includes(searchArticulo.toLowerCase()) ||
        a.descripcion?.toLowerCase().includes(searchArticulo.toLowerCase())
      ).slice(0, 5)
    : [];

  // --- HANDLERS DEL MODAL INDIVIDUAL / EDICIÓN ---
  const handleOpenModal = (item: any = null) => {
    if(item) {
      setEditingItem(item);
      setSearchArticulo(""); 
      setIsModalOpen(true);
    } else {
      // Si no hay item (Click en "Nueva Receta"), abrimos el NUEVO Modal Masivo
      setBulkMla("");
      setBulkVariantes([]);
      setIsBulkModalOpen(true);
    }
  };

  const handleAddIngredientToKit = (baseItem: any) => {
    setEditingItem({
      mla: baseItem.mla,
      variation_id: baseItem.variation_id,
      nombre_variante: baseItem.nombre_variante,
      id_articulo: "",
      cantidad: 1, 
      nombre_articulo: ""
    });
    setSearchArticulo("");
    setIsModalOpen(true);
  };

  const handleSelectArticulo = (articulo: any) => {
    setEditingItem({
      ...editingItem,
      id_articulo: articulo.id_articulo,
      nombre_articulo: articulo.descripcion
    });
    setSearchArticulo(""); 
  };

  const handleSaveKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem.id_articulo) {
      alert("Debes seleccionar un artículo de la lista");
      return;
    }
    const res = await upsertKitComponent(editingItem);
    if (res.success) setIsModalOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm("¿Eliminar este artículo del kit?")) {
      await deleteKitComponent(id);
    }
  };

  // --- NUEVA LÓGICA: RECETAS MASIVAS (BULK) ---
  const handleLoadVariantsForBulk = () => {
    const cleanMla = bulkMla.trim().toUpperCase();
    if(!cleanMla) return;
    
    // Buscamos todas las variantes de este MLA en la tabla maestros
    const found = maestros.filter(m => m.mla === cleanMla);
    
    if (found.length > 0) {
      setBulkVariantes(found.map(f => ({
        variation_id: f.variation_id || "",
        nombre_variante: f.nombre_variante || "Única",
        componentes: [{ id_articulo: "", nombre_articulo: "", cantidad: 1, search: "" }]
      })));
    } else {
      // Si no lo tenemos registrado, armamos una estructura "Única" por defecto
      setBulkVariantes([{
        variation_id: "",
        nombre_variante: "Única",
        componentes: [{ id_articulo: "", nombre_articulo: "", cantidad: 1, search: "" }]
      }]);
    }
  };

  const handleSaveBulkRecipe = async () => {
    if(!bulkMla) {
      alert("Debes ingresar el MLA principal");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { mla: bulkMla, variantes: bulkVariantes };
      const res = await saveBulkKitComponents(payload);
      
      if(res.success) {
        setIsBulkModalOpen(false);
        setBulkVariantes([]);
        setBulkMla("");
      } else {
        alert(res.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error inesperado al guardar la receta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LÓGICA MULTI-VARIANTE PARA ALTA CATÁLOGO ---
  const addVariantRow = () => {
    setMasterData({
      ...masterData,
      variantes: [...masterData.variantes, { nombre_variante: "", variation_id: "" }]
    });
  };

  const removeVariantRow = (index: number) => {
    const updated = [...masterData.variantes];
    updated.splice(index, 1);
    setMasterData({ ...masterData, variantes: updated });
  };

  const updateVariant = (index: number, field: string, value: string) => {
    const updated = [...masterData.variantes];
    updated[index] = { ...updated[index], [field]: value };
    setMasterData({ ...masterData, variantes: updated });
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
        for (const variant of masterData.variantes) {
          const payload = {
            mla: masterData.mla,
            titulo: masterData.titulo,
            nombre_variante: variant.nombre_variante,
            variation_id: variant.variation_id
          };
          const res = await createManualProduct(payload);
          if (!res.success) {
            alert(`Error en variante ${variant.nombre_variante}: ${res.error}`);
          }
        }
        
        setIsMasterModalOpen(false);
        setMasterData({ mla: "", titulo: "", variantes: [{ nombre_variante: "", variation_id: "" }] });
        alert("¡Proceso finalizado! Los productos se han creado correctamente.");
    } catch (error) {
        console.error(error);
        alert("Ocurrió un error inesperado.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar en recetas..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            onClick={() => setIsMasterModalOpen(true)} 
            variant="outline"
            className="bg-white hover:bg-slate-100 text-slate-700 border-slate-300 gap-2 shadow-sm flex-1 md:flex-none"
          >
            <PackagePlus className="h-4 w-4 text-purple-600" /> 
            Alta Catálogo ML
          </Button>
          <Button 
            onClick={() => handleOpenModal()} 
            className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-sm flex-1 md:flex-none"
          >
            <Plus className="h-4 w-4" /> 
            Nueva Receta
          </Button>
        </div>
      </div>

      {/* TABLA DE KITS */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold text-slate-600">MLA</TableHead>
              <TableHead className="font-bold text-slate-600">Variante</TableHead>
              <TableHead className="font-bold text-slate-600">Componente</TableHead>
              <TableHead className="font-bold text-slate-600 text-center">Cant.</TableHead>
              <TableHead className="font-bold text-slate-600 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKits.map((item) => (
              <TableRow key={item.id} className="hover:bg-blue-50/20 transition-colors border-slate-100">
                <TableCell className="font-mono text-blue-600 font-bold text-xs">{item.mla}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-1 rounded text-slate-500 w-fit">
                        {item.nombre_variante || "Única"}
                    </span>
                    {item.variation_id && (
                        <span className="text-[9px] text-slate-400 font-mono mt-0.5">{item.variation_id}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[11px] uppercase text-slate-600">
                    <span className="font-mono font-bold mr-2">{item.id_articulo}</span>
                    {item.nombre_articulo}
                </TableCell>
                <TableCell className="text-center font-black text-slate-700">{item.cantidad}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleAddIngredientToKit(item)} className="h-8 w-8 text-green-600 hover:bg-green-50" title="Agregar otro componente">
                      <CopyPlus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)} className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* NUEVO MODAL: GESTIÓN DE RECETA MASIVA */}
      <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col bg-slate-50">
          <DialogHeader className="bg-white p-4 -m-6 mb-2 border-b">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-blue-800">
              <Plus className="h-5 w-5" /> Armado Rápido de Receta
            </DialogTitle>
            <DialogDescription>
              Ingresa el MLA para cargar sus variantes y asígnales los artículos que la componen.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 items-center px-1 mt-4">
            <Input 
              placeholder="MLA12345678" 
              value={bulkMla} 
              onChange={e => setBulkMla(e.target.value)} 
              className="font-mono uppercase border-blue-200"
            />
            <Button onClick={handleLoadVariantsForBulk} className="bg-blue-600 hover:bg-blue-700 min-w-[150px]">
              <SearchIcon className="h-4 w-4 mr-2" />
              Traer Variantes
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 mt-2 pb-4">
            {bulkVariantes.length === 0 && bulkMla.length > 5 && (
              <p className="text-sm text-slate-500 text-center mt-8">Presiona "Traer Variantes" para comenzar.</p>
            )}
            
            {bulkVariantes.map((variant, vIdx) => (
              <div key={vIdx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700">{variant.nombre_variante}</span>
                    {variant.variation_id && <span className="text-xs font-mono text-slate-400">{variant.variation_id}</span>}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      const newVars = [...bulkVariantes];
                      newVars[vIdx].componentes.push({id_articulo: "", nombre_articulo: "", cantidad: 1, search: ""});
                      setBulkVariantes(newVars);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Agregar Item
                  </Button>
                </div>

                <div className="space-y-2">
                  {variant.componentes.map((comp, cIdx) => (
                    <div key={cIdx} className="flex gap-2 items-center">
                      
                      {/* Búsqueda o Selección del Insumo */}
                      {comp.id_articulo ? (
                        <div className="flex-1 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-md">
                          <span className="text-xs font-bold text-green-700 flex items-center gap-2">
                            <Check className="h-3 w-3" />
                            {comp.id_articulo} - {comp.nombre_articulo}
                          </span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => {
                              const newVars = [...bulkVariantes];
                              newVars[vIdx].componentes[cIdx].id_articulo = "";
                              newVars[vIdx].componentes[cIdx].nombre_articulo = "";
                              setBulkVariantes(newVars);
                          }}>
                             <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex-1 relative">
                          <Input 
                              placeholder="Buscar artículo/insumo..."
                              value={comp.search}
                              className="text-sm"
                              onChange={(e) => {
                                const newVars = [...bulkVariantes];
                                newVars[vIdx].componentes[cIdx].search = e.target.value;
                                setBulkVariantes(newVars);
                              }}
                          />
                          {comp.search && comp.search.length > 1 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-auto">
                                {articulos
                                  .filter(a => a.id_articulo.toLowerCase().includes(comp.search.toLowerCase()) || a.descripcion?.toLowerCase().includes(comp.search.toLowerCase()))
                                  .slice(0, 5)
                                  .map((art) => (
                                  <div 
                                    key={art.id_articulo}
                                    className="p-2 hover:bg-blue-50 cursor-pointer border-b flex justify-between items-center"
                                    onClick={() => {
                                      const newVars = [...bulkVariantes];
                                      newVars[vIdx].componentes[cIdx].id_articulo = art.id_articulo;
                                      newVars[vIdx].componentes[cIdx].nombre_articulo = art.descripcion;
                                      newVars[vIdx].componentes[cIdx].search = "";
                                      setBulkVariantes(newVars);
                                    }}
                                  >
                                    <span className="text-xs font-bold text-blue-600">{art.id_articulo}</span>
                                    <span className="text-[10px] text-slate-600 truncate max-w-[200px]">{art.descripcion}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Cantidad y Eliminar */}
                      <div className="w-20">
                        <Input 
                          type="number" 
                          min="1" 
                          value={comp.cantidad} 
                          className="text-center font-bold"
                          onChange={e => {
                            const newVars = [...bulkVariantes];
                            newVars[vIdx].componentes[cIdx].cantidad = Number(e.target.value);
                            setBulkVariantes(newVars);
                          }} 
                        />
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                        onClick={() => {
                          const newVars = [...bulkVariantes];
                          newVars[vIdx].componentes.splice(cIdx, 1);
                          setBulkVariantes(newVars);
                        }}
                      >
                          <Trash2 className="h-4 w-4" />
                      </Button>

                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="bg-white p-4 -m-6 mt-2 border-t">
            <Button variant="ghost" onClick={() => setIsBulkModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button 
              onClick={handleSaveBulkRecipe} 
              className="bg-green-600 hover:bg-green-700 min-w-[140px]"
              disabled={isSubmitting || bulkVariantes.length === 0}
            >
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar Receta Completa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 1 ORIGINAL: EDICIÓN INDIVIDUAL (Mantenido para el ícono de Lápiz y Copy) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingItem?.id ? "Editar Componente" : "Configurar Receta Individual"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveKit} className="space-y-6 pt-4">
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">MLA Destino</Label>
                <Input 
                  value={editingItem?.mla || ""} 
                  onChange={e => setEditingItem({...editingItem, mla: e.target.value})}
                  className="bg-slate-50 font-mono uppercase"
                  placeholder="MLA..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">ID Variante</Label>
                <Input 
                  value={editingItem?.variation_id || ""} 
                  onChange={e => setEditingItem({...editingItem, variation_id: e.target.value})}
                  className="bg-slate-50 font-mono text-xs"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-2">
                <Label className="font-bold text-slate-700">Nombre Variante</Label>
                <Input 
                  value={editingItem?.nombre_variante || ""} 
                  onChange={e => setEditingItem({...editingItem, nombre_variante: e.target.value})}
                  className="bg-slate-50"
                  placeholder="Ej: Rojo / 28mm"
                />
            </div>

            <div className="space-y-2 relative">
              <Label className="font-bold text-blue-700">Seleccionar Artículo de Costos</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Buscar insumo..." 
                  value={searchArticulo}
                  onChange={e => setSearchArticulo(e.target.value)}
                  className="pl-10 border-blue-200"
                />
              </div>
              {sugerenciasArticulos.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto">
                  {sugerenciasArticulos.map((art) => (
                    <div 
                      key={art.id_articulo}
                      onClick={() => handleSelectArticulo(art)}
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b flex justify-between"
                    >
                      <span className="text-xs font-bold text-blue-600">{art.id_articulo}</span>
                      <span className="text-[10px] text-slate-600">{art.descripcion}</span>
                    </div>
                  ))}
                </div>
              )}
              {editingItem?.id_articulo && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded flex gap-2 items-center">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-bold">{editingItem.id_articulo} - {editingItem.nombre_articulo}</span>
                </div>
              )}
            </div>

            <div className="w-1/3 space-y-2">
              <Label className="font-bold text-slate-700">Cantidad</Label>
              <Input 
                type="number" min="1"
                value={editingItem?.cantidad || 1} 
                onChange={e => setEditingItem({...editingItem, cantidad: Number(e.target.value)})}
                className="text-center font-bold"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2 ORIGINAL: ALTA DE PRODUCTO MAESTRO (MULTI-VARIANTE) */}
      <Dialog open={isMasterModalOpen} onOpenChange={setIsMasterModalOpen}>
        <DialogContent className="sm:max-w-[650px] border-l-4 border-l-purple-500 overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-purple-700 flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Alta de Producto y Variantes
            </DialogTitle>
            <DialogDescription>
              Define el MLA y agrega todas sus variantes de una sola vez.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSaveMaster} className="space-y-5 pt-4 overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">MLA Principal</Label>
                <Input 
                  value={masterData.mla} 
                  onChange={e => setMasterData({...masterData, mla: e.target.value})}
                  placeholder="MLA12345678"
                  className="font-mono uppercase border-purple-200 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Título General</Label>
                <Input 
                  value={masterData.titulo} 
                  onChange={e => setMasterData({...masterData, titulo: e.target.value})}
                  placeholder="Título de la publicación"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-bold text-slate-600">Configuración de Variantes</Label>
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline" 
                  onClick={addVariantRow}
                  className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                >
                  <Plus className="h-3 w-3 mr-1" /> Agregar Variante
                </Button>
              </div>

              <div className="space-y-2">
                {masterData.variantes.map((v, idx) => (
                  <div key={idx} className="flex gap-3 items-end bg-slate-50 p-3 rounded-lg border border-slate-100 relative group">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400">Nombre Variante</Label>
                      <Input 
                        value={v.nombre_variante} 
                        onChange={e => updateVariant(idx, "nombre_variante", e.target.value)}
                        placeholder="Ej: Rojo / 28mm"
                        className="h-8 text-sm"
                        required
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400">ID Variante (ML)</Label>
                      <Input 
                        value={v.variation_id} 
                        onChange={e => updateVariant(idx, "variation_id", e.target.value)}
                        placeholder="Ej: 174680..."
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    {masterData.variantes.length > 1 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeVariantRow(idx)}
                        className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4 border-t sticky bottom-0 bg-white pb-2">
              <Button type="button" variant="ghost" onClick={() => setIsMasterModalOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md min-w-[140px]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Crear {masterData.variantes.length} Productos
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
