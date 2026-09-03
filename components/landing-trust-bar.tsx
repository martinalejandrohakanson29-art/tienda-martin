import { Truck, CreditCard, Wrench, MapPin } from "lucide-react"

interface TrustBarProps {
  config?: {
    showTrustBar?: boolean
    trust1Title?: string | null
    trust1Desc?: string | null
    trust2Title?: string | null
    trust2Desc?: string | null
    trust3Title?: string | null
    trust3Desc?: string | null
    trust4Title?: string | null
    trust4Desc?: string | null
  } | null
}

export default function LandingTrustBar({ config }: TrustBarProps) {
  if (config?.showTrustBar === false) {
    return null
  }

  const items = [
    {
      num: "01",
      icon: Truck,
      title: config?.trust1Title || "Envíos a Todo el País",
      desc: config?.trust1Desc || "Correo Argentino, Andreani y Encomiendas con seguimiento",
    },
    {
      num: "02",
      icon: CreditCard,
      title: config?.trust2Title || "Medios de Pago",
      desc: config?.trust2Desc || "Tarjetas en cuotas y descuento especial por transferencia",
    },
    {
      num: "03",
      icon: Wrench,
      title: config?.trust3Title || "Asesoramiento Técnico",
      desc: config?.trust3Desc || "Te ayudamos a elegir el repuesto exacto y compatible por WhatsApp",
    },
    {
      num: "04",
      icon: MapPin,
      title: config?.trust4Title || "Local en Córdoba",
      desc: config?.trust4Desc || "Retiro inmediato por mostrador y atención personalizada",
    },
  ]

  return (
    <section className="container mx-auto px-4 mt-8" aria-label="Garantías y servicios">
      <div className="bg-[#0f0f0f] border border-white/10 rounded-lg overflow-hidden shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          {items.map((item, idx) => {
            const Icon = item.icon
            return (
              <div
                key={idx}
                className="relative p-4 sm:p-5 flex items-start gap-3.5 hover:bg-white/[0.02] transition-colors group"
              >
                {/* Indicador de acento rojo activo en hover */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-transparent group-hover:bg-red-600 transition-colors" />

                <div className="flex flex-col items-center shrink-0">
                  <div className="w-9 h-9 rounded bg-[#181818] border border-white/10 flex items-center justify-center text-red-500 group-hover:border-red-600/60 group-hover:text-red-400 group-hover:shadow-[0_0_15px_rgba(220,38,38,0.25)] transition-all">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-mono text-[10px] font-black text-zinc-600 mt-1.5 group-hover:text-red-500/80 transition-colors">
                    {item.num}
                  </span>
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-white group-hover:text-red-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug font-medium">
                    {item.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
