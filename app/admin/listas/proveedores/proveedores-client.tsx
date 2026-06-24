"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, ArrowLeft, Edit, Save, Loader2, Users, Plus, Trash2, Mail, Phone, Fingerprint, Star, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { actualizarProveedor, crearProveedor, eliminarProveedor, toggleMayoristaProveedor } from "@/app/actions/listas";
import { consultarPadron } from "@/app/actions/afip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Proveedor {
  id: string;
  razonSocial: string;
  cuit?: string | null;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
  aliasCbu?: string | null;
  esMayorista: boolean;
  ultimaCompra: string | null;
}

function DiasUltimaCompra({ ultimaCompra }: { ultimaCompra: string | null }) {
  if (!ultimaCompra) {
    return <span className="text-xs text-slate-400">Sin compras</span>;
  }
  const dias = Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24));
  const vencido = dias > 30;
  return (
    <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${vencido ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
      <Clock className="h-3 w-3" />
      {dias === 0 ? "Hoy" : `${dias}d`}
    </div>
  );
}

export default function ProveedoresClient({
  proveedoresIniciales
}: {
  proveedoresIniciales: Proveedor[]
}) {
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales);
  const [searchTerm, setSearchTerm] = useState("");
  const [soloMayoristas, setSoloMayoristas] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Estados para Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Estados para el Modal de Edición/Creación
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Proveedor>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Estados para el Modal de Confirmación de Eliminación
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [proveedorAEliminar, setProveedorAEliminar] = useState<Proveedor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const proveedoresFiltrados = useMemo(() => {
    const quitarAcentos = (texto: string) =>
      texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

    let lista = proveedores;

    if (soloMayoristas) {
      lista = lista.filter(p => p.esMayorista);
    }

    if (!searchTerm.trim()) return lista;

    const busquedaLimpia = quitarAcentos(searchTerm.toLowerCase().trim());
    const palabrasBuscadas = busquedaLimpia.split(/\s+/);

    return lista.filter(p => {
      const rsLimpia = quitarAcentos((p.razonSocial || "").toLowerCase());
      const cuitLimpio = quitarAcentos((p.cuit || "").toLowerCase());
      const fantasiaLimpia = quitarAcentos((p.nombreFantasia || "").toLowerCase());

      return palabrasBuscadas.every(palabra =>
        rsLimpia.includes(palabra) || cuitLimpio.includes(palabra) || fantasiaLimpia.includes(palabra)
      );
    });
  }, [searchTerm, soloMayoristas, proveedores]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, soloMayoristas]);

  // Lógica de Paginación
  const totalPages = Math.ceil(proveedoresFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProveedores = proveedoresFiltrados.slice(startIndex, startIndex + itemsPerPage);

  const handleToggleMayorista = async (proveedor: Proveedor) => {
    const nuevoValor = !proveedor.esMayorista;
    setToggling(proveedor.id);
    // Optimistic update
    setProveedores(prev => prev.map(p => p.id === proveedor.id ? { ...p, esMayorista: nuevoValor } : p));
    const res = await toggleMayoristaProveedor(proveedor.id, nuevoValor);
    if (!res.success) {
      // Revert on error
      setProveedores(prev => prev.map(p => p.id === proveedor.id ? { ...p, esMayorista: proveedor.esMayorista } : p));
    }
    setToggling(null);
  };

  // Funciones de Modal
  const abrirModalCrear = () => {
    setFormData({
      razonSocial: "",
      cuit: "",
      nombreFantasia: "",
      email: "",
      telefono: "",
      aliasCbu: ""
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const abrirModalEdicion = (proveedor: Proveedor) => {
    setFormData({ ...proveedor });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleBuscarPadron = async () => {
    if (!formData.cuit) {
      alert("Ingresa un CUIT/DNI para buscar");
      return;
    }
    setIsSearching(true);
    try {
      const res = await consultarPadron(formData.cuit);
      if (res.success) {
        setFormData({
          ...formData,
          razonSocial: res.nombre,
          cuit: res.cuit || formData.cuit
        });
      } else {
        alert(res.error || "No se encontró el CUIT");
      }
    } catch (e) {
      console.error("Error al consultar padrón:", e);
      alert("Error al consultar padrón");
    } finally {
      setIsSearching(false);
    }
  };

  const handleGuardar = async () => {
    if (!formData.razonSocial) {
      alert("La Razón Social es obligatoria");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && formData.id) {
        const res = await actualizarProveedor(formData.id, formData as any);
        if (res.success && res.data) {
          setProveedores(prev => prev.map(p => p.id === formData.id ? { ...(res.data as any), esMayorista: p.esMayorista, ultimaCompra: p.ultimaCompra } : p));
          setIsModalOpen(false);
        } else {
          alert("Error: " + res.error);
        }
      } else {
        const res = await crearProveedor(formData as any);
        if (res.success && res.data) {
          setProveedores(prev => [{ ...(res.data as any), esMayorista: false, ultimaCompra: null }, ...prev]);
          setIsModalOpen(false);
        } else {
          alert("Error: " + res.error);
        }
      }
    } catch (error) {
      alert("Ocurrió un error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEliminar = (proveedor: Proveedor) => {
    setProveedorAEliminar(proveedor);
    setIsConfirmDeleteOpen(true);
  };

  const confirmarEliminar = async () => {
    if (!proveedorAEliminar) return;
    setIsDeleting(true);
    try {
      const res = await eliminarProveedor(proveedorAEliminar.id);
      if (res.success) {
        setProveedores(prev => prev.filter(p => p.id !== proveedorAEliminar.id));
        setIsConfirmDeleteOpen(false);
        setProveedorAEliminar(null);
      } else {
        alert("Error: " + res.error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const cantidadMayoristas = proveedores.filter(p => p.esMayorista).length;

  return (
    <div className="h-full flex flex-col relative">

      {/* HEADER PRINCIPAL */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/listas" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="bg-amber-600 p-2.5 rounded-xl text-white shadow-md shadow-amber-200">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none mb-1">Lista de Proveedores</h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Gestión centralizada de contactos comerciales</p>
          </div>
        </div>

        <Button
          onClick={abrirModalCrear}
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-md shadow-amber-100 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Agregar Proveedor
        </Button>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden">

        {/* Barra de Búsqueda y Filtros */}
        <div className="flex items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por razón social, CUIT o nombre de fantasía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            />
          </div>

          <button
            onClick={() => setSoloMayoristas(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              soloMayoristas
                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <Star className={`h-4 w-4 ${soloMayoristas ? "fill-white" : ""}`} />
            Mayoristas
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${soloMayoristas ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
              {cantidadMayoristas}
            </span>
          </button>

          <div className="ml-auto px-4 text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
            <p className="text-lg font-black text-slate-800">{proveedoresFiltrados.length}</p>
          </div>
        </div>

        {/* Tabla de Datos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Razón Social</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">CUIT / DNI</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Nombre Fantasía</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Contacto</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4 w-28">Mayorista</TableHead>
                  <TableHead className="text-center text-[10px] font-bold uppercase py-4 w-32">Última compra</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase py-4 w-36">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProveedores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-20 text-center text-slate-400 italic">
                      No se encontraron proveedores.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProveedores.map((p) => (
                    <TableRow key={p.id} className="hover:bg-amber-50/30 transition-colors">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-800">{p.razonSocial}</p>
                          {p.esMayorista && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> MAY
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">
                          {p.cuit}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <p className="text-sm text-slate-600">{p.nombreFantasia || "-"}</p>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-1">
                          {p.email && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Mail className="h-3 w-3" /> {p.email}
                            </div>
                          )}
                          {p.telefono && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Phone className="h-3 w-3" /> {p.telefono}
                            </div>
                          )}
                          {!p.email && !p.telefono && <span className="text-slate-400 text-xs">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <button
                          onClick={() => handleToggleMayorista(p)}
                          disabled={toggling === p.id}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                            p.esMayorista ? "bg-amber-500" : "bg-slate-200"
                          }`}
                          title={p.esMayorista ? "Quitar mayorista" : "Marcar como mayorista"}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              p.esMayorista ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <DiasUltimaCompra ultimaCompra={p.ultimaCompra} />
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirModalEdicion(p)}
                            className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-lg h-8 px-2"
                          >
                            <Edit className="h-4 w-4 mr-1.5" /> Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEliminar(p)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg h-8 px-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          {proveedoresFiltrados.length > 0 && (
            <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between flex-shrink-0">
              <div className="text-xs text-slate-500">
                Mostrando <span className="font-bold text-slate-700">{startIndex + 1}</span> a <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, proveedoresFiltrados.length)}</span> de <span className="font-bold text-slate-700">{proveedoresFiltrados.length}</span>
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

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      <ConfirmDialog
        open={isConfirmDeleteOpen}
        onOpenChange={(open) => { if (!isDeleting) { setIsConfirmDeleteOpen(open); if (!open) setProveedorAEliminar(null); } }}
        title="Eliminar proveedor"
        description={`¿Estás seguro de eliminar a "${proveedorAEliminar?.razonSocial}"? Esta acción no se puede deshacer y puede afectar movimientos de cuenta corriente asociados.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={confirmarEliminar}
        isLoading={isDeleting}
      />

      {/* MODAL DE EDICIÓN / CREACIÓN */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-3xl p-6 border-2 border-amber-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-900">
              {isEditing ? <Edit className="h-5 w-5 text-amber-600" /> : <Plus className="h-5 w-5 text-amber-600" />}
              {isEditing ? "Editar Proveedor" : "Nuevo Proveedor"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Completa la información del proveedor. El CUIT/DNI debe ser único.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                  <Fingerprint className="h-3 w-3" /> CUIT / DNI
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.cuit || ""}
                    onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                    className="font-mono bg-slate-50 border-slate-200 focus-visible:ring-amber-500 flex-1"
                    placeholder="20-XXXXXXXX-X"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleBuscarPadron}
                    disabled={isSearching}
                    className="shrink-0 border-slate-200 hover:bg-slate-100"
                  >
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 text-slate-400" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                  Razón Social <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.razonSocial || ""}
                  onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                  className="font-medium bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
                  placeholder="Ej: Moto Repuestos S.A."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">Nombre de Fantasía</Label>
              <Input
                value={formData.nombreFantasia || ""}
                onChange={(e) => setFormData({ ...formData, nombreFantasia: e.target.value })}
                className="bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
                placeholder="Ej: Repuestos El Rayo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
                  placeholder="contacto@proveedor.com"
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Teléfono
                </Label>
                <Input
                  value={formData.telefono || ""}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
                  placeholder="+54 11 XXXX-XXXX"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase">Alias / CBU</Label>
              <Input
                value={formData.aliasCbu || ""}
                onChange={(e) => setFormData({ ...formData, aliasCbu: e.target.value })}
                className="bg-slate-50 border-slate-200 focus-visible:ring-amber-500"
                placeholder="Alias o CBU para transferencias"
              />
            </div>
          </div>

          <DialogFooter className="gap-3 mt-4">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-700">
              Cancelar
            </Button>
            <Button
              onClick={handleGuardar}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold px-8 shadow-md"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {isEditing ? "Guardar Cambios" : "Crear Proveedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
