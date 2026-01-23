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
  
  // El panel solo se muestra si la ruta es exactamente "/admin"
  const isFullscreenPage = pathname !== "/admin";

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      
      {/* BARRA LATERAL (Se oculta si no estamos en el dashboard principal) */}
      {!isFullscreenPage && (
        <aside className="hidden md:block w-72 shrink-0 bg-gray-900 border-r border-gray-800">
          <div className="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto">
            <AdminNav />
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 overflow-hidden"> 
        
        {/* CABECERA MÓVIL (Se oculta si no estamos en el dashboard principal) */}
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

        {/* Usamos pantalla completa y quitamos paddings si no estamos en /admin */}
        <div className={isFullscreenPage ? "p-0 h-screen overflow-hidden" : "p-4 md:p-8"}>
            {children}
        </div>
      </main>
    </div>
  );
}
