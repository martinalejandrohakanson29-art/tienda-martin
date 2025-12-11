import Link from "next/link"
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    // 👇 CAMBIO CLAVE:
    // 1. bg-[radial-gradient...]: El mismo efecto del body.
    // 2. Colores: Usamos 'from-slate-100' a 'to-gray-300' (en vez de 50 a 200).
    // 3. shadow-md: Sombra un poco más fuerte para que "flote" sobre el contenido.
    <header className="sticky top-0 z-50 w-full border-b border-gray-300 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-gray-200 to-gray-300 shadow-md">
      
      {/* Contenedor relativo para el centrado absoluto del menú */}
      <div className="container mx-auto flex h-24 items-center justify-between px-4 relative">
        
        {/* LOGO O NOMBRE */}
        <Link href="/" className="flex items-center gap-2 h-full py-2"> 
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                className="h-full w-auto object-contain drop-shadow-sm" // Un toque de sombra al logo para que destaque en el fondo nuevo
                referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate drop-shadow-sm">
              {config?.companyName || "Mi Tienda"}
            </h1>
          )}
        </Link>

        {/* NAVEGACIÓN PC (Centrada) */}
        <nav className="hidden md:flex items-center space-x-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Link href="/" className="text-sm font-bold text-gray-800 hover:text-black transition-colors uppercase tracking-wide">
            Inicio
          </Link>
          <Link href="/shop" className="text-sm font-bold text-gray-800 hover:text-black transition-colors uppercase tracking-wide">
            Tienda
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
