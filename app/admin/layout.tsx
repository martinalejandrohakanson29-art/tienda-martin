"use client";

import { useEffect } from "react";
import { AdminNav } from "@/components/admin-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, ArrowLeft, LayoutDashboard, Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { NotificationListener } from "@/components/notification-listener"
import { PushNotificationSetup } from "@/components/push-notification-setup";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";
    return () => { document.body.style.backgroundColor = prev; };
  }, []);
  
  // El panel solo se muestra si la ruta es exactamente "/admin"
  const isFullscreenPage = pathname !== "/admin";
  const isLoginPage = pathname === "/admin/login";

  // Secciones que ya tienen su propia barra de navegación, botón atrás, o son dashboards a pantalla completa.
  const hasLocalHeader = 
    pathname.startsWith("/admin/ventas-mostrador") ||
    pathname.startsWith("/admin/compras") ||
    pathname.startsWith("/admin/erp") ||
    pathname.startsWith("/admin/listas") ||
    pathname.startsWith("/admin/mercadolibre") ||
    pathname.startsWith("/admin/todos") ||
    pathname.startsWith("/admin/usuarios") ||
    pathname.startsWith("/admin/contrasenas") ||
    pathname.startsWith("/admin/chatwoot/chats-vivo");

  const showGlobalHeader = !isLoginPage && isFullscreenPage && !hasLocalHeader;

  return (
    <SessionProvider>
    <NotificationListener />
    <PushNotificationSetup />
    <div className="flex flex-col md:flex-row min-h-screen bg-white">
      
      {/* BARRA LATERAL (Se oculta si no estamos en el dashboard principal) */}
      {!isFullscreenPage && (
        <aside className="hidden md:block w-72 shrink-0 bg-gray-900 border-r border-gray-800">
          <div className="sticky top-0 h-screen overflow-y-auto">
            <AdminNav />
          </div>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0"> 
        
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

        {/* CONTENEDOR DE CONTENIDO */}
        <div className={isFullscreenPage ? "flex flex-col min-h-screen bg-slate-50" : "p-4 md:p-8"}>
            {showGlobalHeader && (
                <header className="sticky top-0 z-50 w-full border-b bg-slate-900 text-white shadow-md">
                    <div className="mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.back()}
                                className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                <span>Atrás</span>
                            </Button>
                            <span className="text-slate-700">|</span>
                            <Link href="/admin">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors font-semibold"
                                >
                                    <LayoutDashboard className="h-4 w-4 text-yellow-400" />
                                    <span>Panel Revolución</span>
                                </Button>
                            </Link>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link href="/">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 border-slate-700 text-slate-200 hover:bg-slate-800 rounded-full px-4"
                                >
                                    <Globe className="h-4 w-4 text-emerald-400" />
                                    <span>Ver Tienda</span>
                                </Button>
                            </Link>
                        </div>
                    </div>
                </header>
            )}
            <div className={isFullscreenPage ? (hasLocalHeader ? "flex-1 flex flex-col min-h-0" : "flex-1 p-4 md:p-8") : ""}>
                {children}
            </div>
        </div>
      </main>
    </div>
    </SessionProvider>
  );
}
