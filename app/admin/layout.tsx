import { AdminNav } from "@/components/admin-nav"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet" // Usamos el Sheet para el menú móvil
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react" // Icono de hamburguesa

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-full relative">
      
      {/* 1. BARRA LATERAL FIJA (SOLO PC) */}
      <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900">
        <AdminNav />
      </div>

      {/* 2. CONTENIDO PRINCIPAL */}
      <main className="md:pl-72 pb-10">
        
        {/* CABECERA MÓVIL (SOLO CELULAR) */}
        <div className="md:hidden flex items-center p-4 border-b bg-white shadow-sm sticky top-0 z-50">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                        <Menu className="h-6 w-6" /> {/* Icono de 3 líneas */}
                    </Button>
                </SheetTrigger>
                {/* Contenido del menú desplegable */}
                <SheetContent side="left" className="p-0 bg-slate-900 text-white w-72 border-r-slate-800">
                    <AdminNav />
                </SheetContent>
            </Sheet>
            <span className="font-bold text-lg ml-4">Panel de Administración</span>
        </div>

        {/* EL DASHBOARD O PÁGINA QUE ESTÉS VIENDO */}
        <div className="p-4 md:p-8">
            {children}
        </div>
      </main>
    </div>
  )
}
