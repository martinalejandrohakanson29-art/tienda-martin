import Link from "next/link"
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container mx-auto flex h-24 items-center justify-between px-4">
        
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
        <nav className="hidden md:flex items-center space-x-6">
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
