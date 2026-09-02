import { getProduct, incrementProductView } from "@/app/actions/products"
import { notFound } from "next/navigation"
import AddToCart from "./add-to-cart"
import { formatPrice } from "@/lib/utils"
import { Metadata, ResolvingMetadata } from "next"
import PixelProductView from "@/components/pixel-product-view" // 👈 1. IMPORTANTE: Importamos el componente del Píxel
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft } from "lucide-react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

export const dynamic = "force-dynamic"

// Genera el título y foto para WhatsApp/Google
export async function generateMetadata(
  { params }: { params: { id: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const product = await getProduct(params.id)

  if (!product) {
    return { title: "Producto no encontrado | Revolución Motos" }
  }

  // Si hay fotos, usamos la primera, si no, una por defecto
  const previousImages = (await parent).openGraph?.images || []
  const productImage = product.imageUrl ? [product.imageUrl] : previousImages

  return {
    title: `${product.title} | Revolución Motos`,
    description: `Comprá ${product.title} a ${formatPrice(Number(product.price))}. ${product.description?.slice(0, 120)}...`,
    alternates: {
      canonical: `https://www.revolucionmotos.com.ar/products/${product.id}`,
    },
    openGraph: {
      images: productImage,
      title: `${product.title} | Revolución Motos`,
      description: `Comprá este repuesto al mejor precio: ${formatPrice(Number(product.price))}`,
      url: `https://www.revolucionmotos.com.ar/products/${product.id}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.title} | Revolución Motos`,
      description: `Comprá ${product.title} a ${formatPrice(Number(product.price))}`,
      images: productImage,
    },
  }
}

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

    const productJsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.title,
        "image": images.length > 0 ? images : undefined,
        "description": product.description || product.title,
        "sku": product.id,
        "category": product.category || undefined,
        "offers": {
            "@type": "Offer",
            "url": `https://www.revolucionmotos.com.ar/products/${product.id}`,
            "priceCurrency": "ARS",
            "price": finalPrice.toFixed(2),
            "availability": (product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {
                "@type": "Organization",
                "name": "Revolución Motos",
            },
        },
    }

    return (
        <div className="container mx-auto px-4 py-8 md:py-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
            />
            <PixelProductView product={product} />

            {/* Navegación */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                    <Link href="/" className="hover:text-gray-200 transition-colors flex items-center gap-1">
                        <Home className="h-4 w-4" />
                        <span>Inicio</span>
                    </Link>
                    <span>/</span>
                    <Link href="/shop" className="hover:text-gray-200 transition-colors">Tienda</Link>
                    <span>/</span>
                    <span className="text-gray-300 font-medium truncate max-w-[160px] md:max-w-[280px]">{product.title}</span>
                </div>
                <Link href="/shop">
                    <Button variant="ghost" size="sm" className="flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/10 h-9">
                        <ArrowLeft className="h-4 w-4" />
                        Volver
                    </Button>
                </Link>
            </div>

            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">

                {/* IMÁGENES */}
                <div className="relative rounded-xl bg-white border border-white/10 shadow-lg overflow-hidden">
                    {hasDiscount && (
                        <div className="absolute top-0 left-0 z-10 bg-red-600 text-white text-sm font-black px-4 py-1.5"
                             style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' }}>
                            -{product.discount}% OFF
                        </div>
                    )}

                    {images.length > 1 ? (
                        <Carousel className="w-full">
                            <CarouselContent>
                                {images.map((img, index) => (
                                    <CarouselItem key={index}>
                                        <div className="aspect-square relative">
                                            <img src={img} alt={`${product.title} - foto ${index + 1}`} className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" />
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-2 bg-black/40 hover:bg-black/70 border-white/20 text-white" />
                            <CarouselNext className="right-2 bg-black/40 hover:bg-black/70 border-white/20 text-white" />
                        </Carousel>
                    ) : (
                        <div className="aspect-square relative">
                            <img src={images[0]} alt={product.title} className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" />
                        </div>
                    )}
                </div>

                {/* DETALLES */}
                <div className="space-y-5">
                    <div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            <span className="text-[10px] uppercase font-black text-red-400 bg-red-950 border border-red-900/60 px-2.5 py-1 rounded-full tracking-widest">
                                {product.category}
                            </span>
                            {product.freeShipping && (
                                <span className="text-[10px] uppercase font-black text-green-400 bg-green-950 border border-green-900/60 px-2.5 py-1 rounded-full tracking-widest">
                                    ✓ Envío Gratis
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black text-white leading-tight">{product.title}</h1>
                    </div>

                    <div className="flex items-end gap-3">
                        {hasDiscount && (
                            <span className="text-lg text-gray-500 line-through">
                                {formatPrice(Number(product.price))}
                            </span>
                        )}
                        <span className={`text-4xl md:text-5xl font-black ${hasDiscount ? 'text-red-400' : 'text-white'}`}>
                            {formatPrice(finalPrice)}
                        </span>
                    </div>

                    {product.description && (
                        <div className="text-gray-400 leading-relaxed whitespace-pre-wrap text-sm md:text-base border-t border-white/10 pt-4">
                            {product.description}
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/10 space-y-3">
                        <AddToCart product={product} />
                        <p className="text-xs text-gray-600">Stock disponible: {product.stock} unidades</p>
                    </div>

                    {videoEmbedUrl && (
                        <div className="pt-5 border-t border-white/10">
                            <h3 className="text-base font-black uppercase text-white mb-3 flex items-center gap-2">
                                <div className="w-1 h-5 bg-red-600 rounded-full" />
                                Video del Producto
                            </h3>
                            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black border border-white/10">
                                <iframe src={videoEmbedUrl} className="w-full h-full" allowFullScreen title="Video del producto" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
