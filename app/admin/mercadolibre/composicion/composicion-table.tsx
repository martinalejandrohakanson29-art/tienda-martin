// app/admin/mercadolibre/composicion/composicion-table.tsx
"use client";

import { useState, Fragment } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil, Check, CopyPlus, PackagePlus, Loader2, PackageOpen } from "lucide-react";
import { upsertKitComponent, deleteKitComponent, createProductWithRecipe } from "@/app/actions/kits";
import { deleteManualProduct } from "@/app/actions/ml-maestros";
import { consultarVariantesMLA, type VarianteML } from "@/app/actions/ml-consulta";
import { cn } from "@/lib/utils";

export function ComposicionTable({ kits, articulos, maestros }: { kits: any[], articulos: any[], maestros: any[] }) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all' | 'new'>('all');

  // MODAL DE RECETAS (El habitual)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSavingKit, setIsSavingKit] = useState(false); // ESTADO DE CARGA PARA RECETAS

  // MODAL UNIFICADO: Crear producto con receta
  const [isUnifiedModalOpen, setIsUnifiedModalOpen] = useState(false);
  
  // Estado para el producto maestro
  const [newProduct, setNewProduct] = useState({
    mla: "",
    titulo: "",
    nombre_variante: "",
    variation_id: "",
    user_product_id: "",
    family_id: ""
  });
  
  // Estado para los componentes de la receta
  const [newComponent, setNewComponent] = useState({
    id_articulo: "",
    cantidad: 1,
    nombre_articulo: ""
  });
  
  const [recipeComponents, setRecipeComponents] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<any>(null); // Para mostrar el componente seleccionado

  const [searchArticulo, setSearchArticulo] = useState("");
  const [searchArticuloKitModal, setSearchArticuloKitModal] = useState("");

  // Estados para búsqueda ML (n8n)
  const [mlSearchInput, setMlSearchInput] = useState("");
  const [mlSearchLoading, setMlSearchLoading] = useState(false);
  const [mlSearchResults, setMlSearchResults] = useState<VarianteML[] | null>(null);
  const [mlSearchError, setMlSearchError] = useState<string | null>(null);

  // --- COMBINAR KITS CON MAESTROS SIN RECETA ---
  const combinedKits = [...kits];

  // Agregar maestros que no tienen ninguna receta en 'kits'
  if (maestros) {
    maestros.forEach(maestro => {
      // Intentamos encontrar match exacto primero (si tienen variante), sino, fall back al mla
      const hasKit = kits.some(k =>
        k.mla === maestro.mla &&
        k.variation_id === maestro.variation_id
      );

      // Si el maestro no tiene variation_id (es producto simple), solo validamos mla
      const hasKitSimple = !maestro.variation_id && kits.some(k => k.mla === maestro.mla);

      if (!hasKit && !hasKitSimple) {
        combinedKits.push({
          id: `maestro-${maestro.mla}-${maestro.variation_id || 'base'}`,
          mla: maestro.mla,
          variation_id: maestro.variation_id,
          nombre_variante: maestro.nombre_variante,
          id_articulo: "SIN RECETA",
          nombre_articulo: "Haz clic en el '+' de la derecha para agregar componentes",
          cantidad: 0,
          user_product_id: maestro.user_product_id,
          family_id: maestro.family_id,
          estado: maestro.estado || null,
          es_nuevo: maestro.es_nuevo ?? false,
          isDummy: true
        });
      }
    });
  }

  // --- AGRUPAR POR MLA + variation_id ---
  const allGroups = combinedKits.reduce((acc: any[], item) => {
    const key = `${item.mla}||${item.variation_id || ''}`;
    let group = acc.find((g: any) => g.key === key);
    if (!group) {
      group = {
        key,
        mla: item.mla,
        variation_id: item.variation_id,
        nombre_variante: item.nombre_variante,
        user_product_id: item.user_product_id,
        family_id: item.family_id,
        estado: item.estado || null,
        es_nuevo: item.es_nuevo ?? false,
        components: [],
        isDummy: false
      };
      acc.push(group);
    }
    if (item.isDummy) {
      group.isDummy = true;
    } else {
      group.components.push(item);
    }
    return acc;
  }, []);

  // --- FILTRADO A NIVEL DE GRUPO ---
  const kitGroups = allGroups.filter((group: any) => {
    if (statusFilter === 'new' && !group.es_nuevo) return false;
    if (statusFilter === 'active' && group.estado?.toLowerCase() !== 'active') return false;
    if (statusFilter === 'paused' && group.estado?.toLowerCase() !== 'paused') return false;

    if (!filter) return true;
    const term = filter.toLowerCase();
    return (
      group.mla?.toLowerCase().includes(term) ||
      group.user_product_id?.toLowerCase().includes(term) ||
      group.family_id?.toLowerCase().includes(term) ||
      group.nombre_variante?.toLowerCase().includes(term) ||
      group.components.some((c: any) =>
        c.id_articulo?.toLowerCase().includes(term) ||
        c.nombre_articulo?.toLowerCase().includes(term)
      )
    );
  });

  const sugerenciasArticulos = searchArticulo.length > 1
    ? articulos.filter(a =>
      a.id_articulo.toLowerCase().includes(searchArticulo.toLowerCase()) ||
      a.descripcion?.toLowerCase().includes(searchArticulo.toLowerCase())
    ).slice(0, 5)
    : [];

  const sugerenciasArticulosKitModal = searchArticuloKitModal.length > 1
    ? articulos.filter(a =>
      a.id_articulo.toLowerCase().includes(searchArticuloKitModal.toLowerCase()) ||
      a.descripcion?.toLowerCase().includes(searchArticuloKitModal.toLowerCase())
    ).slice(0, 5)
    : [];

  // --- HANDLERS DEL MODAL DE RECETAS (KIT) ---
  const handleOpenModal = (item: any = null) => {
    setEditingItem(item || {
      mla: "", variation_id: "", nombre_variante: "", id_articulo: "", cantidad: 1, nombre_articulo: ""
    });
    setSearchArticuloKitModal("");
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
    setSearchArticuloKitModal("");
    setIsModalOpen(true);
  };

  // Esta función ya no se usa en el modal unificado, se mantiene para compatibilidad

  const handleSaveKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem.id_articulo) {
      alert("Debes seleccionar un artículo de la lista");
      return;
    }

    setIsSavingKit(true);
    try {
      const res = await upsertKitComponent(editingItem);
      if (res.success) {
        setIsModalOpen(false);
        setSearchArticuloKitModal("");
      } else {
        alert("Error al guardar: " + res.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error inesperado al conectar con el servidor.");
    } finally {
      setIsSavingKit(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("¿Eliminar este artículo del kit?")) {
      const res = await deleteKitComponent(id);
      if (!res.success) {
        alert("Error al eliminar el componente. Intente nuevamente.");
      }
    }
  };

  const handleDeleteMaster = async (mla: string, variation_id?: string) => {
    if (confirm("¿Eliminar este producto maestro del sistema? Esto lo borrará también de la sección de costos.")) {
      const res = await deleteManualProduct(mla, variation_id);
      if (!res.success) {
        alert("Error: " + res.error);
      }
    }
  };

  // --- NUEVOS HANDLERS: ALTA DE PRODUCTO MAESTRO ---
  // Abrir modal unificado
  const handleOpenUnifiedModal = () => {
    setNewProduct({
      mla: "",
      titulo: "",
      nombre_variante: "",
      variation_id: "",
      user_product_id: "",
      family_id: ""
    });
    setRecipeComponents([]);
    setNewComponent({ id_articulo: "", cantidad: 1, nombre_articulo: "" });
    setSearchArticulo("");
    setSelectedComponent(null);
    setMlSearchInput("");
    setMlSearchResults(null);
    setMlSearchError(null);
    setIsUnifiedModalOpen(true);
  };

  // Agregar componente a la receta
  const handleAddRecipeComponent = () => {
    if (newComponent.id_articulo) {
      setRecipeComponents([...recipeComponents, { ...newComponent, id: Date.now() }]);
      setNewComponent({ id_articulo: "", cantidad: 1, nombre_articulo: "" });
      setSelectedComponent(null);
    }
  };

  // Seleccionar artículo de la lista de sugerencias
  const handleSelectArticulo = (articulo: any) => {
    setNewComponent({
      id_articulo: articulo.id_articulo,
      cantidad: 1,
      nombre_articulo: articulo.descripcion
    });
    setSearchArticulo("");
    setSelectedComponent(articulo);
  };

  // Eliminar componente de la receta
  const handleRemoveRecipeComponent = (id: number) => {
    setRecipeComponents(recipeComponents.filter(c => c.id !== id));
  };

  // Búsqueda en ML via n8n
  const handleSearchML = async () => {
    if (!mlSearchInput.trim()) return;
    setMlSearchLoading(true);
    setMlSearchError(null);
    setMlSearchResults(null);
    const result = await consultarVariantesMLA(mlSearchInput);
    if (result.success && result.data) {
      setMlSearchResults(result.data);
    } else {
      setMlSearchError(result.error || "Error desconocido");
    }
    setMlSearchLoading(false);
  };

  const handleSelectVariante = (v: VarianteML) => {
    setNewProduct({
      mla: v.mla,
      titulo: v.titulo,
      nombre_variante: v.nombre_variante === "Único" ? "" : v.nombre_variante,
      variation_id: v.variation_id || "",
      user_product_id: v.user_product_id || "",
      family_id: v.family_id || "",
    });
    setMlSearchResults(null);
    setMlSearchInput("");
  };

  // Guardar producto con receta (unificado)
  const handleSaveProductWithRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newProduct.mla || !newProduct.titulo) {
      alert("El MLA y el Título son obligatorios");
      return;
    }
    
    if (recipeComponents.length === 0) {
      alert("Debe agregar al menos un componente a la receta");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await createProductWithRecipe({
        mla: newProduct.mla,
        titulo: newProduct.titulo,
        nombre_variante: newProduct.nombre_variante,
        variation_id: newProduct.variation_id,
        user_product_id: newProduct.user_product_id,
        family_id: newProduct.family_id,
        componentes: recipeComponents
      });
      
      if (res.success) {
        setIsUnifiedModalOpen(false);
        setRecipeComponents([]);
        alert("¡Producto creado con receta correctamente!");
      } else {
        alert(res.error);
      }
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
      <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-end md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por MLA, Receta, UP o Familia..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 bg-white border-slate-200"
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Button
              onClick={handleOpenUnifiedModal}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 gap-2 shadow-md flex-1 md:flex-none"
            >
              <PackagePlus className="h-4 w-4" />
              Crear Producto con Receta
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Estado:</span>
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
            {([
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Activos' },
              { id: 'paused', label: 'Pausados' },
              { id: 'new', label: 'Nuevos' },
            ] as const).map((btn) => (
              <Button
                key={btn.id}
                variant={statusFilter === btn.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(btn.id)}
                className={cn("h-7 px-3 text-xs font-bold transition-all", statusFilter === btn.id
                  ? btn.id === 'new' ? "bg-purple-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100")}
              >
                {btn.label}
              </Button>
            ))}
          </div>
          <span className="text-xs text-slate-400">{kitGroups.length} publicación{kitGroups.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>

      {/* TABLA DE KITS */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold text-slate-600 w-[120px]">MLA</TableHead>
              <TableHead className="font-bold text-blue-600 w-[130px]">User Product</TableHead>
              <TableHead className="font-bold text-purple-600 w-[140px]">Familia</TableHead>
              <TableHead className="font-bold text-slate-600">Variante</TableHead>
              <TableHead className="font-bold text-slate-600 w-[100px]">Estado</TableHead>
              <TableHead className="font-bold text-slate-600">Componente (Insumo)</TableHead>
              <TableHead className="font-bold text-slate-600 text-center w-[80px]">Cant.</TableHead>
              <TableHead className="font-bold text-slate-600 text-center w-[140px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kitGroups.map((group: any) => (
              <Fragment key={group.key}>
                {/* Fila cabecera del grupo (1 por MLA + variante) */}
                <TableRow className="bg-blue-50/40 hover:bg-blue-100/40 transition-colors border-b-0">
                  <TableCell className="font-mono text-blue-700 font-bold text-xs py-3">{group.mla}</TableCell>
                  <TableCell className="py-3">
                    {group.user_product_id ? (
                      <Badge variant="outline" className="font-mono text-[10px] text-blue-600 bg-blue-50 border-blue-200">
                        {group.user_product_id}
                      </Badge>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    {group.family_id ? (
                      <span className="font-mono text-[10px] text-purple-600 max-w-[130px] truncate block" title={group.family_id}>
                        {group.family_id}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-1 rounded text-slate-500 w-fit">
                        {group.nombre_variante || "Única"}
                      </span>
                      {group.variation_id && (
                        <span className="text-[9px] text-slate-400 font-mono mt-0.5">{group.variation_id}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex flex-col gap-1">
                      {group.estado?.toLowerCase() === 'active'
                        ? <Badge className="bg-green-100 text-green-700 border-green-200 font-bold uppercase text-[9px] w-fit">Activo</Badge>
                        : group.estado?.toLowerCase() === 'paused'
                          ? <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 font-bold uppercase text-[9px] w-fit">Pausado</Badge>
                          : <Badge variant="secondary" className="text-slate-500 text-[9px] w-fit">{group.estado || 'S/D'}</Badge>}
                      {group.es_nuevo && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-bold uppercase text-[9px] w-fit">Nuevo</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell colSpan={2} className="py-3">
                    <span className="text-xs text-slate-400 italic">
                      {group.components.length === 0
                        ? "Sin receta"
                        : `${group.components.length} componente${group.components.length !== 1 ? "s" : ""}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-center py-3">
                    <div className="flex justify-center gap-1">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleAddIngredientToKit(group)}
                        className="h-8 w-8 text-green-600 hover:bg-green-50"
                        title="Agregar componente a este producto"
                      >
                        <CopyPlus className="h-4 w-4" />
                      </Button>
                      {group.components.length === 0 && (
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleDeleteMaster(group.mla, group.variation_id)}
                          className="h-8 w-8 text-red-600 hover:bg-red-50"
                          title="Eliminar producto sin receta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Sub-filas de componentes */}
                {group.components.map((comp: any) => (
                  <TableRow key={comp.id} className="hover:bg-slate-50 border-slate-100 bg-white">
                    <TableCell colSpan={5} className="py-2 border-l-2 border-blue-100" />
                    <TableCell className="text-[11px] uppercase text-slate-600 py-2 pl-6">
                      <span className="font-mono font-bold mr-2 text-slate-800">{comp.id_articulo}</span>
                      {comp.nombre_articulo}
                    </TableCell>
                    <TableCell className="text-center font-black text-slate-700 text-sm py-2">
                      {comp.cantidad}
                    </TableCell>
                    <TableCell className="text-center py-2">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleOpenModal(comp)}
                          className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                          title="Editar componente"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleDelete(comp.id as number)}
                          className="h-7 w-7 text-red-600 hover:bg-red-50"
                          title="Eliminar componente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Mensaje si no tiene componentes */}
                {group.components.length === 0 && (
                  <TableRow className="bg-white border-slate-100">
                    <TableCell colSpan={5} className="py-2 border-l-2 border-orange-100" />
                    <TableCell colSpan={3} className="py-2 pl-6 text-orange-500 text-xs italic">
                      Sin componentes — usá el botón + para agregar la receta
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">MLA Destino</Label>
                <Input
                  value={editingItem?.mla || ""}
                  onChange={e => setEditingItem({ ...editingItem, mla: e.target.value })}
                  className="bg-slate-50 font-mono uppercase"
                  placeholder="MLA..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">ID Variante</Label>
                <Input
                  value={editingItem?.variation_id || ""}
                  onChange={e => setEditingItem({ ...editingItem, variation_id: e.target.value })}
                  className="bg-slate-50 font-mono text-xs"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Nombre Variante</Label>
              <Input
                value={editingItem?.nombre_variante || ""}
                onChange={e => setEditingItem({ ...editingItem, nombre_variante: e.target.value })}
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
                  value={searchArticuloKitModal}
                  onChange={e => setSearchArticuloKitModal(e.target.value)}
                  className="pl-10 border-blue-200"
                />
              </div>
              {sugerenciasArticulosKitModal.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto">
                  {sugerenciasArticulosKitModal.map((art) => (
                    <div
                      key={art.id_articulo}
                      onClick={() => {
                        setEditingItem({ ...editingItem, id_articulo: art.id_articulo, nombre_articulo: art.descripcion });
                        setSearchArticuloKitModal("");
                      }}
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
                type="number" min="1" step="1"
                value={editingItem?.cantidad || 1}
                onChange={e => setEditingItem({ ...editingItem, cantidad: Number(e.target.value) })}
                className="text-center font-bold"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} disabled={isSavingKit}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSavingKit}>
                {isSavingKit ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL UNIFICADO: Crear Producto con Receta */}
      <Dialog open={isUnifiedModalOpen} onOpenChange={setIsUnifiedModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100">
            <DialogTitle className="text-xl font-bold text-purple-700 flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Crear Producto con Receta
            </DialogTitle>
            <DialogDescription>
              Complete los datos del producto y agregue sus componentes para crearlo con su receta.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProductWithRecipe} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">

            {/* SECCIÓN 0: BUSCAR EN MERCADOLIBRE */}
            <div className="space-y-3 border-b border-slate-200 pb-5">
              <h3 className="text-sm font-bold text-slate-500 flex items-center gap-2">
                <Search className="w-4 h-4" /> Importar datos desde MercadoLibre
                <span className="text-[10px] font-normal text-slate-400">(opcional — pre-completa el formulario)</span>
              </h3>
              <div className="flex gap-2">
                <Input
                  value={mlSearchInput}
                  onChange={e => setMlSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSearchML(); } }}
                  placeholder="Ej: MLA3336917582"
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  onClick={handleSearchML}
                  disabled={mlSearchLoading || !mlSearchInput.trim()}
                  className="shrink-0 bg-slate-700 hover:bg-slate-800 text-white"
                >
                  {mlSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>

              {mlSearchError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {mlSearchError}
                </p>
              )}

              {mlSearchResults && mlSearchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    {mlSearchResults.length} variante{mlSearchResults.length !== 1 ? "s" : ""} encontrada{mlSearchResults.length !== 1 ? "s" : ""}. Hacé clic para pre-completar el formulario.
                  </p>
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {mlSearchResults.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectVariante(v)}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-colors group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-purple-700">{v.mla}</span>
                            {v.variation_id && (
                              <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1 rounded">{v.variation_id}</span>
                            )}
                          </div>
                          <div className="flex gap-1.5 text-[10px]">
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">${v.precio?.toLocaleString("es-AR")}</span>
                            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">Stock: {v.stock}</span>
                            <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded capitalize hidden group-hover:inline">{v.logistic_type?.replace("_", " ")}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1 truncate">{v.titulo}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{v.nombre_variante}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mlSearchResults && mlSearchResults.length === 0 && (
                <p className="text-xs text-slate-400 italic">No se encontraron variantes para ese MLA.</p>
              )}
            </div>

            {/* SECCIÓN 1: DATOS DEL PRODUCTO */}
            <div className="space-y-3 border-b border-slate-200 pb-4">
              <h3 className="text-sm font-bold text-purple-700 flex items-center gap-2">
                <PackageOpen className="w-4 h-4" /> Datos del Producto
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">MLA (ID Meli)</Label>
                  <Input
                    value={newProduct.mla}
                    onChange={e => setNewProduct({ ...newProduct, mla: e.target.value })}
                    placeholder="Ej: MLA12345678"
                    className="font-mono uppercase border-purple-200 focus:ring-purple-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">ID Variante (Opcional)</Label>
                  <Input
                    value={newProduct.variation_id}
                    onChange={e => setNewProduct({ ...newProduct, variation_id: e.target.value })}
                    placeholder="Ej: 174680..."
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Título de la Publicación</Label>
                <Input
                  value={newProduct.titulo}
                  onChange={e => setNewProduct({ ...newProduct, titulo: e.target.value })}
                  placeholder="Ej: Kit Carburador 150cc Completo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Nombre Variante (Opcional)</Label>
                <Input
                  value={newProduct.nombre_variante}
                  onChange={e => setNewProduct({ ...newProduct, nombre_variante: e.target.value })}
                  placeholder="Ej: Rojo / 28mm"
                />
              </div>
            </div>

            {/* SECCIÓN 2: DATOS ADICIONALES */}
            <div className="space-y-3 border-b border-slate-200 pb-4">
              <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
                <PackageOpen className="w-4 h-4" /> Datos Adicionales
              </h3>
              <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-blue-700 flex items-center gap-1">
                    <PackageOpen className="w-3 h-3" /> User Product ID
                  </Label>
                  <Input
                    value={newProduct.user_product_id}
                    onChange={e => setNewProduct({ ...newProduct, user_product_id: e.target.value })}
                    placeholder="Ej: MLAU12345"
                    className="text-sm font-mono border-blue-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-purple-700">Familia ID</Label>
                  <Input
                    value={newProduct.family_id}
                    onChange={e => setNewProduct({ ...newProduct, family_id: e.target.value })}
                    placeholder="Nombre de familia..."
                    className="text-sm font-mono border-purple-200"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: AGREGAR COMPONENTES DE LA RECETA */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-green-700 flex items-center gap-2">
                <PackageOpen className="w-4 h-4" /> Agregar Componentes de la Receta
              </h3>
              
              {/* Buscador de artículos */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Buscar Artículo</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar insumo..."
                    value={searchArticulo}
                    onChange={e => setSearchArticulo(e.target.value)}
                    className="pl-10 border-green-200"
                  />
                </div>
                {sugerenciasArticulos.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {sugerenciasArticulos.map((art) => (
                      <div
                        key={art.id_articulo}
                        onClick={() => handleSelectArticulo(art)}
                        className="p-3 hover:bg-green-50 cursor-pointer border-b flex justify-between"
                      >
                        <span className="text-xs font-bold text-green-600">{art.id_articulo}</span>
                        <span className="text-[10px] text-slate-600">{art.descripcion}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedComponent && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded flex gap-2 items-center">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-bold">{selectedComponent.id_articulo} - {selectedComponent.descripcion}</span>
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Cantidad</Label>
                <Input
                  type="number" min="1" step="1"
                  value={newComponent.cantidad}
                  onChange={e => setNewComponent({ ...newComponent, cantidad: Number(e.target.value) })}
                  className="text-center font-bold"
                />
              </div>

              {/* Lista de componentes */}
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Componentes Agregados</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50">
                  {recipeComponents.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No hay componentes agregados</p>
                  ) : (
                    recipeComponents.map((comp) => (
                      <div key={comp.id} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200">
                        <div className="flex-1">
                          <span className="text-xs font-bold text-green-600">{comp.id_articulo}</span>
                          <span className="text-[10px] text-slate-500 ml-1">{comp.nombre_articulo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">Cant: {comp.cantidad}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveRecipeComponent(comp.id)}
                            className="h-6 w-6 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddRecipeComponent}
                  disabled={!newComponent.id_articulo}
                  className="w-full border-green-600 text-green-600 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3 w-3 mr-1" /> Agregar Componente
                </Button>
              </div>
            </div>

          </div>

            {/* Footer */}
            <DialogFooter className="px-6 py-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setIsUnifiedModalOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear Producto con Receta"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
