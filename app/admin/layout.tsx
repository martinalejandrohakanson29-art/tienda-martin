import Link from "next/link"
import { LayoutDashboard, Package, Settings, Image as ImageIcon, Wrench } from "lucide-react" // 👈 Importamos Wrench
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import SignOutButton from "@/components/sign-out-button"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getServerSession(authOptions)

    return (
        <div className="flex min-h-screen">
            <aside className="w-64 bg-gray-900 text-white p-6 hidden md:block fixed h-full">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Admin Panel</h1>
                </div>
                <nav className="space-y-2">
                    <Link href="/admin" className="flex items-center space-x-2 p-2 hover:bg-gray-800 rounded">
                        <LayoutDashboard size={20} />
                        <span>Dashboard</span>
                    </Link>
                    <Link href="/admin/products" className="flex items-center space-x-2 p-2 hover:bg-gray-800 rounded">
                        <Package size={20} />
                        <span>Productos</span>
                    </Link>
                    <Link href="/admin/carousel" className="flex items-center space-x-2 p-2 hover:bg-gray-800 rounded">
                        <ImageIcon size={20} />
                        <span>Carrusel</span>
                    </Link>
                    
                    {/* 👇 NUEVA SECCIÓN HERRAMIENTAS */}
                    <Link href="/admin/tools" className="flex items-center space-x-2 p-2 hover:bg-gray-800 rounded text-blue-300 font-medium">
                        <Wrench size={20} />
                        <span>Herramientas</span>
                    </Link>

                    <Link href="/admin/config" className="flex items-center space-x-2 p-2 hover:bg-gray-800 rounded">
                        <Settings size={20} />
                        <span>Configuración</span>
                    </Link>
                </nav>
                <div className="absolute bottom-6 left-6 right-6">
                    <SignOutButton />
                </div>
            </aside>
            <main className="flex-1 p-8 bg-gray-50 md:ml-64 min-h-screen">
                {children}
            </main>
        </div>
    )
}
