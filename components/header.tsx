import Link from "next/link"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()
  
  // 👇 CAMBIO 1: Cambiamos el default a "60px" (antes era 80px)
  // NOTA: Si en tu Admin > Configuración pusiste un valor manual (ej: 100px), 
  // tendrás que bajarlo ahí también.
  const logoHeight = config?.logoHeight || "60px"

  return (
    // 👇 CAMBIO 2: Quitamos 'sticky top-0' (ya lo maneja el layout).
    // Cambiamos 'rounded-b-[2rem]' por 'rounded-b-xl' (menos curva, más moderno).
    <header className="w-full rounded-b-xl bg-white/90 backdrop-blur-md shadow-sm transition-all duration-300 border-b border-slate-100">
      
      {/* 👇 CAMBIO 3: Redujimos px-6 a px-4, py-3 a py-2, y min-h a 60px */}
      <div className="container mx-auto flex items-center justify-between px-4 py-2 min-h-[60px]">
        
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-2 hover:scale-105 transition-transform duration-300"> 
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                style={{ height: logoHeight }}
                className="w-auto object-contain drop-shadow-sm" 
                referrerPolicy="no-referrer"
            />
          ) : (
            // Texto un poco más chico (text-xl en vez de text-2xl)
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight">
              {config?.companyName || "Mi Tienda"}
            </h1>
          )}
        </Link>

        {/* MENÚ CENTRAL */}
        {/* Ajustamos padding interno para que entre en el header más angosto */}
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-100/50 px-2 py-1 rounded-full border border-white/50 shadow-inner">
          <Link href="/" className="px-5 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
            INICIO
          </Link>
          <Link href="/shop" className="px-5 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
            TIENDA
          </Link>
        </nav>

        {/* CARRITO */}
        <div className="flex items-center gap-4">
          <CartSheet />
        </div>
      </div>
    </header>
  )
}
