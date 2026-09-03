"use client"

import { useState, useRef } from "react"
import { ChevronDown, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useOnClickOutside } from "@/hooks/use-on-click-outside"
import { slugify } from "@/lib/seo-utils"

export default function CategoryMenu({ categories }: { categories: string[] }) {
    const [open, setOpen] = useState(false)
    const navRef = useRef<HTMLDivElement>(null)

    useOnClickOutside(navRef, () => {
        setOpen(false)
    })

    return (
        <div ref={navRef} className="relative z-50">
            <Button
                variant="ghost"
                className="font-bold md:font-extrabold text-xs md:text-sm uppercase tracking-wide flex items-center gap-1 md:gap-2 text-gray-300 hover:text-white hover:bg-transparent transition-colors px-1 md:px-4 h-auto py-1 md:py-2"
                onClick={() => setOpen(!open)}
            >
                <Layers className="h-4 w-4 md:h-5 md:w-5" />
                Categorías <ChevronDown className={`h-3 w-3 md:h-4 md:w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>

            {open && (
                <div className="absolute top-full left-0 mt-2 w-60 bg-[#141414] text-white rounded-xl shadow-2xl border border-white/10 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="py-2">
                        {categories.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-400 italic">No hay categorías aún</p>
                        ) : (
                            categories.map((cat) => (
                                <Link
                                    key={cat}
                                    href={`/categoria/${slugify(cat)}`}
                                    onClick={() => setOpen(false)}
                                    className="block w-full text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-300 hover:bg-red-950/60 hover:text-red-400 transition-colors border-b last:border-0 border-white/5"
                                >
                                    {cat}
                                </Link>
                            ))
                        )}
                        <Link
                            href="/shop"
                            onClick={() => setOpen(false)}
                            className="block w-full text-left px-5 py-2.5 text-xs font-black uppercase tracking-wider text-red-500 bg-red-950/30 hover:bg-red-900/40 transition-colors mt-1"
                        >
                            Ver Todo el Catálogo →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    )
}
