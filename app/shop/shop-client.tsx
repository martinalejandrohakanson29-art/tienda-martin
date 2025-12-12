"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation" // 👈 Importante
import ProductCard from "@/components/ui/product-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"

export default function ShopClient({ initialProducts }: { initialProducts: any[] }) {
    const searchParams = useSearchParams()
    const categoryFilter = searchParams.get("category") // 👈 Leemos ?category=...

    const [filteredProducts, setFilteredProducts] = useState(initialProducts)
    const [search, setSearch] = useState("")

    // Efecto para filtrar cuando cambia la categoría en la URL o el buscador
    useEffect(() => {
        let result = initialProducts

        // 1. Filtro por Categoría (URL)
        if (categoryFilter) {
            result = result.filter(p => p.category === categoryFilter)
        }

        // 2. Filtro por Buscador (Texto)
        if (search) {
            result = result.filter(p => 
                p.title.toLowerCase().includes(search.toLowerCase()) ||
                p.category.toLowerCase().includes(search.toLowerCase())
            )
        }

        setFilteredProducts(result)
    }, [categoryFilter, search, initialProducts])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input 
                        placeholder="Buscar productos..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {/* Mostrar qué categoría estamos viendo */}
                {categoryFilter && (
                    <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
                        Categoría: {categoryFilter}
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-4 w-4 hover:bg-blue-100 rounded-full"
                            onClick={() => window.location.href = "/shop"} // Limpiar filtro
                        >
                            <X size={12} />
                        </Button>
                    </div>
                )}
                <div className="text-sm text-gray-500 font-medium">
                    {filteredProducts.length} productos encontrados
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-xl text-gray-500">No se encontraron productos.</p>
                    {categoryFilter && (
                         <Button variant="link" onClick={() => window.location.href = "/shop"}>
                            Ver todos los productos
                         </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    )
}
