"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Store } from "lucide-react" // Usamos íconos claros

export default function HeaderLogo({ config }: { config: any }) {
    const pathname = usePathname()
    const isHome = pathname === "/"

    // Definimos cómo se ve el logo para reutilizarlo
    const LogoContent = () => (
         <>
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
         </>
    )

    return (
        <>
            {/* 🖥️ VERSIÓN ESCRITORIO: Siempre mostramos el Logo */}
            <Link href="/" className="hidden md:flex items-center gap-2 transition-opacity hover:opacity-80">
                <LogoContent />
            </Link>

            {/* 📱 VERSIÓN MÓVIL: Lógica inteligente */}
            <div className="md:hidden flex items-center">
                 {isHome ? (
                     // Si estamos en Home, mostramos el Logo normal
                     <Link href="/" className="flex items-center gap-2">
                        <LogoContent />
                     </Link>
                 ) : (
                     // Si NO estamos en Home, mostramos botón de Volver/Inicio
                     <Link href="/">
                        <Button variant="ghost" className="pl-0 gap-2 font-bold text-gray-700 hover:text-blue-600 hover:bg-transparent">
                            <ArrowLeft className="h-5 w-5" />
                            <span className="text-lg">Inicio</span>
                        </Button>
                     </Link>
                 )}
            </div>
        </>
    )
}
