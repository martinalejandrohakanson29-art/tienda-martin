import Link from "next/link"

export const metadata = {
  title: "Bases de Datos y Listas - Sistema Revolución Motos",
  description: "Consulta y edición de listas maestras del sistema",
}

export default function ListasPage() {
  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Header principal */}
        <header className="mb-6">
          <h1 className="text-3xl font-black text-slate-900 mb-1">Bases de Datos y Listas</h1>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Gestión centralizada de registros</p>
        </header>

        {/* Tarjetas individuales como enlaces */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tarjeta: Artículos Mostrador */}
          <Link 
            href="/admin/listas/articulos-mostrador"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-md shadow-indigo-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">Artículos Mostrador</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gestión de productos de venta</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Administra el catálogo de productos disponibles para venta en el mostrador. Incluye control de precios, stock y edición de artículos.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-white border-t border-indigo-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-indigo-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Tarjeta: Gestión de Packs */}
          <Link 
            href="/admin/listas/packs"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-purple-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-purple-600 p-3 rounded-xl text-white shadow-md shadow-purple-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-purple-600 transition-colors">Gestión de Packs</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Creación y administración de combinaciones</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Crea y gestiona packs de productos combinados. Define componentes, cantidades y precios para ofertas especiales.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-purple-50 to-white border-t border-purple-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
