import { getProduct } from "@/app/actions/products"
import { notFound } from "next/navigation"
import AddToCart from "./add-to-cart"

export const dynamic = "force-dynamic"

export default async function ProductPage({ params }: { params: { id: string } }) {
    const product = await getProduct(params.id)

    if (!product) return notFound()

    return (
        <div className="container mx-auto px-4 py-12">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
                {/* Imagen del Producto */}
                <div className="aspect-square relative overflow-hidden rounded-2xl bg-gray-50 border shadow-sm">
                    <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                    />
                </div>

                {/* Información del Producto */}
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{product.title}</h1>
                        <div className="flex items-center gap-2 mt-2">
                            <p className="text-lg text-gray-500 badge badge-secondary">{product.category}</p>
                            {/* 👇 Etiqueta de Oferta */}
                            {product.discount > 0 && (
                                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                                    OFERTA {product.discount}% OFF
                                </span>
                            )}
                        </div>
                    </div>
                    
                    {/* 👇 Sección de Precios con lógica de Descuento */}
                    <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold text-gray-900">
                            ${(Number(product.price) * (1 - (product.discount || 0) / 100)).toFixed(2)}
                        </span>
                        {product.discount > 0 && (
                            <span className="text-xl text-gray-400 line-through mb-1">
                                ${Number(product.price).toFixed(2)}
                            </span>
                        )}
                    </div>

                    <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed">
                        <p>{product.description}</p>
                    </div>

                    <div className="pt-6 border-t">
                        <AddToCart product={product} />
                        <p className="text-sm text-gray-400 mt-4">Stock disponible: {product.stock} unidades</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
