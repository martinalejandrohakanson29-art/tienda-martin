import { getProduct, incrementProductView } from "@/app/actions/products"
import { notFound } from "next/navigation"
import AddToCart from "./add-to-cart"
import { formatPrice } from "@/lib/utils" // 👈 Importamos la función

export const dynamic = "force-dynamic"

export default async function ProductPage({ params }: { params: { id: string } }) {
    const product = await getProduct(params.id)

    if (!product) return notFound()

    // 👇 MAGIA: Registramos la visita en segundo plano
    incrementProductView(product.id).catch(console.error)

    // Calculamos el precio final aquí para tener el código más limpio
    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)

    return (
        <div className="container mx-auto px-4 py-12">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
                <div className="aspect-square relative overflow-hidden rounded-2xl bg-gray-50 border shadow-sm">
                    {product.discount > 0 && (
                        <span className="absolute top-4 right-4 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-md z-10">
                            {product.discount}% OFF
                        </span>
                    )}
                    <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                    />
                </div>

                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{product.title}</h1>
                        <p className="text-lg text-gray-500 mt-2 badge badge-secondary">{product.category}</p>
                    </div>
                    
                    <div className="flex items-end gap-3">
                        <span className={`text-4xl font-bold ${product.discount > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatPrice(finalPrice)} {/* 👈 Precio con descuento formateado */}
                        </span>
                        {product.discount > 0 && (
                            <span className="text-xl text-gray-400 line-through mb-1">
                                {formatPrice(product.price)} {/* 👈 Precio original formateado */}
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
