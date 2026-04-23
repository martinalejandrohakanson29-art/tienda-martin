"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Movimiento {
  id: string;
  proveedorId: string;
  fecha: string;
  tipo: string;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  saldo: number;
  proveedorNombre: string;
}

interface MovimientosClientProps {
  movimientosIniciales: Movimiento[];
}

export default function MovimientosClient({
  movimientosIniciales,
}: MovimientosClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredMovimientos = useMemo(() => {
    return movimientosIniciales.filter((m) =>
      m.proveedorNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.descripcion && m.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [movimientosIniciales, searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);
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
                Listado de Movimientos
              </h1>
              <p className="text-sm text-slate-500">
                Historial de saldos y transacciones por proveedor
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
              placeholder="Buscar por proveedor o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Saldo Resultante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMovimientos.length > 0 ? (
                filteredMovimientos.map((m) => (
                  <tr key={m.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${m.anulado ? "opacity-60 grayscale-[0.5]" : ""}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {format(new Date(m.fecha), "dd/MM/yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-bold text-slate-900 dark:text-white ${m.anulado ? "line-through" : ""}`}>{m.proveedorNombre}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`text-sm text-slate-600 dark:text-slate-400 line-clamp-1 ${m.anulado ? "italic text-red-500" : ""}`}>
                        {m.anulado && <span className="mr-1">⚠️</span>}
                        {m.descripcion || "---"}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${
                          m.tipo === "HABER" || m.tipo === "INGRESO"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        }`}>
                          {m.tipo}
                        </span>
                        {m.anulado && (
                          <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase w-fit">
                            Anulado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${
                      m.anulado ? "text-slate-400 line-through" : (m.monto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
                    }`}>
                      {formatCurrency(m.monto)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white text-right ${m.anulado ? "text-slate-400" : ""}`}>
                      {formatCurrency(m.saldo)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">history</span>
                      <p className="text-slate-500 font-medium">No se encontraron movimientos.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
