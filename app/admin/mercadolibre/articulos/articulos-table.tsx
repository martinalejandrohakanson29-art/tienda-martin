"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
// Agregamos Filter para el ícono del nuevo filtro
import { RefreshCw, Search, Plus, Pencil, Trash2, Boxes, Trash, Filter } from "lucide-react";
import { upsertArticulo, deleteArticulo, getComponentes, updateComponentes, recalculateAllArticulos } from "@/app/actions/costos";
import { updateConfig } from "@/app/actions/config";

export function ArticulosTable({ data, initialConfig }: { data: any[], initialConfig: any }) {
  const [filter, setFilter] = useState("");
  // NUEVO: Estado para filtrar por Dólar (all, dolar, pesos)
  const [dolarFilter, setDolarFilter] = useState<"all" | "dolar" | "pesos">("all");
  
  const [tempDolar, setTempDolar] = useState(Number(initialConfig?.dolarCotizacion || 1530));
  const [tempFob, setTempFob] = useState(Number(initialConfig?.factorFob || 2.3));
  const [tempFinanc, setTempFinanc] = useState(Number(initialConfig?.recargoFinanciacion || 0));

  const [activeDolar, setActiveDolar] = useState(tempDolar);
  const [activeFob, setActiveFob] = useState(tempFob);
  const [activeFinanc, setActiveFinanc] = useState(tempFinanc);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticulo, setEditingArticulo] = useState<any>(null);

  const [isKitModalOpen, setIsKitModalOpen] = useState(false);
  const [selectedPadre, setSelectedPadre] = useState<any>(null);
  const [componentesTemp, setComponentesTemp] = useState<{sku_hijo: string, cantidad: number}[]>([]);
  const [busquedaHijo, setBusquedaHijo] = useState("");

  const aplicarCambiosGlobales = async () => {
    setActiveDolar(tempDolar);
    setActiveFob(tempFob);
    setActiveFinanc(tempFinanc);
    await updateConfig({
      dolarCotizacion: tempDolar,
      factorFob: tempFob,
      recargoFinanciacion: tempFinanc
    });
    await recalculateAllArticulos();
    alert("Configuración guardada y precios de Kits actualizados.");
  };

  const handleOpenKitModal = async (articulo: any) => {
    setSelectedPadre(articulo);
    const comps = await getComponentes(articulo.id_articulo);
    setComponentesTemp(comps.map(c => ({ sku_hijo: c.sku_hijo, cantidad: c.cantidad })));
    setIsKitModalOpen(true);
  };

  const addComponente = (sku: string) => {
    if (sku === selectedPadre.id_articulo) return alert("No puedes agregar el mismo artículo como hijo.");
    if (componentesTemp.find(c => c.sku_hijo === sku)) return;
    setComponentesTemp([...componentesTemp, { sku_hijo: sku, cantidad: 1 }]);
    setBusquedaHijo("");
  };

  const removeComponente = (sku: string) => {
    setComponentesTemp(componentesTemp.filter(c => c.sku_hijo !== sku));
  };

  const updateQuantity = (sku: string, cant: number) => {
    setComponentesTemp(componentesTemp.map(c => c.sku_hijo === sku ? { ...c, cantidad: cant } : c));
  };

  const saveComposicion = async () => {
    const res = await updateComponentes(selectedPadre.id_articulo, componentesTemp);
    if (res.success) {
      setIsKitModalOpen(false);
    } else {
      alert("Error: " + res.error);
    }
  };

  const handleOpenModal = (articulo = null) => {
    setEditingArticulo(articulo || { id_articulo: "", descripcion: "", costo_usd: 0, es_dolar: true });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await upsertArticulo(editingArticulo);
    if (res?.success) setIsModalOpen(false);
  };

  // LÓGICA DE FILTRADO ACTUALIZADA (Buscador + Filtro Dólar)
  const filteredData = data.filter(item => {
    const matchesSearch = item.descripcion?.toLowerCase().includes(filter.toLowerCase()) ||
                         item.id_articulo?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesDolar = dolarFilter === "all" || 
                        (dolarFilter === "dolar" && item.es_dolar) || 
                        (dolarFilter === "pesos" && !item.es_dolar);
    
    return matchesSearch && matchesDolar;
  });

  const listaHijosDisponibles = data.filter(item => 
    item.id_articulo.toLowerCase().includes(busquedaHijo.toLowerCase()) ||
    item.descripcion.toLowerCase().includes(busquedaHijo.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* HEADER DE CONTROL */}
      <div className="sticky top-[-16px] z-30 bg-slate-50/95 backdrop-blur-sm pb-4 pt-2 -mx-2 px-2 border-b mb-6">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          <div className="flex items-center gap-3 w-full max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar descripción o ID..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 bg-white border-slate-200"
              />
            </div>

            {/* NUEVO SELECT DE FILTRO POR MONEDA */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 h-10 shadow-sm">
              <Filter className="h-4 w-4 text-slate-400" />
              <select 
                value={dolarFilter} 
                onChange={(e) => setDolarFilter(e.target.value as any)}
                className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="dolar">Solo Dólar</option>
                <option value="pesos">Solo Pesos</option>
              </select>
            </div>

            <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700 gap-2 shadow-sm">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </div>

          <div className="flex items-end gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Valor Dólar</Label>
              <Input type="number" value={tempDolar} onChange={(e) => setTempDolar(Number(e.target.value))} className="w-24 h-10 font-bold text-blue-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Factor FOB</Label>
              <Input type="number" step="0.1" value={tempFob} onChange={(e) => setTempFob(Number(e.target.value))} className="w-20 h-10 font-bold text-amber-600" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Financ. %</Label>
              <Input type="number" value={tempFinanc} onChange={(e) => setTempFinanc(Number(e.target.value))} className="w-32 h-10 font-bold text-purple-600" />
            </div>
            <Button onClick={aplicarCambiosGlobales} className="h-10 bg-blue-600 hover:bg-blue-700 shadow-md gap-2 px-6">
              <RefreshCw className="h-4 w-4" /> Guardar variables
            </Button>
          </div>
        </div>
      </div>
      
      {/* TABLA PRINCIPAL */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[150px] font-bold">Cód. Artículo</TableHead>
              <TableHead className="font-bold">Descripción</TableHead>
              <TableHead className="w-[80px] text-center">Kit</TableHead>
              <TableHead className="w-[100px] text-center font-bold">Es Dólar</TableHead>
              <TableHead className="w-[140px] text-center font-bold">Precio Base</TableHead>
              <TableHead className="w-[180px] text-right pr-8 font-bold">Final ARS (Preview)</TableHead>
              <TableHead className="w-[140px] text-center font-bold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              let finalArs = 0;
              if (item.isKit) {
                finalArs = Number(item.costo_final_ars || 0);
              } else {
                const subtotal = item.es_dolar 
                  ? Number(item.costo_usd) * tempDolar * tempFob 
                  : Number(item.costo_usd);
                finalArs = item.es_dolar 
                  ? subtotal * (1 + (tempFinanc / 100)) 
                  : subtotal;
              }

              return (
                <TableRow key={item.id} className="hover:bg-blue-50/30 transition-colors">
                  <TableCell className="font-mono text-blue-600">{item.id_articulo}</TableCell>
                  <TableCell className="font-medium uppercase text-[11px]">{item.descripcion}</TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-8 w-8 ${item.isKit ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-50'}`} 
                      onClick={() => handleOpenKitModal(item)}
                    >
                      <Boxes className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.es_dolar ? "default" : "secondary"}>{item.es_dolar ? "SÍ" : "NO"}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-slate-500">
                    {item.es_dolar ? 'U$S ' : '$ '} {Number(item.costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right pr-8 font-extrabold text-green-700 text-lg">
                    ${finalArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleOpenModal(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => deleteArticulo(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="text-[10px] text-slate-400 italic text-right pr-4 pb-10">
        * Vista Previa &rarr; Dólar: ${tempDolar.toLocaleString('es-AR')} | FOB: x{tempFob.toFixed(2)} | Financ: {tempFinanc}%
      </div>

      {/* MODAL 1: EDICIÓN / CREACIÓN SIMPLE */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className="text-xl font-bold">{editingArticulo?.id ? "Editar Artículo" : "Nuevo Artículo"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="sku">ID de Artículo (SKU)</Label>
              <Input id="sku" value={editingArticulo?.id_articulo || ""} onChange={e => setEditingArticulo({...editingArticulo, id_articulo: e.target.value})} required className="bg-slate-50" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc">Descripción</Label>
              <Input id="desc" value={editingArticulo?.descripcion || ""} onChange={e => setEditingArticulo({...editingArticulo, descripcion: e.target.value})} required className="bg-slate-50 uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Costo Base</Label>
                <Input id="price" type="number" step="0.01" value={editingArticulo?.costo_usd || 0} onChange={e => setEditingArticulo({...editingArticulo, costo_usd: Number(e.target.value)})} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="is-usd">¿Es Dólar?</Label>
                <select id="is-usd" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingArticulo?.es_dolar ? "true" : "false"} onChange={e => setEditingArticulo({...editingArticulo, es_dolar: e.target.value === "true"})}>
                  <option value="true">SÍ (Usar Dólar/FOB)</option>
                  <option value="false">NO (Pesos Directo)</option>
                </select>
              </div>
            </div>
            <DialogFooter className="pt-4"><Button type="submit" className="bg-blue-600 hover:bg-blue-700 px-8">Guardar Cambios</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: COMPOSICIÓN DE KIT */}
      <Dialog open={isKitModalOpen} onOpenChange={setIsKitModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Boxes className="h-6 w-6 text-amber-600" />
              Composición: {selectedPadre?.id_articulo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-2 relative">
              <Label className="font-bold">Agregar Artículo al Kit</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Buscar por SKU o descripción..." value={busquedaHijo} onChange={(e) => setBusquedaHijo(e.target.value)} className="pl-10" />
              </div>
              {busquedaHijo && (
                <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg mt-1 overflow-hidden">
                  {listaHijosDisponibles.map(hijo => (
                    <button key={hijo.id} onClick={() => addComponente(hijo.id_articulo)} className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex justify-between">
                      <span className="font-bold">{hijo.id_articulo}</span>
                      <span className="text-slate-500 truncate ml-4">{hijo.descripcion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-[11px]">SKU HIJO</TableHead>
                    <TableHead className="text-center font-bold text-[11px]">CANT</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {componentesTemp.map((comp) => (
                    <TableRow key={comp.sku_hijo}>
                      <TableCell className="font-mono text-xs">{comp.sku_hijo}</TableCell>
                      <TableCell className="text-center">
                        <Input type="number" min="1" value={comp.cantidad} onChange={(e) => updateQuantity(comp.sku_hijo, Number(e.target.value))} className="w-16 h-8 text-center mx-auto" />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeComponente(comp.sku_hijo)} className="h-8 w-8 text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {componentesTemp.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-8 italic">Este artículo no tiene componentes asociados aún.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
              <p className="text-[11px] text-slate-500 italic">* El costo del padre se actualizará sumando sus componentes.</p>
              <Button onClick={saveComposicion} className="bg-amber-600 hover:bg-amber-700 px-8">Guardar Composición</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
