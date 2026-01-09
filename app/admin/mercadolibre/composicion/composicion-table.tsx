"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil } from "lucide-react";
import { upsertKitComponent, deleteKitComponent } from "@/app/actions/kits";

export function ComposicionTable({ kits, articulos }: { kits: any[], articulos: any[] }) {
  const [filter, setFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const filteredKits = kits.filter(k => 
    k.mla.toLowerCase().includes(filter.toLowerCase()) ||
    k.id_articulo.toLowerCase().includes(filter.toLowerCase()) ||
    k.nombre_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  const handleOpenModal = (item = null) => {
    setEditingItem(item || { mla: "", nombre_variante: "", id_articulo: "", cantidad: 1, nombre_articulo: "" });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await upsertKitComponent(editingItem);
    if (res.success) setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 w-full max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por MLA, ID Artículo..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Plus className="h-4 w-4" /> Nuevo Componente
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold">MLA</TableHead>
              <TableHead className="font-bold">Variante</TableHead>
              <TableHead className="font-bold">ID Artículo (SKU)</TableHead>
              <TableHead className="font-bold">Descripción Artículo</TableHead>
              <TableHead className="font-bold text-center">Cant.</TableHead>
              <TableHead className="font-bold text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKits.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50 transition-colors">
                <TableCell className="font-mono text-blue-600 font-medium">{item.mla}</TableCell>
                <TableCell className="text-xs uppercase font-bold text-slate-500">{item.nombre_variante}</TableCell>
                <TableCell className="font-mono">{item.id_articulo}</TableCell>
                <TableCell className="text-xs uppercase">{item.nombre_articulo}</TableCell>
                <TableCell className="text-center font-bold">{item.cantidad}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(item)} className="h-8 w-8 text-blue-600">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteKitComponent(item.id)} className="h-8 w-8 text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* MODAL DE GESTIÓN */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem?.id ? "Editar Componente" : "Vincular Artículo a MLA"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>MLA</Label>
                <Input 
                  placeholder="MLA123456" 
                  value={editingItem?.mla || ""} 
                  onChange={e => setEditingItem({...editingItem, mla: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre Variante</Label>
                <Input 
                  placeholder="Ej: Rojo / XL" 
                  value={editingItem?.nombre_variante || ""} 
                  onChange={e => setEditingItem({...editingItem, nombre_variante: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>ID de Artículo (Debe existir en Costos)</Label>
              <Input 
                placeholder="SKU-123" 
                value={editingItem?.id_articulo || ""} 
                onChange={e => {
                  const art = articulos.find(a => a.id_articulo === e.target.value);
                  setEditingItem({
                    ...editingItem, 
                    id_articulo: e.target.value,
                    nombre_articulo: art ? art.descripcion : editingItem.nombre_articulo
                  });
                }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input 
                  type="number" 
                  value={editingItem?.cantidad || 1} 
                  onChange={e => setEditingItem({...editingItem, cantidad: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre Artículo (Opcional)</Label>
                <Input 
                  className="bg-slate-50"
                  value={editingItem?.nombre_articulo || ""} 
                  readOnly
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full bg-blue-600">Guardar Cambios en Kit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
