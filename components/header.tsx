import Link from "next/link"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    // 👇 CAMBIO TOTAL DE ESTILO:
    // 1. rounded-b-3xl: Curva fuerte abajo para romper el "rectángulo".
    // 2. bg-white/80 + backdrop-blur-md: Efecto cristal moderno (deja ver borroso lo que pasa atrás).
    // 3. border-none: Quitamos las líneas duras.
    // 4. shadow-sm: Una sombra muy leve para dar altura sin pesar.
    <header className="sticky top-0 z-50 w-full rounded-b-[2rem] bg-white/90 backdrop-blur-md shadow-sm transition-all duration-300">
      
      <div className="container mx-auto flex h-24 items-center justify-between px-6">
        
        {/* LOGO (Izquierda) */}
        <Link href="/" className="flex items-center gap-2 h-full py-3 hover:scale-105 transition-transform duration-300"> 
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                className="h-full w-auto object-contain drop-shadow-sm" 
                referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              {config?.companyName || "Mi Tienda"}
            </h1>
          )}
        </Link>

        {/* MENÚ CENTRAL (Estilo Píldora) */}
        {/* Lo encerramos en una 'píldora' sutil para darle estructura sin ser un bloque */}
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-100/50 px-2 py-1.5 rounded-full border border-white/50 shadow-inner">
          <Link href="/" className="px-6 py-2 rounded-full text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
            INICIO
          </Link>
          <Link href="/shop" className="px-6 py-2 rounded-full text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
            TIENDA
          </Link>
        </nav>

        {/* CARRITO (Derecha) */}
        <div className="flex items-center gap-4">
          <CartSheet />
        </div>
      </div>
    </header>
  )
}
