"use client"

import { Product } from "@prisma/client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

export default function ShopClient({ products, categories }: { products: Product[], categories: string[] }) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    const filteredProducts = selectedCategory
        ? products.filter((p) => p.category === selectedCategory)
        : products

    return (
        <div className="flex flex-col md:flex-row gap-8">
            <aside className="w-full md:w-64 space-y-4">
                <h3 className="font-semibold text-lg">Categorías</h3>
                <div className="flex flex-wrap gap-2 md:flex-col">
                    <Button
                        variant={selectedCategory === null ? "default" : "ghost"}
                        className="justify-start w-full"
                        onClick={() => setSelectedCategory(null)}
                    >
                        Todas
                    </Button>
                    {categories.map((category) => (
                        <Button
                            key={category}
                            variant={selectedCategory === category ? "default" : "ghost"}
                            className="justify-start w-full"
                            onClick={() => setSelectedCategory(category)}
                        >
                            {category}
                        </Button>
                    ))}
                </div>
            </aside>

            <div className="flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProducts.map((product) => (
                        <Link key={product.id} href={`/products/${product.id}`}>
                            <Card className="h-full hover:shadow-lg transition-shadow border-0 shadow-sm">
                                <div className="aspect-square relative overflow-hidden rounded-t-lg bg-gray-100">
                                    <img
                                        src={product.imageUrl}
                                        alt={product.title}
                                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                               <CardContent className="p-4">
    <h3 className="font-semibold text-lg truncate">{product.title}</h3>
    <p className="text-gray-500 text-sm truncate">{product.category}</p>
    <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-col">
            {product.discount > 0 && (
                <span className="text-xs text-gray-400 line-through">
                    ${Number(product.price).toFixed(2)}
                </span>
            )}
            <span className="text-xl font-bold">
                ${(Number(product.price) * (1 - (product.discount || 0) / 100)).toFixed(2)}
            </span>
        </div>
        {product.discount > 0 ? (
             <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
                -{product.discount}%
            </span>
        ) : (
            <Button size="sm" variant="secondary">Ver</Button>
        )}
    </div>
</CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
                {filteredProducts.length === 0 && (
                    <p className="text-center text-gray-500 mt-8">No se encontraron productos en esta categoría.</p>
                )}
            </div>
        </div>
    )
}

