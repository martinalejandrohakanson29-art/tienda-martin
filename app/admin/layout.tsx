"use client"; // 👈 Necesario para saber en qué página estamos

import { AdminNav } from "@/components/admin-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation"; // 👈 Importamos el hook de navegación

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Detectamos si estamos en la página de la planilla gigante
  const isPlanningPage = pathname === "/admin/mercadolibre/planning";

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      
      {/* 1. BARRA LATERAL (SOLO PC) */}
      {/* 👇 CONDICIÓN: Si NO es planning, mostramos la barra. Si es planning, se oculta (null) */}
      {!isPlanningPage && (
        <aside className="hidden md:block w-72 shrink-0 bg-gray-900 border-r border-gray-800">
          <div className="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto">
            <AdminNav />
          </div>
        </aside>
      )}

      {/* 2. CONTENIDO PRINCIPAL */}
      <main className="flex-1 overflow-hidden"> 
      {/* Agregué overflow-hidden para evitar doble scroll en la página de planning */}
        
        {/* CABECERA MÓVIL (SOLO CELULAR) */}
        {/* 👇 También la ocultamos en planning para ganar espacio en el cel */}
        {!isPlanningPage && (
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

        {/* EL DASHBOARD */}
        {/* 👇 Truco: Si es planning, quitamos el padding (p-0) para que la tabla toque los bordes */}
        <div className={isPlanningPage ? "p-0 h-screen" : "p-4 md:p-8"}>
            {children}
        </div>
      </main>
    </div>
  );
}
