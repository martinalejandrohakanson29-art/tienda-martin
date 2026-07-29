"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, ImageOff, Check, ExternalLink, Search, X, Link2, Link2Off, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import {
    actualizarImagenMayorista,
    actualizarArticuloMayorista,
    buscarArticulosMostradorParaVincular,
    vincularArticuloMostrador,
} from "@/app/actions/articulos-mayoristas"

function formatMiles(n: number) {
    return n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
}

function parseMiles(s: string) {
    return Number(s.replace(/\D/g, "")) || 0
}

// Misma fórmula que /admin/ventas-mostrador: marcación real sobre el costo.
function calcularMarcacion(costo?: number, precio?: number): number | null {
    if (!costo || costo <= 0 || precio == null) return null
    return ((precio - costo) / costo) * 100
}

// Mismos umbrales de color que /admin/ventas-mostrador.
function claseColorMarcacion(marc: number): string {
    if (marc >= 60) return "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200"
    if (marc >= 50) return "bg-green-50 text-green-600 border-green-200"
    if (marc >= 40) return "bg-orange-50 text-orange-600 border-orange-200"
    return "bg-red-50 text-red-600 border-red-200"
}

interface ArticuloMostradorVinculado {
    id: string
    nombre: string
    costo: number
    esPack: boolean | null
}

interface Articulo {
    id: string
    categoria: string
    nombre: string
    marca: string | null
    codigo: string
    precio: number
    imageUrl: string
    orden: number
    activo: boolean
    articuloMostrador: ArticuloMostradorVinculado | null
}

interface ResultadoBusqueda {
    id: string
    nombre: string
    costo: number
    esPack: boolean | null
    codigoProveedor: string | null
}

export default function MayoristasAdminClient({
    articulosIniciales,
    galeria,
}: {
    articulosIniciales: Articulo[]
    galeria: string[]
}) {
    const [articulos, setArticulos] = useState(articulosIniciales)
    const [pickerFor, setPickerFor] = useState<string | null>(null)
    const [vincularFor, setVincularFor] = useState<string | null>(null)
    const [vincularQuery, setVincularQuery] = useState("")
    const [vincularResultados, setVincularResultados] = useState<ResultadoBusqueda[]>([])
    const [buscando, setBuscando] = useState(false)
    const [search, setSearch] = useState("")
    const [, startTransition] = useTransition()

    const faltantes = useMemo(() => articulos.filter(a => !a.imageUrl).length, [articulos])
    const sinCosto = useMemo(() => articulos.filter(a => !a.articuloMostrador).length, [articulos])

    useEffect(() => {
        if (!vincularFor) return
        const query = vincularQuery.trim()
        if (!query) {
            setVincularResultados([])
            setBuscando(false)
            return
        }
        setBuscando(true)
        const timeout = setTimeout(() => {
            buscarArticulosMostradorParaVincular(query)
                .then(setVincularResultados)
                .finally(() => setBuscando(false))
        }, 300)
        return () => clearTimeout(timeout)
    }, [vincularQuery, vincularFor])

    const articulosFiltrados = useMemo(() => {
        if (!search.trim()) return articulos
        const s = search.toLowerCase()
        return articulos.filter(a =>
            a.nombre.toLowerCase().includes(s) ||
            a.codigo.toLowerCase().includes(s) ||
            (a.marca || "").toLowerCase().includes(s) ||
            a.categoria.toLowerCase().includes(s)
        )
    }, [articulos, search])

    const usoPorImagen = useMemo(() => {
        const map = new Map<string, string[]>()
        for (const a of articulos) {
            if (!a.imageUrl) continue
            const arr = map.get(a.imageUrl) || []
            arr.push(a.nombre)
            map.set(a.imageUrl, arr)
        }
        return map
    }, [articulos])

    const grupos = useMemo(() => {
        const map = new Map<string, Articulo[]>()
        for (const a of articulosFiltrados) {
            const arr = map.get(a.categoria) || []
            arr.push(a)
            map.set(a.categoria, arr)
        }
        return Array.from(map.entries())
    }, [articulosFiltrados])

    function setLocal(id: string, patch: Partial<Articulo>) {
        setArticulos(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
    }

    function asignarFoto(id: string, url: string) {
        setLocal(id, { imageUrl: url })
        setPickerFor(null)
        startTransition(() => {
            actualizarImagenMayorista(id, url)
        })
    }

    function guardarCampo(id: string, patch: Partial<Articulo>) {
        startTransition(() => {
            actualizarArticuloMayorista(id, patch as any)
        })
    }

    function abrirVincular(id: string) {
        setVincularFor(id)
        setVincularQuery("")
        setVincularResultados([])
    }

    function vincular(id: string, articuloMostrador: ArticuloMostradorVinculado | null) {
        setLocal(id, { articuloMostrador })
        setVincularFor(null)
        startTransition(() => {
            vincularArticuloMostrador(id, articuloMostrador?.id ?? null)
        })
    }

    const articuloActivo = articulos.find(a => a.id === pickerFor)
    const articuloVinculando = articulos.find(a => a.id === vincularFor)

    return (
        <div className="h-full w-full overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto flex flex-col gap-6 pb-16">
                <header className="flex items-center gap-4">
                    <Link
                        href="/admin/listas"
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Volver a Listas"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-3xl font-black text-slate-900 mb-1">Lista Mayorista</h1>
                        <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">
                            {articulos.length} artículos · {faltantes > 0 ? `${faltantes} sin foto` : "todos con foto"} · {sinCosto > 0 ? `${sinCosto} sin costo vinculado` : "todos con costo"}
                        </p>
                    </div>
                    <Link
                        href="/mayoristas"
                        target="_blank"
                        className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 px-4 py-2 rounded-xl border-2 border-indigo-200 hover:border-indigo-400 transition-colors"
                    >
                        Ver catálogo público <ExternalLink className="h-4 w-4" />
                    </Link>
                </header>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar por nombre, código, marca o categoría..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-9 h-11 bg-white border-slate-200 focus-visible:ring-indigo-400"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {grupos.length === 0 && (
                    <p className="text-center py-16 text-slate-400 font-bold">No se encontraron artículos.</p>
                )}

                {grupos.map(([categoria, items]) => (
                    <div key={categoria} className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 bg-slate-900 text-white font-black text-sm uppercase tracking-wider">
                            {categoria}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {items.map(articulo => (
                                <div
                                    key={articulo.id}
                                    className={`flex items-center gap-4 p-3 ${!articulo.activo ? "opacity-50" : ""}`}
                                >
                                    <button
                                        onClick={() => setPickerFor(articulo.id)}
                                        className="relative shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 overflow-hidden flex items-center justify-center transition-colors"
                                        title="Asignar foto"
                                    >
                                        {articulo.imageUrl ? (
                                            <img src={articulo.imageUrl} alt="" className="w-full h-full object-contain" />
                                        ) : (
                                            <ImageOff className="h-5 w-5 text-red-400" />
                                        )}
                                    </button>

                                    <div className="flex-1 min-w-0 space-y-1">
                                        <Input
                                            defaultValue={articulo.nombre}
                                            onBlur={(e) => {
                                                if (e.target.value !== articulo.nombre) {
                                                    setLocal(articulo.id, { nombre: e.target.value })
                                                    guardarCampo(articulo.id, { nombre: e.target.value })
                                                }
                                            }}
                                            className="h-8 font-semibold text-sm border-transparent hover:border-slate-200 focus:border-indigo-400 px-2"
                                        />
                                        {articulo.marca && (
                                            <p className="text-xs text-slate-400 px-2">{articulo.marca}</p>
                                        )}
                                    </div>

                                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                                        {articulo.codigo}
                                    </Badge>

                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-slate-400 text-sm">$</span>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            defaultValue={formatMiles(articulo.precio)}
                                            onChange={(e) => {
                                                const val = parseMiles(e.target.value)
                                                e.target.value = val ? formatMiles(val) : ""
                                            }}
                                            onBlur={(e) => {
                                                const val = parseMiles(e.target.value)
                                                e.target.value = formatMiles(val)
                                                if (val !== articulo.precio) {
                                                    setLocal(articulo.id, { precio: val })
                                                    guardarCampo(articulo.id, { precio: val })
                                                }
                                            }}
                                            className="h-8 w-28 text-sm"
                                        />
                                    </div>

                                    <div className="flex flex-col items-start gap-1 shrink-0 w-44">
                                        {articulo.articuloMostrador ? (
                                            (() => {
                                                const costo = articulo.articuloMostrador!.costo
                                                const marc = calcularMarcacion(costo, articulo.precio)
                                                return (
                                                    <>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs text-slate-500">
                                                                Costo: <span className="font-semibold text-slate-700">$ {formatMiles(costo)}</span>
                                                            </span>
                                                            <button
                                                                onClick={() => abrirVincular(articulo.id)}
                                                                title="Cambiar vínculo"
                                                                className="text-slate-300 hover:text-indigo-500"
                                                            >
                                                                <Link2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                        {marc != null ? (
                                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${claseColorMarcacion(marc)}`}>
                                                                Marcación {marc.toFixed(0)}%
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-slate-400">Sin costo &gt; 0</span>
                                                        )}
                                                        <button
                                                            onClick={() => vincular(articulo.id, null)}
                                                            className="text-[10px] text-slate-400 hover:text-red-500 truncate max-w-full"
                                                            title={`Desvincular de "${articulo.articuloMostrador!.nombre}"`}
                                                        >
                                                            {articulo.articuloMostrador!.nombre}
                                                        </button>
                                                    </>
                                                )
                                            })()
                                        ) : (
                                            <button
                                                onClick={() => abrirVincular(articulo.id)}
                                                className="flex items-center gap-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg px-2 py-1.5 transition-colors"
                                            >
                                                <Link2 className="h-3.5 w-3.5" />
                                                Vincular costo
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0" title="Visible en el catálogo público">
                                        <Checkbox
                                            checked={articulo.activo}
                                            onCheckedChange={(checked) => {
                                                const val = checked === true
                                                setLocal(articulo.id, { activo: val })
                                                guardarCampo(articulo.id, { activo: val })
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <Dialog open={!!pickerFor} onOpenChange={(open) => !open && setPickerFor(null)}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Elegir foto{articuloActivo ? ` — ${articuloActivo.nombre}` : ""}</DialogTitle>
                        <DialogDescription>
                            Fotos extraídas de la lista mayorista en PDF. Una foto puede repetirse en más de un artículo si el proveedor usó la misma imagen.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                        {articuloActivo?.imageUrl && (
                            <button
                                onClick={() => asignarFoto(articuloActivo.id, "")}
                                className="aspect-square rounded-lg border-2 border-red-200 hover:border-red-400 bg-red-50 flex flex-col items-center justify-center text-red-500 text-[11px] font-bold gap-1 transition-colors"
                            >
                                <ImageOff className="h-5 w-5" />
                                Quitar foto
                            </button>
                        )}
                        {galeria.map(url => {
                            const usos = usoPorImagen.get(url) || []
                            const esActual = articuloActivo?.imageUrl === url
                            return (
                                <button
                                    key={url}
                                    onClick={() => pickerFor && asignarFoto(pickerFor, url)}
                                    className={`relative aspect-square rounded-lg border-2 bg-white overflow-hidden transition-colors ${
                                        esActual ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"
                                    }`}
                                    title={usos.length ? `Usada por: ${usos.join(", ")}` : "Sin usar"}
                                >
                                    <img src={url} alt="" className="w-full h-full object-contain p-1" />
                                    {esActual && (
                                        <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                    {usos.length > 0 && !esActual && (
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center py-0.5 truncate px-1">
                                            {usos.length} en uso
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!vincularFor} onOpenChange={(open) => !open && setVincularFor(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Vincular costo{articuloVinculando ? ` — ${articuloVinculando.nombre}` : ""}</DialogTitle>
                        <DialogDescription>
                            Buscá el artículo en Artículos Mostrador (o Pack) del que sale el costo real. La marcación se calcula igual que en Registrar Venta.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            autoFocus
                            placeholder="Nombre o código de proveedor..."
                            value={vincularQuery}
                            onChange={(e) => setVincularQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {articuloVinculando?.articuloMostrador && (
                        <button
                            onClick={() => vincular(articuloVinculando.id, null)}
                            className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-700 border border-dashed border-red-200 hover:border-red-400 rounded-lg px-3 py-2 transition-colors"
                        >
                            <Link2Off className="h-4 w-4" />
                            Quitar vínculo actual ({articuloVinculando.articuloMostrador.nombre})
                        </button>
                    )}

                    <div className="flex flex-col gap-1">
                        {buscando && (
                            <div className="flex items-center justify-center py-6 text-slate-400">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        )}
                        {!buscando && vincularQuery.trim() && vincularResultados.length === 0 && (
                            <p className="text-center py-6 text-sm text-slate-400">Sin resultados.</p>
                        )}
                        {!buscando && vincularResultados.map(r => (
                            <button
                                key={r.id}
                                onClick={() => vincularFor && vincular(vincularFor, { id: r.id, nombre: r.nombre, costo: r.costo, esPack: r.esPack })}
                                className="flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate">
                                        {r.esPack && <Badge className="bg-purple-100 text-purple-700 border-purple-200 shrink-0">Pack</Badge>}
                                        <span className="truncate">{r.nombre}</span>
                                    </div>
                                    {r.codigoProveedor && (
                                        <p className="text-[11px] text-slate-400 font-mono">{r.codigoProveedor}</p>
                                    )}
                                </div>
                                <span className="text-sm font-bold text-slate-600 shrink-0">$ {formatMiles(r.costo)}</span>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
