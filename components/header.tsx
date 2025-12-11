import Link from "next/link"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    // 👇 CAMBIO: Volvemos a bg-white (Fondo Blanco) y borde suave
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        
        {/* LOGO O NOMBRE */}
        <Link href="/" className="flex items-center gap-2">
          {config?.logoUrl ? (
            // Si hay logo, mostramos la imagen
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                className="h-12 w-auto object-contain" 
                referrerPolicy="no-referrer"
            />
          ) : (
            // Si no, el texto en color oscuro (Negro)
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
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
          {/* Botón Admin discreto */}
          <Link href="/admin">
             <Button variant="ghost" size="sm" className="text-gray-500 hover:text-black hover:bg-gray-100 gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden lg:inline">Admin</span>
             </Button>
          </Link>
        </nav>

        {/* CARRITO */}
        <div className="flex items-center gap-4">
          {/* En móvil también mostramos el link de admin solo como icono si se necesita, o lo dejamos oculto */}
          <Link href="/admin" className="md:hidden text-gray-500">
            <Settings className="h-5 w-5" />
          </Link>
          
          <CartSheet />
        </div>
      </div>
    </header>
  )
}
