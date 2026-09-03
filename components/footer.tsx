import { getConfig } from "@/app/actions/config"
import { getUniqueCategories } from "@/app/actions/products"
import { slugify } from "@/lib/seo-utils"
import { MapPin, Phone, ExternalLink } from "lucide-react"
import Link from "next/link"

// Icono SVG optimizado de WhatsApp
function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.669-.699c.969.54 1.771.83 2.787.83 3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.816-5.764-5.816zm3.393 8.245c-.144.405-.837.774-1.17.824-.312.045-.694.079-2.096-.499-1.786-.738-2.92-2.569-3.009-2.688-.088-.12-.718-.956-.718-1.822 0-.866.452-1.294.614-1.468.162-.174.354-.218.472-.218.118 0 .237.001.34.006.109.005.253-.041.396.3.144.341.493 1.203.535 1.29.043.087.072.189.014.305-.058.117-.087.19-.174.291-.088.102-.185.228-.264.306-.089.088-.182.183-.078.361.104.179.462.763.992 1.236.682.609 1.258.797 1.437.886.179.088.283.074.389-.044.106-.118.452-.526.574-.707.121-.18.243-.151.408-.09.165.061 1.05.495 1.23.585.18.09.3.135.344.21.044.075.044.437-.1 1.047zM12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.662 1.435 5.176L2 22l4.958-1.397A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.2c-1.637 0-3.153-.513-4.408-1.391l-.316-.225-2.966.837.842-2.888-.242-.338C3.937 14.869 3.4 13.487 3.4 12c0-4.742 3.858-8.6 8.6-8.6 4.741 0 8.6 3.858 8.6 8.6 0 4.742-3.859 8.6-8.6 8.6z" />
    </svg>
  )
}

// Icono SVG optimizado de Instagram
function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

// Icono SVG optimizado de TikTok
function TikTokIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .57.04.84.11V9.4a6.33 6.33 0 0 0-.84-.05A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.82-.06 4.83 4.83 0 0 1-.36-4.5z" />
    </svg>
  )
}

export default async function Footer() {
  const [config, categories] = await Promise.all([
    getConfig(),
    getUniqueCategories(),
  ])

  const companyName = config?.companyName || "Revolución Motos"
  const welcomeText =
    config?.welcomeText ||
    "Especialistas en repuestos, accesorios y kits de potenciación para motos. Venta minorista con envíos a todo el país y atención mayorista a talleres."

  const mapsUrl = config?.locationUrl || "https://maps.app.goo.gl/Xk1TKtYBPEAao9LQ6"
  const topCategories = categories.slice(0, 7)

  return (
    <footer className="bg-[#080808] border-t border-white/10 text-white mt-16 pt-14 pb-8 overflow-hidden relative">
      {/* Luz ambiental sutil de fondo */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 opacity-10 pointer-events-none blur-3xl"
        style={{ background: "radial-gradient(ellipse at top, #dc2626, transparent)" }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          
          {/* Columna 1: Identidad & Confianza */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-6 bg-red-600 rounded-full inline-block" />
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                {companyName}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
              {welcomeText}
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#121212] border border-white/10 text-[11px] font-mono font-bold text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Despachos diarios a toda Argentina</span>
            </div>
          </div>

          {/* Columna 2: Categorías de Repuestos (SEO Anchor Links) */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-red-500 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Categorías Principales
            </h4>
            <ul className="space-y-2.5">
              {topCategories.map((cat) => (
                <li key={cat}>
                  <Link
                    href={`/categoria/${slugify(cat)}`}
                    className="text-xs sm:text-sm text-zinc-400 hover:text-white hover:translate-x-1 transition-all inline-block font-medium"
                  >
                    {cat}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/shop"
                  className="text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 inline-flex items-center gap-1 mt-1 transition-colors"
                >
                  <span>Ver todas las categorías</span>
                  <ExternalLink size={12} />
                </Link>
              </li>
            </ul>
          </div>

          {/* Columna 3: Navegación & Modalidad Comercial */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-red-500 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Navegación & Servicios
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/"
                  className="text-xs sm:text-sm text-zinc-400 hover:text-white transition-colors font-medium inline-block"
                >
                  Inicio
                </Link>
              </li>
              <li>
                <Link
                  href="/shop"
                  className="text-xs sm:text-sm text-zinc-400 hover:text-white transition-colors font-medium inline-block"
                >
                  Catálogo Completo
                </Link>
              </li>
              <li>
                <Link
                  href="/mayoristas"
                  className="text-xs sm:text-sm text-zinc-400 hover:text-white transition-colors font-medium inline-flex items-center gap-1.5"
                >
                  <span>Venta Mayorista a Talleres</span>
                  <span className="text-[9px] font-black uppercase bg-red-950/80 text-red-400 px-1.5 py-0.5 rounded border border-red-900/40">
                    B2B
                  </span>
                </Link>
              </li>
              {config?.paymentMethods && (
                <li className="pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                    Medios de Pago
                  </span>
                  <p className="text-xs text-zinc-400 leading-snug">
                    {config.paymentMethods}
                  </p>
                </li>
              )}
            </ul>
          </div>

          {/* Columna 4: Local Comercial, GPS & Redes */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-red-500 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Contacto & Ubicación
            </h4>

            {/* Enlace verificado a Google Maps */}
            <div className="p-3.5 rounded-lg bg-[#121212] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-200">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>Local en Córdoba Capital</span>
              </div>
              <p className="text-xs text-zinc-400 leading-snug">
                Retiro inmediato en mostrador y envíos a todo el país.
              </p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors pt-1"
              >
                <span>Ver ubicación en Google Maps</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Redes Sociales con Iconos Locales SVG */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {config?.whatsappNumber && (
                <a
                  href={`https://wa.me/${config.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contactar por WhatsApp"
                  className="p-2.5 rounded-lg bg-[#181818] hover:bg-[#25D366] text-zinc-300 hover:text-black border border-white/10 transition-all"
                  title="WhatsApp"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                </a>
              )}

              {config?.instagramUrl && (
                <a
                  href={config.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Seguir en Instagram"
                  className="p-2.5 rounded-lg bg-[#181818] hover:bg-gradient-to-tr hover:from-yellow-500 hover:via-pink-500 hover:to-purple-600 text-zinc-300 hover:text-white border border-white/10 transition-all"
                  title="Instagram"
                >
                  <InstagramIcon className="w-4 h-4" />
                </a>
              )}

              {config?.tiktokUrl && (
                <a
                  href={config.tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Seguir en TikTok"
                  className="p-2.5 rounded-lg bg-[#181818] hover:bg-white text-zinc-300 hover:text-black border border-white/10 transition-all"
                  title="TikTok"
                >
                  <TikTokIcon className="w-4 h-4" />
                </a>
              )}

              {config?.whatsappNumber && (
                <a
                  href={`https://wa.me/${config.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#181818] hover:bg-red-600/20 text-xs font-mono font-bold text-zinc-300 hover:text-red-400 border border-white/10 hover:border-red-600/40 transition-colors"
                >
                  <Phone size={12} className="text-red-500" />
                  <span>+{config.whatsappNumber}</span>
                </a>
              )}
            </div>
          </div>

        </div>

        {/* Barra Inferior con Declaración Semántica de Rubro */}
        <div className="border-t border-white/10 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>
            &copy; {new Date().getFullYear()} {companyName}. Tienda de repuestos, kits de potenciación y accesorios para motos. Córdoba, Argentina.
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/shop" className="hover:text-zinc-300 transition-colors">
              Catálogo
            </Link>
            <span>•</span>
            <Link href="/mayoristas" className="hover:text-zinc-300 transition-colors">
              Mayoristas
            </Link>
            <span>•</span>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300 transition-colors"
            >
              Google Maps
            </a>
          </div>
        </div>

      </div>
    </footer>
  )
}
