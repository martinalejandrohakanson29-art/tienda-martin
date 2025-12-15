import Link from "next/link"
import { Menu, LayoutDashboard } from "lucide-react" // 👈 Agregamos el ícono del Dashboard
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import CartSheet from "@/components/cart-sheet"
import { getConfig } from "@/app/actions/config"
import { getUniqueCategories } from "@/app/actions/products"
import CategoryMenu from "@/components/category-menu"
// 👇 Importaciones necesarias para la seguridad
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

export default async function Header() {
  const config = await getConfig()
  const categories = await getUniqueCategories()
  
  // 👇 Verificamos si hay alguien logueado
  const session = await getServerSession(authOptions)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        
        {/* GRUPO IZQUIERDA: Logo + Categorías (Móvil) */}
        <div className="flex items-center gap-2 md:gap-6">
            <Link href="/" className="flex items-center gap-2">
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

            {/* Visible solo en móvil (md:hidden) */}
            <div className="md:hidden border-l pl-2 ml-1 border-gray-300">
                <CategoryMenu categories={categories} />
            </div>
        </div>

        {/* GRUPO CENTRO: Navegación PC */}
        <nav className="hidden md:flex items-center gap-6 flex-1 ml-6">
          <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">Inicio</Link>
          <Link href="/shop" className="text-sm font-medium hover:text-primary transition-colors">Tienda</Link>
          <CategoryMenu categories={categories} />

          {/* 👇 BOTÓN DASHBOARD (Solo visible si estás logueado) */}
          {session && (
            <Link 
                href="/admin" 
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-all font-bold text-sm shadow-md ml-4 animate-in fade-in zoom-in"
            >
                <LayoutDashboard size={16} className="text-yellow-400" /> {/* Ícono amarillo para destacar */}
                Dashboard
            </Link>
          )}
        </nav>

        {/* GRUPO DERECHA: Carrito + Hamburguesa */}
        <div className="flex items-center gap-2">
            <CartSheet />

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
                        
                        {/* 👇 BOTÓN DASHBOARD MÓVIL (Solo si logueado) */}
                        {session && (
                            <>
                                <div className="h-px bg-gray-200 my-2"></div>
                                <Link 
                                    href="/admin" 
                                    className="flex items-center gap-2 text-lg font-bold text-slate-900 bg-slate-100 p-3 rounded-lg"
                                >
                                    <LayoutDashboard size={20} className="text-purple-600" />
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
