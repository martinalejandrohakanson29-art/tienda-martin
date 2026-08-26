// app/admin/mercadolibre/composicion/composicion-table.tsx
"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Trash2, Pencil, Check, CopyPlus, PackagePlus,
  Loader2, PackageOpen, Layers, X, ArrowRight, CheckCircle2,
  AlertCircle, Sparkles, ExternalLink, RefreshCw
} from "lucide-react";
import { upsertKitComponent, deleteKitComponent, createProductWithRecipe } from "@/app/actions/kits";
import { deleteManualProduct } from "@/app/actions/ml-maestros";
import { consultarVariantesMLA, type VarianteML } from "@/app/actions/ml-consulta";
import { cn } from "@/lib/utils";

const fmtMoneda = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export function ComposicionTable({ kits, articulos, maestros }: { kits: any[], articulos: any[], maestros: any[] }) {
  const router = useRouter();

  // Estados sincronizados con props
  const [localKits, setLocalKits] = useState<any[]>(kits || []);
  const [localMaestros, setLocalMaestros] = useState<any[]>(maestros || []);

  useEffect(() => {
    setLocalKits(kits || []);
  }, [kits]);

  useEffect(() => {
    setLocalMaestros(maestros || []);
  }, [maestros]);

  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all' | 'new'>('all');

  // MODAL 1: RECETAS INDIVIDUALES (Edición rápida desde la tabla)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSavingKit, setIsSavingKit] = useState(false);
  const [searchArticuloKitModal, setSearchArticuloKitModal] = useState("");

  // MODAL 2: MODAL PROGRESIVO UNIFICADO (Crear / Importar Variantes con Receta)
  const [isUnifiedModalOpen, setIsUnifiedModalOpen] = useState(false);
  const [mlSearchInput, setMlSearchInput] = useState("");
  const [mlSearchLoading, setMlSearchLoading] = useState(false);
  const [mlSearchResults, setMlSearchResults] = useState<VarianteML[] | null>(null);
  const [mlSearchError, setMlSearchError] = useState<string | null>(null);

  // Variante activa en el modal progresivo
  const [activeVariantIndex, setActiveVariantIndex] = useState<number>(0);
  const [copiedRecipeTemplate, setCopiedRecipeTemplate] = useState<any[] | null>(null);

  // Estado del producto maestro activo en el formulario
  const [newProduct, setNewProduct] = useState({
    mla: "",
    titulo: "",
    nombre_variante: "",
    variation_id: "",
    user_product_id: "",
    family_id: "",
    es_nuevo: false
  });

  // Componentes de la receta de la variante activa
  const [recipeComponents, setRecipeComponents] = useState<Array<{
    id: number;
    id_articulo: string;
    cantidad: number;
    nombre_articulo: string;
    costo_unitario?: number;
  }>>([]);

  // Insumo a agregar a la receta
  const [newComponent, setNewComponent] = useState({
    id_articulo: "",
    cantidad: 1,
    nombre_articulo: "",
    costo_unitario: 0
  });
  const [searchArticulo, setSearchArticulo] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<any>(null);

  const [isSubmittingVariant, setIsSubmittingVariant] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // --- DETECTOR EN TIEMPO REAL DEL ESTADO DE UNA VARIANTE ---
  const getVariantStatus = (v: {
    mla?: string | null;
    variation_id?: string | number | null;
    nombre_variante?: string | null;
  }) => {
    const vMla = String(v.mla || "").trim().toUpperCase();
    const vVarId = v.variation_id != null && String(v.variation_id).trim() !== "" ? String(v.variation_id).trim() : null;
    const vVarName = v.nombre_variante != null && String(v.nombre_variante).trim() !== "" && v.nombre_variante !== "Único"
      ? String(v.nombre_variante).trim()
      : null;

    // 1. Buscar coincidencia en productos maestros
    const maestro = localMaestros.find(m => {
      if ((m.mla || "").toUpperCase() !== vMla) return false;
      if (vVarId && m.variation_id) return String(m.variation_id).trim() === vVarId;
      if (vVarName && m.nombre_variante) return m.nombre_variante.trim().toLowerCase() === vVarName.toLowerCase();
      if (!vVarId && (!m.variation_id || m.variation_id === "")) return true;
      return false;
    }) || localMaestros.find(m => (m.mla || "").toUpperCase() === vMla);

    // 2. Buscar componentes en kits
    const comps = localKits.filter(k => {
      if ((k.mla || "").toUpperCase() !== vMla) return false;
      if (vVarId && k.variation_id) return String(k.variation_id).trim() === vVarId;
      if (vVarName && k.nombre_variante && k.nombre_variante !== "0") {
        return k.nombre_variante.trim().toLowerCase() === vVarName.toLowerCase();
      }
      if (!vVarId && (!k.variation_id || k.variation_id === "")) return true;
      return false;
    });

    if (comps.length > 0) {
      return {
        tipo: "con_receta" as const,
        label: `Con Receta (${comps.length})`,
        componentes: comps,
        maestro
      };
    }
    if (maestro) {
      return {
        tipo: "sin_receta" as const,
        label: "Sin Receta",
        componentes: [],
        maestro
      };
    }
    return {
      tipo: "nuevo" as const,
      label: "Pendiente",
      componentes: [],
      maestro: null
    };
  };

  // --- COMBINAR KITS CON MAESTROS SIN RECETA ---
  const combinedKits = [...localKits];

  if (localMaestros) {
    localMaestros.forEach(maestro => {
      const hasKit = localKits.some(k =>
        k.mla === maestro.mla &&
        k.variation_id === maestro.variation_id
      );

      const hasKitSimple = !maestro.variation_id && localKits.some(k => k.mla === maestro.mla);

      if (!hasKit && !hasKitSimple) {
        combinedKits.push({
          id: `maestro-${maestro.mla}-${maestro.variation_id || 'base'}`,
          mla: maestro.mla,
          variation_id: maestro.variation_id,
          nombre_variante: maestro.nombre_variante,
          nombre_publicacion: maestro.nombre_publicacion || "",
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
        nombre_publicacion: item.nombre_publicacion || item.titulo || "",
        user_product_id: item.user_product_id,
        family_id: item.family_id,
        estado: item.estado || null,
        es_nuevo: item.es_nuevo ?? false,
        components: [],
        isDummy: false,
        costoTotal: 0,
        costoIncompleto: false,
      };
      acc.push(group);
    }
    if (item.isDummy) {
      group.isDummy = true;
    } else {
      group.components.push(item);
      if (item.subtotal != null) {
        group.costoTotal += item.subtotal;
      } else {
        group.costoIncompleto = true;
      }
    }
    return acc;
  }, []);

  // --- FILTRADO A NIVEL DE GRUPO ---
  const kitGroups = allGroups.filter((group: any) => {
    if (statusFilter === 'new' && !group.es_nuevo) return false;
    if (statusFilter === 'active' && group.estado?.toLowerCase() !== 'active') return false;
    if (statusFilter === 'paused' && group.estado?.toLowerCase() !== 'paused') return false;

    if (!filter) return true;
    const term = filter.toLowerCase().trim();
    return (
      group.mla?.toLowerCase().includes(term) ||
      group.nombre_publicacion?.toLowerCase().includes(term) ||
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
    ).slice(0, 8)
    : [];

  const sugerenciasArticulosKitModal = searchArticuloKitModal.length > 1
    ? articulos.filter(a =>
      a.id_articulo.toLowerCase().includes(searchArticuloKitModal.toLowerCase()) ||
      a.descripcion?.toLowerCase().includes(searchArticuloKitModal.toLowerCase())
    ).slice(0, 8)
    : [];

  const variantesDeMaestro = (mla: string | undefined | null) => {
    const m = (mla || "").trim().toUpperCase();
    if (!m) return [] as { variation_id: string; nombre_variante: string }[];
    const vistos = new Set<string>();
    const out: { variation_id: string; nombre_variante: string }[] = [];
    for (const x of (localMaestros || [])) {
      if ((x.mla || "").trim().toUpperCase() !== m) continue;
      const vid = x.variation_id ? String(x.variation_id).trim() : "";
      if (!vid || vistos.has(vid)) continue;
      vistos.add(vid);
      out.push({ variation_id: vid, nombre_variante: (x.nombre_variante || "").trim() });
    }
    return out;
  };

  // --- HANDLERS DEL MODAL DE RECETAS INDIVIDUALES ---
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
        router.refresh();
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
      if (res.success) {
        setLocalKits(prev => prev.filter(k => k.id !== id));
        router.refresh();
      } else {
        alert("Error al eliminar el componente. Intente nuevamente.");
      }
    }
  };

  const handleDeleteMaster = async (mla: string, variation_id?: string) => {
    if (confirm("¿Eliminar este producto maestro del sistema? Esto lo borrará también de la sección de costos.")) {
      const res = await deleteManualProduct(mla, variation_id);
      if (res.success) {
        setLocalMaestros(prev => prev.filter(m => !(m.mla === mla && (variation_id ? m.variation_id === variation_id : !m.variation_id))));
        router.refresh();
      } else {
        alert("Error: " + res.error);
      }
    }
  };

  // --- SELECCIONAR VARIANTE EN EL MODAL PROGRESIVO ---
  const selectVariantForEditing = (v: VarianteML, index: number, templateRecipe?: any[]) => {
    setActiveVariantIndex(index);
    setSavedFeedback(null);

    const cleanVarName = v.nombre_variante === "Único" ? "" : String(v.nombre_variante ?? "");

    setNewProduct({
      mla: String(v.mla ?? ""),
      titulo: String(v.titulo ?? ""),
      nombre_variante: cleanVarName,
      variation_id: v.variation_id != null ? String(v.variation_id) : "",
      user_product_id: v.user_product_id != null ? String(v.user_product_id) : "",
      family_id: v.family_id != null ? String(v.family_id) : "",
      es_nuevo: false
    });

    // Cargar receta existente o plantilla
    const status = getVariantStatus(v);
    if (status.componentes.length > 0) {
      setRecipeComponents(status.componentes.map((c, i) => ({
        id: c.id || (Date.now() + i),
        id_articulo: c.id_articulo,
        cantidad: c.cantidad || 1,
        nombre_articulo: c.nombre_articulo || "",
        costo_unitario: c.costo_unitario || 0
      })));
    } else if (templateRecipe && templateRecipe.length > 0) {
      setRecipeComponents(templateRecipe.map((c, i) => ({
        id: Date.now() + i + Math.floor(Math.random() * 1000),
        id_articulo: c.id_articulo,
        cantidad: c.cantidad,
        nombre_articulo: c.nombre_articulo,
        costo_unitario: c.costo_unitario || 0
      })));
    } else if (copiedRecipeTemplate && copiedRecipeTemplate.length > 0) {
      setRecipeComponents(copiedRecipeTemplate.map((c, i) => ({
        id: Date.now() + i + Math.floor(Math.random() * 1000),
        id_articulo: c.id_articulo,
        cantidad: c.cantidad,
        nombre_articulo: c.nombre_articulo,
        costo_unitario: c.costo_unitario || 0
      })));
    } else {
      setRecipeComponents([]);
    }

    setNewComponent({ id_articulo: "", cantidad: 1, nombre_articulo: "", costo_unitario: 0 });
    setSearchArticulo("");
    setSelectedComponent(null);
  };

  // Abrir modal progresivo
  const handleOpenUnifiedModal = (initialMla = "") => {
    setNewProduct({
      mla: initialMla,
      titulo: "",
      nombre_variante: "",
      variation_id: "",
      user_product_id: "",
      family_id: "",
      es_nuevo: false
    });
    setRecipeComponents([]);
    setNewComponent({ id_articulo: "", cantidad: 1, nombre_articulo: "", costo_unitario: 0 });
    setSearchArticulo("");
    setSelectedComponent(null);
    setMlSearchInput(initialMla);
    setMlSearchResults(null);
    setMlSearchError(null);
    setSavedFeedback(null);
    setActiveVariantIndex(0);
    setCopiedRecipeTemplate(null);
    setIsUnifiedModalOpen(true);
  };

  // Búsqueda en ML via n8n
  const handleSearchML = async () => {
    if (!mlSearchInput.trim()) return;
    setMlSearchLoading(true);
    setMlSearchError(null);
    setSavedFeedback(null);

    const result = await consultarVariantesMLA(mlSearchInput);
    if (result.success && result.data && result.data.length > 0) {
      setMlSearchResults(result.data);
      // Seleccionar automáticamente la primera variante
      selectVariantForEditing(result.data[0], 0);
    } else {
      setMlSearchResults(null);
      setMlSearchError(result.error || "No se encontraron publicaciones ni variantes para este MLA.");
    }
    setMlSearchLoading(false);
  };

  // Agregar componente a la receta de la variante activa
  const handleAddRecipeComponent = () => {
    if (newComponent.id_articulo) {
      if (recipeComponents.some(c => c.id_articulo === newComponent.id_articulo)) {
        alert("Este componente ya está en la receta de esta variante.");
        return;
      }
      setRecipeComponents([...recipeComponents, { ...newComponent, id: Date.now() }]);
      setNewComponent({ id_articulo: "", cantidad: 1, nombre_articulo: "", costo_unitario: 0 });
      setSelectedComponent(null);
      setSearchArticulo("");
    }
  };

  const handleSelectArticulo = (articulo: any) => {
    const costo = articulo.costo_final_ars ? Number(articulo.costo_final_ars) : (articulo.costo ? Number(articulo.costo) : 0);
    setNewComponent({
      id_articulo: articulo.id_articulo,
      cantidad: 1,
      nombre_articulo: articulo.descripcion || "",
      costo_unitario: costo
    });
    setSearchArticulo("");
    setSelectedComponent(articulo);
  };

  const handleRemoveRecipeComponent = (id: number) => {
    setRecipeComponents(recipeComponents.filter(c => c.id !== id));
  };

  const handleUpdateComponentQty = (id: number, cantidad: number) => {
    setRecipeComponents(recipeComponents.map(c => c.id === id ? { ...c, cantidad: Math.max(1, cantidad) } : c));
  };

  // GUARDAR VARIANTE ACTIVA (con opción de pasar a la siguiente)
  const handleSaveActiveVariant = async (andNext = false) => {
    if (!newProduct.mla || !newProduct.titulo) {
      alert("El MLA y el Título son obligatorios.");
      return;
    }

    if (recipeComponents.length === 0) {
      alert("Debe agregar al menos un componente a la receta de esta variante.");
      return;
    }

    setIsSubmittingVariant(true);
    setSavedFeedback(null);

    try {
      const res = await createProductWithRecipe({
        mla: newProduct.mla,
        titulo: newProduct.titulo,
        nombre_variante: newProduct.nombre_variante,
        variation_id: newProduct.variation_id,
        user_product_id: newProduct.user_product_id,
        family_id: newProduct.family_id,
        es_nuevo: newProduct.es_nuevo,
        componentes: recipeComponents.map(c => ({
          id_articulo: c.id_articulo,
          cantidad: c.cantidad,
          nombre_articulo: c.nombre_articulo
        }))
      });

      if (res.success) {
        const savedMla = newProduct.mla.trim().toUpperCase();
        const savedVarId = newProduct.variation_id ? newProduct.variation_id.trim() : null;
        const savedVarName = newProduct.nombre_variante ? newProduct.nombre_variante.trim() : null;

        // Actualización optimista de localMaestros
        setLocalMaestros(prev => {
          const existingIdx = prev.findIndex(m =>
            m.mla.toUpperCase() === savedMla &&
            (savedVarId ? m.variation_id === savedVarId : (!m.variation_id || m.variation_id === ""))
          );
          const updatedItem = {
            mla: savedMla,
            nombre_publicacion: newProduct.titulo,
            nombre_variante: savedVarName,
            variation_id: savedVarId,
            user_product_id: newProduct.user_product_id || null,
            family_id: newProduct.family_id || null,
            estado: "active",
            es_nuevo: newProduct.es_nuevo
          };
          if (existingIdx >= 0) {
            const copy = [...prev];
            copy[existingIdx] = { ...copy[existingIdx], ...updatedItem };
            return copy;
          }
          return [...prev, updatedItem];
        });

        // Actualización optimista de localKits
        setLocalKits(prev => {
          const filtered = prev.filter(k => !(
            k.mla.toUpperCase() === savedMla &&
            (savedVarId ? k.variation_id === savedVarId : (k.nombre_variante === savedVarName || (!k.variation_id && !savedVarId)))
          ));
          const newComps = recipeComponents.map(c => {
            const art = articulos.find(a => a.id_articulo === c.id_articulo);
            const costoUnit = art?.costo_final_ars ? Number(art.costo_final_ars) : (c.costo_unitario || 0);
            return {
              id: Date.now() + Math.random(),
              mla: savedMla,
              variation_id: savedVarId,
              nombre_variante: savedVarName || "0",
              id_articulo: c.id_articulo,
              nombre_articulo: c.nombre_articulo,
              cantidad: c.cantidad,
              costo_unitario: costoUnit,
              subtotal: costoUnit * c.cantidad,
              nombre_publicacion: newProduct.titulo,
              user_product_id: newProduct.user_product_id,
              family_id: newProduct.family_id,
              estado: "active",
              es_nuevo: newProduct.es_nuevo
            };
          });
          return [...filtered, ...newComps];
        });

        router.refresh();

        const varLabel = newProduct.nombre_variante || "Principal";
        setSavedFeedback(`¡Variante "${varLabel}" (${newProduct.mla}) guardada correctamente!`);

        // Si se pidió pasar a la siguiente variante
        if (andNext && mlSearchResults && mlSearchResults.length > 1) {
          let nextIdx = -1;
          for (let i = activeVariantIndex + 1; i < mlSearchResults.length; i++) {
            const st = getVariantStatus(mlSearchResults[i]);
            if (st.tipo !== "con_receta") {
              nextIdx = i;
              break;
            }
          }
          if (nextIdx === -1) {
            for (let i = 0; i < activeVariantIndex; i++) {
              const st = getVariantStatus(mlSearchResults[i]);
              if (st.tipo !== "con_receta") {
                nextIdx = i;
                break;
              }
            }
          }
          if (nextIdx === -1) {
            nextIdx = (activeVariantIndex + 1) % mlSearchResults.length;
          }

          if (nextIdx !== activeVariantIndex) {
            selectVariantForEditing(mlSearchResults[nextIdx], nextIdx);
          }
        }
      } else {
        alert("Error al guardar: " + res.error);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error inesperado.");
    } finally {
      setIsSubmittingVariant(false);
    }
  };

  // Copiar receta actual a pendientes
  const handleCopyRecipeToPending = () => {
    if (recipeComponents.length === 0) {
      alert("La receta actual no tiene componentes para copiar.");
      return;
    }
    setCopiedRecipeTemplate(recipeComponents);
    alert(`¡Plantilla copiada! Las variantes pendientes que selecciones vendrán con estos ${recipeComponents.length} componente(s) pre-cargados para que solo tengas que ajustar o guardar.`);
  };

  const costoTotalRecetaActiva = recipeComponents.reduce((acc, c) => {
    const art = articulos.find(a => a.id_articulo === c.id_articulo);
    const unit = art?.costo_final_ars ? Number(art.costo_final_ars) : (c.costo_unitario || 0);
    return acc + (unit * c.cantidad);
  }, 0);

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-end md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por MLA, Título, Receta, UP o Familia..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 bg-white border-slate-200 shadow-sm"
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Button
              onClick={() => handleOpenUnifiedModal()}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white gap-2 shadow-md flex-1 md:flex-none font-bold"
            >
              <PackagePlus className="h-4 w-4" />
              Cargar / Importar Variantes de ML
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Estado:</span>
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
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
            <span className="text-xs text-slate-400 font-medium">{kitGroups.length} publicación{kitGroups.length !== 1 ? 'es' : ''}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.refresh()}
            className="text-xs text-slate-500 hover:text-slate-700 gap-1 h-7"
            title="Refrescar datos del servidor"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </Button>
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
              <TableHead className="font-bold text-slate-600">Título / Variante</TableHead>
              <TableHead className="font-bold text-slate-600 w-[100px]">Estado</TableHead>
              <TableHead className="font-bold text-slate-600">Componente (Insumo)</TableHead>
              <TableHead className="font-bold text-slate-600 text-center w-[80px]">Cant.</TableHead>
              <TableHead className="font-bold text-slate-600 text-right w-[150px]">Costo</TableHead>
              <TableHead className="font-bold text-slate-600 text-center w-[140px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kitGroups.map((group: any) => (
              <Fragment key={group.key}>
                {/* Fila cabecera del grupo */}
                <TableRow className="bg-blue-50/40 hover:bg-blue-100/40 transition-colors border-b-0">
                  <TableCell className="font-mono text-blue-700 font-bold text-xs py-3">
                    <div className="flex items-center gap-1.5">
                      <span>{group.mla}</span>
                      <a
                        href={`https://articulo.mercadolibre.com.ar/${group.mla}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-blue-600"
                        title="Ver en MercadoLibre"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TableCell>
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
                    <div className="flex flex-col gap-0.5">
                      {group.nombre_publicacion && (
                        <span className="text-[11px] text-slate-700 font-medium truncate max-w-[280px]" title={group.nombre_publicacion}>
                          {group.nombre_publicacion}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-600 w-fit">
                          {group.nombre_variante || "Única"}
                        </span>
                        {group.variation_id && (
                          <span className="text-[9px] text-slate-400 font-mono">ID: {group.variation_id}</span>
                        )}
                      </div>
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
                  <TableCell className="text-right py-3">
                    {group.components.length === 0 ? (
                      <span className="text-slate-300 text-xs">-</span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-slate-800">{fmtMoneda(group.costoTotal)}</span>
                        {group.costoIncompleto && (
                          <span className="text-[9px] text-amber-600 font-bold uppercase" title="Falta el costo de uno o más componentes">
                            Costo parcial
                          </span>
                        )}
                      </div>
                    )}
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
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleOpenUnifiedModal(group.mla)}
                        className="h-8 w-8 text-indigo-600 hover:bg-indigo-50"
                        title="Abrir en editor de variantes / receta"
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
                    <TableCell className="text-right py-2">
                      {comp.subtotal != null ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-slate-700">{fmtMoneda(comp.subtotal)}</span>
                          <span className="text-[10px] text-slate-400">
                            {fmtMoneda(comp.costo_unitario)} c/u
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-bold uppercase" title="El artículo no está en costos_articulos">
                          Sin costo
                        </span>
                      )}
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

                {group.components.length === 0 && (
                  <TableRow className="bg-white border-slate-100">
                    <TableCell colSpan={5} className="py-2 border-l-2 border-orange-100" />
                    <TableCell colSpan={4} className="py-2 pl-6 text-orange-500 text-xs italic">
                      Sin componentes — usá el botón + para agregar la receta
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* MODAL 1: GESTIÓN DE COMPONENTE INDIVIDUAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingItem?.id ? "Editar Componente" : "Configurar Receta"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveKit} className="space-y-6 pt-4">
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

            {(() => {
              const variantesMLA = variantesDeMaestro(editingItem?.mla);
              const SIN_VARIANTE = "__sin_variante__";
              if (variantesMLA.length > 0) {
                const valorActual = (editingItem?.variation_id || "").trim() || SIN_VARIANTE;
                const esConocida = valorActual === SIN_VARIANTE || variantesMLA.some(v => v.variation_id === valorActual);
                return (
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Variante de la publicación</Label>
                    <Select
                      value={esConocida ? valorActual : ""}
                      onValueChange={(val) => {
                        if (val === SIN_VARIANTE) {
                          setEditingItem({ ...editingItem, variation_id: "", nombre_variante: "" });
                        } else {
                          const v = variantesMLA.find(x => x.variation_id === val);
                          setEditingItem({ ...editingItem, variation_id: val, nombre_variante: v?.nombre_variante || "" });
                        }
                      }}
                    >
                      <SelectTrigger className="bg-slate-50">
                        <SelectValue placeholder="Elegí la variante..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SIN_VARIANTE}>Sin variante (Único)</SelectItem>
                        {variantesMLA.map(v => (
                          <SelectItem key={v.variation_id} value={v.variation_id}>
                            {v.nombre_variante || v.variation_id}
                            <span className="ml-2 text-[10px] text-slate-400 font-mono">{v.variation_id}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">ID Variante</Label>
                    <Input
                      value={editingItem?.variation_id || ""}
                      onChange={e => setEditingItem({ ...editingItem, variation_id: e.target.value })}
                      className="bg-slate-50 font-mono text-xs"
                      placeholder="Opcional"
                    />
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
                </div>
              );
            })()}

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
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b flex justify-between items-center gap-2"
                    >
                      <span className="text-xs font-bold text-blue-600">{art.id_articulo}</span>
                      <span className="text-[10px] text-slate-600 flex-1 text-right">{art.descripcion}</span>
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
                {isSavingKit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: MODAL PROGRESIVO UNIFICADO DE VARIANTES Y RECETAS */}
      <Dialog open={isUnifiedModalOpen} onOpenChange={setIsUnifiedModalOpen}>
        <DialogContent className="sm:max-w-[960px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100 bg-gradient-to-r from-purple-50 via-indigo-50 to-white">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-purple-800 flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-600" />
                Cargador Progresivo de Variantes y Recetas
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Buscá la publicación por MLA en MercadoLibre. Podrás ver todas las variantes asociadas, su estado de carga y armar las recetas una a una de forma progresiva.
            </DialogDescription>
          </DialogHeader>

          {/* BARRA DE BÚSQUEDA ML */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={mlSearchInput}
                  onChange={e => setMlSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSearchML(); } }}
                  placeholder="Ingresá el MLA (ej: MLA3288838680 o MLA1385494305)..."
                  className="pl-9 font-mono uppercase bg-white border-purple-200 focus-visible:ring-purple-500 font-bold"
                />
              </div>
              <Button
                type="button"
                onClick={handleSearchML}
                disabled={mlSearchLoading || !mlSearchInput.trim()}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold gap-2 px-5 shadow-sm"
              >
                {mlSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar en MercadoLibre
              </Button>
            </div>

            {mlSearchError && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{mlSearchError}</span>
              </div>
            )}
          </div>

          {/* CUERPO DEL MODAL */}
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* COLUMNA IZQUIERDA: LISTA DE VARIANTES CON ESTADO */}
            <div className="w-full md:w-[340px] border-r border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-200 bg-slate-100/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase">Variantes de la publicación</span>
                  {mlSearchResults && (
                    <Badge variant="secondary" className="text-[10px] font-mono font-bold">
                      {mlSearchResults.length}
                    </Badge>
                  )}
                </div>
                {mlSearchResults && mlSearchResults.length > 1 && recipeComponents.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyRecipeToPending}
                    className="h-6 text-[10px] text-purple-700 hover:bg-purple-100 px-2 gap-1 font-bold"
                    title="Copiar los insumos actuales para que aparezcan en las demás variantes"
                  >
                    <Sparkles className="h-3 w-3" />
                    Copiar Receta
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {!mlSearchResults ? (
                  <div className="p-6 text-center text-slate-400 space-y-2">
                    <PackageOpen className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs">Buscá un MLA arriba para listar sus variantes y empezar a cargar sus recetas.</p>
                  </div>
                ) : mlSearchResults.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center p-4 italic">No se encontraron variantes para este MLA.</p>
                ) : (
                  mlSearchResults.map((v, i) => {
                    const status = getVariantStatus(v);
                    const isSelected = activeVariantIndex === i;

                    return (
                      <button
                        key={`${v.mla}-${v.variation_id || i}`}
                        type="button"
                        onClick={() => selectVariantForEditing(v, i)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg border transition-all relative flex flex-col gap-1.5",
                          isSelected
                            ? "border-purple-500 bg-purple-50/70 shadow-sm ring-1 ring-purple-400"
                            : "border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "text-xs font-bold uppercase px-2 py-0.5 rounded",
                              isSelected ? "bg-purple-200 text-purple-900" : "bg-slate-100 text-slate-700"
                            )}>
                              {v.nombre_variante || "Única"}
                            </span>
                            {v.variation_id && (
                              <span className="text-[9px] text-slate-400 font-mono">ID: {v.variation_id}</span>
                            )}
                          </div>

                          {/* Badge de Estado Existente */}
                          {status.tipo === "con_receta" ? (
                            <Badge className="bg-green-100 text-green-800 border-green-300 font-bold text-[9px] gap-1 px-1.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              {status.label}
                            </Badge>
                          ) : status.tipo === "sin_receta" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold text-[9px]">
                              {status.label}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-300 font-normal text-[9px]">
                              {status.label}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span className="font-bold text-slate-700">{v.mla}</span>
                          <div className="flex gap-2">
                            <span>${v.precio?.toLocaleString("es-AR")}</span>
                            <span className="text-green-700 font-bold">Stk: {v.stock}</span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-600 line-clamp-1 truncate" title={v.titulo}>
                          {v.titulo}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMNA DERECHA: EDITOR DE LA VARIANTE ACTIVA */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {savedFeedback && (
                <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-xs font-bold text-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>{savedFeedback}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {/* CABECERA DE LA VARIANTE ACTIVA */}
                <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase bg-purple-600 text-white px-2.5 py-0.5 rounded shadow-sm">
                        {newProduct.nombre_variante || "Variante Principal"}
                      </span>
                      <span className="font-mono font-bold text-sm text-purple-900">{newProduct.mla}</span>
                      {newProduct.variation_id && (
                        <span className="font-mono text-xs text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          Var ID: {newProduct.variation_id}
                        </span>
                      )}
                    </div>
                    {newProduct.mla && (
                      <a
                        href={`https://articulo.mercadolibre.com.ar/${newProduct.mla}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-purple-700 hover:text-purple-900 flex items-center gap-1 font-medium"
                      >
                        Ver en ML <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{newProduct.titulo || "Sin título"}</p>
                </div>

                {/* FORMULARIO DE METADATOS (MODIFICABLE SI HACE FALTA) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600">MLA</Label>
                    <Input
                      value={newProduct.mla}
                      onChange={e => setNewProduct({ ...newProduct, mla: e.target.value })}
                      className="h-7 text-xs font-mono uppercase bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600">Nombre Variante</Label>
                    <Input
                      value={newProduct.nombre_variante}
                      onChange={e => setNewProduct({ ...newProduct, nombre_variante: e.target.value })}
                      className="h-7 text-xs bg-white"
                      placeholder="Ej: 28mm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600">User Product ID</Label>
                    <Input
                      value={newProduct.user_product_id}
                      onChange={e => setNewProduct({ ...newProduct, user_product_id: e.target.value })}
                      className="h-7 text-xs font-mono uppercase bg-white"
                      placeholder="Ej: MLAU123"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-600">Familia ID</Label>
                    <Input
                      value={newProduct.family_id}
                      onChange={e => setNewProduct({ ...newProduct, family_id: e.target.value })}
                      className="h-7 text-xs font-mono bg-white"
                      placeholder="Familia..."
                    />
                  </div>
                </div>

                {/* SECCIÓN DE INSUMOS DE LA RECETA */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <PackageOpen className="w-4 h-4 text-green-600" />
                      Insumos de la Receta ({recipeComponents.length})
                    </h3>
                    {costoTotalRecetaActiva > 0 && (
                      <span className="text-xs font-bold text-slate-700">
                        Costo Total: <span className="text-green-700 font-black">{fmtMoneda(costoTotalRecetaActiva)}</span>
                      </span>
                    )}
                  </div>

                  {/* BUSCADOR DE INSUMO PARA AGREGAR */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Buscar insumo o artículo por código o descripción..."
                        value={searchArticulo}
                        onChange={e => setSearchArticulo(e.target.value)}
                        className="pl-10 border-green-200 focus-visible:ring-green-500 bg-white"
                      />
                    </div>

                    {sugerenciasArticulos.length > 0 && (
                      <div className="w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-auto z-20">
                        {sugerenciasArticulos.map((art) => (
                          <div
                            key={art.id_articulo}
                            onClick={() => handleSelectArticulo(art)}
                            className="p-2.5 hover:bg-green-50 cursor-pointer border-b flex justify-between items-center gap-2"
                          >
                            <span className="text-xs font-bold text-green-700 font-mono">{art.id_articulo}</span>
                            <span className="text-xs text-slate-700 flex-1 truncate">{art.descripcion}</span>
                            <span className="text-xs font-bold text-slate-800">
                              {art.costo_final_ars ? fmtMoneda(Number(art.costo_final_ars)) : "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedComponent && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="font-mono font-bold text-xs text-green-800 shrink-0">{selectedComponent.id_articulo}</span>
                          <span className="text-xs text-slate-700 truncate">{selectedComponent.descripcion}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium text-slate-600">Cant:</span>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={newComponent.cantidad}
                              onChange={e => setNewComponent({ ...newComponent, cantidad: Number(e.target.value) })}
                              className="h-8 w-16 text-center font-bold bg-white"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={handleAddRecipeComponent}
                            className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1 font-bold text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* LISTA DE COMPONENTES DE ESTA RECETA */}
                  <div className="space-y-1.5 max-h-52 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                    {recipeComponents.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6 italic">
                        Esta variante aún no tiene insumos agregados. Buscá insumos arriba para agregarlos.
                      </p>
                    ) : (
                      recipeComponents.map((comp) => {
                        const art = articulos.find(a => a.id_articulo === comp.id_articulo);
                        const unitCost = art?.costo_final_ars ? Number(art.costo_final_ars) : (comp.costo_unitario || 0);
                        const subtotal = unitCost * comp.cantidad;

                        return (
                          <div key={comp.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-bold font-mono text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 shrink-0">
                                {comp.id_articulo}
                              </span>
                              <span className="text-xs text-slate-700 truncate" title={comp.nombre_articulo}>
                                {comp.nombre_articulo}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">Cant:</span>
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={comp.cantidad}
                                  onChange={e => handleUpdateComponentQty(comp.id, Number(e.target.value))}
                                  className="h-7 w-14 text-center text-xs font-bold"
                                />
                              </div>

                              {unitCost > 0 && (
                                <div className="text-right min-w-[70px]">
                                  <span className="text-xs font-bold text-slate-800 block">{fmtMoneda(subtotal)}</span>
                                  <span className="text-[9px] text-slate-400 block">{fmtMoneda(unitCost)} c/u</span>
                                </div>
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveRecipeComponent(comp.id)}
                                className="h-7 w-7 text-red-500 hover:bg-red-50"
                                title="Quitar insumo"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* FOOTER DE ACCIÓN PARA LA VARIANTE */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {mlSearchResults && (
                    <span>Variante {activeVariantIndex + 1} de {mlSearchResults.length}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSaveActiveVariant(false)}
                    disabled={isSubmittingVariant || !newProduct.mla || recipeComponents.length === 0}
                    className="border-slate-300 font-bold"
                  >
                    {isSubmittingVariant ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1 text-green-600" />}
                    Guardar Variante
                  </Button>

                  {mlSearchResults && mlSearchResults.length > 1 ? (
                    <Button
                      type="button"
                      onClick={() => handleSaveActiveVariant(true)}
                      disabled={isSubmittingVariant || !newProduct.mla || recipeComponents.length === 0}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold gap-1 shadow-md"
                    >
                      {isSubmittingVariant ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Guardar y Siguiente <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => handleSaveActiveVariant(false)}
                      disabled={isSubmittingVariant || !newProduct.mla || recipeComponents.length === 0}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold shadow-md"
                    >
                      Guardar Producto con Receta
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER GENERAL DEL MODAL */}
          <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
            <span className="text-xs text-slate-400">Podés cerrar en cualquier momento; lo guardado queda registrado inmediatamente.</span>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                setIsUnifiedModalOpen(false);
                router.refresh();
              }}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              Listo / Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
