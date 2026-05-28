// components/header.tsx
import Link from "next/link"
import { Menu, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import CartSheet from "@/components/cart-sheet"
// ELIMINAMOS las importaciones de acciones que ya no usamos (getConfig, getUniqueCategories)
import CategoryMenu from "@/components/category-menu"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import HeaderLogo from "@/components/header-logo"

// Definimos que el componente recibe config y categories
export default async function Header({ config, categories }: { config: any, categories: any }) {
  // ELIMINADO: const config = await getConfig()
  // ELIMINADO: const categories = await getUniqueCategories()
  
  // Esto SÍ lo mantenemos porque el layout no lo está pasando
  const session = await getServerSession(authOptions)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0D0D0D]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0D0D0D]/80">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        
        {/* GRUPO IZQUIERDA: Logo Inteligente + Categorías */}
        <div className="flex items-center gap-2 md:gap-6">
            
            {/* Pasamos el config directamente, ya viene procesado del layout */}
            <HeaderLogo config={config} />

            {/* Visible solo en móvil (md:hidden) */}
            <div className="md:hidden border-l pl-2 ml-1 border-gray-300">
                <CategoryMenu categories={categories} />
            </div>
        </div>

        {/* GRUPO CENTRO: Navegación PC */}
        <nav className="hidden md:flex items-center gap-6 flex-1 ml-6">
          <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Inicio</Link>
          <Link href="/shop" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Tienda</Link>
          <CategoryMenu categories={categories} />

          {/* BOTÓN DASHBOARD (Solo visible si estás logueado) */}
          {session && (
            <Link 
                href="/admin" 
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-all font-bold text-sm shadow-md ml-4 animate-in fade-in zoom-in"
            >
                <LayoutDashboard size={16} className="text-yellow-400" />
                Dashboard
            </Link>
          )}
        </nav>

        {/* GRUPO DERECHA: Carrito + Hamburguesa */}
        <div className="flex items-center gap-2">
            <CartSheet />

            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-white/10">
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="bg-[#111] border-white/10 text-white">
                    <div className="flex flex-col gap-4 mt-8">
                        <Link href="/" className="text-lg font-bold text-gray-200 hover:text-white transition-colors">Inicio</Link>
                        <Link href="/shop" className="text-lg font-bold text-gray-200 hover:text-white transition-colors">Tienda Completa</Link>

                        {session && (
                            <>
                                <div className="h-px bg-white/10 my-2"></div>
                                <Link
                                    href="/admin"
                                    className="flex items-center gap-2 text-base font-bold text-white bg-white/10 hover:bg-white/15 p-3 rounded-lg transition-colors"
                                >
                                    <LayoutDashboard size={20} className="text-yellow-400" />
                                    Ir al Dashboard
                                </Link>
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
      </div>
    </header>
  )
}
