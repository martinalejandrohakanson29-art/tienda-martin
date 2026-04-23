"use client";

import React, { useState } from "react";
import Link from "next/link";

interface Proveedor {
  id: string;
  razonSocial: string;
  cuit: string;
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
}

interface CuentaCorrienteClientProps {
  proveedoresIniciales: Proveedor[];
}

export default function CuentaCorrienteClient({
  proveedoresIniciales,
}: CuentaCorrienteClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProveedores = proveedoresIniciales.filter(
    (p) =>
      p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cuit.includes(searchTerm) ||
      (p.nombreFantasia &&
        p.nombreFantasia.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatCurrency = (amount: any) => {
    const value = typeof amount === "number" ? amount : parseFloat(amount);
    if (isNaN(value)) return "$ 0,00";
    
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(value);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header section with back button and title */}
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

        {/* Search Bar */}
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

      {/* Grid of Suppliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProveedores.length > 0 ? (
          filteredProveedores.map((proveedor) => (
            <div
              key={proveedor.id}
              className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#2b8cee]/50 transition-all duration-300 hover:shadow-xl flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#2b8cee]/10 flex items-center justify-center text-[#2b8cee] group-hover:bg-[#2b8cee] group-hover:text-white transition-colors duration-300">
                  <span className="material-symbols-outlined text-2xl">
                    business
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    CUIT
                  </span>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                    {proveedor.cuit}
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
                  <span className={`text-sm font-semibold ${proveedor.saldoVencido < 0 ? 'text-red-500' : ''}`}>
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
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Saldo Total
                  </span>
                  <span className={`text-xl font-black ${proveedor.total < 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                    {formatCurrency(proveedor.total)}
                  </span>
                </div>
                <button className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-[#2b8cee] hover:text-white transition-all">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
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
    </div>
  );
}
