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
            Panel de gestión centralizado.
          </p>
        </div>

        <div className="w-full max-w-6xl space-y-12">
          
          {/* SECCIÓN 1: COMPRAS Y VENTAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Lado Izquierdo: Acción */}
            <div className="grid grid-cols-2 gap-4">
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400">sell</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ventas</h3>
                <p className="text-xs text-slate-500">Facturación directa</p>
              </a>
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400">shopping_cart</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Compras</h3>
                <p className="text-xs text-slate-500">Cargar facturas</p>
              </a>
            </div>
            {/* Lado Derecho: Consultas (Separadas) */}
            <div className="grid grid-cols-2 gap-4 border-l border-slate-200 dark:border-slate-800 lg:pl-12">
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-[#2b8cee]/10 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-slate-600 dark:text-slate-400 group-hover:text-[#2b8cee]">search</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Consulta Ventas</h3>
                <p className="text-xs text-slate-500">Historial y reportes</p>
              </a>
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-[#2b8cee]/10 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-slate-600 dark:text-slate-400 group-hover:text-[#2b8cee]">manage_search</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Consulta Compras</h3>
                <p className="text-xs text-slate-500">Listado de facturas</p>
              </a>
            </div>
          </div>

          {/* SECCIÓN 2: TESORERÍA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Lado Izquierdo: Gestión */}
            <div className="grid grid-cols-2 gap-4">
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400">payments</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestionar Pagos</h3>
                <p className="text-xs text-slate-500">Registrar egresos</p>
              </a>
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400">account_balance_wallet</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Gestionar Cobros</h3>
                <p className="text-xs text-slate-500">Registrar ingresos</p>
              </a>
            </div>
            {/* Lado Derecho: Consultas */}
            <div className="grid grid-cols-2 gap-4 border-l border-slate-200 dark:border-slate-800 lg:pl-12">
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-[#2b8cee]/10 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-slate-600 dark:text-slate-400 group-hover:text-[#2b8cee]">receipt</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Consultar Cobros</h3>
                <p className="text-xs text-slate-500">Archivo de ingresos</p>
              </a>
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-[#2b8cee]/10 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-slate-600 dark:text-slate-400 group-hover:text-[#2b8cee]">history_edu</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Consultar Pagos</h3>
                <p className="text-xs text-slate-500">Archivo de egresos</p>
              </a>
            </div>
          </div>

          {/* SECCIÓN 3: PEDIDOS */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-emerald-600 dark:text-emerald-400">assignment</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos de Ventas</h3>
                <p className="text-xs text-slate-500">Órdenes en proceso</p>
              </a>
              <a className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" href="#">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4 group-hover:bg-rose-100 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400">inventory_2</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Pedidos de Compras</h3>
                <p className="text-xs text-slate-500">Solicitudes pendientes</p>
              </a>
            </div>
          </div>

        </div>
      </main>

      <footer className="w-full py-8 px-4 text-center border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101922]">
        <p className="text-sm text-slate-500 dark:text-slate-500">
          © 2026 ERP Revolución Motos. Sistema gestionado por Martin
        </p>
      </footer>
    </div>
  );
}
