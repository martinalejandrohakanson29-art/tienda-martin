import { getCarouselItems } from "@/app/actions/carousel"
import { getFeaturedProducts, getProducts, getHomeShowcaseProducts, getComboProducts } from "@/app/actions/products"
import { getConfig, getLandingFaqs } from "@/app/actions/config"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import HomeSearch from "@/components/home-search"
import HomeCarousel from "@/components/home-carousel"
import ProductCard from "@/components/ui/product-card"
import LandingTrustBar from "@/components/landing-trust-bar"
import LandingSeoSection from "@/components/landing-seo-section"
import LandingFaq from "@/components/landing-faq"
import { slugify } from "@/lib/seo-utils"
import { Zap } from "lucide-react"

export const dynamic = "force-dynamic"

const DEFAULT_FAQS = [
  {
    question: "¿Hacen envíos a todo el país y cuánto demora la entrega?",
    answer: "Sí, despachamos todos los días a toda la Argentina a través de Correo Argentino, Andreani y encomiendas a terminal de ómnibus. Una vez despachado tu pedido, te enviamos el código de seguimiento para que puedas rastrearlo en tiempo real. Los envíos suelen demorar entre 2 a 5 días hábiles según la localidad.",
    order: 1,
    isActive: true,
  },
  {
    question: "¿Qué medios de pago aceptan?",
    answer: "Aceptamos todas las tarjetas de crédito y débito a través de pasarelas seguras (con opciones de cuotas), dinero en cuenta de Mercado Pago y transferencias bancarias directas con descuentos especiales.",
    order: 2,
    isActive: true,
  },
  {
    question: "¿Cómo sé si un repuesto o kit de potenciación es compatible con mi moto?",
    answer: "En cada ficha de producto detallamos los modelos, años y medidas de compatibilidad. Si te queda alguna duda sobre preparación, cruce de levas, relaciones o medidas de cilindro, escribinos por WhatsApp y nuestro equipo técnico te asesora al instante.",
    order: 3,
    isActive: true,
  },
  {
    question: "¿Hacen ventas mayoristas para talleres mecánicos y casas de repuestos?",
    answer: "¡Sí! Contamos con precios mayoristas directos para talleres mecánicos, preparadores de competición y casas de repuestos de todo el país. Podés consultar nuestro catálogo mayorista en la sección Mayoristas de la web.",
    order: 4,
    isActive: true,
  },
  {
    question: "¿Tienen local comercial para retirar personalmente?",
    answer: "Sí, podés retirar tus compras por nuestro punto de atención en Córdoba Capital o comprar directamente en el mostrador. Consultanos por WhatsApp para coordinar tu retiro.",
    order: 5,
    isActive: true,
  },
]

export default async function Home() {
  const [carouselItems, featuredProducts, showcaseProducts, comboProducts, allProducts, config, dbFaqs] =
    await Promise.all([
      getCarouselItems(),
      getFeaturedProducts(),
      getHomeShowcaseProducts(),
      getComboProducts(),
      getProducts(),
      getConfig(),
      getLandingFaqs(),
    ])

  const carouselItemsJson = JSON.parse(JSON.stringify(carouselItems))
  const configJson = JSON.parse(JSON.stringify(config))
  const featuredProductsJson = JSON.parse(JSON.stringify(featuredProducts))
  const showcaseProductsJson = JSON.parse(JSON.stringify(showcaseProducts))
  const comboProductsJson = JSON.parse(JSON.stringify(comboProducts))
  const allProductsJson = JSON.parse(JSON.stringify(allProducts))

  const faqs = dbFaqs && dbFaqs.length > 0 ? JSON.parse(JSON.stringify(dbFaqs)) : DEFAULT_FAQS

  const hasCarousel = carouselItems.length > 0

  const categories = Array.from(
    new Set((allProductsJson as any[]).map((p) => p.category).filter(Boolean))
  ) as string[]


  return (
    <div className="bg-[#0D0D0D] min-h-screen pb-16">

      {/* CARRUSEL */}
      {hasCarousel && (
        <HomeCarousel items={carouselItemsJson} config={configJson} />
      )}

      {/* FRANJA DE CATEGORÍAS */}
      {categories.length > 0 && (
        <div className="border-b border-white/5 bg-[#0A0A0A]">
          <div className="container mx-auto px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <Link
                href="/shop"
                className="flex-shrink-0 px-4 py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide transition-colors"
              >
                Todo
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/categoria/${slugify(cat)}`}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full bg-[#1A1A1A] hover:bg-red-600/20 hover:text-red-400 border border-white/10 hover:border-red-800/60 text-gray-400 text-xs font-semibold uppercase tracking-wide transition-all whitespace-nowrap"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BUSCADOR Y ENCABEZADO H1 SEO */}
      <div className={`container mx-auto px-4 relative z-10 ${hasCarousel ? "mt-8" : "mt-10 md:mt-14"}`}>
        <div className="text-center mb-6 max-w-3xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
            Repuestos y Accesorios para Motos
          </h1>
          <p className="text-gray-400 text-sm sm:text-base mt-2 font-medium">
            Kits de potenciación, cilindros, levas y repuestos exclusivos con envíos a todo el país
          </p>
        </div>
        <HomeSearch products={allProductsJson} />
      </div>

      {/* BARRA DE BENEFICIOS Y CONFIANZA */}
      <LandingTrustBar config={configJson} />

      {/* COMBOS EN OFERTA */}
      {comboProductsJson.length > 0 && (
        <div className="container mx-auto px-4 mt-14">
          <div className="relative overflow-hidden rounded-lg border border-red-900/40 bg-gradient-to-br from-[#1C0404] via-[#0D0D0D] to-[#0D0D0D] p-6 mb-8">
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.07]">
              <Zap size={110} className="text-red-500" />
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-1 h-14 bg-red-600 rounded-full flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-black text-red-500 tracking-widest block mb-1">
                  ⚡ Tiempo Limitado
                </span>
                <h2 className="text-2xl md:text-3xl font-black uppercase text-white tracking-tight">
                  Kits & Combos en Oferta
                </h2>
                <p className="text-gray-500 text-sm mt-0.5">Bundles exclusivos al mejor precio</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {comboProductsJson.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTOS DESTACADOS */}
      <div className="container mx-auto px-4 mt-14">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1 h-8 bg-red-600 rounded-full flex-shrink-0" />
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
            Productos Destacados
          </h2>
        </div>

        {featuredProductsJson.length === 0 ? (
          <p className="text-center text-gray-600 my-8 italic">Aún no hay productos destacados.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {featuredProductsJson.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* TAMBIÉN TE PUEDE INTERESAR */}
      {showcaseProductsJson.length > 0 && (
        <div className="mt-14 py-12 bg-[#080808] border-y border-white/5">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-1 h-8 bg-red-600 rounded-full flex-shrink-0" />
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                También te puede interesar
              </h3>
              <span className="text-[10px] uppercase font-black text-red-400 bg-red-950 border border-red-900/60 px-2.5 py-0.5 rounded-full ml-1">
                Novedades
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {showcaseProductsJson.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VER TODOS */}
      <div className="container mx-auto px-4 text-center mt-14">
        <Link href="/shop">
          <Button
            size="lg"
            className="px-10 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black uppercase tracking-wider shadow-lg shadow-red-900/30 hover:scale-105 transition-all border-0 text-base"
          >
            Ver Todos los Productos →
          </Button>
        </Link>
        <p className="text-gray-600 text-sm mt-3">
          {allProducts.length} productos disponibles
        </p>
      </div>

      {/* BLOQUE SEMÁNTICO DE AUTORIDAD SEO */}
      <LandingSeoSection config={configJson} />

      {/* PREGUNTAS FRECUENTES (FAQ) CON SCHEMA JSON-LD */}
      <LandingFaq
        faqs={faqs}
        whatsappNumber={config?.whatsappNumber}
        showFaqSection={config?.showFaqSection ?? true}
      />

    </div>
  )
}

