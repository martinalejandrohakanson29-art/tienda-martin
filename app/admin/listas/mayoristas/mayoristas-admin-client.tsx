"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, ImageOff, Check, ExternalLink, Search, X, Link2Off, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Layers, Link2 } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import {
    actualizarImagenMayorista,
    actualizarArticuloMayorista,
    buscarArticulosMostradorParaVincular,
    vincularArticuloMostrador,
    agruparVariante,
    desagruparVariante,
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

// Mismo redondeo que /admin/ventas-mostrador: precio final siempre en múltiplos de 50.
function redondearA50(n: number): number {
    return Math.round(n / 50) * 50
}

function calcularPrecioDesdeMarcacion(costo: number, margen: number): number {
    return redondearA50(costo * (1 + margen / 100))
}

// Umbrales propios de la lista mayorista: <25% rojo, 25-35% verde, >35% magenta.
function claseColorMarcacion(marc: number): string {
    if (marc > 35) return "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200"
    if (marc >= 25) return "bg-green-50 text-green-600 border-green-200"
    return "bg-red-50 text-red-600 border-red-200"
}

interface ArticuloMostradorVinculado {
    id: string
    nombre: string
    costo: number
    esPack: boolean | null
    stock: number
}

interface Articulo {
    id: string
    categoria: string
    nombre: string
    titulo: string | null
    descripcion: string | null
    marca: string | null
    codigo: string
    precio: number
    imageUrl: string
    orden: number
    activo: boolean
    nivelStock: number
    grupoVarianteId: string | null
    variante: string | null
    articuloMostrador: ArticuloMostradorVinculado | null
}

// Campos que se comparten entre variantes de un mismo grupo: el server ya los propaga al guardar,
// esto además los refleja localmente para que la UI no quede desincronizada hasta refrescar.
const CAMPOS_COMPARTIDOS: (keyof Articulo)[] = ["categoria", "nombre", "titulo", "descripcion", "marca", "imageUrl"]

type Columna = "nombre" | "codigo" | "stock" | "costo" | "marcacion" | "precio"

function valorColumna(articulo: { nombre: string; codigo: string; precio: number; articuloMostrador: { costo: number; stock: number } | null }, columna: Columna): string | number | null {
    switch (columna) {
        case "nombre": return articulo.nombre.toLowerCase()
        case "codigo": return articulo.codigo.toLowerCase()
        case "stock": return articulo.articuloMostrador?.stock ?? null
        case "costo": return articulo.articuloMostrador?.costo ?? null
        case "marcacion": return calcularMarcacion(articulo.articuloMostrador?.costo, articulo.precio)
        case "precio": return articulo.precio
    }
}

// Color del texto del nivel de stock manual (barra deslizante): rojo sin stock, verde al máximo.
function claseColorNivelStock(n: number): string {
    if (n <= 15) return "text-red-500"
    if (n <= 60) return "text-yellow-600"
    return "text-green-600"
}

interface ResultadoBusqueda {
    id: string
    nombre: string
    costo: number
    esPack: boolean | null
    codigoProveedor: string | null
    stock: number
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
    const [marcacionEditId, setMarcacionEditId] = useState<string | null>(null)
    const [marcacionTemp, setMarcacionTemp] = useState<string>("")
    const [precioEditId, setPrecioEditId] = useState<string | null>(null)
    const [precioTemp, setPrecioTemp] = useState<string>("")
    const [sortColumna, setSortColumna] = useState<Columna | null>(null)
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
    const [agruparFor, setAgruparFor] = useState<string | null>(null)
    const [agruparQuery, setAgruparQuery] = useState("")
    const [, startTransition] = useTransition()

    const faltantes = useMemo(() => articulos.filter(a => !a.imageUrl).length, [articulos])
    const sinCosto = useMemo(() => articulos.filter(a => !a.articuloMostrador).length, [articulos])
    const sinTitulo = useMemo(() => articulos.filter(a => !a.titulo).length, [articulos])

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
        const entries = Array.from(map.entries())
        if (sortColumna) {
            for (const [, items] of entries) {
                items.sort((a, b) => {
                    const va = valorColumna(a, sortColumna)
                    const vb = valorColumna(b, sortColumna)
                    if (va == null && vb == null) return 0
                    if (va == null) return 1
                    if (vb == null) return -1
                    if (va < vb) return sortDir === "asc" ? -1 : 1
                    if (va > vb) return sortDir === "asc" ? 1 : -1
                    return 0
                })
            }
        } else {
            // Sin sort explícito: agrupar variantes de un mismo artículo adyacentes entre sí.
            for (const [, items] of entries) {
                items.sort((a, b) => {
                    const ga = a.grupoVarianteId ?? a.id
                    const gb = b.grupoVarianteId ?? b.id
                    if (ga !== gb) return ga < gb ? -1 : 1
                    return a.orden - b.orden
                })
            }
        }
        return entries
    }, [articulosFiltrados, sortColumna, sortDir])

    const conteoGrupo = useMemo(() => {
        const map = new Map<string, number>()
        for (const a of articulos) {
            if (!a.grupoVarianteId) continue
            map.set(a.grupoVarianteId, (map.get(a.grupoVarianteId) || 0) + 1)
        }
        return map
    }, [articulos])

    function setLocal(id: string, patch: Partial<Articulo>) {
        setArticulos(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
    }

    // Además de guardar `patch` en `id`, refleja localmente los campos compartidos
    // (título, foto, descripción, etc.) en el resto de las variantes de su grupo.
    function setLocalConGrupo(id: string, patch: Partial<Articulo>) {
        setArticulos(prev => {
            const actual = prev.find(a => a.id === id)
            const grupoId = actual?.grupoVarianteId
            const patchCompartido: Partial<Articulo> = {}
            for (const campo of CAMPOS_COMPARTIDOS) {
                if (campo in patch) (patchCompartido as Record<string, unknown>)[campo] = (patch as Record<string, unknown>)[campo]
            }
            return prev.map(a => {
                if (a.id === id) return { ...a, ...patch }
                if (grupoId && a.grupoVarianteId === grupoId && Object.keys(patchCompartido).length > 0) {
                    return { ...a, ...patchCompartido }
                }
                return a
            })
        })
    }

    const agruparCandidatos = useMemo(() => {
        if (!agruparFor) return []
        const actual = articulos.find(a => a.id === agruparFor)
        const q = agruparQuery.trim().toLowerCase()
        return articulos
            .filter(a =>
                a.id !== agruparFor &&
                a.grupoVarianteId !== actual?.grupoVarianteId // ya está en el mismo grupo
            )
            .filter(a => !q || a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q) || (a.marca || "").toLowerCase().includes(q))
            .slice(0, 25)
    }, [articulos, agruparFor, agruparQuery])

    function abrirAgrupar(id: string) {
        setAgruparFor(id)
        setAgruparQuery("")
    }

    function confirmarAgrupar(destino: Articulo) {
        if (!agruparFor) return
        const origenId = agruparFor
        setAgruparFor(null)
        setArticulos(prev => {
            const grupoVarianteId = destino.grupoVarianteId ?? destino.id
            return prev.map(a => {
                if (a.id === destino.id) return { ...a, grupoVarianteId }
                if (a.id === origenId) {
                    return {
                        ...a,
                        grupoVarianteId,
                        categoria: destino.categoria,
                        nombre: destino.nombre,
                        titulo: destino.titulo,
                        descripcion: destino.descripcion,
                        marca: destino.marca,
                        imageUrl: destino.imageUrl,
                    }
                }
                return a
            })
        })
        startTransition(() => {
            agruparVariante(origenId, destino.id)
        })
    }

    function quitarDelGrupo(articulo: Articulo) {
        const grupoId = articulo.grupoVarianteId
        setArticulos(prev => {
            const restantes = grupoId ? prev.filter(a => a.grupoVarianteId === grupoId && a.id !== articulo.id) : []
            return prev.map(a => {
                if (a.id === articulo.id) return { ...a, grupoVarianteId: null, variante: null }
                if (grupoId && restantes.length === 1 && a.id === restantes[0].id) return { ...a, grupoVarianteId: null, variante: null }
                return a
            })
        })
        startTransition(() => {
            desagruparVariante(articulo.id)
        })
    }

    function asignarFoto(id: string, url: string) {
        setLocalConGrupo(id, { imageUrl: url })
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

    function iniciarEdicionMarcacion(articulo: Articulo) {
        const costo = articulo.articuloMostrador?.costo
        if (!costo || costo <= 0) return
        const marc = calcularMarcacion(costo, articulo.precio)
        setMarcacionEditId(articulo.id)
        setMarcacionTemp(marc !== null ? String(Number(marc.toFixed(1))) : "")
    }

    function cancelarEdicionMarcacion() {
        setMarcacionEditId(null)
        setMarcacionTemp("")
    }

    function guardarMarcacion(articulo: Articulo) {
        const costo = articulo.articuloMostrador?.costo
        const nuevoMargen = Number(marcacionTemp)
        if (marcacionTemp.trim() === "" || isNaN(nuevoMargen) || !costo || costo <= 0) {
            cancelarEdicionMarcacion()
            return
        }
        const nuevoPrecio = calcularPrecioDesdeMarcacion(costo, nuevoMargen)
        cancelarEdicionMarcacion()
        if (nuevoPrecio !== articulo.precio) {
            setLocal(articulo.id, { precio: nuevoPrecio })
            guardarCampo(articulo.id, { precio: nuevoPrecio })
        }
    }

    // Mientras se edita la marcación, el precio final mostrado se recalcula en vivo con lo
    // tipeado; mientras se edita el precio directamente, muestra el buffer de esa edición.
    function precioMostrado(articulo: Articulo): string {
        if (precioEditId === articulo.id) return precioTemp
        if (marcacionEditId === articulo.id) {
            const costo = articulo.articuloMostrador?.costo
            const tempMarc = Number(marcacionTemp)
            if (costo && costo > 0 && marcacionTemp.trim() !== "" && !isNaN(tempMarc)) {
                return formatMiles(calcularPrecioDesdeMarcacion(costo, tempMarc))
            }
        }
        return formatMiles(articulo.precio)
    }

    function toggleSort(columna: Columna) {
        if (sortColumna === columna) {
            setSortDir(d => (d === "asc" ? "desc" : "asc"))
        } else {
            setSortColumna(columna)
            setSortDir("asc")
        }
    }

    function iconoOrden(columna: Columna) {
        if (sortColumna !== columna) return <ArrowUpDown className="h-3 w-3 opacity-40" />
        return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
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
    const articuloAgrupando = articulos.find(a => a.id === agruparFor)

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
                            {articulos.length} artículos · {faltantes > 0 ? `${faltantes} sin foto` : "todos con foto"} · {sinCosto > 0 ? `${sinCosto} sin costo vinculado` : "todos con costo"} · {sinTitulo > 0 ? `${sinTitulo} sin título` : "todos con título"}
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

                {grupos.length > 0 && (
                    <div className="flex items-center gap-4 px-3 text-sm font-black uppercase tracking-wider text-slate-400">
                        <div className="w-16 shrink-0" />
                        <button
                            onClick={() => toggleSort("nombre")}
                            className={`flex-1 min-w-0 flex items-center gap-1 text-left hover:text-slate-600 transition-colors ${sortColumna === "nombre" ? "text-indigo-600" : ""}`}
                        >
                            Artículo {iconoOrden("nombre")}
                        </button>
                        <button
                            onClick={() => toggleSort("codigo")}
                            className={`w-32 shrink-0 flex items-center gap-1 hover:text-slate-600 transition-colors ${sortColumna === "codigo" ? "text-indigo-600" : ""}`}
                        >
                            Código {iconoOrden("codigo")}
                        </button>
                        <button
                            onClick={() => toggleSort("stock")}
                            className={`w-16 shrink-0 flex items-center gap-1 hover:text-slate-600 transition-colors ${sortColumna === "stock" ? "text-indigo-600" : ""}`}
                        >
                            Stock {iconoOrden("stock")}
                        </button>
                        <button
                            onClick={() => toggleSort("costo")}
                            className={`w-24 shrink-0 flex items-center gap-1 hover:text-slate-600 transition-colors ${sortColumna === "costo" ? "text-indigo-600" : ""}`}
                        >
                            Costo {iconoOrden("costo")}
                        </button>
                        <button
                            onClick={() => toggleSort("marcacion")}
                            className={`w-32 shrink-0 flex items-center gap-1 hover:text-slate-600 transition-colors ${sortColumna === "marcacion" ? "text-indigo-600" : ""}`}
                        >
                            Marcación {iconoOrden("marcacion")}
                        </button>
                        <button
                            onClick={() => toggleSort("precio")}
                            className={`w-28 shrink-0 flex items-center gap-1 hover:text-slate-600 transition-colors ${sortColumna === "precio" ? "text-indigo-600" : ""}`}
                        >
                            Precio final {iconoOrden("precio")}
                        </button>
                        <div className="w-28 shrink-0">Nivel stock (público)</div>
                        <div className="w-10 shrink-0" />
                    </div>
                )}

                {grupos.map(([categoria, items]) => (
                    <div key={categoria} className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 bg-slate-900 text-white font-black text-sm uppercase tracking-wider">
                            {categoria}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {items.map(articulo => {
                                const costo = articulo.articuloMostrador?.costo
                                const marc = calcularMarcacion(costo, articulo.precio)
                                return (
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
                                                defaultValue={articulo.titulo || articulo.nombre}
                                                title="Nombre / título que se ve en /mayoristas"
                                                onBlur={(e) => {
                                                    const val = e.target.value
                                                    if (val !== articulo.nombre || val !== articulo.titulo) {
                                                        setLocalConGrupo(articulo.id, { nombre: val, titulo: val })
                                                        guardarCampo(articulo.id, { nombre: val, titulo: val })
                                                    }
                                                }}
                                                className="h-8 font-semibold text-sm border-transparent hover:border-slate-200 focus:border-indigo-400 px-2"
                                            />
                                            {articulo.marca && (
                                                <p className="text-xs text-slate-400 px-2">{articulo.marca}</p>
                                            )}
                                            <Textarea
                                                defaultValue={articulo.descripcion || ""}
                                                placeholder="Descripción (opcional, para /mayoristas)"
                                                title="Descripción que se ve en /mayoristas"
                                                onBlur={(e) => {
                                                    // Siempre se guarda en minúscula, sin importar cómo se haya tipeado.
                                                    const val = e.target.value.trim().toLowerCase() || null
                                                    e.target.value = val || ""
                                                    if (val !== articulo.descripcion) {
                                                        setLocalConGrupo(articulo.id, { descripcion: val })
                                                        guardarCampo(articulo.id, { descripcion: val })
                                                    }
                                                }}
                                                rows={2}
                                                className="min-h-0 resize-none text-xs text-slate-500 border-transparent hover:border-slate-200 focus:border-indigo-400 px-2 py-1"
                                            />
                                        </div>

                                        {/* Código + agrupar variantes */}
                                        <div className="flex flex-col items-start gap-1 shrink-0 w-32">
                                            <Badge variant="outline" className="font-mono text-xs">
                                                {articulo.codigo}
                                            </Badge>
                                            {!articulo.articuloMostrador && (
                                                <button
                                                    onClick={() => abrirVincular(articulo.id)}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700"
                                                >
                                                    <Link2Off className="h-3 w-3 shrink-0" />
                                                    Vincular
                                                </button>
                                            )}
                                            {articulo.grupoVarianteId ? (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600" title="Artículo con variantes agrupadas">
                                                        <Layers className="h-3 w-3 shrink-0" />
                                                        Grupo · {conteoGrupo.get(articulo.grupoVarianteId) ?? 1}
                                                    </span>
                                                    <Input
                                                        defaultValue={articulo.variante || ""}
                                                        placeholder="Medida / variante"
                                                        title="Etiqueta de esta variante (ej. 12mm), se ve como pill en /mayoristas"
                                                        onBlur={(e) => {
                                                            const val = e.target.value.trim() || null
                                                            if (val !== articulo.variante) {
                                                                setLocal(articulo.id, { variante: val })
                                                                guardarCampo(articulo.id, { variante: val })
                                                            }
                                                        }}
                                                        className="h-6 text-[11px] px-1.5 border-purple-200 focus-visible:ring-purple-400"
                                                    />
                                                    <button
                                                        onClick={() => quitarDelGrupo(articulo)}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500"
                                                    >
                                                        <Link2Off className="h-3 w-3 shrink-0" />
                                                        Quitar del grupo
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => abrirAgrupar(articulo.id)}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-purple-500 hover:text-purple-700"
                                                >
                                                    <Link2 className="h-3 w-3 shrink-0" />
                                                    Agrupar variante
                                                </button>
                                            )}
                                        </div>

                                        {/* Stock real (mismo artículo del que sale el costo) */}
                                        <div className="shrink-0 w-16">
                                            {articulo.articuloMostrador ? (
                                                <span className={`text-sm font-semibold ${articulo.articuloMostrador.stock > 0 ? "text-slate-700" : "text-red-500"}`}>
                                                    {articulo.articuloMostrador.stock}
                                                </span>
                                            ) : (
                                                <span className="text-sm text-slate-300">—</span>
                                            )}
                                        </div>

                                        {/* Costo */}
                                        <div className="shrink-0 w-24">
                                            {articulo.articuloMostrador ? (
                                                <button
                                                    onClick={() => abrirVincular(articulo.id)}
                                                    title="Cambiar vínculo de costo"
                                                    className="text-sm font-semibold text-slate-700 hover:text-indigo-600"
                                                >
                                                    $ {formatMiles(costo!)}
                                                </button>
                                            ) : (
                                                <span className="text-sm text-slate-300">—</span>
                                            )}
                                        </div>

                                        {/* Marcación */}
                                        <div className="shrink-0 w-32">
                                            {marcacionEditId === articulo.id ? (
                                                <Input
                                                    autoFocus
                                                    type="number"
                                                    value={marcacionTemp}
                                                    onChange={(e) => setMarcacionTemp(e.target.value)}
                                                    onBlur={() => guardarMarcacion(articulo)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") e.currentTarget.blur()
                                                        if (e.key === "Escape") cancelarEdicionMarcacion()
                                                    }}
                                                    className="h-10 w-24 text-center text-base font-black bg-white border-indigo-300 focus-visible:ring-indigo-500"
                                                />
                                            ) : marc != null ? (
                                                <button
                                                    onClick={() => iniciarEdicionMarcacion(articulo)}
                                                    title="Clic para editar la marcación y recalcular el precio final"
                                                    className={`text-base font-black px-3 py-1.5 rounded-lg border transition-all hover:ring-1 hover:ring-indigo-300 ${claseColorMarcacion(marc)}`}
                                                >
                                                    {marc.toFixed(0)}%
                                                </button>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">—</span>
                                            )}
                                        </div>

                                        {/* Precio final */}
                                        <div className="flex items-center gap-1 shrink-0 w-28">
                                            <span className="text-slate-400 text-sm">$</span>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={precioMostrado(articulo)}
                                                onFocus={() => {
                                                    setPrecioEditId(articulo.id)
                                                    setPrecioTemp(formatMiles(articulo.precio))
                                                }}
                                                onChange={(e) => setPrecioTemp(formatMiles(parseMiles(e.target.value)))}
                                                onBlur={() => {
                                                    const val = parseMiles(precioTemp)
                                                    setPrecioEditId(null)
                                                    if (val !== articulo.precio) {
                                                        setLocal(articulo.id, { precio: val })
                                                        guardarCampo(articulo.id, { precio: val })
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") e.currentTarget.blur()
                                                }}
                                                className="h-8 w-24 text-sm"
                                            />
                                        </div>

                                        {/* Nivel de stock manual: barra roja (sin stock) a verde (máximo) que se ve en /mayoristas */}
                                        <div className="flex flex-col gap-0.5 shrink-0 w-28">
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={articulo.nivelStock}
                                                onChange={(e) => setLocal(articulo.id, { nivelStock: Number(e.target.value) })}
                                                onMouseUp={(e) => guardarCampo(articulo.id, { nivelStock: Number(e.currentTarget.value) })}
                                                onTouchEnd={(e) => guardarCampo(articulo.id, { nivelStock: Number(e.currentTarget.value) })}
                                                onKeyUp={(e) => guardarCampo(articulo.id, { nivelStock: Number(e.currentTarget.value) })}
                                                className="stock-slider"
                                                title="Nivel de stock que se muestra en /mayoristas"
                                            />
                                            <span className={`text-[10px] font-bold text-center ${claseColorNivelStock(articulo.nivelStock)}`}>
                                                {articulo.nivelStock}%
                                            </span>
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
                                )
                            })}
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
                                onClick={() => vincularFor && vincular(vincularFor, { id: r.id, nombre: r.nombre, costo: r.costo, esPack: r.esPack, stock: r.stock })}
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

            <Dialog open={!!agruparFor} onOpenChange={(open) => !open && setAgruparFor(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Agrupar variante{articuloAgrupando ? ` — ${articuloAgrupando.nombre}` : ""}</DialogTitle>
                        <DialogDescription>
                            Buscá el artículo del que esta fila es una variante (ej. otra medida). Título, foto, descripción, marca y categoría pasan a ser los del artículo elegido, y en /mayoristas van a aparecer juntos en un solo card con selector de variante.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            autoFocus
                            placeholder="Nombre, código o marca..."
                            value={agruparQuery}
                            onChange={(e) => setAgruparQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        {agruparCandidatos.length === 0 && (
                            <p className="text-center py-6 text-sm text-slate-400">Sin resultados.</p>
                        )}
                        {agruparCandidatos.map(a => (
                            <button
                                key={a.id}
                                onClick={() => confirmarAgrupar(a)}
                                className="flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate">
                                        {a.grupoVarianteId && <Badge className="bg-purple-100 text-purple-700 border-purple-200 shrink-0">Grupo · {conteoGrupo.get(a.grupoVarianteId) ?? 1}</Badge>}
                                        <span className="truncate">{a.titulo || a.nombre}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-mono">{a.codigo}</p>
                                </div>
                                <span className="text-sm font-bold text-slate-600 shrink-0">$ {formatMiles(a.precio)}</span>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}
