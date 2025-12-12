"use client"

import { useState } from "react"
import { ChevronDown, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function CategoryMenu({ categories }: { categories: string[] }) {
    const [open, setOpen] = useState(false)
    const router = useRouter()

    const handleSelect = (category: string) => {
        setOpen(false)
        router.push(`/shop?category=${encodeURIComponent(category)}`)
    }

    return (
        <div className="relative z-50">
            <Button 
                variant="ghost" 
                // 👇 CAMBIO: Tamaños responsive (text-xs en móvil, text-lg en PC)
                className="font-bold md:font-extrabold text-xs md:text-lg uppercase tracking-wide flex items-center gap-1 md:gap-2 hover:bg-transparent hover:text-blue-600 transition-colors px-1 md:px-4 h-auto py-1 md:py-2"
                onClick={() => setOpen(!open)}
            >
                {/* 👇 CAMBIO: Ícono más chico en móvil */}
                <Layers className="h-4 w-4 md:h-5 md:w-5" />
                Categorías <ChevronDown className={`h-3 w-3 md:h-4 md:w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                        <div className="py-2">
                            {categories.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-gray-400 italic">No hay categorías aún</p>
                            ) : (
                                categories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => handleSelect(cat)}
                                        className="w-full text-left px-5 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors border-b last:border-0 border-gray-50"
                                    >
                                        {cat}
                                    </button>
                                ))
                            )}
                            <button
                                onClick={() => router.push('/shop')}
                                className="w-full text-left px-5 py-3 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors mt-1"
                            >
                                Ver Todo
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
