import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getProducts } from "@/app/actions/products"
import { createTodo, getUsers } from "@/app/actions/todos"
import { 
    Eye, 
    Package, 
    Trophy, 
    Store, 
    ArrowRight, 
    Instagram, 
    Settings2, 
    ClipboardList,
    ListTodo
} from "lucide-react" 
import Link from "next/link"

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    const [products, users] = await Promise.all([
        getProducts(),
        getUsers()
    ])

    const totalProducts = products.length
    const totalViews = products.reduce((acc, curr) => acc + (curr.views || 0), 0)
    const topProducts = [...products].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5)

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hola Revolución 👋</h1>
                    <p className="text-gray-500">Bienvenido a tu centro de control.</p>
                </div>
            </div>

            {/* SECCIÓN ASIGNACIÓN DE PENDIENTES ACTUALIZADA */}
            <Card className="border-2 border-primary/10 shadow-sm bg-slate-50/50">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <ClipboardList className="h-5 w-5" />
                            Asignar de tareas
                        </CardTitle>
                        <CardDescription>
                            Crear y asignar tareas especificas por usuario
                        </CardDescription>
                    </div>
                    {/* Botón nuevo para ir al visualizador */}
                    <Link href="/admin/todos">
                        <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/5">
                            <ListTodo className="h-4 w-4" />
                            Visualizar tareas pendientes
                        </Button>
                    </Link>
                </CardHeader>
                <CardContent>
                    <form action={createTodo} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Tarea / Pendiente</label>
                            <Input 
                                name="content" 
                                placeholder="Ej: actualizar lista de precios Paolucci..." 
                                required 
                                className="bg-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Prioridad</label>
                            <select 
                                name="priority" 
                                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                            >
                                <option value="baja">Baja</option>
                                <option value="media">Media</option>
                                <option value="alta">Alta</option>
                                <option value="urgente">⚠️ Urgente</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Asignar a</label>
                            <select 
                                name="userId" 
                                required 
                                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                            >
                                <option value="">Seleccionar...</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>@{user.username}</option>
                                ))}
                            </select>
                        </div>
                        <Button type="submit" className="w-full md:w-auto gap-2">
                            Asignar Tarea
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* SECCIÓN 1: OPERACIONES */}
            <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">🚀 Accesos Rápidos</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="border-l-4 border-l-yellow-400 shadow-md bg-gradient-to-br from-white to-yellow-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-yellow-800 text-xl"><Store className="h-6 w-6" />Gestionar Mercadolibre</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Link href="/admin/mercadolibre">
                                <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white h-12 text-lg">Entrar al Panel <ArrowRight size={18} /></Button>
                            </Link>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-pink-500 shadow-md bg-gradient-to-br from-white to-pink-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-pink-800 text-xl"><Instagram className="h-6 w-6" />Gestionar Instagram</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Link href="/admin/instagram">
                                <Button className="w-full bg-pink-600 hover:bg-pink-700 text-white h-12 text-lg">Entrar al Panel <ArrowRight size={18} /></Button>
                            </Link>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-indigo-500 shadow-md bg-gradient-to-br from-white to-indigo-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-indigo-800 text-xl"><Settings2 className="h-6 w-6" />Gestión Interna</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Link href="/admin/mercadolibre/interna">
                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-lg">Entrar al Panel <ArrowRight size={18} /></Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
