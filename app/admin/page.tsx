import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getProducts } from "@/app/actions/products"
import { Eye, Package, Trophy } from "lucide-react"

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    const products = await getProducts()

    // Cálculos de métricas
    const totalProducts = products.length
    const totalViews = products.reduce((acc, curr) => acc + (curr.views || 0), 0)
    
    // Producto más visto
    const mostViewedProduct = [...products].sort((a, b) => (b.views || 0) - (a.views || 0))[0]

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Panel de Control</h1>
            
            <div className="grid gap-4 md:grid-cols-3">
                {/* Tarjeta 1: Total Productos */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Productos</CardTitle>
                        <Package className="h-4 w-4 text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalProducts}</div>
                    </CardContent>
                </Card>

                {/* Tarjeta 2: Total Visitas */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Visitas Totales</CardTitle>
                        <Eye className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{totalViews}</div>
                        <p className="text-xs text-gray-400 mt-1">Interés general en tus productos</p>
                    </CardContent>
                </Card>

                {/* Tarjeta 3: Producto Estrella */}
                <Card className="border-l-4 border-l-yellow-400">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Producto Estrella</CardTitle>
                        <Trophy className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        {mostViewedProduct ? (
                            <>
                                <div className="text-lg font-bold truncate" title={mostViewedProduct.title}>
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
    )
}
