"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X, Tag } from "lucide-react"
import { formatPrice } from "@/lib/utils"

interface ArticuloMayorista {
    id: string
    categoria: string
    nombre: string
    marca: string | null
    codigo: string
    precio: number
    imageUrl: string
}

export default function MayoristasClient({ articulos }: { articulos: ArticuloMayorista[] }) {
    const [search, setSearch] = useState("")
    const [categoria, setCategoria] = useState<string | null>(null)

    const categorias = useMemo(() => {
        const set = new Set(articulos.map(a => a.categoria))
        return Array.from(set)
    }, [articulos])

    const filtrados = useMemo(() => {
        let result = articulos
        if (categoria) result = result.filter(a => a.categoria === categoria)
        if (search) {
            const s = search.toLowerCase()
            result = result.filter(a =>
                a.nombre.toLowerCase().includes(s) ||
                a.codigo.toLowerCase().includes(s) ||
                (a.marca || "").toLowerCase().includes(s)
            )
        }
        return result
    }, [articulos, search, categoria])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-[#1A1A1A] border border-white/10 p-4 rounded-lg">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por nombre o código..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-[#111] border-white/15 text-white placeholder:text-gray-600 focus-visible:ring-red-600/50 h-11"
                    />
                </div>
                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                    {filtrados.length} artículos
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setCategoria(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        categoria === null
                            ? "bg-red-600 border-red-600 text-white"
                            : "bg-[#1A1A1A] border-white/15 text-gray-400 hover:text-white hover:border-white/30"
                    }`}
                >
                    Todas
                </button>
                {categorias.map(c => (
                    <button
                        key={c}
                        onClick={() => setCategoria(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                            categoria === c
                                ? "bg-red-600 border-red-600 text-white"
                                : "bg-[#1A1A1A] border-white/15 text-gray-400 hover:text-white hover:border-white/30"
                        }`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {filtrados.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-xl text-gray-500">No se encontraron artículos.</p>
                    {(search || categoria) && (
                        <Button
                            variant="link"
                            className="text-red-400 hover:text-red-300 mt-2"
                            onClick={() => { setSearch(""); setCategoria(null) }}
                        >
                            Ver todos los artículos
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filtrados.map((articulo) => (
                        <div
                            key={articulo.id}
                            className="group relative overflow-hidden border-0 ring-1 ring-white/10 hover:ring-red-600/60 bg-[#111] text-white transition-all duration-300 h-full flex flex-col rounded-lg shadow-lg"
                        >
                            <div className="h-[3px] w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 flex-shrink-0" />

                            <div className="aspect-square relative overflow-hidden bg-white flex-shrink-0">
                                {articulo.imageUrl ? (
                                    <img
                                        src={articulo.imageUrl}
                                        alt={articulo.nombre}
                                        className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-gray-300 text-xs font-bold uppercase">
                                        Sin foto
                                    </div>
                                )}
                            </div>

                            <div className="p-3 flex-1 flex flex-col bg-[#111]">
                                <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-0.5 truncate">
                                    {articulo.categoria}
                                </p>
                                <h3 className="font-semibold text-gray-100 text-sm leading-tight line-clamp-2 h-9">
                                    {articulo.nombre}
                                </h3>
                                {articulo.marca && (
                                    <p className="text-[11px] text-gray-500 mt-0.5">{articulo.marca}</p>
                                )}

                                <div className="mt-auto pt-2 flex items-end justify-between border-t border-white/10">
                                    <span className="text-lg font-extrabold leading-none text-white">
                                        {formatPrice(articulo.precio)}
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                                        <Tag size={10} />
                                        {articulo.codigo}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
