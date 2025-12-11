"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Package, Settings, Image as ImageIcon, Wrench, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
// 👇 CORRECCIÓN: Quitamos las llaves { } porque es una exportación por defecto
import SignOutButton from "@/components/sign-out-button" 

const routes = [
    {
        label: "Dashboard",
        icon: LayoutDashboard,
        href: "/admin",
        color: "text-sky-500",
    },
    {
        label: "Productos",
        icon: Package,
        href: "/admin/products",
        color: "text-violet-500",
    },
    {
        label: "Carrusel",
        icon: ImageIcon,
        href: "/admin/carousel",
        color: "text-pink-700",
    },
    {
        label: "Configuración",
        icon: Settings,
        href: "/admin/config",
        color: "text-orange-700",
    },
    {
        label: "Herramientas",
        icon: Wrench,
        href: "/admin/tools",
        color: "text-gray-500",
    },
]

export function AdminNav({ className }: { className?: string }) {
    const pathname = usePathname()

    return (
        <div className={cn("space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white", className)}>
            <div className="px-3 py-2 flex-1">
                <Link href="/admin" className="flex items-center pl-3 mb-14">
                    <h1 className="text-2xl font-bold">
                        Admin Panel
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            
            {/* Botón de Salir al final */}
            <div className="px-3 py-4 border-t border-slate-800">
                 {/* Usamos el componente que importamos */}
                 <div className="px-3">
                    <SignOutButton />
                 </div>
            </div>
        </div>
    )
}
