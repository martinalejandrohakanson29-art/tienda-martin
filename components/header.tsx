import Link from "next/link"
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      {/* 👇 Agregamos 'relative' para que el posicionamiento absoluto funcione aquí dentro */}
      <div className="container mx-auto flex h-24 items-center justify-between px-4 relative">
        
        {/* LOGO O NOMBRE */}
        <Link href="/" className="flex items-center gap-2 h-full py-2"> 
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                className="h-full w-auto object-contain" 
                referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">
              {config?.companyName || "Mi Tienda"}
            </h1>
          )}
        </Link>

        {/* NAVEGACIÓN PC */}
        {/* 👇 CAMBIO: Posicionamiento absoluto para centrado perfecto */}
        <nav className="hidden md:flex items-center space-x-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Link href="/" className="text-sm font-medium text-gray-700 hover:text-black transition-colors">
            Inicio
          </Link>
          <Link href="/shop" className="text-sm font-medium text-gray-700 hover:text-black transition-colors">
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
