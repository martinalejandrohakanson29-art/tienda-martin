// app/admin/mercadolibre/articulos/articulos-table.tsx
"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Search, Plus, Pencil, Trash2 } from "lucide-react";
import { upsertArticulo, deleteArticulo } from "@/app/actions/costos";

export function ArticulosTable({ data }: { data: any[] }) {
  const [filter, setFilter] = useState("");
  const [tempDolar, setTempDolar] = useState(1530);
  const [tempFob, setTempFob] = useState(2.3);
  const [activeDolar, setActiveDolar] = useState(1530);
  const [activeFob, setActiveFob] = useState(2.3);

  // Estados para el Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticulo, setEditingArticulo] = useState<any>(null);

  const aplicarCambios = () => {
    setActiveDolar(tempDolar);
    setActiveFob(tempFob);
  };

  const handleOpenModal = (articulo = null) => {
    setEditingArticulo(articulo || { id_articulo: "", descripcion: "", costo_usd: 0, es_dolar: true });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await upsertArticulo(editingArticulo);
    if (res.success) setIsModalOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (confirm("¿Estás seguro de eliminar este artículo?")) {
      await deleteArticulo(id);
    }
  };

  const filteredData = data.filter(item => 
    item.descripcion?.toLowerCase().includes(filter.toLowerCase()) ||
    item.id_articulo?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-[-16px] z-30 bg-slate-50/95 backdrop-blur-sm pb-4 pt-2 -mx-2 px-2 border-b mb-6">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          <div className="flex items-center gap-3 w-full max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar descripción o ID..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 bg-white"
              />
            </div>
            {/* BOTÓN AGREGAR ARTÍCULO */}
            <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 gap-2">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </div>

          <div className="flex items-end gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            {/* ... (Tus controles de Dólar y FOB se mantienen igual) */}
            <Button onClick={aplicarCambios} className="h-10 bg-blue-600 hover:bg-blue-700 gap-2">
              <RefreshCw className="h-4 w-4" /> Modificar
            </Button>
          </div>
        </div>
      </div>
      
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[150px] font-bold">Cód. Artículo</TableHead>
              <TableHead className="font-bold">Descripción</TableHead>
              <TableHead className="w-[100px] text-center font-bold">Moneda</TableHead>
              <TableHead className="w-[140px] text-center font-bold">Precio Base</TableHead>
              <TableHead className="w-[150px] text-right font-bold">Final ARS</TableHead>
              <TableHead className="w-[100px] text-center font-bold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              const finalArs = item.es_dolar 
                ? Number(item.costo_usd) * activeDolar * activeFob 
                : Number(item.costo_usd);

              return (
                <TableRow key={item.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-blue-600">{item.id_articulo}</TableCell>
                  <TableCell className="text-xs uppercase">{item.descripcion}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.es_dolar ? "default" : "secondary"}>
                      {item.es_dolar ? "USD" : "ARS"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {item.es_dolar ? 'U$S' : '$'} {Number(item.costo_usd).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-green-700">
                    ${finalArs.toLocaleString('es-AR')}
                  </TableCell>
                  {/* COLUMNA ACCIONES */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleOpenModal(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* MODAL DE EDICIÓN / CREACIÓN */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingArticulo?.id ? "Editar Artículo" : "Nuevo Artículo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-2">
              <Label>ID de Artículo (SKU)</Label>
              <Input 
                value={editingArticulo?.id_articulo || ""} 
                onChange={e => setEditingArticulo({...editingArticulo, id_articulo: e.target.value})} 
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Descripción</Label>
              <Input 
                value={editingArticulo?.descripcion || ""} 
                onChange={e => setEditingArticulo({...editingArticulo, descripcion: e.target.value})} 
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Precio Base</Label>
                <Input 
                  type="number" step="0.01"
                  value={editingArticulo?.costo_usd || 0} 
                  onChange={e => setEditingArticulo({...editingArticulo, costo_usd: Number(e.target.value)})} 
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>¿Es Dólar?</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editingArticulo?.es_dolar ? "true" : "false"}
                  onChange={e => setEditingArticulo({...editingArticulo, es_dolar: e.target.value === "true"})}
                >
                  <option value="true">Sí (USD)</option>
                  <option value="false">No (ARS)</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
