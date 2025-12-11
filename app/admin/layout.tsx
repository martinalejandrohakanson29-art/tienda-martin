import { AdminNav } from "@/components/admin-nav"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // 👇 CAMBIO 1: Usamos Flexbox para poner Sidebar y Contenido lado a lado.
    // 'min-h-screen' asegura que cubra la pantalla.
    <div className="flex flex-col md:flex-row min-h-screen">
      
      {/* 1. BARRA LATERAL (SOLO PC) */}
      {/* Ya no usamos 'fixed'. Ahora es un bloque sólido que ocupa su espacio (w-72). */}
      <aside className="hidden md:block w-72 shrink-0 bg-gray-900 border-r border-gray-800">
        {/* 👇 TRUCO DE MAGIA: 'sticky top-24' 
           Esto hace que la barra se quede quieta cuando bajas (scroll), 
           pero respetando la altura de tu Header (aprox 24 unidades).
           Así nunca se solapa con el logo.
        */}
        <div className="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto">
          <AdminNav />
        </div>
      </aside>

      {/* 2. CONTENIDO PRINCIPAL */}
      {/* 'flex-1' hace que ocupe todo el ancho restante disponible. */}
      <main className="flex-1">
        
        {/* CABECERA MÓVIL (SOLO CELULAR - Sin cambios) */}
        <div className="md:hidden flex items-center p-4 border-b bg-white shadow-sm sticky top-0 z-40">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                        <Menu className="h-6 w-6" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 bg-slate-900 text-white w-72 border-r-slate-800">
                    <AdminNav />
                </SheetContent>
            </Sheet>
            <span className="font-bold text-lg ml-4">Panel de Administración</span>
        </div>

        {/* EL DASHBOARD */}
        <div className="p-4 md:p-8">
            {children}
        </div>
      </main>
    </div>
  )
}
