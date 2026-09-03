import Link from "next/link"
import { Gauge, CheckCircle, ArrowRight } from "lucide-react"

interface SeoSectionProps {
  config?: {
    showSeoSection?: boolean
    seoTitle?: string | null
    seoSubtitle?: string | null
    seoText1?: string | null
    seoText2?: string | null
    seoTags?: string | null
  } | null
}

export default function LandingSeoSection({ config }: SeoSectionProps) {
  if (config?.showSeoSection === false) {
    return null
  }

  const title =
    config?.seoTitle ||
    "Especialistas en Potenciación y Repuestos para Motos"

  const subtitle =
    config?.seoSubtitle ||
    "Componentes de alto rendimiento, kits de cilindro, levas y repuestos de competición con envíos a todo el país."

  const text1 =
    config?.seoText1 ||
    "En Revolución Motos nos dedicamos a la preparación de motores y al suministro de repuestos de alto rendimiento. Armamos y testeamos kits de cilindro potenciado, pistones forjados, levas con cruce para calle o circuito, tapas trabajadas, válvulas especiales y carburadores preparados para sacarle el máximo rendimiento a tu moto."

  const text2 =
    config?.seoText2 ||
    "Disponemos de stock real y compatibilidad asegurada para los modelos más armados de Argentina: Honda Wave 110, CG Titán 150, XR 150/250, Tornado 250, Twister, Yamaha YBR 125, FZ 16, Crypton, Motomel, Gilera Smash, Corven Energy y Bajaj Rouser. Despachamos todos los días desde Córdoba a cualquier punto del país."

  const rawTags =
    config?.seoTags ||
    "Honda, Yamaha, Motomel, Corven, Gilera, Bajaj, Kits de Potenciación, Cilindros, Levas, Carburadores, Escapes"

  const tags = rawTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  return (
    <section className="container mx-auto px-4 mt-16" aria-label="Información técnica">
      <div className="border border-white/10 bg-[#0d0d0d] rounded-lg p-6 md:p-8 relative overflow-hidden">
        {/* Marca de agua sutil de fondo */}
        <div className="absolute -right-8 -bottom-8 opacity-[0.03] pointer-events-none select-none text-white">
          <Gauge size={280} />
        </div>

        {/* Encabezado con línea roja característica de la tienda */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-1 h-12 bg-red-600 rounded-full flex-shrink-0 mt-1" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-black uppercase text-red-500 tracking-widest bg-red-950/40 px-2 py-0.5 rounded border border-red-900/40">
                Tienda & Potenciación
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 font-medium max-w-3xl">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Bloque técnico de 2 columnas sin tarjetas plásticas */}
        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Potenciación & Alto Rendimiento
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
              {text1}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Compatibilidad de Modelos & Envíos
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
              {text2}
            </p>
          </div>
        </div>

        {/* Selector de marcas y repuestos estilo ficha técnica automotriz */}
        {tags.length > 0 && (
          <div className="mt-8 pt-5 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mr-2">
                Filtros directos:
              </span>
              {tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/shop?search=${encodeURIComponent(tag)}`}
                  className="px-2.5 py-1 rounded bg-[#161616] hover:bg-red-600 hover:text-white border border-white/10 hover:border-red-600 text-zinc-300 text-[11px] font-mono font-bold uppercase tracking-tight transition-all"
                >
                  {tag}
                </Link>
              ))}
            </div>

            <Link
              href="/mayoristas"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-400 shrink-0 transition-colors"
            >
              <span>Venta Mayorista a Talleres</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
