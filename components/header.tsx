// components/header.tsx
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import CartSheet from "@/components/cart-sheet"
import CategoryMenu from "@/components/category-menu"
import HeaderLogo from "@/components/header-logo"

export default async function Header({ config, categories }: { config: any, categories: any }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0D0D0D]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0D0D0D]/80">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">

        {/* IZQUIERDA: Logo + Categorías mobile */}
        <div className="flex items-center gap-2 md:gap-6">
          <HeaderLogo config={config} />
          <div className="md:hidden border-l pl-2 ml-1 border-gray-700">
            <CategoryMenu categories={categories} />
          </div>
        </div>

        {/* CENTRO: Navegación desktop */}
        <nav className="hidden md:flex items-center gap-6 flex-1 ml-6">
          <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Inicio</Link>
          <Link href="/shop" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Tienda</Link>
          <CategoryMenu categories={categories} />
        </nav>

        {/* DERECHA: Carrito + Hamburguesa */}
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
              </div>
            </SheetContent>
          </Sheet>
        </div>

      </div>
    </header>
  )
}
