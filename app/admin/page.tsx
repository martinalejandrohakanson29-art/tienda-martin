import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getProducts } from "@/app/actions/products"
import { Eye, Package, Trophy, Truck, ExternalLink, ArrowRight } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    // 1. Mantenemos la lógica de métricas que ya tenías
    const products = await getProducts()
    const totalProducts = products.length
    const totalViews = products.reduce((acc, curr) => acc + (curr.views || 0), 0)
    const mostViewedProduct = [...products].sort((a, b) => (b.views || 0) - (a.views || 0))[0]

    return (
        <div className="space-y-8">
            {/* Encabezado */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Hola Revolucion 👋</h1>
                <p className="text-gray-500">Bienvenido a tu centro de control.</p>
            </div>

            {/* SECCIÓN 1: OPERACIONES (Lo prioritario) */}
            <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    🚀 Accesos Rápidos
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    
                    {/* 👇 LA TARJETA QUE PEDISTE: ENVÍOS FULL */}
                    <Card className="border-l-4 border-l-blue-600 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-blue-50/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-blue-800 text-xl">
                                <Truck className="h-6 w-6" />
                                Envíos Full ML
                            </CardTitle>
                            <CardDescription className="text-blue-600/80 font-medium">
                                Sistema de Fotos y Etiquetado
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600 mb-6">
                                Accede a la herramienta para escanear productos y subir evidencia a Drive.
                            </p>
                            <Link 
                                href="https://guia-pedidos-ml-production.up.railway.app/" 
                                target="_blank" 
                                rel="noopener noreferrer"
                            >
                                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm h-12 text-lg">
                                    Abrir Sistema <ExternalLink size={18} />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Tarjeta de Acceso a Productos (Para no perderla de vista) */}
                    <Card className="hover:shadow-md transition-all cursor-pointer group border-l-4 border-l-gray-300">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-gray-700">
                                <Package className="h-6 w-6" />
                                Gestionar Catálogo
                            </CardTitle>
                            <CardDescription>
                                Editar precios, stock y fotos
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <Link href="/admin/products">
                                <Button variant="outline" className="w-full gap-2 group-hover:border-gray-400 group-hover:bg-gray-50">
                                    Ir a Productos <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform"/>
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* SECCIÓN 2: MÉTRICAS (Información secundaria) */}
            <div className="pt-4 border-t">
                <h2 className="text-xl font-semibold mb-4 text-gray-600">Resumen de la Tienda</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    {/* Tarjeta Total Productos */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Inventario Total</CardTitle>
                            <Package className="h-4 w-4 text-gray-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalProducts}</div>
                            <p className="text-xs text-gray-400 mt-1">productos cargados</p>
                        </CardContent>
                    </Card>

                    {/* Tarjeta Total Visitas */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Interés Generado</CardTitle>
                            <Eye className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">{totalViews}</div>
                            <p className="text-xs text-gray-400 mt-1">visitas totales</p>
                        </CardContent>
                    </Card>

                    {/* Tarjeta Producto Estrella */}
                    <Card className="border-l-4 border-l-yellow-400 bg-yellow-50/30">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-yellow-700">Más Popular</CardTitle>
                            <Trophy className="h-4 w-4 text-yellow-500" />
                        </CardHeader>
                        <CardContent>
                            {mostViewedProduct ? (
                                <>
                                    <div className="text-lg font-bold truncate text-gray-800" title={mostViewedProduct.title}>
                                        {mostViewedProduct.title}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Con <span className="font-bold text-gray-900">{mostViewedProduct.views}</span> visitas
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-gray-400">Aún no hay datos</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

