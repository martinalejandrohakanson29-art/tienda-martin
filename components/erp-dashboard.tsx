import React from "react";
import Link from "next/link";

export function ErpDashboard() {
  return (
    <div className="w-full bg-[#f6f7f8] dark:bg-[#101922] text-slate-900 dark:text-slate-100 flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
      <main className="flex-grow flex flex-col items-center justify-start px-4 py-8 max-w-7xl mx-auto w-full">
        <div className="w-full max-w-6xl space-y-12">
          
          {/* SECCIÓN 1: OPERACIONES */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#2b8cee]">inventory</span>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">COMPRAS Y VENTAS</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/ventas-mostrador">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-white">sell</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ventas</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/compras">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-white">shopping_cart</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Compras</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/pedidos-venta">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400 group-hover:text-white">assignment</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos Venta</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/pedidos-compra">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400 group-hover:text-white">inventory_2</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos Compra</h3>
              </Link>

              {/* Fila 2: centrada entre Compras (col 2) y Pedidos Venta (col 3) */}
              <div className="lg:col-start-2 lg:col-span-2 flex justify-center">
                <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-orange-300/40 w-full lg:max-w-[calc(50%-8px)]" href="/admin/erp/lista-pedidos">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mb-4 group-hover:bg-orange-500 group-hover:text-white transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl text-orange-500 dark:text-orange-400 group-hover:text-white">format_list_bulleted</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Artículos Faltantes</h3>
                </Link>
              </div>

            </div>
          </div>

          {/* SECCIÓN 2: TESORERÍA Y CUENTAS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#2b8cee]">payments</span>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">MOVIMIENTOS CUENTA CORRIENTE</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/pagos">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-white">payments</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Nueva Orden de Pago</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/cobros">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-white">account_balance_wallet</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Nueva Orden de Cobro</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-blue-200 dark:border-blue-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/cuenta-corriente">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400 group-hover:text-white">account_balance</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Cuenta Corriente</h3>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-indigo-200 dark:border-indigo-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/movimientos">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400 group-hover:text-white">history</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Historial Saldo</h3>
              </Link>
            </div>
          </div>

          {/* SECCIÓN 3: ADMINISTRACIÓN */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#2b8cee]">settings</span>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Catálogos y Listas</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/listas">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400 group-hover:text-white">database</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Consultar Listas</h3>
              </Link>
            </div>
          </div>

        </div>
      </main>

      <footer className="w-full py-6 px-4 text-center border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101922]">
        <p className="text-sm text-slate-500 dark:text-slate-500">
          © 2026 ERP Revolución Motos.
        </p>
      </footer>
    </div>
  );
}
