import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getProducts } from "@/app/actions/products"
import { getUsers } from "@/app/actions/todos"
import { 
    Eye, 
    Package, 
    Trophy, 
    Store, 
    ArrowRight, 
    Instagram, 
    Settings2,
    ListTodo,
    LayoutDashboard,
    Globe // Importamos este icono nuevo
} from "lucide-react" 
import Link from "next/link"
import TaskForm from "./task-form"

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    const [products, users] = await Promise.all([
        getProducts(),
        getUsers()
    ])

    const totalProducts = products.length
    const totalViews = products.reduce((acc, curr) => acc + (curr.views || 0), 0)
    
    const topProducts = [...products]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 5)

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hola Revolución 👋</h1>
                    <p className="text-gray-500">Bienvenido a tu centro de control.</p>
                </div>
                
                <Link href="/admin/todos">
                    <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/5">
                        <ListTodo className="h-4 w-4" />
                        Visualizar tareas pendientes
                    </Button>
                </Link>
            </div>

            <Card className="border-2 border-primary/10 shadow-sm bg-slate-50/50">
                <TaskForm users={users} />
            </Card>

            <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    🚀 Accesos Rápidos
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    
                    <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-blue-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-blue-800 text-xl">
                                <LayoutDashboard className="h-6 w-6" />
                                Sistema Revolución Motos
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-6">Panel de control ERP integrado.</p>
                            <Link href="/admin/erp">
                                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm h-12 text-lg font-semibold">
                                    Abrir ERP <ArrowRight size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* ¡AQUÍ ESTÁ LA NUEVA TARJETA! */}
                    <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-emerald-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-emerald-800 text-xl">
                                <Globe className="h-6 w-6" />
                                Ventas de la Página
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-6">Historial de carritos y pagos web.</p>
                            <Link href="/admin/ventas-web">
                                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm h-12 text-lg">
                                    Ver Ventas <ArrowRight size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-yellow-400 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-yellow-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-yellow-800 text-xl">
                                <Store className="h-6 w-6" />
                                Gestionar Mercadolibre
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-6">Planificación, envíos y gestión.</p>
                            <Link href="/admin/mercadolibre">
                                <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white gap-2 shadow-sm h-12 text-lg">
                                    Entrar al Panel <ArrowRight size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-pink-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-pink-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-pink-800 text-xl">
                                <Instagram className="h-6 w-6" />
                                Gestionar Instagram
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-6">Seguimiento de ventas externas.</p>
                            <Link href="/admin/instagram">
                                <Button className="w-full bg-pink-600 hover:bg-pink-700 text-white gap-2 shadow-sm h-12 text-lg">
                                    Entrar al Panel <ArrowRight size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-indigo-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-indigo-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-indigo-800 text-xl">
                                <Settings2 className="h-6 w-6" />
                                Gestión Interna
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-6">Stock, Costos y Rentabilidad.</p>
                            <Link href="/admin/mercadolibre/interna">
                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm h-12 text-lg">
                                    Entrar al Panel <ArrowRight size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="pt-4 border-t">
                <h2 className="text-xl font-semibold mb-4 text-gray-600">Resumen de la Tienda</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Inventario Total</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalProducts} productos</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Interés Generado</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">{totalViews} visitas</div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-yellow-400 bg-yellow-50/30">
                        <CardHeader className="pb-2 text-sm font-medium text-yellow-700">Top 5 Más Vistos</CardHeader>
                        <CardContent>
                             {topProducts.map((p, i) => (
                                 <div key={p.id} className="text-xs font-bold py-1 border-b border-yellow-100 last:border-0">
                                     {i+1}. {p.title} ({p.views} vistas)
                                 </div>
                             ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
