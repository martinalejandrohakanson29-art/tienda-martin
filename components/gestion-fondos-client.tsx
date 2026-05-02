"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registrarMovimientoManualProveedor, anularMovimientoProveedor } from "@/app/actions/erp";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Proveedor {
  id: string;
  razonSocial: string;
  total: number;
}

interface GestionFondosClientProps {
  type: "PAGO" | "COBRO";
  proveedores: Proveedor[];
  recentMovimientos?: any[];
}

export default function GestionFondosClient({
  type,
  proveedores,
  recentMovimientos = [],
}: GestionFondosClientProps) {
  const router = useRouter();
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [selectedEmisorProveedorId, setSelectedEmisorProveedorId] = useState("");
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [deQuien, setDeQuien] = useState("");
  const [aQuien, setAQuien] = useState(type === "PAGO" ? "" : "Caja Central");
  const [deMode, setDeMode] = useState<"manual" | "proveedor">("manual");
  const [descripcion, setDescripcion] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeDropdown, setShowDeDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnulando, setIsAnulando] = useState<string | null>(null);

  const filteredProveedores = useMemo(() => {
    return proveedores.filter((p) =>
      p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [proveedores, searchTerm]);

  const deFilteredProveedores = useMemo(() => {
    if (!deQuien) return [];
    return proveedores.filter((p) =>
      p.razonSocial.toLowerCase().includes(deQuien.toLowerCase())
    );
  }, [proveedores, deQuien]);

  const selectedProveedor = useMemo(() => {
    return proveedores.find((p) => p.id === selectedProveedorId);
  }, [proveedores, selectedProveedorId]);

  const saldoAntes = selectedProveedor?.total || 0;
  const montoNum = parseFloat(monto) || 0;
  const saldoDespues = type === "PAGO" ? saldoAntes + montoNum : saldoAntes - montoNum;

  const handleSelectProveedor = (p: Proveedor) => {
    setSelectedProveedorId(p.id);
    setSearchTerm(p.razonSocial);
    setShowDropdown(false);
    if (isPago) setAQuien(p.razonSocial);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProveedorId || !monto || !deQuien || !aQuien) {
      toast.error("Por favor, completa todos los campos obligatorios");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registrarMovimientoManualProveedor({
        proveedorId: selectedProveedorId,
        emisorProveedorId: deMode === "proveedor" ? selectedEmisorProveedorId : undefined,
        monto: montoNum,
        tipo: type,
        metodoPago,
        deQuien,
        aQuien,
        descripcion,
      });

      if (result.success) {
        toast.success(`${type === "PAGO" ? "Pago" : "Cobro"} registrado correctamente`);
        router.push("/admin/erp/movimientos");
      } else {
        toast.error(result.error || "Ocurrió un error");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnular = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas anular este movimiento?")) {
      return;
    }

    setIsAnulando(id);
    try {
      const result = await anularMovimientoProveedor(id);
      if (result.success) {
        toast.success("Movimiento anulado correctamente");
        router.refresh();
      } else {
        const errorMsg = (result as any).error || "Error al anular";
        toast.error(errorMsg);
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setIsAnulando(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);
  };

  const isPago = type === "PAGO";

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/erp"
          className="p-2 text-slate-500 hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center justify-center"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isPago ? "Registrar Pago a Proveedor" : "Registrar Cobro de Proveedor"}
          </h1>
          <p className="text-sm text-slate-500">
            Carga manual de movimientos que impactan en la cuenta corriente
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Proveedor *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                    placeholder="Escribe para buscar proveedor..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                      if (!e.target.value) setSelectedProveedorId("");
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400">
                    search
                  </span>
                </div>

                {showDropdown && filteredProveedores.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {filteredProveedores.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-0"
                        onClick={() => handleSelectProveedor(p)}
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{p.razonSocial}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-tighter">ID: {p.id}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-bold ${p.total >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {formatCurrency(p.total)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                
                {showDropdown && searchTerm && filteredProveedores.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 text-center">
                    <p className="text-sm text-slate-500">No se encontraron proveedores.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Monto *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                      placeholder="0.00"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Método de Pago *
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    required
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Dólares">Dólares</option>
                    <option value="Cruzada">Cruzada</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      De (Emisor) *
                    </label>
                    <select
                      className="px-4 py-2 text-sm font-bold rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-[#2b8cee]/20 cursor-pointer"
                      value={deMode}
                      onChange={(e) => {
                        setDeMode(e.target.value as "manual" | "proveedor");
                        setDeQuien("");
                      }}
                    >
                      <option value="manual">Cargar a mano emisor</option>
                      <option value="proveedor">Proveedor</option>
                    </select>
                  </div>

                  {deMode === "manual" ? (
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                        placeholder="Escribe nombre del emisor..."
                        value={deQuien}
                        onChange={(e) => setDeQuien(e.target.value)}
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400">
                        edit_note
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                          placeholder="Busca proveedor..."
                          value={deQuien}
                          onChange={(e) => {
                            setDeQuien(e.target.value);
                            setShowDeDropdown(true);
                          }}
                          onFocus={() => setShowDeDropdown(true)}
                          onBlur={() => setTimeout(() => setShowDeDropdown(false), 200)}
                          required
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400">
                          person_search
                        </span>
                      </div>

                      {showDeDropdown && deFilteredProveedores.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {deFilteredProveedores.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-0"
                              onClick={() => {
                                setDeQuien(p.razonSocial);
                                setSelectedEmisorProveedorId(p.id);
                                setShowDeDropdown(false);
                              }}
                            >
                              <span className="text-sm text-slate-700 dark:text-slate-300">{p.razonSocial}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    A (Receptor) *
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                    placeholder="Quien recibe los fondos"
                    value={aQuien}
                    onChange={(e) => setAQuien(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descripción / Observaciones
                </label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-[#2b8cee]/20 outline-none"
                  rows={3}
                  placeholder="Detalles adicionales del movimiento..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg ${
                isPago 
                  ? "bg-rose-500 hover:bg-rose-600 shadow-rose-200 dark:shadow-rose-900/20" 
                  : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/20"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Procesando...
                </span>
              ) : (
                `Confirmar ${isPago ? "Pago" : "Cobro"}`
              )}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-5 ${isPago ? "bg-rose-500" : "bg-emerald-500"}`} />
            
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">analytics</span>
              Resumen de Impacto
            </h3>

            <div className="space-y-6">
              {/* Impacto en Proveedor Principal */}
              <div className="pb-6 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-[#2b8cee] uppercase tracking-widest mb-4">
                  Impacto en {selectedProveedor?.razonSocial || "Proveedor"}
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Saldo Actual</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      {formatCurrency(saldoAntes)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPago ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                      <span className="material-symbols-outlined text-sm">{isPago ? "add" : "remove"}</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-bold">Monto</p>
                      <p className={`text-base font-bold ${isPago ? "text-emerald-600" : "text-rose-600"}`}>
                        {formatCurrency(montoNum)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Nuevo Saldo</p>
                    <p className={`text-xl font-black ${saldoDespues >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatCurrency(saldoDespues)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Impacto en Emisor (si es proveedor) */}
              {deMode === "proveedor" && selectedEmisorProveedorId && (
                <div className="pt-2">
                  <p className="text-[10px] font-black text-rose-500 dark:text-rose-400 uppercase tracking-widest mb-4">
                    Impacto en Emisor: {deQuien}
                  </p>
                  <div className="space-y-4">
                    {(() => {
                      const emisor = proveedores.find(p => p.id === selectedEmisorProveedorId);
                      const saldoEmisorAntes = emisor?.total || 0;
                      // El emisor hace lo opuesto al principal
                      const saldoEmisorDespues = isPago ? saldoEmisorAntes - montoNum : saldoEmisorAntes + montoNum;
                      
                      return (
                        <>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Saldo Actual</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">
                              {formatCurrency(saldoEmisorAntes)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPago ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                              <span className="material-symbols-outlined text-sm">{isPago ? "remove" : "add"}</span>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase font-bold">Monto</p>
                              <p className={`text-base font-bold ${isPago ? "text-rose-600" : "text-emerald-600"}`}>
                                {formatCurrency(montoNum)}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Nuevo Saldo</p>
                            <p className={`text-lg font-black ${saldoEmisorDespues >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {formatCurrency(saldoEmisorDespues)}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50 p-5">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-blue-600">info</span>
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                Este movimiento quedará registrado en el <strong>Historial de Saldo</strong> y actualizará el saldo total del proveedor en tiempo real.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Movements Section */}
      {recentMovimientos.length > 0 && (
        <div className="mt-12 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2b8cee]">history</span>
              Movimientos Recientes
            </h2>
            <Link 
              href="/admin/erp/movimientos" 
              className="text-sm font-bold text-[#2b8cee] hover:underline"
            >
              Ver todo el historial
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                    <th className="px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentMovimientos.map((m) => (
                    <tr key={m.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${m.anulado ? "opacity-50" : ""}`}>
                      <td className="px-6 py-3 whitespace-nowrap text-slate-500 text-xs">
                        {format(new Date(m.fecha), "dd/MM/yy HH:mm", { locale: es })}
                      </td>
                      <td className={`px-6 py-3 whitespace-nowrap font-bold ${m.anulado ? "line-through text-slate-400" : ""}`}>
                        {m.proveedorNombre}
                      </td>
                      <td className={`px-6 py-3 ${m.anulado ? "line-through italic text-slate-400" : ""}`}>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-blue-500 font-bold uppercase">{m.tipo}</span>
                          <span className="truncate max-w-[200px]">{m.descripcion || "---"}</span>
                        </div>
                      </td>
                      <td className={`px-6 py-3 whitespace-nowrap font-bold text-right ${
                        m.anulado ? "text-slate-400" : (m.monto >= 0 ? "text-emerald-600" : "text-rose-600")
                      }`}>
                        {formatCurrency(m.monto)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-center">
                        {!m.anulado && (
                          <button
                            onClick={() => handleAnular(m.id)}
                            disabled={isAnulando === m.id}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            title="Anular"
                          >
                            {isAnulando === m.id ? (
                              <span className="w-4 h-4 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin inline-block" />
                            ) : (
                              <span className="material-symbols-outlined text-base">block</span>
                            )}
                          </button>
                        )}
                        {m.anulado && (
                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter">Anulado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
