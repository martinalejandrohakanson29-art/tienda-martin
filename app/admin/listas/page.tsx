import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Bases de Datos y Listas - Sistema Revolución Motos",
  description: "Consulta y edición de listas maestras del sistema",
}

export default function ListasPage() {
  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Header principal */}
        <header className="mb-6 flex items-center gap-4">
          <Link 
            href="/admin/erp" 
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            title="Volver al ERP"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-1">Bases de Datos y Listas</h1>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Gestión centralizada de registros</p>
          </div>
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

          {/* Tarjeta: Puntos de Venta */}
          <Link 
            href="/admin/listas/puntos-venta"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-emerald-600 p-3 rounded-xl text-white shadow-md shadow-emerald-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-emerald-600 transition-colors">Puntos de Venta</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Configuración de Origen</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Administra los diferentes puntos y canales de venta (Mostrador, MercadoLibre, Instagram, etc.) para vincularlos al registrar ventas.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-white border-t border-emerald-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-emerald-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Tarjeta: Lista de Proveedores */}
          <Link 
            href="/admin/listas/proveedores"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-amber-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-amber-600 p-3 rounded-xl text-white shadow-md shadow-amber-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-amber-600 transition-colors">Lista de Proveedores</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gestión de contactos comerciales</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Directorio centralizado de proveedores. Permite gestionar datos de contacto, CUIT y nombres de fantasía para el sistema.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-amber-50 to-white border-t border-amber-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-amber-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Tarjeta: Lista Mayorista */}
          <Link
            href="/admin/listas/mayoristas"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-rose-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-rose-600 p-3 rounded-xl text-white shadow-md shadow-rose-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-rose-600 transition-colors">Lista Mayorista</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Catálogo para clientes por mayor</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Administra el catálogo público de /mayoristas: fotos, precios y códigos de los artículos de potenciación y repuestos.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-rose-50 to-white border-t border-rose-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-rose-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Tarjeta: Artículos Importados */}
          <Link
            href="/admin/listas/articulos-importados"
            className="group block bg-white rounded-2xl border-2 border-slate-200 shadow-sm hover:shadow-xl hover:border-orange-400 transition-all duration-300 overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-orange-600 p-3 rounded-xl text-white shadow-md shadow-orange-200 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16V8z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 mb-1 group-hover:text-orange-600 transition-colors">Artículos Importados</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Costos base y kits</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">Tabla maestra de artículos importados: costo base en dólares o pesos, composición de kits y recálculo de precios.</p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-orange-50 to-white border-t border-orange-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Acceder &rarr;
                  </span>
                  <svg className="w-5 h-5 text-orange-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
