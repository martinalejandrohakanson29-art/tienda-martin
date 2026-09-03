"use client"

import { useState } from "react"
import { Plus, Minus, MessageSquare, ArrowUpRight } from "lucide-react"

export interface FaqItem {
  id?: string
  question: string
  answer: string
  order?: number
  isActive?: boolean
}

interface LandingFaqProps {
  faqs: FaqItem[]
  whatsappNumber?: string
  showFaqSection?: boolean
}

export default function LandingFaq({
  faqs,
  whatsappNumber,
  showFaqSection = true,
}: LandingFaqProps) {
  const [openIndices, setOpenIndices] = useState<number[]>([0]) // Primer pregunta abierta

  if (!showFaqSection) {
    return null
  }

  const activeFaqs = faqs.filter((f) => f.isActive !== false)

  if (activeFaqs.length === 0) {
    return null
  }

  const toggleIndex = (index: number) => {
    setOpenIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }

  // Schema FAQPage para Google Search Console
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": activeFaqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  }

  return (
    <section className="container mx-auto px-4 mt-16" aria-label="Preguntas Frecuentes">
      {/* Script JSON-LD para Google Search Console */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="border border-white/10 bg-[#0d0d0d] rounded-lg p-6 md:p-8">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Columna Izquierda: Título y contacto técnico */}
          <div className="lg:col-span-4 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-1 h-10 bg-red-600 rounded-full flex-shrink-0 mt-1" />
              <div>
                <span className="text-[10px] font-mono font-black uppercase text-red-500 tracking-widest block mb-1">
                  Guía Rápida
                </span>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
                  Preguntas Frecuentes
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                  Información clave sobre despachos, medios de pago y compatibilidad de repuestos antes de realizar tu pedido.
                </p>
              </div>
            </div>

            {/* Caja de ayuda técnica integrada en el diseño oscuro */}
            {whatsappNumber && (
              <div className="p-4 rounded-lg bg-[#141414] border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  <MessageSquare className="w-4 h-4 text-red-500" />
                  <span>¿Duda con tu armado?</span>
                </div>
                <p className="text-xs text-zinc-400 leading-snug">
                  Escribinos con el modelo y año de tu moto para confirmarte compatibilidad y medidas exactas.
                </p>
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between w-full px-3.5 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider transition-colors group"
                >
                  <span>Consultar por WhatsApp</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              </div>
            )}
          </div>

          {/* Columna Derecha: Acordeón técnico */}
          <div className="lg:col-span-8 divide-y divide-white/10">
            {activeFaqs.map((faq, index) => {
              const isOpen = openIndices.includes(index)
              const num = String(index + 1).padStart(2, "0")
              return (
                <div key={faq.id || index} className="py-4 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => toggleIndex(index)}
                    className="w-full text-left flex items-start justify-between gap-4 group focus:outline-none"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs font-bold text-red-500/80 shrink-0">
                        {num}
                      </span>
                      <span className="text-sm sm:text-base font-bold text-white group-hover:text-red-400 transition-colors leading-snug">
                        {faq.question}
                      </span>
                    </div>
                    <div className="w-6 h-6 rounded bg-[#181818] border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-red-600/50 shrink-0 mt-0.5 transition-colors">
                      {isOpen ? (
                        <Minus className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pl-7 pr-4 pt-2.5 text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal animate-in fade-in-50 duration-150">
                      {faq.answer}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </section>
  )
}
