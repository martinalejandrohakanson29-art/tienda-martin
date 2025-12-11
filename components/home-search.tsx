"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

export default function HomeSearch() {
    const router = useRouter()
    const [query, setQuery] = useState("")

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        // Si hay texto, enviamos al usuario a la tienda con el filtro aplicado
        if (query.trim()) {
            router.push(`/shop?search=${encodeURIComponent(query)}`)
        }
    }

    return (
        <form onSubmit={handleSearch} className="max-w-xl mx-auto flex gap-2 w-full shadow-lg p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-gray-200">
            <Input 
                placeholder="¿Qué estás buscando hoy?" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-0 focus-visible:ring-0 bg-transparent text-lg h-12"
            />
            <Button type="submit" size="icon" className="h-12 w-12 shrink-0">
                <Search className="h-5 w-5" />
            </Button>
        </form>
    )
}
