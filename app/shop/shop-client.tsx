"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import ProductCard from "@/components/ui/product-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"

export default function ShopClient({ initialProducts }: { initialProducts: any[] }) {
    const searchParams = useSearchParams()
    const categoryFilter = searchParams.get("category")

    const [filteredProducts, setFilteredProducts] = useState(initialProducts)
    const [search, setSearch] = useState("")

    useEffect(() => {
        let result = initialProducts

        if (categoryFilter) {
            result = result.filter(p => p.category === categoryFilter)
        }

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
            {/* Barra de búsqueda y filtros */}
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-[#1A1A1A] border border-white/10 p-4 rounded-lg">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar productos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-[#111] border-white/15 text-white placeholder:text-gray-600 focus-visible:ring-red-600/50 h-11"
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    {categoryFilter && (
                        <div className="flex items-center gap-2 bg-red-950 text-red-400 border border-red-900/60 px-3 py-1.5 rounded-full text-xs font-bold">
                            {categoryFilter}
                            <button
                                className="hover:text-red-300 transition-colors p-0.5"
                                onClick={() => window.location.href = "/shop"}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                        {filteredProducts.length} productos
                    </span>
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-xl text-gray-500">No se encontraron productos.</p>
                    {categoryFilter && (
                        <Button
                            variant="link"
                            className="text-red-400 hover:text-red-300 mt-2"
                            onClick={() => window.location.href = "/shop"}
                        >
                            Ver todos los productos
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    )
}
