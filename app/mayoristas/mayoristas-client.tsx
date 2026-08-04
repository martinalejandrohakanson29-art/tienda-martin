"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Search, Tag, ShoppingCart, Plus, Minus, Trash2, Loader2 } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { buscarClienteMayoristaPorDni, crearPedidoMayoristaWeb } from "@/app/actions/pedido-mayorista-web"

interface ArticuloMayorista {
    id: string
    categoria: string
    nombre: string
    titulo: string | null
    descripcion: string | null
    marca: string | null
    codigo: string
    precio: number
    imageUrl: string
    nivelStock: number
    grupoVarianteId: string | null
    variante: string | null
}

// Un artículo con variantes (ej. medidas) se carga como varias filas que comparten
// grupoVarianteId; acá se agrupan en una sola card con selector. Un artículo sin
// variantes queda como "grupo de 1", mismo camino de renderizado para ambos casos.
interface CardArticulo {
    key: string
    categoria: string
    variantes: ArticuloMayorista[]
}

// Valor numérico de una etiqueta de variante (ej. "26mm" -> 26) para poder ordenar
// las medidas de menor a mayor; sin número, va al final.
function valorOrdenVariante(v: ArticuloMayorista): number {
    const match = v.variante?.match(/\d+(?:[.,]\d+)?/)
    return match ? parseFloat(match[0].replace(",", ".")) : Number.POSITIVE_INFINITY
}

function agruparEnCards(articulos: ArticuloMayorista[]): CardArticulo[] {
    const map = new Map<string, ArticuloMayorista[]>()
    for (const a of articulos) {
        const key = a.grupoVarianteId ?? a.id
        const arr = map.get(key) || []
        arr.push(a)
        map.set(key, arr)
    }
    return Array.from(map.entries()).map(([key, variantes]) => ({
        key,
        categoria: variantes[0].categoria,
        variantes: [...variantes].sort((a, b) => valorOrdenVariante(a) - valorOrdenVariante(b)),
    }))
}

// Interpola de rojo (sin stock) a verde (stock máximo) según el nivel 0-100
// que se fija a mano en el admin con la barra deslizante.
function colorNivelStock(nivel: number): string {
    return `hsl(${Math.max(0, Math.min(100, nivel)) * 1.2}, 70%, 45%)`
}

// Categoría que siempre se muestra primero (tanto en los tabs de filtro como en los
// bloques del catálogo), sin importar el orden de creación de sus artículos.
const CATEGORIA_DESTACADA = "KITS DE POTENCIACION / CILINDROS Y CIGUEÑALES"

// Categoría que siempre se muestra al final, mismo criterio que la destacada.
const CATEGORIA_AL_FINAL = "PLANTILLAS Y ADMISIÓN"

const CARRITO_KEY = "mayoristas-carrito"

// Pasos del checkout dentro del panel del carrito: se pide el DNI, se intenta
// identificar al cliente (Proveedores o padrón ARCA), se elige la entrega y se confirma el pedido.
type PasoCheckout = "carrito" | "dni" | "nombreManual" | "envio" | "confirmar" | "enviando" | "exito"

const TIPOS_ENVIO = [
    { value: "andreani", label: "Andreani" },
    { value: "via cargo", label: "Via Cargo" },
    { value: "retiran aca", label: "Retiran en el local" },
] as const

export default function MayoristasClient({
    articulos,
}: {
    articulos: ArticuloMayorista[]
}) {
    const [search, setSearch] = useState("")
    const [categoria, setCategoria] = useState<string | null>(null)
    const [carrito, setCarrito] = useState<Record<string, number>>({})
    const [carritoAbierto, setCarritoAbierto] = useState(false)
    const [montado, setMontado] = useState(false)

    const [pasoCheckout, setPasoCheckout] = useState<PasoCheckout>("carrito")
    const [dniInput, setDniInput] = useState("")
    const [telefonoInput, setTelefonoInput] = useState("")
    const [nombreManualInput, setNombreManualInput] = useState("")
    const [tipoEnvioInput, setTipoEnvioInput] = useState<string>("andreani")
    const [observacionesInput, setObservacionesInput] = useState("")
    const [clienteResuelto, setClienteResuelto] = useState<{ nombre: string; cuit: string } | null>(null)
    const [errorCheckout, setErrorCheckout] = useState<string | null>(null)
    const [buscandoCliente, setBuscandoCliente] = useState(false)
    const [numeroVentaExito, setNumeroVentaExito] = useState<number | null>(null)

    // Al cerrar el panel del carrito (por fuera de "Cerrar" en el paso de éxito), se reinicia
    // el checkout para que la próxima vez que se abra arranque desde el resumen del pedido.
    useEffect(() => {
        if (!carritoAbierto) {
            setPasoCheckout("carrito")
            setDniInput("")
            setTelefonoInput("")
            setNombreManualInput("")
            setTipoEnvioInput("andreani")
            setObservacionesInput("")
            setClienteResuelto(null)
            setErrorCheckout(null)
        }
    }, [carritoAbierto])

    // Carga el pedido guardado (si había uno a medio armar) y lo mantiene sincronizado en localStorage.
    useEffect(() => {
        setMontado(true)
        try {
            const guardado = localStorage.getItem(CARRITO_KEY)
            if (guardado) setCarrito(JSON.parse(guardado))
        } catch {
            localStorage.removeItem(CARRITO_KEY)
        }
    }, [])

    useEffect(() => {
        if (!montado) return
        localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito))
    }, [carrito, montado])

    function cambiarCantidad(id: string, delta: number) {
        setCarrito(prev => {
            const nueva = Math.max(0, (prev[id] || 0) + delta)
            const next = { ...prev }
            if (nueva === 0) delete next[id]
            else next[id] = nueva
            return next
        })
    }

    function quitarDelCarrito(id: string) {
        setCarrito(prev => {
            const next = { ...prev }
            delete next[id]
            return next
        })
    }

    function vaciarCarrito() {
        setCarrito({})
    }

    const [seleccion, setSeleccion] = useState<Record<string, string>>({})

    const categorias = useMemo(() => {
        const set = new Set(articulos.map(a => a.categoria))
        return Array.from(set).sort((a, b) => {
            if (a === CATEGORIA_DESTACADA) return -1
            if (b === CATEGORIA_DESTACADA) return 1
            if (a === CATEGORIA_AL_FINAL) return 1
            if (b === CATEGORIA_AL_FINAL) return -1
            return 0
        })
    }, [articulos])

    const cards = useMemo(() => agruparEnCards(articulos), [articulos])

    // Buscador flexible: separa el texto en palabras y matchea cada una sin importar el orden
    // en el que se escriban (ej. "titan cilindro" encuentra "Cilindro Titan 190"), ignorando acentos.
    // Una card matchea si alguna de sus variantes matchea (así buscar "12mm" no rompe el agrupamiento).
    const cardsFiltradas = useMemo(() => {
        let result = cards
        if (categoria) result = result.filter(c => c.categoria === categoria)
        if (search.trim()) {
            const diacriticos = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g")
            const quitarAcentos = (texto: string) => texto.normalize("NFD").replace(diacriticos, "")
            const palabras = quitarAcentos(search.toLowerCase().trim()).split(/\s+/)
            result = result.filter(c => c.variantes.some(a => {
                const nombreLimpio = quitarAcentos(a.nombre.toLowerCase())
                const tituloLimpio = quitarAcentos((a.titulo || "").toLowerCase())
                const descripcionLimpia = quitarAcentos((a.descripcion || "").toLowerCase())
                const codigoLimpio = quitarAcentos(a.codigo.toLowerCase())
                const marcaLimpia = quitarAcentos((a.marca || "").toLowerCase())
                const categoriaLimpia = quitarAcentos(a.categoria.toLowerCase())
                const varianteLimpia = quitarAcentos((a.variante || "").toLowerCase())
                return palabras.every(p =>
                    nombreLimpio.includes(p) || tituloLimpio.includes(p) || descripcionLimpia.includes(p) ||
                    codigoLimpio.includes(p) || marcaLimpia.includes(p) || categoriaLimpia.includes(p) || varianteLimpia.includes(p)
                )
            }))
        }
        return result
    }, [cards, search, categoria])

    // Agrupa por categoría (en bloques separados, tipo cilindros / tapas / etc.) respetando
    // el orden en el que aparecen las categorías en el catálogo completo.
    const grupos = useMemo(() => {
        const map = new Map<string, CardArticulo[]>()
        for (const c of cardsFiltradas) {
            const arr = map.get(c.categoria) || []
            arr.push(c)
            map.set(c.categoria, arr)
        }
        return categorias
            .filter(c => map.has(c))
            .map(c => [c, map.get(c)!] as const)
    }, [cardsFiltradas, categorias])

    // Variante elegida para una card: la que el cliente tocó, o por default la primera con
    // stock (si ninguna tiene, la primera de la lista).
    function varianteSeleccionada(card: CardArticulo): ArticuloMayorista {
        const elegidaId = seleccion[card.key]
        const elegida = elegidaId && card.variantes.find(v => v.id === elegidaId)
        if (elegida) return elegida
        return card.variantes.find(v => v.nivelStock > 0) || card.variantes[0]
    }

    const itemsCarrito = useMemo(() => {
        return Object.entries(carrito)
            .map(([id, cantidad]) => {
                const articulo = articulos.find(a => a.id === id)
                return articulo ? { articulo, cantidad } : null
            })
            .filter((x): x is { articulo: ArticuloMayorista; cantidad: number } => x !== null)
    }, [carrito, articulos])

    const cantidadTotal = itemsCarrito.reduce((sum, i) => sum + i.cantidad, 0)
    const totalCarrito = itemsCarrito.reduce((sum, i) => sum + i.articulo.precio * i.cantidad, 0)

    async function handleContinuarDni() {
        const limpio = dniInput.replace(/\D/g, "")
        if (limpio.length < 7) {
            setErrorCheckout("Ingresá un DNI válido")
            return
        }
        if (telefonoInput.replace(/\D/g, "").length < 6) {
            setErrorCheckout("Ingresá un WhatsApp válido")
            return
        }
        setErrorCheckout(null)
        setBuscandoCliente(true)
        try {
            const res = await buscarClienteMayoristaPorDni(limpio)
            if (res.encontrado && res.nombre) {
                setClienteResuelto({ nombre: res.nombre, cuit: res.cuit })
                setPasoCheckout("envio")
            } else {
                setClienteResuelto({ nombre: "", cuit: res.cuit })
                setNombreManualInput("")
                setPasoCheckout("nombreManual")
            }
        } catch {
            setErrorCheckout("No pudimos verificar el DNI. Probá de nuevo.")
        } finally {
            setBuscandoCliente(false)
        }
    }

    function handleContinuarNombreManual() {
        const nombre = nombreManualInput.trim()
        if (!nombre || !clienteResuelto) return
        setClienteResuelto({ ...clienteResuelto, nombre })
        setPasoCheckout("envio")
    }

    async function handleAceptarPedido() {
        if (!clienteResuelto) return
        setErrorCheckout(null)
        setPasoCheckout("enviando")
        try {
            const res = await crearPedidoMayoristaWeb({
                cuit: clienteResuelto.cuit,
                nombre: clienteResuelto.nombre,
                telefono: telefonoInput,
                tipoEnvio: tipoEnvioInput,
                observaciones: observacionesInput,
                items: itemsCarrito.map(({ articulo, cantidad }) => ({ articuloMayoristaId: articulo.id, cantidad })),
            })
            if (res.success) {
                setNumeroVentaExito(res.numeroVenta ?? null)
                vaciarCarrito()
                setPasoCheckout("exito")
            } else {
                setErrorCheckout(res.error || "No se pudo generar el pedido")
                setPasoCheckout("confirmar")
            }
        } catch {
            setErrorCheckout("No se pudo generar el pedido. Probá de nuevo.")
            setPasoCheckout("confirmar")
        }
    }

    return (
        <div className="space-y-6 pb-24">
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
                    {cardsFiltradas.length} artículos
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setCategoria(null)}
                    className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors ${
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
                        className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors ${
                            categoria === c
                                ? "bg-red-600 border-red-600 text-white"
                                : "bg-[#1A1A1A] border-white/15 text-gray-400 hover:text-white hover:border-white/30"
                        }`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {cardsFiltradas.length === 0 ? (
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
                <div className="space-y-8">
                    {grupos.map(([nombreCategoria, items]) => (
                        <div key={nombreCategoria}>
                            <div className="flex items-center gap-3 mb-3 min-w-0">
                                <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide text-white min-w-0 shrink">
                                    {nombreCategoria}
                                </h2>
                                <span className="text-xs text-gray-500 font-medium whitespace-nowrap shrink-0">
                                    {items.length}
                                </span>
                                <div className="flex-1 h-px bg-white/10 shrink-0" />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                                {items.map((card) => {
                                    const articulo = varianteSeleccionada(card)
                                    const tieneVariantes = card.variantes.length > 1
                                    const cantidadEnCarrito = carrito[articulo.id] || 0
                                    const sinStock = articulo.nivelStock === 0
                                    return (
                                        <div
                                            key={card.key}
                                            className="group relative overflow-hidden border-0 ring-1 ring-white/10 hover:ring-red-600/60 bg-[#111] text-white transition-all duration-300 h-full flex flex-col rounded-lg shadow-lg"
                                        >
                                            <div className="h-[3px] w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 flex-shrink-0" />

                                            <div className="aspect-square relative overflow-hidden bg-white flex-shrink-0">
                                                {articulo.imageUrl ? (
                                                    <img
                                                        src={articulo.imageUrl}
                                                        alt={articulo.nombre}
                                                        loading="lazy"
                                                        decoding="async"
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
                                                <h3 className="font-semibold text-gray-100 text-sm leading-tight line-clamp-2">
                                                    {articulo.titulo || articulo.nombre}
                                                </h3>
                                                {articulo.descripcion && (
                                                    <p className="text-[11px] text-gray-400 leading-snug line-clamp-2 mt-0.5">
                                                        {articulo.descripcion}
                                                    </p>
                                                )}

                                                {tieneVariantes && (
                                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                                        {card.variantes.map(v => {
                                                            const activa = v.id === articulo.id
                                                            const enCarrito = (carrito[v.id] || 0) > 0
                                                            return (
                                                                <button
                                                                    key={v.id}
                                                                    onClick={() => setSeleccion(prev => ({ ...prev, [card.key]: v.id }))}
                                                                    className={`relative px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                                                        activa
                                                                            ? "bg-red-600 border-red-600 text-white"
                                                                            : "bg-white/5 border-white/15 text-gray-300 hover:border-white/40"
                                                                    } ${v.nivelStock === 0 ? "opacity-40" : ""}`}
                                                                    title={v.nivelStock === 0 ? "Sin stock" : undefined}
                                                                >
                                                                    {v.variante || v.codigo}
                                                                    {enCarrito && (
                                                                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-400 ring-1 ring-[#111]" />
                                                                    )}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                )}

                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                    <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 shrink-0">Stock</span>
                                                    {sinStock ? (
                                                        <span className="text-[10px] font-bold uppercase text-red-500">Sin stock</span>
                                                    ) : (
                                                        <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden" title="Nivel de stock">
                                                            <div
                                                                className="h-full rounded-full transition-all"
                                                                style={{ width: `${articulo.nivelStock}%`, backgroundColor: colorNivelStock(articulo.nivelStock) }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-auto pt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between border-t border-white/10">
                                                    <span className="text-lg font-extrabold leading-none text-white">
                                                        {formatPrice(articulo.precio)}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 font-mono min-w-0">
                                                        <Tag size={10} className="shrink-0" />
                                                        <span className="truncate">{articulo.codigo}</span>
                                                    </span>
                                                </div>

                                                <div
                                                    className={`mt-2 flex items-center justify-between gap-2 rounded-md p-1 transition-colors ${
                                                        cantidadEnCarrito > 0 ? "bg-red-600/15 ring-1 ring-red-600/40" : "bg-white/5"
                                                    }`}
                                                >
                                                    <button
                                                        onClick={() => cambiarCantidad(articulo.id, -1)}
                                                        disabled={cantidadEnCarrito === 0}
                                                        className="h-8 w-8 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/10 text-white transition-colors"
                                                        aria-label="Restar cantidad"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className={`font-black text-sm min-w-[1.5rem] text-center ${cantidadEnCarrito > 0 ? "text-red-400" : "text-gray-500"}`}>
                                                        {cantidadEnCarrito}
                                                    </span>
                                                    <button
                                                        onClick={() => cambiarCantidad(articulo.id, 1)}
                                                        disabled={sinStock}
                                                        className="h-8 w-8 flex items-center justify-center rounded bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-red-600 text-white transition-colors"
                                                        aria-label="Sumar cantidad"
                                                        title={sinStock ? "Sin stock disponible" : undefined}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {cantidadTotal > 0 && (
                <button
                    onClick={() => setCarritoAbierto(true)}
                    className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 bg-red-600 hover:bg-red-700 text-white font-bold pl-4 pr-5 py-3.5 rounded-full shadow-2xl shadow-black/50 transition-transform hover:scale-105"
                >
                    <span className="relative">
                        <ShoppingCart size={20} />
                        <span className="absolute -top-2 -right-2 bg-white text-red-600 text-[10px] font-black h-4 min-w-[1rem] px-1 rounded-full flex items-center justify-center">
                            {cantidadTotal}
                        </span>
                    </span>
                    <span className="text-sm">{formatPrice(totalCarrito)}</span>
                </button>
            )}

            <Sheet open={carritoAbierto} onOpenChange={setCarritoAbierto}>
                <SheetContent side="right" className="bg-[#111] border-white/10 text-white w-full sm:max-w-md flex flex-col">
                    <SheetTitle className="text-white text-lg font-black uppercase tracking-wide">Tu pedido</SheetTitle>

                    {itemsCarrito.length === 0 && pasoCheckout === "carrito" ? (
                        <p className="text-gray-500 text-sm mt-4">Todavía no agregaste artículos.</p>
                    ) : (
                        <>
                            {pasoCheckout === "carrito" && (
                            <div className="flex-1 overflow-y-auto space-y-3 mt-4 pr-1">
                                {itemsCarrito.map(({ articulo, cantidad }) => (
                                    <div key={articulo.id} className="flex items-center gap-3 border-b border-white/10 pb-3">
                                        <div className="w-12 h-12 rounded bg-white shrink-0 overflow-hidden flex items-center justify-center">
                                            {articulo.imageUrl && (
                                                <img src={articulo.imageUrl} alt="" className="w-full h-full object-contain p-1" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate">
                                                {articulo.titulo || articulo.nombre}
                                                {articulo.variante && <span className="text-gray-400 font-normal"> — {articulo.variante}</span>}
                                            </p>
                                            <p className="text-xs text-gray-500">{formatPrice(articulo.precio)} c/u</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => cambiarCantidad(articulo.id, -1)}
                                                className="h-7 w-7 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 transition-colors"
                                                aria-label="Restar cantidad"
                                            >
                                                <Minus size={12} />
                                            </button>
                                            <span className="w-5 text-center text-sm font-bold">{cantidad}</span>
                                            <button
                                                onClick={() => cambiarCantidad(articulo.id, 1)}
                                                className="h-7 w-7 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 transition-colors"
                                                aria-label="Sumar cantidad"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => quitarDelCarrito(articulo.id)}
                                            className="text-gray-500 hover:text-red-400 shrink-0 transition-colors"
                                            aria-label="Quitar artículo"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            )}

                            {pasoCheckout !== "carrito" && pasoCheckout !== "exito" && (
                                <div className="mt-4 flex items-center justify-between text-xs text-gray-400 bg-white/5 rounded-lg p-3">
                                    <span>{itemsCarrito.length} artículo(s)</span>
                                    <span className="font-bold text-white">{formatPrice(totalCarrito)}</span>
                                </div>
                            )}

                            <div className="pt-4 border-t border-white/10 mt-2 space-y-3">
                                {pasoCheckout === "carrito" && (
                                    <div className="flex items-center justify-between text-lg font-black">
                                        <span>Total</span>
                                        <span>{formatPrice(totalCarrito)}</span>
                                    </div>
                                )}

                                {pasoCheckout === "carrito" && (
                                    <>
                                        <button
                                            onClick={() => setPasoCheckout("dni")}
                                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
                                        >
                                            Confirmar pedido
                                        </button>
                                        <button
                                            onClick={vaciarCarrito}
                                            className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors"
                                        >
                                            Vaciar pedido
                                        </button>
                                    </>
                                )}

                                {pasoCheckout === "dni" && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-400">Ingresá tu DNI y WhatsApp para identificarte y confirmar el pedido.</p>
                                        <Input
                                            value={dniInput}
                                            onChange={(e) => setDniInput(e.target.value.replace(/\D/g, ""))}
                                            placeholder="DNI. Ej: 30123456"
                                            inputMode="numeric"
                                            autoFocus
                                            className="bg-[#111] border-white/15 text-white placeholder:text-gray-600"
                                        />
                                        <Input
                                            value={telefonoInput}
                                            onChange={(e) => setTelefonoInput(e.target.value.replace(/[^\d+\s()-]/g, ""))}
                                            placeholder="WhatsApp. Ej: 11 2345-6789"
                                            inputMode="tel"
                                            className="bg-[#111] border-white/15 text-white placeholder:text-gray-600"
                                        />
                                        {errorCheckout && <p className="text-xs text-red-400">{errorCheckout}</p>}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPasoCheckout("carrito")}
                                                className="flex-1 text-xs text-gray-400 hover:text-white py-2.5"
                                            >
                                                Volver
                                            </button>
                                            <button
                                                onClick={handleContinuarDni}
                                                disabled={buscandoCliente || dniInput.length < 7 || telefonoInput.replace(/\D/g, "").length < 6}
                                                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-lg transition-colors"
                                            >
                                                {buscandoCliente && <Loader2 size={14} className="animate-spin" />}
                                                {buscandoCliente ? "Buscando..." : "Continuar"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {pasoCheckout === "nombreManual" && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-400">No encontramos ese DNI registrado. Decinos tu nombre y apellido para continuar.</p>
                                        <Input
                                            value={nombreManualInput}
                                            onChange={(e) => setNombreManualInput(e.target.value)}
                                            placeholder="Nombre y apellido"
                                            autoFocus
                                            className="bg-[#111] border-white/15 text-white placeholder:text-gray-600"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPasoCheckout("dni")}
                                                className="flex-1 text-xs text-gray-400 hover:text-white py-2.5"
                                            >
                                                Volver
                                            </button>
                                            <button
                                                onClick={handleContinuarNombreManual}
                                                disabled={!nombreManualInput.trim()}
                                                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-lg transition-colors"
                                            >
                                                Continuar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {pasoCheckout === "envio" && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-400">¿Cómo querés recibir el pedido?</p>
                                        <select
                                            value={tipoEnvioInput}
                                            onChange={(e) => setTipoEnvioInput(e.target.value)}
                                            className="w-full bg-[#111] border border-white/15 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-600/50"
                                        >
                                            {TIPOS_ENVIO.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                        <textarea
                                            value={observacionesInput}
                                            onChange={(e) => setObservacionesInput(e.target.value)}
                                            placeholder="Observaciones (opcional). Ej: dirección de entrega, horarios, aclaraciones..."
                                            rows={3}
                                            className="w-full bg-[#111] border border-white/15 text-white placeholder:text-gray-600 rounded-lg px-3 py-2.5 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-red-600/50"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPasoCheckout("dni")}
                                                className="flex-1 text-xs text-gray-400 hover:text-white py-2.5"
                                            >
                                                Volver
                                            </button>
                                            <button
                                                onClick={() => setPasoCheckout("confirmar")}
                                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors"
                                            >
                                                Continuar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {pasoCheckout === "confirmar" && clienteResuelto && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-gray-200">
                                            ¿Confirmás el pedido a nombre de <span className="font-bold text-white">{clienteResuelto.nombre}</span>?
                                        </p>
                                        <div className="bg-white/5 rounded-lg p-2.5 text-xs text-gray-400 space-y-1">
                                            <p>Entrega: <span className="text-gray-200 font-semibold">{TIPOS_ENVIO.find(t => t.value === tipoEnvioInput)?.label}</span></p>
                                            {observacionesInput.trim() && (
                                                <p className="whitespace-pre-wrap">Observaciones: <span className="text-gray-200">{observacionesInput.trim()}</span></p>
                                            )}
                                        </div>
                                        {errorCheckout && <p className="text-xs text-red-400">{errorCheckout}</p>}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setClienteResuelto(null); setDniInput(""); setPasoCheckout("dni") }}
                                                className="flex-1 text-xs text-gray-400 hover:text-white py-2.5"
                                            >
                                                No soy yo, cambiar DNI
                                            </button>
                                            <button
                                                onClick={handleAceptarPedido}
                                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors"
                                            >
                                                Aceptar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {pasoCheckout === "enviando" && (
                                    <div className="flex items-center justify-center gap-2 py-3 text-gray-300 text-sm">
                                        <Loader2 size={16} className="animate-spin" /> Enviando pedido...
                                    </div>
                                )}

                                {pasoCheckout === "exito" && (
                                    <div className="text-center space-y-2 py-2">
                                        <p className="text-green-400 font-black text-lg">Pedido cargado</p>
                                        <p className="text-sm text-gray-300">
                                            En breve nos comunicamos para coordinar todo, ¡muchas gracias! <span className="text-gray-500">(Pedido #{numeroVentaExito})</span>
                                        </p>
                                        <button
                                            onClick={() => setCarritoAbierto(false)}
                                            className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-lg mt-2 transition-colors"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
