import { getProduct, incrementProductView } from "@/app/actions/products"
import { notFound } from "next/navigation"
import AddToCart from "./add-to-cart"
import { formatPrice } from "@/lib/utils"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

export const dynamic = "force-dynamic"

function getVideoEmbedUrl(url: string) {
    if (!url) return null;
    if (url.includes("youtube.com/watch?v=")) return url.replace("watch?v=", "embed/");
    if (url.includes("youtu.be/")) {
        const id = url.split("youtu.be/")[1];
        return `https://www.youtube.com/embed/${id}`;
    }
    if (url.includes("drive.google.com") && url.includes("/view")) return url.replace("/view", "/preview");
    return url;
}

export default async function ProductPage({ params }: { params: { id: string } }) {
    const product = await getProduct(params.id)

    if (!product) return notFound()

    incrementProductView(product.id).catch(console.error)
    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)
    const hasDiscount = (product.discount || 0) > 0

    const images = [product.imageUrl, product.imageUrl2, product.imageUrl3].filter(img => img && img.trim() !== "")
    const videoEmbedUrl = getVideoEmbedUrl(product.videoUrl || "")

    return (
        <div className="container mx-auto px-4 py-12">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
                
                {/* SECCIÓN DE IMÁGENES / CARRUSEL */}
                <div className="relative rounded-2xl bg-gray-50 border shadow-sm overflow-hidden">
                    {/* 👇 CAMBIO: Badge Verde */}
                    {hasDiscount && (
                        <span className="absolute top-4 right-4 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-md z-10">
                            {product.discount}% OFF
                        </span>
                    )}

                    {images.length > 1 ? (
                        <Carousel className="w-full">
                            <CarouselContent>
                                {images.map((img, index) => (
                                    <CarouselItem key={index}>
                                        <div className="aspect-square relative">
                                            <img src={img} alt={`${product.title} - foto ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-2 opacity-70 hover:opacity-100" />
                            <CarouselNext className="right-2 opacity-70 hover:opacity-100" />
                        </Carousel>
                    ) : (
                        <div className="aspect-square relative">
                            <img src={images[0]} alt={product.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                    )}
                </div>

                {/* DETALLES */}
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{product.title}</h1>
                        <p className="text-lg text-gray-500 mt-2 badge badge-secondary">{product.category}</p>
                    </div>
                    
                    <div className="flex items-end gap-3">
                        {/* 👇 CAMBIO: Precio Verde si hay descuento */}
                        <span className={`text-4xl font-bold ${hasDiscount ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatPrice(finalPrice)}
                        </span>
                        {hasDiscount && (
                            <span className="text-xl text-gray-400 line-through mb-1">
                                {formatPrice(Number(product.price))}
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

                    {videoEmbedUrl && (
                        <div className="mt-8 pt-6 border-t">
                            <h3 className="text-lg font-bold mb-3">Video del Producto</h3>
                            <div className="aspect-video w-full rounded-xl overflow-hidden shadow-sm border bg-black">
                                <iframe src={videoEmbedUrl} className="w-full h-full" allowFullScreen title="Video del producto" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
