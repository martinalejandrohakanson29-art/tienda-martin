import React from "react";
import Link from "next/link";

export function ErpDashboard() {
  return (
    <div className="w-full bg-[#f6f7f8] dark:bg-[#101922] text-slate-900 dark:text-slate-100 flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
      
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#101922]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link 
                href="/admin" 
                className="p-2 mr-1 text-slate-500 hover:text-[#2b8cee] dark:hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center justify-center"
                title="Volver al inicio"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </Link>
              <div className="bg-[#2b8cee] p-2 rounded-lg flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-2xl">
                  account_balance
                </span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Revolución<span className="text-[#2b8cee]">Motos</span>
              </span>
            </div>
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-slate-400 text-sm">
                    search
                  </span>
                </div>
                <input
                  className="block w-full pl-10 pr-3 py-2 border-none bg-slate-100 dark:bg-slate-800 rounded-lg text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#2b8cee]/20 transition-all outline-none"
                  placeholder="Buscar facturas, clientes o pedidos..."
                  type="text"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#101922]"></span>
              </button>
              <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="material-symbols-outlined">settings</span>
              </button>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
              <div className="flex items-center gap-3 pl-1">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-none">
                    Martín
                  </p>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">
                    Administrador
                  </p>
                </div>
                <div className="h-9 w-9 rounded-full bg-[#2b8cee]/10 border border-[#2b8cee]/20 flex items-center justify-center overflow-hidden">
                  <img
                    alt="Avatar de usuario"
                    className="h-full w-full object-cover"
                    src="https://ui-avatars.com/api/?name=Martin&background=2b8cee&color=fff"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

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
                <p className="text-xs text-slate-500">Registrar Mostrador</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/compras">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-white">shopping_cart</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Compras</h3>
                <p className="text-xs text-slate-500">Registrar compras</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/pedidos-venta">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400 group-hover:text-white">assignment</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos Venta</h3>
                <p className="text-xs text-slate-500">Órdenes en proceso</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/pedidos-compra">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400 group-hover:text-white">inventory_2</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos Compra</h3>
                <p className="text-xs text-slate-500">Órdenes a proveedores</p>
              </Link>
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
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestionar Pagos</h3>
                <p className="text-xs text-slate-500">Efectivo/Bancos</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/cobros">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-white">account_balance_wallet</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestionar Cobros</h3>
                <p className="text-xs text-slate-500">Caja diaria</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-blue-200 dark:border-blue-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/cuenta-corriente">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400 group-hover:text-white">account_balance</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Cuenta Corriente</h3>
                <p className="text-xs text-slate-500">Saldos Proveedores</p>
              </Link>

              <Link className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-indigo-200 dark:border-indigo-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#2b8cee]/30" href="/admin/erp/movimientos">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                  <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400 group-hover:text-white">history</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Historial Saldo</h3>
                <p className="text-xs text-slate-500">Listado Movimientos</p>
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
                <p className="text-xs text-slate-500">Precios y Stock</p>
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
