"use client";

import { AdminNav } from "@/components/admin-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // 1. Definimos qué páginas queremos ver SIN menú lateral (Pantalla Completa)
  const isFullscreenPage = 
    pathname === "/admin/mercadolibre/planning" || 
    pathname === "/admin/mercadolibre/articulos";

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      
      {/* 2. BARRA LATERAL (SOLO PC) */}
      {/* Se oculta si estamos en Planning o Artículos */}
      {!isFullscreenPage && (
        <aside className="hidden md:block w-72 shrink-0 bg-gray-900 border-r border-gray-800">
          <div className="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto">
            <AdminNav />
          </div>
        </aside>
      )}

      {/* 3. CONTENIDO PRINCIPAL */}
      <main className="flex-1 overflow-hidden"> 
        
        {/* CABECERA MÓVIL (SOLO CELULAR) */}
        {!isFullscreenPage && (
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
        )}

        {/* EL DASHBOARD / TABLA */}
        {/* Si es pantalla completa, quitamos el padding (p-0) para usar todo el espacio */}
        <div className={isFullscreenPage ? "p-0 h-screen overflow-hidden" : "p-4 md:p-8"}>
            {children}
        </div>
      </main>
    </div>
  );
}
