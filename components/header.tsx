import Link from "next/link"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()
  
  // Valor por defecto por si acaso
  const logoHeight = config?.logoHeight || "80px"

  return (
    // 👇 CAMBIO 1: Quitamos 'h-24' y ponemos 'py-2' o 'py-4'. 
    // 'min-h-[80px]' asegura que no se vea aplastado si no hay logo.
    <header className="sticky top-0 z-50 w-full rounded-b-[2rem] bg-white/90 backdrop-blur-md shadow-sm transition-all duration-300">
      
      {/* Usamos 'py-3' para dar aire arriba y abajo */}
      <div className="container mx-auto flex items-center justify-between px-6 py-3 min-h-[80px]">
        
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-2 hover:scale-105 transition-transform duration-300"> 
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                // 👇 CAMBIO 2: Aplicamos la altura dinámica aquí
                style={{ height: logoHeight }}
                className="w-auto object-contain drop-shadow-sm" 
                referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              {config?.companyName || "Mi Tienda"}
            </h1>
          )}
        </Link>

        {/* MENÚ CENTRAL */}
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-100/50 px-2 py-1.5 rounded-full border border-white/50 shadow-inner">
          <Link href="/" className="px-6 py-2 rounded-full text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
            INICIO
          </Link>
          <Link href="/shop" className="px-6 py-2 rounded-full text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all duration-200">
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
