"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function CategoryMenu({ categories }: { categories: string[] }) {
    const [open, setOpen] = useState(false)
    const router = useRouter()

    const handleSelect = (category: string) => {
        setOpen(false)
        // Navegamos a la tienda con el filtro aplicado
        router.push(`/shop?category=${encodeURIComponent(category)}`)
    }

    return (
        <div className="relative z-50">
            <Button 
                variant="ghost" 
                className="font-extrabold text-lg uppercase tracking-wide flex items-center gap-2 hover:bg-transparent hover:text-blue-600 transition-colors px-0 md:px-4"
                onClick={() => setOpen(!open)}
            >
                <Layers className="h-5 w-5" />
                Categorías <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>

            {open && (
                <>
                    {/* Fondo transparente para cerrar al hacer clic afuera */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    
                    {/* El Menú Desplegable */}
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
