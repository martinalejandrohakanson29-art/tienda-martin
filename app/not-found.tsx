import Link from 'next/link'
 
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white">
      <h2 className="text-4xl font-bold mb-4">404 - Página no encontrada</h2>
      <p className="text-slate-400 mb-8">Lo sentimos, la página que buscas no existe.</p>
      <Link 
        href="/"
        className="px-6 py-3 bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors font-bold"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
