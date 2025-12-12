import Link from "next/link"
import { ShoppingCart, Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import CartSheet from "@/components/cart-sheet"
import { getConfig } from "@/app/actions/config"
import { getUniqueCategories } from "@/app/actions/products" // 👈 Importamos la acción
import CategoryMenu from "@/components/category-menu" // 👈 Importamos el menú

export default async function Header() {
  const config = await getConfig()
  const categories = await getUniqueCategories() // 👈 Obtenemos las categorías

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-6">
          {config?.logoUrl ? (
            <img 
                src={config.logoUrl} 
                alt={config.companyName} 
                className="object-contain"
                style={{ height: config.logoHeight || '40px' }} 
            />
          ) : (
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                {config?.companyName || "Tienda"}
            </span>
          )}
        </Link>

        {/* Navegación PC */}
        <nav className="hidden md:flex items-center gap-6 flex-1">
          <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">Inicio</Link>
          <Link href="/shop" className="text-sm font-medium hover:text-primary transition-colors">Tienda</Link>
          
          {/* 👇 AQUÍ ESTÁ EL NUEVO MENÚ */}
          <CategoryMenu categories={categories} />
        </nav>

        {/* Acciones Derecha (Carrito) */}
        <div className="flex items-center gap-2">
            <CartSheet />

            {/* Menú Móvil */}
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left">
                    <div className="flex flex-col gap-4 mt-8">
                        <Link href="/" className="text-lg font-bold">Inicio</Link>
                        <Link href="/shop" className="text-lg font-bold">Tienda Completa</Link>
                        
                        <div className="py-2 border-t border-b">
                            <p className="text-sm text-gray-500 mb-2 uppercase font-bold">Categorías</p>
                            <div className="flex flex-col gap-2 pl-2">
                                {categories.map(cat => (
                                    <Link key={cat} href={`/shop?category=${encodeURIComponent(cat)}`} className="text-base">
                                        • {cat}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
      </div>
    </header>
  )
}
