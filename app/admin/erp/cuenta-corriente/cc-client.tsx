"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actualizarProveedor, eliminarProveedor } from "@/app/actions/listas";
import { toast } from "sonner";

interface Proveedor {
  id: string;
  razonSocial: string;
  cuit: string | null;
  nombreFantasia: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  saldoAnterior: number;
  saldoVencido: number;
  dias15: number;
  dias30: number;
  dias45: number;
  dias60: number;
  mas60: number;
  total: number;
  aliasCbu?: string | null;
}

interface CuentaCorrienteClientProps {
  proveedoresIniciales: Proveedor[];
}

type FilterType = "todos" | "deudores" | "acreedores";
type SortType = "nombre-asc" | "nombre-desc" | "saldo-asc" | "saldo-desc";

export default function CuentaCorrienteClient({
  proveedoresIniciales,
}: CuentaCorrienteClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState<FilterType>("todos");
  const [sortBy, setSortBy] = useState<SortType>("nombre-asc");
  
  // States for Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [editForm, setEditForm] = useState({
    razonSocial: "",
    nombreFantasia: "",
    cuit: "",
    email: "",
    telefono: "",
    celular: "",
    aliasCbu: ""
  });

  const processedProveedores = useMemo(() => {
    let result = proveedoresIniciales.filter((p) => {
      const matchesSearch = 
        p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.cuit && p.cuit.includes(searchTerm)) ||
        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = 
        filterBy === "todos" ? true :
        filterBy === "deudores" ? p.total > 0 :
        filterBy === "acreedores" ? p.total < 0 : true;
      
      return matchesSearch && matchesFilter;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "nombre-asc": return a.razonSocial.localeCompare(b.razonSocial);
        case "nombre-desc": return b.razonSocial.localeCompare(a.razonSocial);
        case "saldo-asc": return a.total - b.total;
        case "saldo-desc": return b.total - a.total;
        default: return 0;
      }
    });

    return result;
  }, [proveedoresIniciales, searchTerm, filterBy, sortBy]);

  const formatCurrency = (amount: any) => {
    const value = typeof amount === "number" ? amount : parseFloat(amount);
    if (isNaN(value)) return "$ 0,00";
    
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(value);
  };

  const handleEditClick = (p: Proveedor) => {
    setSelectedProveedor(p);
    setEditForm({
      razonSocial: p.razonSocial || "",
      nombreFantasia: p.nombreFantasia || "",
      cuit: p.cuit || "",
      email: p.email || "",
      telefono: p.telefono || "",
      celular: p.celular || "",
      aliasCbu: p.aliasCbu || ""
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar al proveedor "${name}"? Esta acción no se puede deshacer.`)) {
      startTransition(async () => {
        const res = await eliminarProveedor(id);
        if (res.success) {
          toast.success("Proveedor eliminado correctamente");
          router.refresh();
        } else {
          toast.error(res.error || "Error al eliminar");
        }
      });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProveedor) return;

    startTransition(async () => {
      const res = await actualizarProveedor(selectedProveedor.id, {
        ...editForm,
      });

      if (res.success) {
        toast.success("Proveedor actualizado");
        setIsEditModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al actualizar");
      }
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header section */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/erp"
              className="p-2 text-slate-500 hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center justify-center"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Cuenta Corriente
              </h1>
              <p className="text-sm text-slate-500">
                Gestión de saldos y vencimientos de proveedores
              </p>
            </div>
          </div>

          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400 text-sm">
                search
              </span>
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
              placeholder="Buscar por nombre, CUIT o fantasía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Toolbar: Sorting & Filtering */}
        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-200 dark:border-slate-800">
            <span className="material-symbols-outlined text-slate-400 text-sm">filter_list</span>
            <div className="flex gap-1">
              {(["todos", "deudores", "acreedores"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterBy(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterBy === f 
                    ? "bg-[#2b8cee] text-white" 
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {f === "todos" ? "Todos" : f === "deudores" ? "Deudores (>0)" : "A quienes debemos (<0)"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-sm">sort</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="nombre-asc">Nombre (A-Z)</option>
              <option value="nombre-desc">Nombre (Z-A)</option>
              <option value="saldo-desc">Saldo (Mayor a Menor)</option>
              <option value="saldo-asc">Saldo (Menor a Mayor)</option>
            </select>
          </div>

          <div className="ml-auto text-xs font-medium text-slate-400">
            {processedProveedores.length} proveedores encontrados
          </div>
        </div>
      </div>

      {/* Grid of Suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {processedProveedores.length > 0 ? (
          processedProveedores.map((proveedor) => (
            <div
              key={proveedor.id}
              className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#2b8cee]/50 transition-all duration-300 hover:shadow-xl flex flex-col relative"
            >
              {/* Action Buttons Overlay */}
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleEditClick(proveedor)}
                  className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#2b8cee] hover:border-[#2b8cee] transition-all"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
                <button 
                  onClick={() => handleDeleteClick(proveedor.id, proveedor.razonSocial)}
                  className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-500 hover:border-red-500 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>

              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#2b8cee]/10 flex items-center justify-center text-[#2b8cee] group-hover:bg-[#2b8cee] group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-2xl">
                    business
                  </span>
                </div>
                <div className="text-right pr-10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    CUIT
                  </span>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                    {proveedor.cuit || "---"}
                  </p>
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 truncate">
                {proveedor.razonSocial}
              </h3>
              {proveedor.nombreFantasia && (
                <p className="text-sm text-[#2b8cee] font-medium mb-4">
                  {proveedor.nombreFantasia}
                </p>
              )}

              {/* Account Aging Summary */}
              <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Anterior</span>
                  <span className="text-sm font-semibold">{formatCurrency(proveedor.saldoAnterior)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Vencido</span>
                  <span className={`text-sm font-semibold ${proveedor.saldoVencido < 0 ? 'text-red-500' : proveedor.saldoVencido > 0 ? 'text-emerald-500' : ''}`}>
                    {formatCurrency(proveedor.saldoVencido)}
                  </span>
                </div>
              </div>

              <div className="flex-grow space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">15 - 30 días</span>
                  <span className="font-medium">{formatCurrency(proveedor.dias15 + proveedor.dias30)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">45 - 60 días</span>
                  <span className="font-medium">{formatCurrency(proveedor.dias45 + proveedor.dias60)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">+ 60 días</span>
                  <span className="font-medium">{formatCurrency(proveedor.mas60)}</span>
                </div>
              </div>

              <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="material-symbols-outlined text-sm">mail</span>
                  <span className="truncate">{proveedor.email || "Sin email"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="material-symbols-outlined text-sm">call</span>
                  <span>{proveedor.telefono || proveedor.celular || "Sin contacto"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  <span className="truncate">{proveedor.aliasCbu || "Sin alias/cbu"}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Saldo Total
                  </span>
                  <span className={`text-xl font-black ${proveedor.total < 0 ? 'text-red-500' : proveedor.total > 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                    {formatCurrency(proveedor.total)}
                  </span>
                </div>
                <Link 
                  href={`/admin/erp/movimientos?proveedor=${proveedor.id}`}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-[#2b8cee] hover:text-white transition-all"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-4xl text-slate-400">
                search_off
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              No se encontraron proveedores
            </h3>
            <p className="text-slate-500">
              Intenta con otro término de búsqueda o verifica que el proveedor
              esté registrado.
            </p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Editar Proveedor</h2>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Razón Social</label>
                  <input 
                    required
                    type="text"
                    value={editForm.razonSocial}
                    onChange={(e) => setEditForm({...editForm, razonSocial: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nombre de Fantasía</label>
                  <input 
                    type="text"
                    value={editForm.nombreFantasia}
                    onChange={(e) => setEditForm({...editForm, nombreFantasia: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">CUIT / DNI</label>
                  <input 
                    type="text"
                    value={editForm.cuit}
                    onChange={(e) => setEditForm({...editForm, cuit: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                  <input 
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Teléfono</label>
                  <input 
                    type="text"
                    value={editForm.telefono}
                    onChange={(e) => setEditForm({...editForm, telefono: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Celular</label>
                  <input 
                    type="text"
                    value={editForm.celular}
                    onChange={(e) => setEditForm({...editForm, celular: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Alias / CBU</label>
                  <input 
                    type="text"
                    value={editForm.aliasCbu}
                    onChange={(e) => setEditForm({...editForm, aliasCbu: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isPending}
                  className="flex-[2] px-4 py-3 bg-[#2b8cee] text-white font-bold rounded-xl hover:bg-[#2b8cee]/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
