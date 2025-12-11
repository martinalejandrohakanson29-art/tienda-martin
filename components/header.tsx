import Link from "next/link"
import { Settings, Package } from "lucide-react" // Me aseguro de importar Package por si acaso
import { Button } from "@/components/ui/button"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
  const config = await getConfig()

  return (
    // 👇 CAMBIO 1: Aumentamos la altura del header a h-20 (80px) para dar espacio al logo
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        
        {/* LOGO O NOMBRE */}
        <Link href="/" className="flex items-center gap-2 h-full py-2"> 
          {config?.logoUrl ? (
            // 👇 CAMBIO 2: Aumentamos la imagen a h-16 (64px) o h-full para aprovechar el espacio
            // 'object-contain' asegura que se vea entero sin cortarse
            <img 
                src={config.logoUrl} 
                alt={config?.companyName || "Logo"} 
                className="h-full w-auto max-h-16 object-contain" 
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
          <Link href="/admin" className="md:hidden text-gray-500">
            <Settings className="h-5 w-5" />
          </Link>
          
          <CartSheet />
        </div>
      </div>
    </header>
  )
}
