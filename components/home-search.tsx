"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import { Product } from "@prisma/client"

// 👇 Recibimos la lista completa de productos
export default function HomeSearch({ products = [] }: { products?: Product[] }) {
    const router = useRouter()
    const [query, setQuery] = useState("")
    const [suggestions, setSuggestions] = useState<Product[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)

    // Lógica de filtrado inteligente (la misma que en la tienda)
    useEffect(() => {
        if (query.trim().length === 0) {
            setSuggestions([])
            setIsOpen(false)
            return
        }

        const terms = query.toLowerCase().split(" ").filter(t => t)
        
        const filtered = products.filter(product => {
            const title = product.title.toLowerCase()
            return terms.every(term => title.includes(term))
        })

        // Mostramos máximo 5 sugerencias para no tapar todo
        setSuggestions(filtered.slice(0, 5))
        setIsOpen(true)
    }, [query, products])

    // Cierra las sugerencias si haces clic fuera
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            setIsOpen(false)
            router.push(`/shop?search=${encodeURIComponent(query)}`)
        }
    }

    const handleSelectProduct = (productId: string) => {
        router.push(`/products/${productId}`)
    }

    return (
        <div ref={wrapperRef} className="max-w-xl mx-auto w-full relative">
            <form onSubmit={handleSearch} className="flex gap-2 w-full shadow-lg p-2 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200">
                <Input 
                    placeholder="¿Qué estás buscando hoy?" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.trim().length > 0 && setIsOpen(true)}
                    className="border-0 focus-visible:ring-0 bg-transparent text-lg h-12"
                />
                <Button type="submit" size="icon" className="h-12 w-12 shrink-0">
                    <Search className="h-5 w-5" />
                </Button>
            </form>

            {/* 👇 LISTA DE SUGERENCIAS FLOTANTE */}
            {isOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50">
                    <ul>
                        {suggestions.map((product) => (
                            <li 
                                key={product.id}
                                onClick={() => handleSelectProduct(product.id)}
                                className="flex items-center gap-4 p-3 hover:bg-gray-50 cursor-pointer transition-colors border-b last:border-0"
                            >
                                <img 
                                    src={product.imageUrl} 
                                    alt={product.title} 
                                    className="w-12 h-12 rounded-md object-cover bg-gray-100"
                                    referrerPolicy="no-referrer"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{product.title}</p>
                                    <p className="text-sm text-green-600 font-semibold">
                                        ${Number(product.price).toFixed(2)}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {/* Botón para ver todos los resultados si hay muchos */}
                    <div 
                        onClick={handleSearch}
                        className="p-3 text-center text-sm text-blue-600 font-medium hover:bg-gray-50 cursor-pointer bg-gray-50/50"
                    >
                        Ver todos los resultados para "{query}"
                    </div>
                </div>
            )}
        </div>
    )
}
