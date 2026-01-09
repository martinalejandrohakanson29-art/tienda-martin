// app/admin/mercadolibre/composicion/composicion-table.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil, Check, Box } from "lucide-react";
import { upsertKitComponent, deleteKitComponent } from "@/app/actions/kits";
import { cn } from "@/lib/utils";

export function ComposicionTable({ kits, articulos }: { kits: any[], articulos: any[] }) {
  const [filter, setFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Estado para el buscador interno de artículos dentro del modal
  const [searchArticulo, setSearchArticulo] = useState("");

  const filteredKits = kits.filter(k => 
    k.mla.toLowerCase().includes(filter.toLowerCase()) ||
    k.id_articulo.toLowerCase().includes(filter.toLowerCase()) ||
    k.nombre_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  // Filtrado de artículos para el buscador del modal
  const sugerenciasArticulos = searchArticulo.length > 1 
    ? articulos.filter(a => 
        a.id_articulo.toLowerCase().includes(searchArticulo.toLowerCase()) ||
        a.descripcion?.toLowerCase().includes(searchArticulo.toLowerCase())
      ).slice(0, 5) // Mostramos solo los primeros 5 para no saturar
    : [];

  const handleOpenModal = (item = null) => {
    setEditingItem(item || { mla: "", nombre_variante: "", id_articulo: "", cantidad: 1, nombre_articulo: "" });
    setSearchArticulo(""); // Resetear buscador
    setIsModalOpen(true);
  };

  const handleSelectArticulo = (articulo: any) => {
    setEditingItem({
      ...editingItem,
      id_articulo: articulo.id_articulo,
      nombre_articulo: articulo.descripcion
    });
    setSearchArticulo(""); // Limpiamos la búsqueda tras elegir
  };

  const handleSave = async (e: React.FormEvent) => {
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

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda principal */}
      <div className="flex items-center gap-3 w-full max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por MLA, ID Artículo o nombre..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-sm">
          <Plus className="h-4 w-4" /> Nuevo Componente
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold text-slate-600">MLA</TableHead>
              <TableHead className="font-bold text-slate-600">Variante</TableHead>
              <TableHead className="font-bold text-slate-600">ID Artículo</TableHead>
              <TableHead className="font-bold text-slate-600">Descripción</TableHead>
              <TableHead className="font-bold text-slate-600 text-center">Cant.</TableHead>
              <TableHead className="font-bold text-slate-600 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKits.map((item) => (
              <TableRow key={item.id} className="hover:bg-blue-50/20 transition-colors border-slate-100">
                <TableCell className="font-mono text-blue-600 font-bold">{item.mla}</TableCell>
                <TableCell>
                  <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">
                    {item.nombre_variante || "Única"}
                  </span>
                </TableCell>
                <TableCell className="font-mono font-medium">{item.id_articulo}</TableCell>
                <TableCell className="text-[11px] uppercase text-slate-600">{item.nombre_articulo}</TableCell>
                <TableCell className="text-center font-black text-slate-700">{item.cantidad}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
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

      {/* MODAL DE GESTIÓN CON BUSCADOR DE ARTÍCULOS */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingItem?.id ? "Editar Componente" : "Agregar Artículo al MLA"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSave} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">MLA Destino</Label>
                <Input 
                  placeholder="MLA123456789" 
                  value={editingItem?.mla || ""} 
                  onChange={e => setEditingItem({...editingItem, mla: e.target.value})}
                  className="bg-slate-50 font-mono"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Variante (opcional)</Label>
                <Input 
                  placeholder="Ej: Larga" 
                  value={editingItem?.nombre_variante || ""} 
                  onChange={e => setEditingItem({...editingItem, nombre_variante: e.target.value})}
                  className="bg-slate-50"
                />
              </div>
            </div>

            {/* SECCIÓN BUSCADOR DE ARTÍCULOS */}
            <div className="space-y-2 relative">
              <Label className="font-bold text-blue-700">Seleccionar Artículo de Costos</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Escribe el código o nombre del artículo..." 
                  value={searchArticulo}
                  onChange={e => setSearchArticulo(e.target.value)}
                  className="pl-10 border-blue-200 focus:ring-blue-500"
                />
              </div>

              {/* Lista de sugerencias (Dropdown) */}
              {sugerenciasArticulos.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto">
                  {sugerenciasArticulos.map((art) => (
                    <div 
                      key={art.id_articulo}
                      onClick={() => handleSelectArticulo(art)}
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-blue-600">{art.id_articulo}</span>
                        <span className="text-[10px] uppercase text-slate-500">{art.descripcion}</span>
                      </div>
                      <Plus className="h-3 w-3 text-slate-300" />
                    </div>
                  ))}
                </div>
              )}

              {/* Artículo Seleccionado actualmente */}
              {editingItem?.id_articulo && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                  <div className="bg-green-600 p-1.5 rounded text-white">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-green-800 uppercase">Seleccionado:</span>
                    <span className="text-xs font-mono font-bold">{editingItem.id_articulo} - {editingItem.nombre_articulo}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="w-1/3 space-y-2">
              <Label className="font-bold text-slate-700">Cantidad</Label>
              <Input 
                type="number" 
                min="1"
                value={editingItem?.cantidad || 1} 
                onChange={e => setEditingItem({...editingItem, cantidad: Number(e.target.value)})}
                className="text-center font-bold text-lg"
                required
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 px-8 shadow-md">
                {editingItem?.id ? "Actualizar Kit" : "Guardar en Kit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
