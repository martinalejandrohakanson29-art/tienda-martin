// app/admin/mercadolibre/composicion/composicion-table.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil, Check, CopyPlus, PackagePlus } from "lucide-react";
import { upsertKitComponent, deleteKitComponent } from "@/app/actions/kits";
import { createManualProduct } from "@/app/actions/ml-maestros"; // <--- IMPORTAMOS LA NUEVA ACCIÓN

export function ComposicionTable({ kits, articulos }: { kits: any[], articulos: any[] }) {
  const [filter, setFilter] = useState("");
  
  // MODAL DE RECETAS (El que ya teníamos)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // NUEVO MODAL: ALTA DE PRODUCTO MAESTRO
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ mla: "", titulo: "", nombre_variante: "", variation_id: "" });
  
  const [searchArticulo, setSearchArticulo] = useState("");

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

  // --- HANDLERS DEL MODAL DE RECETAS (KIT) ---
  const handleOpenModal = (item: any = null) => {
    setEditingItem(item || { 
      mla: "", variation_id: "", nombre_variante: "", id_articulo: "", cantidad: 1, nombre_articulo: "" 
    });
    setSearchArticulo(""); 
    setIsModalOpen(true);
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

  // --- NUEVOS HANDLERS: ALTA DE PRODUCTO MAESTRO ---
  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createManualProduct(newProduct);
    if (res.success) {
      setIsMasterModalOpen(false);
      setNewProduct({ mla: "", titulo: "", nombre_variante: "", variation_id: "" });
      // Opcional: Abrir el modal de receta automáticamente después de crear
      handleOpenModal({ mla: newProduct.mla, nombre_variante: newProduct.nombre_variante || "0" });
    } else {
      alert(res.error);
    }
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
        
        {/* Buscador */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar en recetas..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>

        {/* Botones de Acción */}
        <div className="flex gap-2 w-full md:w-auto">
          {/* Botón 1: Crear Producto en Catálogo (NUEVO) */}
          <Button 
            onClick={() => setIsMasterModalOpen(true)} 
            variant="outline"
            className="bg-white hover:bg-slate-100 text-slate-700 border-slate-300 gap-2 shadow-sm flex-1 md:flex-none"
          >
            <PackagePlus className="h-4 w-4 text-purple-600" /> 
            Alta Catálogo ML
          </Button>

          {/* Botón 2: Crear Receta Directa */}
          <Button 
            onClick={() => handleOpenModal()} 
            className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-sm flex-1 md:flex-none"
          >
            <Plus className="h-4 w-4" /> 
            Nueva Receta
          </Button>
        </div>
      </div>

      {/* TABLA DE KITS (La misma de siempre) */}
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

      {/* MODAL 1: GESTIÓN DE RECETA (KIT) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingItem?.id ? "Editar Componente" : "Configurar Receta"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveKit} className="space-y-6 pt-4">
             {/* ... (El contenido de este form es el mismo que hicimos antes) ... */}
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

      {/* MODAL 2: ALTA DE PRODUCTO MAESTRO (NUEVO) */}
      <Dialog open={isMasterModalOpen} onOpenChange={setIsMasterModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-l-4 border-l-purple-500">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-purple-700 flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Alta de Producto en Catálogo
            </DialogTitle>
            <DialogDescription>
              Esto crea el producto en la base para que aparezca en la tabla de costos y vistas.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSaveMaster} className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">MLA (Mercado Libre ID)</Label>
              <Input 
                value={newProduct.mla} 
                onChange={e => setNewProduct({...newProduct, mla: e.target.value})}
                placeholder="Ej: MLA12345678"
                className="font-mono uppercase border-purple-200 focus:ring-purple-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Título de la Publicación</Label>
              <Input 
                value={newProduct.titulo} 
                onChange={e => setNewProduct({...newProduct, titulo: e.target.value})}
                placeholder="Ej: Kit Carburador 150cc Completo"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500">Nombre Variante (Opcional)</Label>
                <Input 
                  value={newProduct.nombre_variante} 
                  onChange={e => setNewProduct({...newProduct, nombre_variante: e.target.value})}
                  placeholder="Ej: Rojo / 28mm"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500">ID Variante (Opcional)</Label>
                <Input 
                  value={newProduct.variation_id} 
                  onChange={e => setNewProduct({...newProduct, variation_id: e.target.value})}
                  placeholder="Ej: 174680..."
                  className="text-sm font-mono"
                />
              </div>
              <p className="col-span-2 text-[10px] text-slate-400 italic">
                * Si el producto no tiene variantes, deja estos campos vacíos.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsMasterModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white shadow-md">
                Crear Producto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
