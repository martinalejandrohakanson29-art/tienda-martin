import React from "react";

export function ErpDashboard() {
  return (
    <div className="w-full bg-[#f6f7f8] dark:bg-[#101922] text-slate-900 dark:text-slate-100 flex flex-col rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
      {/* Importamos los íconos de Google Material Symbols */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />

      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#101922]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
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
      
      <main className="flex-grow flex flex-col items-center justify-start px-4 py-12 max-w-7xl mx-auto w-full">
        <div className="text-center mb-12 space-y-2">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            ¡Hola, Martín! 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
            Panel de gestión.
          </p>
        </div>
        
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Transacciones Principales */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="material-symbols-outlined text-[#2b8cee] text-xl">
                dataset
              </span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Compras y Pagos
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    shopping_cart
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Compras
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Proveedores y abasto
                </p>
              </a>
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    sell
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Ventas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Facturación y clientes
                </p>
              </a>
            </div>
          </div>

          {/* Gestión de Tesorería */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="material-symbols-outlined text-[#2b8cee] text-xl">
                account_balance
              </span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                cobros y Pagos
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    account_balance_wallet
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Cobros
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cuentas por cobrar
                </p>
              </a>
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    payments
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Pagos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Gastos y nómina
                </p>
              </a>
            </div>
          </div>

          {/* Historiales */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="material-symbols-outlined text-[#2b8cee] text-xl">
                history
              </span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Historiales
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    history_edu
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Gestion de pagos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Registro de egresos
                </p>
              </a>
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    receipt_long
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Gestion de Cobros
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Archivo de ingresos
                </p>
              </a>
            </div>
          </div>

          {/* Pedidos */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="material-symbols-outlined text-[#2b8cee] text-xl">
                inventory
              </span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Pedidos
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    inventory_2
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Pedidos Compras
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Solicitudes pendientes
                </p>
              </a>
              <a
                className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-full transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_25px_-5px_rgba(43,140,238,0.15)]"
                href="#"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400 group-hover:text-[#2b8cee] transition-colors" style={{ fontVariationSettings: "'FILL' 0" }}>
                    assignment
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Pedidos Ventas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Órdenes en proceso
                </p>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl border-t border-slate-200 dark:border-slate-800 pt-12">
          <div className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="p-3 bg-green-500/10 rounded-full">
              <span className="material-symbols-outlined text-green-500">
                trending_up
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Flujo de Caja
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                +$12.450,00
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="p-3 bg-amber-500/10 rounded-full">
              <span className="material-symbols-outlined text-amber-500">
                pending_actions
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Tareas Pendientes
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                14 Avisos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="p-3 bg-[#2b8cee]/10 rounded-full">
              <span className="material-symbols-outlined text-[#2b8cee]">
                verified_user
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Estado de Sistema
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white text-[#2b8cee]">
                100% Operativo
              </p>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="w-full py-8 px-4 text-center border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101922]">
        <p className="text-sm text-slate-500 dark:text-slate-500">
          © 2024 ERP Revolución Motos. Sistema de gestión unificado y eficiente.
        </p>
      </footer>
    </div>
  );
}
