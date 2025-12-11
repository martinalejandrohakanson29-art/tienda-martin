import Link from "next/link"
import { ShoppingCart, Package, Home, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/60 text-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        
        {/* 👇 AQUÍ ESTÁ LA LÓGICA DEL LOGO vs TEXTO */}
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
          {config?.logoUrl ? (
            // OPCIÓN 1: SI HAY URL DE LOGO, MUESTRA LA IMAGEN
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                // h-10 o h-12 es un buen tamaño para que no rompa el header
                // object-contain asegura que el logo no se deforme
                className="h-12 w-auto object-contain" 
                referrerPolicy="no-referrer"
            />
          ) : (
            // OPCIÓN 2: SI NO HAY LOGO, MUESTRA EL TEXTO (Como estaba antes)
            <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300 truncate">
              {config?.companyName || "Tienda"}
            </h1>
          )}
        </Link>

        {/* Resto del Header (Navegación y Carrito) */}
        <nav className="flex items-center gap-2 md:gap-4">
          <Link href="/shop">
            <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20 hidden md:flex">
              <Package className="h-5 w-5 mr-2" />
              Productos
            </Button>
             {/* Versión móvil solo icono */}
            <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/20 md:hidden">
              <Package className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/admin" className="hidden md:block">
             <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/20 gap-2">
                <Settings className="h-4 w-4" /> Admin
             </Button>
          </Link>

          <CartSheet />
        </nav>
      </div>
    </header>
  )
}
