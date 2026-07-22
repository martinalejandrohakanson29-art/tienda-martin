"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, ArrowLeft, Edit, Save, Loader2, Database, Plus, EyeOff, Eye, History, User, ListChecks, Truck, Check, X, FileSpreadsheet, Upload, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { actualizarArticuloDesdeLista, crearArticuloMostrador, toggleOcultarArticulo, obtenerHistorialArticulo, aplicarProveedorMasivo, previsualizarExcelProveedor, aplicarActualizacionMasivaExcel } from "@/app/actions/listas";
import type { PreviewExcelResultado } from "@/app/actions/listas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  costo?: number;
  margenGanancia?: number;
  oculto?: boolean;
  codigoProveedor?: string | null;
  proveedorId?: string | null;
  proveedorNombre?: string | null;
}

interface ProveedorOpcion {
  id: string;
  nombre: string;
}

export default function ArticulosClient({
  articulosIniciales,
  proveedores
}: {
  articulosIniciales: Articulo[];
  proveedores: ProveedorOpcion[];
}) {
  const [articulos, setArticulos] = useState<Articulo[]>(articulosIniciales);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Estados para Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; 
  
  // Estados para el Modal de Edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editData, setEditData] = useState<Articulo | null>(null);
  
  // Estados para edición inline del Costo en la tabla
  const [editandoCostoId, setEditandoCostoId] = useState<string | null>(null);
  const [costoTemp, setCostoTemp] = useState<string>("");
  const [guardandoCostoId, setGuardandoCostoId] = useState<string | null>(null);
  const cancelarSaveRef = useRef(false);

  // Estados para edición inline de Proveedor (Select, guarda al elegir) en la tabla
  const [guardandoProveedorSelId, setGuardandoProveedorSelId] = useState<string | null>(null);

  // Estados para edición inline del Código Proveedor (guarda al salir del campo) en la tabla
  const [editandoCodigoProveedorId, setEditandoCodigoProveedorId] = useState<string | null>(null);
  const [codigoProveedorTemp, setCodigoProveedorTemp] = useState<string>("");
  const [guardandoCodigoProveedorId, setGuardandoCodigoProveedorId] = useState<string | null>(null);
  const cancelarSaveCodigoProveedorRef = useRef(false);

  // Estado para ocultar/mostrar artículos
  const [togglingOcultoId, setTogglingOcultoId] = useState<string | null>(null);
  const [soloOcultos, setSoloOcultos] = useState(false);

  // Estados para selección múltiple y acciones masivas (funciona sobre TODO el filtro, no solo la página visible)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("aplicar_proveedor");
  const [bulkProveedorId, setBulkProveedorId] = useState<string>("none");
  const [aplicandoBulk, setAplicandoBulk] = useState(false);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Estados para el Modal de Actualización de Precios desde Excel
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelStep, setExcelStep] = useState<"upload" | "preview">("upload");
  const [excelProveedorId, setExcelProveedorId] = useState<string>("");
  const [excelArchivoNombre, setExcelArchivoNombre] = useState<string | null>(null);
  const [excelDragging, setExcelDragging] = useState(false);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelPreview, setExcelPreview] = useState<PreviewExcelResultado | null>(null);
  const [excelPorcentaje, setExcelPorcentaje] = useState<string>("");
  const [aplicandoExcel, setAplicandoExcel] = useState(false);
  const excelFileRef = useRef<HTMLInputElement>(null);

  // Estados para el Modal de Historial
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historialActual, setHistorialActual] = useState<{ id: string; usuario: string; accion: string; detalle: string | null; createdAt: Date }[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Estados para el Modal de Creación
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newData, setNewData] = useState<Articulo>({
    id: "",
    nombre: "",
    precio: 0,
    stock: 0,
    costo: 0,
    margenGanancia: 0,
    codigoProveedor: "",
    proveedorId: null
  });

  // --- NUEVO BUSCADOR INTELIGENTE Y FLEXIBLE ---
  const articulosFiltrados = useMemo(() => {
    const quitarAcentos = (texto: string) =>
      texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let lista = soloOcultos ? articulos.filter(art => art.oculto) : articulos;

    if (!searchTerm.trim()) return lista;

    const busquedaLimpia = quitarAcentos(searchTerm.toLowerCase().trim());
    const palabrasBuscadas = busquedaLimpia.split(/\s+/);

    return lista.filter(art => {
      const nombreLimpio = quitarAcentos(art.nombre.toLowerCase());
      const idLimpio = quitarAcentos(art.id.toLowerCase());
      const codigoProveedorLimpio = quitarAcentos((art.codigoProveedor || "").toLowerCase());
      const proveedorLimpio = quitarAcentos((art.proveedorNombre || "").toLowerCase());
      return palabrasBuscadas.every(p => nombreLimpio.includes(p) || idLimpio.includes(p) || codigoProveedorLimpio.includes(p) || proveedorLimpio.includes(p));
    });
  }, [searchTerm, articulos, soloOcultos]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, soloOcultos]);

  // Lógica de Paginación
  const totalPages = Math.ceil(articulosFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedArticulos = articulosFiltrados.slice(startIndex, startIndex + itemsPerPage);

  // --- Selección múltiple: siempre relativa a TODO lo que devuelve el filtro actual, sin importar la página ---
  const idsFiltrados = useMemo(() => articulosFiltrados.map(a => a.id), [articulosFiltrados]);
  const seleccionadosEnFiltro = useMemo(
    () => idsFiltrados.filter(id => selectedIds.has(id)).length,
    [idsFiltrados, selectedIds]
  );
  const todosFiltradosSeleccionados = idsFiltrados.length > 0 && seleccionadosEnFiltro === idsFiltrados.length;
  const algunosFiltradosSeleccionados = seleccionadosEnFiltro > 0 && !todosFiltradosSeleccionados;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = algunosFiltradosSeleccionados;
    }
  }, [algunosFiltradosSeleccionados]);

  const toggleSeleccionarTodosFiltrados = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (todosFiltradosSeleccionados) {
        idsFiltrados.forEach(id => next.delete(id));
      } else {
        idsFiltrados.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSeleccionarUno = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const limpiarSeleccion = () => setSelectedIds(new Set());

  const handleAplicarProveedorMasivo = async () => {
    if (selectedIds.size === 0) return;
    setAplicandoBulk(true);

    const ids = Array.from(selectedIds);
    const proveedorId = bulkProveedorId === "none" ? null : bulkProveedorId;
    const res = await aplicarProveedorMasivo(ids, proveedorId);

    if (res.success) {
      const idsSet = new Set(ids);
      const proveedorNombre = res.proveedorNombre ?? null;
      setArticulos(prev => prev.map(a => idsSet.has(a.id) ? { ...a, proveedorId, proveedorNombre } : a));
      setSelectedIds(new Set());
      setBulkProveedorId("none");
    } else {
      alert("Error: " + res.error);
    }

    setAplicandoBulk(false);
  };

  // --- Actualización de precios desde Excel de proveedor ---
  const abrirModalExcel = () => {
    setExcelStep("upload");
    setExcelProveedorId("");
    setExcelArchivoNombre(null);
    setExcelPreview(null);
    setExcelError(null);
    setExcelPorcentaje("");
    setExcelDragging(false);
    setIsExcelModalOpen(true);
  };

  const procesarArchivoExcel = async (file: File) => {
    if (!excelProveedorId) {
      setExcelError("Elegí primero el proveedor de la lista de precios.");
      return;
    }
    setCargandoExcel(true);
    setExcelError(null);
    setExcelArchivoNombre(file.name);

    const fd = new FormData();
    fd.append("file", file);
    const res = await previsualizarExcelProveedor(fd, excelProveedorId);

    if (res.success && res.data) {
      setExcelPreview(res.data);
      setExcelStep("preview");
    } else {
      setExcelError(res.error || "No se pudo procesar el archivo.");
    }
    setCargandoExcel(false);
  };

  const onExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) procesarArchivoExcel(f);
    e.target.value = "";
  };

  const onExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setExcelDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) procesarArchivoExcel(f);
  };

  const handleAplicarExcel = async () => {
    if (!excelPreview || excelPreview.items.length === 0) return;
    const pct = Number(excelPorcentaje);
    if (excelPorcentaje.trim() === "" || isNaN(pct) || pct < 0) {
      alert("Ingresá un % de marcación válido.");
      return;
    }
    setAplicandoExcel(true);

    const updates = excelPreview.items.map(it => ({ id: it.id, costoNuevo: it.costoNuevo }));
    const res = await aplicarActualizacionMasivaExcel(updates, pct);

    if (res.success) {
      const updatesMap = new Map(excelPreview.items.map(it => [it.id, it.costoNuevo]));
      setArticulos(prev => prev.map(a => {
        const costoNuevo = updatesMap.get(a.id);
        if (costoNuevo === undefined) return a;
        return { ...a, costo: costoNuevo, margenGanancia: pct, precio: calcularPrecio(costoNuevo, pct) };
      }));
      setIsExcelModalOpen(false);
    } else {
      alert("Error: " + res.error);
    }
    setAplicandoExcel(false);
  };

  // Funciones de Edición
  const abrirModalEdicion = (articulo: Articulo) => {
    setEditData({ ...articulo });
    setIsEditModalOpen(true);
  };

  const handleGuardarCambios = async () => {
    if (!editData) return;
    setIsSubmitting(true);

    const res = await actualizarArticuloDesdeLista(
      editData.id,
      editData.nombre,
      editData.precio,
      editData.stock,
      editData.costo,
      editData.margenGanancia,
      editData.codigoProveedor || undefined,
      editData.proveedorId || null
    );

    if (res.success) {
      const proveedorNombre = proveedores.find(p => p.id === editData.proveedorId)?.nombre || null;
      setArticulos(prev => prev.map(a => a.id === editData.id ? { ...editData, proveedorNombre } : a));
      setIsEditModalOpen(false);
    } else {
      alert("Error: " + res.error);
    }
    
    setIsSubmitting(false);
  };

  const handleCrearArticulo = async () => {
    if (!newData.id || !newData.nombre) {
      alert("ID y Nombre son obligatorios");
      return;
    }
    setIsSubmitting(true);

    const res = await crearArticuloMostrador(newData);

    if (res.success) {
      const proveedorNombre = proveedores.find(p => p.id === newData.proveedorId)?.nombre || null;
      setArticulos(prev => [...prev, { ...newData, proveedorNombre }]);
      setIsCreateModalOpen(false);
      setNewData({ id: "", nombre: "", precio: 0, stock: 0, costo: 0, margenGanancia: 0, codigoProveedor: "", proveedorId: null });
    } else {
      alert("Error: " + res.error);
    }
    
    setIsSubmitting(false);
  };

  // --- Edición inline del Costo desde la tabla ---
  const iniciarEdicionCosto = (art: Articulo) => {
    setEditandoCostoId(art.id);
    setCostoTemp(art.costo && art.costo > 0 ? String(art.costo) : "");
  };

  const cancelarEdicionCosto = () => {
    setEditandoCostoId(null);
    setCostoTemp("");
  };

  const guardarCosto = async (art: Articulo) => {
    const nuevoCosto = Number(costoTemp);
    // Sin cambios o valor inválido: cancelar sin tocar el servidor
    if (costoTemp.trim() === "" || isNaN(nuevoCosto) || nuevoCosto < 0 || nuevoCosto === (art.costo ?? 0)) {
      cancelarEdicionCosto();
      return;
    }
    setEditandoCostoId(null);
    setGuardandoCostoId(art.id);

    // Reutilizamos la acción existente; el precio de venta NO se recalcula al editar el costo inline.
    const res = await actualizarArticuloDesdeLista(
      art.id, art.nombre, art.precio, art.stock, nuevoCosto, art.margenGanancia, art.codigoProveedor || undefined, art.proveedorId || null
    );

    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, costo: nuevoCosto } : a));
    } else {
      alert("Error: " + res.error);
    }
    setGuardandoCostoId(null);
    setCostoTemp("");
  };

  // --- Edición inline del Proveedor desde la tabla: guarda apenas se elige una opción ---
  const guardarProveedorInline = async (art: Articulo, nuevoProveedorId: string | null) => {
    if (nuevoProveedorId === (art.proveedorId || null)) return;
    setGuardandoProveedorSelId(art.id);

    const res = await actualizarArticuloDesdeLista(
      art.id, art.nombre, art.precio, art.stock, art.costo, art.margenGanancia, art.codigoProveedor || undefined, nuevoProveedorId
    );

    if (res.success) {
      const proveedorNombre = proveedores.find(p => p.id === nuevoProveedorId)?.nombre || null;
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, proveedorId: nuevoProveedorId, proveedorNombre } : a));
    } else {
      alert("Error: " + res.error);
    }
    setGuardandoProveedorSelId(null);
  };

  // --- Edición inline del Código Proveedor desde la tabla: guarda al salir del campo ---
  const iniciarEdicionCodigoProveedor = (art: Articulo) => {
    setEditandoCodigoProveedorId(art.id);
    setCodigoProveedorTemp(art.codigoProveedor || "");
  };

  const cancelarEdicionCodigoProveedor = () => {
    setEditandoCodigoProveedorId(null);
    setCodigoProveedorTemp("");
  };

  const guardarCodigoProveedor = async (art: Articulo) => {
    const nuevoCodigoProveedor = codigoProveedorTemp.trim();
    // Sin cambios: cancelar sin tocar el servidor
    if (nuevoCodigoProveedor === (art.codigoProveedor || "")) {
      cancelarEdicionCodigoProveedor();
      return;
    }
    setEditandoCodigoProveedorId(null);
    setGuardandoCodigoProveedorId(art.id);

    const res = await actualizarArticuloDesdeLista(
      art.id, art.nombre, art.precio, art.stock, art.costo, art.margenGanancia, nuevoCodigoProveedor || undefined, art.proveedorId || null
    );

    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, codigoProveedor: nuevoCodigoProveedor } : a));
    } else {
      alert("Error: " + res.error);
    }
    setGuardandoCodigoProveedorId(null);
    setCodigoProveedorTemp("");
  };

  const abrirHistorial = async (art: Articulo) => {
    setIsHistorialModalOpen(true);
    setCargandoHistorial(true);
    const res = await obtenerHistorialArticulo(art.id);
    setHistorialActual(res.success ? (res.data ?? []) : []);
    setCargandoHistorial(false);
  };

  const handleToggleOcultar = async (art: Articulo) => {
    setTogglingOcultoId(art.id);
    const nuevoEstado = !art.oculto;
    const res = await toggleOcultarArticulo(art.id, nuevoEstado);
    if (res.success) {
      setArticulos(prev => prev.map(a => a.id === art.id ? { ...a, oculto: nuevoEstado } : a));
    } else {
      alert("Error: " + res.error);
    }
    setTogglingOcultoId(null);
  };

  // Marcación real sobre el costo: (precio - costo) / costo * 100
  const calcularMarcacion = (costo?: number, precio?: number): number | null => {
    if (!costo || costo <= 0 || precio == null) return null;
    return ((precio - costo) / costo) * 100;
  };

  const calcularPrecio = (costo: number, margen: number) => {
    return Number((costo * (1 + margen / 100)).toFixed(2));
  };

  const handleCostoChange = (val: number, isEdit: boolean) => {
    if (isEdit && editData) {
      const nuevoPrecio = calcularPrecio(val, editData.margenGanancia || 0);
      setEditData({ ...editData, costo: val, precio: nuevoPrecio });
    } else if (!isEdit) {
      const nuevoPrecio = calcularPrecio(val, newData.margenGanancia || 0);
      setNewData({ ...newData, costo: val, precio: nuevoPrecio });
    }
  };

  const handleMargenChange = (val: number, isEdit: boolean) => {
    if (isEdit && editData) {
      const nuevoPrecio = calcularPrecio(editData.costo || 0, val);
      setEditData({ ...editData, margenGanancia: val, precio: nuevoPrecio });
    } else if (!isEdit) {
      const nuevoPrecio = calcularPrecio(newData.costo || 0, val);
      setNewData({ ...newData, margenGanancia: val, precio: nuevoPrecio });
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/listas" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-indigo-200">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-1">Artículos Mostrador</h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Gestión de productos de venta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={abrirModalExcel}
            variant="outline"
            className="rounded-xl font-bold gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <FileSpreadsheet className="h-5 w-5" />
            Aumentar precios desde Excel
          </Button>
          <Button
            onClick={() => {
              const nuevoId = "ART-" + Math.random().toString(36).substring(2, 9).toUpperCase();
              setNewData({ ...newData, id: nuevoId });
              setIsCreateModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md gap-2"
          >
            <Plus className="h-5 w-5" />
            Crear nuevo artículo
          </Button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden">
        
        {/* Barra de Búsqueda */}
        <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Ej: kit 170, etc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setSoloOcultos(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all flex-shrink-0 ${soloOcultos ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Solo ocultos
          </button>
          <div className="ml-auto px-4 text-right flex-shrink-0">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Total Registros</p>
            <p className="text-lg font-black text-slate-800">{articulosFiltrados.length}</p>
          </div>
        </div>

        {/* Barra de Acciones Masivas: aparece al tildar el check de selección */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-indigo-600 text-white pl-4 pr-2 py-2.5 rounded-2xl shadow-lg shadow-indigo-200/60 flex-shrink-0 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-white/15 p-2 rounded-xl flex-shrink-0">
              <ListChecks className="h-4 w-4" />
            </div>
            <div className="flex-shrink-0">
              <p className="text-sm font-black leading-tight">
                {selectedIds.size} artículo{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </p>
              <button
                onClick={limpiarSeleccion}
                className="text-[11px] text-indigo-100 hover:text-white underline underline-offset-2 transition-colors"
              >
                Limpiar selección
              </button>
            </div>

            <div className="h-8 w-px bg-white/20 mx-1 flex-shrink-0" />

            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="h-9 text-xs font-bold bg-white/10 text-white border border-white/25 rounded-xl px-2.5 outline-none cursor-pointer hover:bg-white/15 transition-colors flex-shrink-0"
            >
              <option value="aplicar_proveedor" className="text-slate-800">Aplicar proveedor</option>
            </select>

            {bulkAction === "aplicar_proveedor" && (
              <div className="flex items-center gap-2 bg-white/10 rounded-xl p-1.5 pl-3 flex-shrink-0">
                <Truck className="h-3.5 w-3.5 text-indigo-100 flex-shrink-0" />
                <select
                  value={bulkProveedorId}
                  onChange={(e) => setBulkProveedorId(e.target.value)}
                  disabled={aplicandoBulk}
                  className="h-8 text-xs font-bold bg-white text-slate-700 rounded-lg px-2 outline-none min-w-[170px] cursor-pointer"
                >
                  <option value="none">Sin proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <Button
                  onClick={handleAplicarProveedorMasivo}
                  disabled={aplicandoBulk}
                  size="sm"
                  className="bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold h-8 px-4 shadow-none"
                >
                  {aplicandoBulk ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Aplicar
                </Button>
              </div>
            )}

            <button
              onClick={limpiarSeleccion}
              title="Cancelar selección"
              className="ml-auto p-1.5 hover:bg-white/15 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Tabla de Datos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
                <TableRow>
                  <TableHead className="py-4 w-10 pl-4">
                    <Checkbox
                      ref={headerCheckboxRef}
                      checked={todosFiltradosSeleccionados}
                      onCheckedChange={toggleSeleccionarTodosFiltrados}
                      disabled={idsFiltrados.length === 0}
                      title="Seleccionar todos los artículos filtrados (todas las páginas)"
                      className="h-4 w-4"
                    />
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">ID Artículo</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Nombre / Descripción</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Proveedor</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4">Costo ($)</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4">Precio Base ($)</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4">Marcación</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4">Stock Físico</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4 w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedArticulos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-20 text-center text-slate-400 italic">
                      No se encontraron artículos con esa búsqueda.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedArticulos.map((art) => (
                    <TableRow key={art.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedIds.has(art.id) ? 'bg-indigo-50/50' : ''} ${art.oculto ? 'bg-slate-50/60' : ''}`}>
                      <TableCell className="py-3 pl-4">
                        <Checkbox
                          checked={selectedIds.has(art.id)}
                          onCheckedChange={() => toggleSeleccionarUno(art.id)}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className={`text-xs font-mono py-3 ${art.oculto ? 'text-slate-300' : 'text-slate-400'}`}>{art.id}</TableCell>
                      <TableCell className={`font-bold py-3 ${art.oculto ? 'text-slate-400' : 'text-slate-800'}`}>
                        <div className="flex items-center gap-2">
                          {art.nombre}
                          {art.oculto && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 border border-slate-300">
                              <EyeOff className="h-2.5 w-2.5" /> Oculto
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-0.5 min-w-[150px]">
                          {/* Proveedor: guarda apenas se elige una opción del combo.
                              Select nativo (no Radix): con ~300 proveedores, montar un
                              SelectItem de Radix por opción en cada fila de la tabla
                              tranca el hilo principal unos cientos de ms por apertura. */}
                          <div className="flex items-center gap-1.5">
                            <select
                              value={art.proveedorId || "none"}
                              onChange={(e) => guardarProveedorInline(art, e.target.value === "none" ? null : e.target.value)}
                              disabled={guardandoProveedorSelId === art.id}
                              className={`h-7 text-xs font-bold border-none bg-transparent shadow-none px-1.5 -ml-1.5 rounded-lg hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none max-w-[160px] ${art.oculto ? 'text-slate-400' : 'text-slate-700'} ${!art.proveedorId ? 'text-slate-300 font-normal' : ''}`}
                            >
                              <option value="none">Sin proveedor</option>
                              {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                              ))}
                            </select>
                            {guardandoProveedorSelId === art.id && (
                              <Loader2 className="h-3 w-3 animate-spin text-indigo-500 flex-shrink-0" />
                            )}
                          </div>

                          {/* Código Proveedor: guarda al salir del campo (blur) o Enter */}
                          {editandoCodigoProveedorId === art.id ? (
                            <Input
                              autoFocus
                              value={codigoProveedorTemp}
                              onChange={(e) => setCodigoProveedorTemp(e.target.value)}
                              placeholder="Código proveedor"
                              onBlur={() => {
                                if (cancelarSaveCodigoProveedorRef.current) {
                                  cancelarSaveCodigoProveedorRef.current = false;
                                  cancelarEdicionCodigoProveedor();
                                } else {
                                  guardarCodigoProveedor(art);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  cancelarSaveCodigoProveedorRef.current = true;
                                  e.currentTarget.blur();
                                }
                              }}
                              className="h-7 text-[11px] font-mono bg-white border-indigo-300 focus-visible:ring-indigo-500"
                            />
                          ) : guardandoCodigoProveedorId === art.id ? (
                            <div className="flex justify-start px-1.5">
                              <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => iniciarEdicionCodigoProveedor(art)}
                              title="Clic para editar el código proveedor"
                              className="text-left rounded-lg px-1.5 py-0.5 -mx-1.5 hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-all"
                            >
                              {art.codigoProveedor ? (
                                <span className="text-[10px] font-mono text-slate-400">{art.codigoProveedor}</span>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-200 italic">Sin código</span>
                              )}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        {editandoCostoId === art.id ? (
                          <Input
                            autoFocus
                            type="number"
                            value={costoTemp}
                            onChange={(e) => setCostoTemp(e.target.value)}
                            onBlur={() => {
                              if (cancelarSaveRef.current) {
                                cancelarSaveRef.current = false;
                                cancelarEdicionCosto();
                              } else {
                                guardarCosto(art);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              } else if (e.key === "Escape") {
                                cancelarSaveRef.current = true;
                                e.currentTarget.blur();
                              }
                            }}
                            className="h-8 w-28 ml-auto text-right font-bold bg-white border-indigo-300 focus-visible:ring-indigo-500"
                          />
                        ) : guardandoCostoId === art.id ? (
                          <div className="flex justify-end">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => iniciarEdicionCosto(art)}
                            title="Clic para editar el costo"
                            className="ml-auto block text-right rounded-lg px-2 py-1 hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-all"
                          >
                            {art.costo && art.costo > 0 ? (
                              <span className="font-bold text-slate-700">$ {art.costo.toLocaleString('es-AR')}</span>
                            ) : (
                              <span className="text-red-500 font-black" title="Sin costo cargado">✗</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 py-3">
                        $ {art.precio.toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {(() => {
                          const marc = calcularMarcacion(art.costo, art.precio);
                          if (marc === null) return <span className="text-slate-300">—</span>;
                          return (
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${marc < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {marc.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <span className={`text-xs font-black px-3 py-1 rounded-lg border ${art.stock <= 0 ? 'bg-red-50 text-red-600 border-red-200' : art.stock <= 5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                          {art.stock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirModalEdicion(art)}
                            className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-lg h-8 px-2"
                          >
                            <Edit className="h-4 w-4 mr-1.5" /> Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleOcultar(art)}
                            disabled={togglingOcultoId === art.id}
                            title={art.oculto ? "Mostrar en ventas" : "Ocultar de ventas"}
                            className={`rounded-lg h-8 px-2 ${art.oculto ? 'text-orange-500 hover:text-orange-700 hover:bg-orange-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                          >
                            {togglingOcultoId === art.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : art.oculto
                                ? <><Eye className="h-4 w-4 mr-1" />Mostrar</>
                                : <><EyeOff className="h-4 w-4 mr-1" />Ocultar</>
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirHistorial(art)}
                            title="Ver historial de cambios"
                            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg h-8 px-2"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* CONTROLES DE PAGINACIÓN */}
          {articulosFiltrados.length > 0 && (
            <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between flex-shrink-0">
              <div className="text-xs text-slate-500">
                Mostrando <span className="font-bold text-slate-700">{startIndex + 1}</span> a <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, articulosFiltrados.length)}</span> de <span className="font-bold text-slate-700">{articulosFiltrados.length}</span>
              </div>
              
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="h-8 border-slate-300 text-slate-600"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                
                <span className="text-xs font-bold text-slate-600">
                  Página {currentPage} de {totalPages}
                </span>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="h-8 border-slate-300 text-slate-600"
                >
                  Siguiente <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE EDICIÓN */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-indigo-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
              <Edit className="h-5 w-5 text-indigo-600" /> Editar Registro
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Modifica los valores del artículo. Los cambios afectarán al sistema de ventas inmediatamente.
            </DialogDescription>
          </DialogHeader>
          
          {editData && (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
                <Input 
                  value={editData.nombre} 
                  onChange={(e) => setEditData({...editData, nombre: e.target.value})} 
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Proveedor</Label>
                  <Select
                    value={editData.proveedorId || "none"}
                    onValueChange={(v) => setEditData({...editData, proveedorId: v === "none" ? null : v})}
                  >
                    <SelectTrigger className="bg-slate-50 border-slate-200 focus:ring-indigo-500">
                      <SelectValue placeholder="Sin proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proveedor</SelectItem>
                      {proveedores.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Código Proveedor</Label>
                  <Input
                    value={editData.codigoProveedor || ""}
                    onChange={(e) => setEditData({...editData, codigoProveedor: e.target.value})}
                    placeholder="ID del artículo en el proveedor"
                    className="font-mono bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                  <Input
                    type="number"
                    value={editData.costo}
                    onChange={(e) => handleCostoChange(Number(e.target.value), true)} 
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                  <Input 
                    type="number" 
                    value={editData.margenGanancia} 
                    onChange={(e) => handleMargenChange(Number(e.target.value), true)} 
                    className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Precio Final ($)</Label>
                  <Input 
                    type="number" 
                    value={editData.precio} 
                    onChange={(e) => setEditData({...editData, precio: Number(e.target.value)})} 
                    className="font-black text-lg bg-indigo-50 border-indigo-200 text-indigo-700 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Stock Físico</Label>
                  <Input 
                    type="number" 
                    value={editData.stock} 
                    onChange={(e) => setEditData({...editData, stock: Number(e.target.value)})} 
                    className="font-black text-lg bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
                 <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">ID Interno (No editable)</p>
                 <p className="text-xs font-mono text-slate-600">{editData.id}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button 
              onClick={handleGuardarCambios} 
              disabled={isSubmitting} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* MODAL DE CREACIÓN */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-2 border-indigo-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-900">
              <Plus className="h-5 w-5 text-indigo-600" /> Nuevo Artículo
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Ingresa los datos del nuevo artículo para el mostrador.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">ID Artículo (SKU)</Label>
                <Input 
                  value={newData.id} 
                  readOnly
                  className="font-mono bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Stock Inicial</Label>
                <Input 
                  type="number" 
                  value={newData.stock} 
                  onChange={(e) => setNewData({...newData, stock: Number(e.target.value)})} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">Nombre / Descripción</Label>
              <Input 
                value={newData.nombre} 
                onChange={(e) => setNewData({...newData, nombre: e.target.value})}
                className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Proveedor</Label>
                <Select
                  value={newData.proveedorId || "none"}
                  onValueChange={(v) => setNewData({...newData, proveedorId: v === "none" ? null : v})}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200 focus:ring-indigo-500">
                    <SelectValue placeholder="Sin proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {proveedores.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Código Proveedor</Label>
                <Input
                  value={newData.codigoProveedor || ""}
                  onChange={(e) => setNewData({...newData, codigoProveedor: e.target.value})}
                  placeholder="ID del artículo en el proveedor"
                  className="font-mono bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Costo ($)</Label>
                <Input 
                  type="number" 
                  value={newData.costo} 
                  onChange={(e) => handleCostoChange(Number(e.target.value), false)} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">% Ganancia</Label>
                <Input 
                  type="number" 
                  value={newData.margenGanancia} 
                  onChange={(e) => handleMargenChange(Number(e.target.value), false)} 
                  className="font-bold bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <Label className="text-xs font-bold text-indigo-600 uppercase mb-2 block">Precio Final de Venta</Label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-indigo-900">$</span>
                <Input 
                  type="number" 
                  value={newData.precio} 
                  onChange={(e) => setNewData({...newData, precio: Number(e.target.value)})} 
                  className="font-black text-2xl bg-white border-indigo-200 text-indigo-700 focus-visible:ring-indigo-500 h-12"
                />
              </div>
              <p className="text-[10px] text-indigo-400 mt-2 font-medium italic">* Puedes ajustar el precio manualmente si lo deseas.</p>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button 
              onClick={handleCrearArticulo} 
              disabled={isSubmitting} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Crear Artículo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* MODAL DE ACTUALIZACIÓN DE PRECIOS DESDE EXCEL */}
      <Dialog open={isExcelModalOpen} onOpenChange={setIsExcelModalOpen}>
        <DialogContent className="sm:max-w-[640px] rounded-3xl p-6 border-2 border-emerald-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-emerald-900">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Aumentar precios desde Excel
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Subí la lista de precios del proveedor para actualizar el costo por código de proveedor.
            </DialogDescription>
          </DialogHeader>

          {excelStep === "upload" ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase">Proveedor</Label>
                {/* Select nativo (no Radix): con ~300 proveedores, permite escribir para saltar
                    directo a la opción (ej. tipear "paolucci"), algo que un Select de Radix no ofrece. */}
                <select
                  value={excelProveedorId}
                  onChange={(e) => { setExcelProveedorId(e.target.value); setExcelError(null); }}
                  className="w-full h-10 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
                >
                  <option value="">Elegí el proveedor de la planilla</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  El cruce se hace por el "Código Proveedor" cargado en cada artículo de este proveedor.
                </p>
              </div>

              <div
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 transition-all
                  ${!excelProveedorId ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50" :
                    excelDragging ? "border-emerald-400 bg-emerald-50 cursor-pointer" : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer"}`}
                onClick={() => excelProveedorId && excelFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (excelProveedorId) setExcelDragging(true); }}
                onDragLeave={() => setExcelDragging(false)}
                onDrop={(e) => { if (excelProveedorId) onExcelDrop(e); else e.preventDefault(); }}
              >
                {cargandoExcel ? (
                  <>
                    <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                    <p className="text-sm font-medium text-slate-600">Procesando <span className="text-emerald-700">{excelArchivoNombre}</span>…</p>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-emerald-100 rounded-xl">
                      <Upload className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 text-center">
                      {excelDragging ? "Soltá el archivo aquí" : "Arrastrá el XLSX o hacé clic para seleccionar"}
                    </p>
                    <p className="text-[11px] text-slate-400">.xlsx / .xls / .csv</p>
                  </>
                )}
              </div>
              <input ref={excelFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onExcelFileChange} />

              {excelError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">
                  {excelError}
                </div>
              )}
            </div>
          ) : excelPreview && (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Coinciden</p>
                  <p className="text-xl font-black text-slate-700">{excelPreview.coincidencias}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-red-400 uppercase flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Suben</p>
                  <p className="text-xl font-black text-red-600">{excelPreview.suben}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Bajan</p>
                  <p className="text-xl font-black text-emerald-600">{excelPreview.bajan}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-center gap-1"><Minus className="h-3 w-3" /> Igual</p>
                  <p className="text-xl font-black text-slate-500">{excelPreview.iguales}</p>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>Archivo: <span className="text-slate-600 font-medium">{excelArchivoNombre}</span></span>
                <span>Filas en Excel: <span className="text-slate-600 font-medium">{excelPreview.totalFilasExcel}</span></span>
                <span>Artículos del proveedor con código: <span className="text-slate-600 font-medium">{excelPreview.articulosProveedor}</span></span>
                {excelPreview.sinMatchEnExcel > 0 && (
                  <span className="text-amber-600">{excelPreview.sinMatchEnExcel} artículo{excelPreview.sinMatchEnExcel !== 1 ? "s" : ""} sin coincidencia en el Excel</span>
                )}
              </div>

              {excelPreview.items.length > 0 && (
                <div className="border border-slate-100 rounded-xl max-h-[220px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase text-[10px]">Artículo</th>
                        <th className="text-right px-3 py-2 font-bold text-slate-500 uppercase text-[10px]">Costo Actual</th>
                        <th className="text-right px-3 py-2 font-bold text-slate-500 uppercase text-[10px]">Costo Nuevo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.items.map(it => (
                        <tr key={it.id} className="border-b border-slate-50">
                          <td className="px-3 py-1.5 text-slate-700 truncate max-w-[220px]" title={it.nombre}>{it.nombre}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-500">$ {it.costoActual.toLocaleString('es-AR')}</td>
                          <td className={`px-3 py-1.5 text-right font-mono font-bold ${it.costoNuevo > it.costoActual ? 'text-red-600' : it.costoNuevo < it.costoActual ? 'text-emerald-600' : 'text-slate-500'}`}>
                            $ {it.costoNuevo.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <Label className="text-xs font-bold text-emerald-700 uppercase mb-2 block">% de marcación a aplicar</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={excelPorcentaje}
                    onChange={(e) => setExcelPorcentaje(e.target.value)}
                    placeholder="Ej: 35"
                    className="font-black text-lg bg-white border-emerald-200 text-emerald-700 focus-visible:ring-emerald-500"
                  />
                  <span className="text-2xl font-black text-emerald-700">%</span>
                </div>
                <p className="text-[10px] text-emerald-500 mt-2 font-medium italic">
                  Se aplica sobre el costo nuevo a los {excelPreview.coincidencias} artículos coincidentes.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-3 mt-4">
            {excelStep === "preview" && (
              <Button
                variant="ghost"
                onClick={() => { setExcelStep("upload"); setExcelPreview(null); setExcelError(null); }}
                className="text-slate-500 hover:text-slate-700 mr-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Cargar otro archivo
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsExcelModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            {excelStep === "preview" && (
              <Button
                onClick={handleAplicarExcel}
                disabled={aplicandoExcel || excelPreview?.items.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-8 shadow-md"
              >
                {aplicandoExcel ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Aplicar cambios
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* MODAL DE HISTORIAL */}
      <Dialog open={isHistorialModalOpen} onOpenChange={setIsHistorialModalOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <History className="h-5 w-5 text-slate-500" /> Historial de Cambios
            </DialogTitle>
            <DialogDescription>Aquí verás todas las modificaciones realizadas sobre este artículo.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[500px] overflow-y-auto">
            {cargandoHistorial ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : historialActual.length === 0 ? (
              <div className="text-center text-slate-400 italic py-10">No hay modificaciones registradas para este artículo.</div>
            ) : (
              historialActual.map((auditoria) => (
                <div key={auditoria.id} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-4 items-start">
                  <div className="bg-white p-2 border border-slate-200 rounded-lg"><User className="h-4 w-4 text-slate-400" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{auditoria.usuario}</p>
                    <p className="text-xs text-slate-500 mb-2">{new Date(auditoria.createdAt).toLocaleString('es-AR')}</p>
                    <div className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-100">
                      <span className="font-bold text-amber-600 block mb-1">{auditoria.accion}</span>
                      {auditoria.detalle}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter><Button onClick={() => setIsHistorialModalOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}