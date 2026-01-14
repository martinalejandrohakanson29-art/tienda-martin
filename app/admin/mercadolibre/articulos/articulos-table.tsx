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
import { updateConfig } from "@/app/actions/config";

export function ArticulosTable({ data, initialConfig }: { data: any[], initialConfig: any }) {
  const [filter, setFilter] = useState("");
  
  // Valores para los inputs (Temporales) - Estos son los que usaremos para calcular en vivo
  const [tempDolar, setTempDolar] = useState(Number(initialConfig?.dolarCotizacion || 1530));
  const [tempFob, setTempFob] = useState(Number(initialConfig?.factorFob || 2.3));
  const [tempFinanc, setTempFinanc] = useState(Number(initialConfig?.recargoFinanciacion || 0));

  // Valores "Activos" - Representan lo que está actualmente en la DB
  const [activeDolar, setActiveDolar] = useState(tempDolar);
  const [activeFob, setActiveFob] = useState(tempFob);
  const [activeFinanc, setActiveFinanc] = useState(tempFinanc);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticulo, setEditingArticulo] = useState<any>(null);

  const aplicarCambiosGlobales = async () => {
    // Cuando apretamos el botón, sincronizamos los valores activos y guardamos en DB
    setActiveDolar(tempDolar);
    setActiveFob(tempFob);
    setActiveFinanc(tempFinanc);

    await updateConfig({
      dolarCotizacion: tempDolar,
      factorFob: tempFob,
      recargoFinanciacion: tempFinanc
    });
  };

  const handleOpenModal = (articulo = null) => {
    setEditingArticulo(articulo || { id_articulo: "", descripcion: "", costo_usd: 0, es_dolar: true });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await upsertArticulo(editingArticulo);
      if (res?.success) {
        setIsModalOpen(false);
      } else {
        alert("Error: " + (res?.error || "Error de base de datos."));
      }
    } catch (err) {
      alert("Error inesperado en el servidor.");
    }
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
                className="pl-10 bg-white border-slate-200"
              />
            </div>
            <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 gap-2 shadow-sm">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </div>

          <div className="flex items-end gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Valor Dólar</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                <Input
                  type="number"
                  value={tempDolar}
                  onChange={(e) => setTempDolar(Number(e.target.value))}
                  className="w-24 h-10 pl-7 font-bold text-blue-600 border-slate-100 bg-slate-50/50"
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Factor FOB</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">x</span>
                <Input
                  type="number"
                  step="0.1"
                  value={tempFob}
                  onChange={(e) => setTempFob(Number(e.target.value))}
                  className="w-20 h-10 pl-7 font-bold text-amber-600 border-slate-100 bg-slate-50/50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Financ. %</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                {/* CAMBIO: Aumentado el ancho de w-20 a w-32 para que entre el número entero */}
                <Input
                  type="number"
                  step="0.01"
                  value={tempFinanc}
                  onChange={(e) => setTempFinanc(Number(e.target.value))}
                  className="w-32 h-10 pl-7 font-bold text-purple-600 border-slate-100 bg-slate-50/50"
                />
              </div>
            </div>

            <Button 
              onClick={aplicarCambiosGlobales} 
              className="h-10 bg-blue-600 hover:bg-blue-700 shadow-md gap-2 px-6"
            >
              <RefreshCw className="h-4 w-4" />
              Guardar en DB
            </Button>
          </div>
        </div>
      </div>
      
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[150px] font-bold text-slate-600">Cód. Artículo</TableHead>
              <TableHead className="font-bold text-slate-600">Descripción</TableHead>
              <TableHead className="w-[100px] font-bold text-slate-600 text-center">Es Dólar</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-600 text-center">Precio Base</TableHead>
              <TableHead className="w-[180px] font-bold text-slate-700 text-right pr-8">Final ARS (Vista Previa)</TableHead>
              <TableHead className="w-[100px] font-bold text-slate-600 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              let finalArs = 0;
              if (item.es_dolar) {
                // CAMBIO: Ahora usamos tempDolar, tempFob y tempFinanc para ver el cambio instantáneo
                const subtotal = Number(item.costo_usd) * tempDolar * tempFob;
                finalArs = subtotal * (1 + (tempFinanc / 100));
              } else {
                finalArs = Number(item.costo_usd);
              }

              return (
                <TableRow key={item.id} className="hover:bg-blue-50/30 transition-colors border-slate-100">
                  <TableCell className="font-mono font-medium text-blue-600">{item.id_articulo}</TableCell>
                  <TableCell className="font-medium uppercase text-slate-700 text-[11px] leading-tight">
                    {item.descripcion}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.es_dolar ? "default" : "secondary"}>
                      {item.es_dolar ? "SÍ" : "NO"}
                    </Badge>
                  </TableCell>
                  
                  <TableCell className="text-center font-semibold text-slate-500">
                    {item.es_dolar ? 'U$S ' : '$ '}
                    {Number(item.costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>

                  <TableCell className="text-right pr-8 font-extrabold text-green-700 text-lg">
                    ${finalArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => handleOpenModal(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
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

      <div className="text-[10px] text-slate-400 italic text-right pr-4 pb-10">
        {/* CAMBIO: La leyenda inferior también refleja los cambios que estás simulando */}
        * Vista Previa -> Dólar: ${tempDolar.toLocaleString('es-AR')} | FOB: x{tempFob.toFixed(2)} | Financ: {tempFinanc}%
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingArticulo?.id ? "Editar Artículo" : "Agregar Nuevo Artículo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="sku" className="font-bold">ID de Artículo (SKU)</Label>
              <Input 
                id="sku"
                value={editingArticulo?.id_articulo || ""} 
                onChange={e => setEditingArticulo({...editingArticulo, id_articulo: e.target.value})} 
                required
                className="bg-slate-50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc" className="font-bold">Descripción</Label>
              <Input 
                id="desc"
                value={editingArticulo?.descripcion || ""} 
                onChange={e => setEditingArticulo({...editingArticulo, descripcion: e.target.value})} 
                required
                className="bg-slate-50 uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price" className="font-bold">Precio Base</Label>
                <Input 
                  id="price"
                  type="number" step="0.01"
                  value={editingArticulo?.costo_usd || 0} 
                  onChange={e => setEditingArticulo({...editingArticulo, costo_usd: Number(e.target.value)})} 
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="is-usd" className="font-bold">¿Es Dólar?</Label>
                <select 
                  id="is-usd"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  value={editingArticulo?.es_dolar ? "true" : "false"}
                  onChange={e => setEditingArticulo({...editingArticulo, es_dolar: e.target.value === "true"})}
                >
                  <option value="true">SÍ (Usar Dólar/FOB)</option>
                  <option value="false">NO (Precio en Pesos)</option>
                </select>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 px-8">Guardar Cambios</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
