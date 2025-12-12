"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import QuickAddButton from "@/components/quick-add-button"

export default function ProductCard({ product }: { product: any }) {
    // Calculamos el precio final para mostrarlo
    const finalPrice = product.discount > 0
        ? Number(product.price) * (1 - product.discount / 100)
        : Number(product.price)

    return (
        <Link href={`/products/${product.id}`} className="block h-full">
            <Card className="h-full hover:shadow-lg transition-shadow border-0 shadow-sm cursor-pointer group flex flex-col">
                <div className="aspect-square relative overflow-hidden rounded-t-lg bg-gray-100">
                    {/* Badge de Descuento */}
                    {product.discount > 0 && (
                        <span className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10 shadow-sm">
                            {product.discount}% OFF
                        </span>
                    )}
                    <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                    />
                </div>
                <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-lg truncate">{product.title}</h3>
                    <p className="text-gray-500 text-sm truncate mb-3">{product.category}</p>

                    <div className="mt-auto flex items-end justify-between">
                        <div className="flex flex-col">
                            {product.discount > 0 && (
                                <span className="text-xs text-gray-400 line-through">
                                    ${Number(product.price).toFixed(2)}
                                </span>
                            )}
                            <span className={`text-xl font-bold ${product.discount > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                                ${finalPrice.toFixed(2)}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs">Ver</Button>
                            {/* Reusamos el botón rápido que creamos antes */}
                            <QuickAddButton product={product} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
