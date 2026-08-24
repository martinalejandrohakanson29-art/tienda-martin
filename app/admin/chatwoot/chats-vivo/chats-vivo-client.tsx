"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MoreVertical, Search, ExternalLink } from "lucide-react"

// Maqueta visual del visor de chats "tipo WhatsApp". Datos hardcodeados
// (nada de fetch a Chatwoot todavía) para poder iterar el look primero.
// Cuando esto se conecte de verdad, `categoria` sale del label que ya
// pone el workflow de n8n en la conversación.

type Categoria = "tecnica" | "negocio" | "precio" | "sin_etiqueta"

type Mensaje = {
    id: number
    texto: string
    hora: string
    propio: boolean
}

type Conversacion = {
    id: number
    nombre: string
    telefono: string
    iniciales: string
    colorAvatar: string
    categoria: Categoria
    hora: string
    noLeidos: number
    mensajes: Mensaje[]
}

const CATEGORIA_INFO: Record<Categoria, { texto: string; clase: string }> = {
    tecnica: { texto: "Técnica", clase: "bg-blue-100 text-blue-800 border-blue-200" },
    negocio: { texto: "Negocio", clase: "bg-purple-100 text-purple-800 border-purple-200" },
    precio: { texto: "Precio", clase: "bg-amber-100 text-amber-800 border-amber-200" },
    sin_etiqueta: { texto: "Sin etiqueta", clase: "bg-slate-100 text-slate-600 border-slate-200" },
}

const CONVERSACIONES: Conversacion[] = [
    {
        id: 1,
        nombre: "Facundo Rios",
        telefono: "+54 9 351 555-0110",
        iniciales: "FR",
        colorAvatar: "bg-emerald-500",
        categoria: "tecnica",
        hora: "10:24",
        noLeidos: 2,
        mensajes: [
            { id: 1, texto: "Hola, el kit de arrastre sirve para una Zanella RX 150?", hora: "10:20", propio: false },
            { id: 2, texto: "Depende del año, ¿me pasás el modelo exacto?", hora: "10:21", propio: true },
            { id: 3, texto: "Es una 2019", hora: "10:23", propio: false },
            { id: 4, texto: "Ese año sí, va con el kit largo", hora: "10:24", propio: false },
        ],
    },
    {
        id: 2,
        nombre: "Marina Sosa",
        telefono: "+54 9 351 555-0223",
        iniciales: "MS",
        colorAvatar: "bg-rose-500",
        categoria: "precio",
        hora: "09:58",
        noLeidos: 0,
        mensajes: [
            { id: 1, texto: "Buenas! Cuánto sale el kit 8 completo?", hora: "09:55", propio: false },
            { id: 2, texto: "Hola Marina! El kit 8 corto sale $145.000 y el largo $162.000", hora: "09:57", propio: true },
            { id: 3, texto: "Genial, gracias", hora: "09:58", propio: false },
        ],
    },
    {
        id: 3,
        nombre: "Diego Villalba",
        telefono: "+54 9 351 555-0342",
        iniciales: "DV",
        colorAvatar: "bg-indigo-500",
        categoria: "negocio",
        hora: "09:40",
        noLeidos: 5,
        mensajes: [
            { id: 1, texto: "Hacen envíos a Rio Cuarto?", hora: "09:35", propio: false },
            { id: 2, texto: "Sí, con Correo Argentino o Via Cargo", hora: "09:36", propio: true },
            { id: 3, texto: "Cuánto tarda más o menos?", hora: "09:38", propio: false },
            { id: 4, texto: "2 a 4 días hábiles", hora: "09:39", propio: true },
            { id: 5, texto: "Y aceptan Mercado Pago?", hora: "09:40", propio: false },
        ],
    },
    {
        id: 4,
        nombre: "Lucas Peralta",
        telefono: "+54 9 351 555-0417",
        iniciales: "LP",
        colorAvatar: "bg-amber-500",
        categoria: "sin_etiqueta",
        hora: "ayer",
        noLeidos: 0,
        mensajes: [
            { id: 1, texto: "Buenas tardes", hora: "ayer", propio: false },
            { id: 2, texto: "Hola! En qué te puedo ayudar?", hora: "ayer", propio: true },
        ],
    },
    {
        id: 5,
        nombre: "Camila Ferreyra",
        telefono: "+54 9 351 555-0561",
        iniciales: "CF",
        colorAvatar: "bg-sky-500",
        categoria: "tecnica",
        hora: "ayer",
        noLeidos: 0,
        mensajes: [
            { id: 1, texto: "El cigueñal que tienen es compatible con Motomel S2 200?", hora: "ayer", propio: false },
            { id: 2, texto: "Sí, es compatible", hora: "ayer", propio: true },
        ],
    },
]

const fondoChat: React.CSSProperties = {
    backgroundColor: "#efeae2",
    backgroundImage:
        "radial-gradient(circle at 2px 2px, rgba(0,0,0,0.045) 1px, transparent 0)",
    backgroundSize: "22px 22px",
}

export function ChatsVivoClient() {
    const [filtro, setFiltro] = useState<Categoria | "todas">("todas")
    const [busqueda, setBusqueda] = useState("")
    const [seleccionadaId, setSeleccionadaId] = useState<number>(CONVERSACIONES[0].id)

    const conversacionesFiltradas = useMemo(() => {
        return CONVERSACIONES.filter((c) => {
            const pasaCategoria = filtro === "todas" || c.categoria === filtro
            const pasaBusqueda = c.nombre.toLowerCase().includes(busqueda.toLowerCase())
            return pasaCategoria && pasaBusqueda
        })
    }, [filtro, busqueda])

    const seleccionada = CONVERSACIONES.find((c) => c.id === seleccionadaId) ?? conversacionesFiltradas[0]

    const chips: { valor: Categoria | "todas"; texto: string }[] = [
        { valor: "todas", texto: "Todas" },
        { valor: "tecnica", texto: "Técnica" },
        { valor: "negocio", texto: "Negocio" },
        { valor: "precio", texto: "Precio" },
        { valor: "sin_etiqueta", texto: "Sin etiqueta" },
    ]

    return (
        <div className="h-screen w-full overflow-hidden flex flex-col bg-[#f0f2f5]">
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-white shrink-0">
                <Link href="/admin/chatwoot" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-sm font-semibold text-gray-800">Chats en vivo</h1>
                    <p className="text-xs text-gray-500">Maqueta visual — datos de ejemplo, todavía sin conectar a Chatwoot</p>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Columna izquierda: lista de conversaciones */}
                <div className="w-[440px] shrink-0 border-r bg-white flex flex-col min-h-0">
                    <div className="flex items-center justify-between px-4 py-3 bg-[#f0f2f5] shrink-0">
                        <span className="font-semibold text-[#111b25] text-base">Conversaciones</span>
                        <MoreVertical className="h-5 w-5 text-[#54656f]" />
                    </div>

                    <div className="px-3 py-2 shrink-0">
                        <div className="flex items-center gap-2 bg-[#f0f2f5] rounded-lg px-3 py-1.5">
                            <Search className="h-4 w-4 text-[#54656f]" />
                            <input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar conversación"
                                className="bg-transparent outline-none text-sm w-full text-[#111b25] placeholder:text-[#667781]"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 px-3 pb-2 overflow-x-auto shrink-0">
                        {chips.map((chip) => (
                            <button
                                key={chip.valor}
                                onClick={() => setFiltro(chip.valor)}
                                className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${
                                    filtro === chip.valor
                                        ? "bg-[#00a884] text-white border-[#00a884]"
                                        : "bg-white text-[#54656f] border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                                {chip.texto}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {conversacionesFiltradas.length === 0 && (
                            <p className="text-sm text-gray-400 text-center mt-8">Ninguna conversación con este filtro</p>
                        )}
                        {conversacionesFiltradas.map((c) => {
                            const cat = CATEGORIA_INFO[c.categoria]
                            const activa = c.id === seleccionada?.id
                            const ultimoMensaje = c.mensajes[c.mensajes.length - 1]
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => setSeleccionadaId(c.id)}
                                    className={`w-full flex items-start gap-4 px-4 py-4 border-b border-gray-100 text-left transition-colors ${
                                        activa ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f5f6f6]"
                                    }`}
                                >
                                    <div className={`h-16 w-16 rounded-full ${c.colorAvatar} text-white flex items-center justify-center font-semibold text-lg shrink-0`}>
                                        {c.iniciales}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-[#111b25] text-base truncate">{c.nombre}</span>
                                            <span className="text-xs text-[#667781] shrink-0">{c.hora}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-sm text-[#667781] truncate">
                                                {ultimoMensaje.propio ? "Vos: " : ""}
                                                {ultimoMensaje.texto}
                                            </span>
                                            {c.noLeidos > 0 && (
                                                <span className="bg-[#25d366] text-white text-xs font-semibold rounded-full h-6 min-w-6 px-1.5 flex items-center justify-center shrink-0">
                                                    {c.noLeidos}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border ${cat.clase}`}>
                                            {cat.texto}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Columna derecha: hilo de la conversación seleccionada */}
                <div className="flex-1 flex flex-col min-h-0">
                    {seleccionada ? (
                        <>
                            <div className="flex items-center justify-between px-4 py-2.5 bg-[#f0f2f5] border-b shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-full ${seleccionada.colorAvatar} text-white flex items-center justify-center font-semibold text-sm`}>
                                        {seleccionada.iniciales}
                                    </div>
                                    <div>
                                        <p className="font-medium text-[#111b25] text-sm">{seleccionada.nombre}</p>
                                        <p className="text-xs text-[#667781]">{seleccionada.telefono}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CATEGORIA_INFO[seleccionada.categoria].clase}`}>
                                        {CATEGORIA_INFO[seleccionada.categoria].texto}
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 text-xs text-[#00a884] font-medium">
                                    Ver en Chatwoot <ExternalLink className="h-3.5 w-3.5" />
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1" style={fondoChat}>
                                {seleccionada.mensajes.map((m) => (
                                    <div key={m.id} className={`flex ${m.propio ? "justify-end" : "justify-start"}`}>
                                        <div
                                            className={`max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm text-sm text-[#111b25] ${
                                                m.propio ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
                                            }`}
                                        >
                                            <p className="whitespace-pre-wrap">{m.texto}</p>
                                            <span className="block text-right text-[10px] text-[#667781] mt-0.5">{m.hora}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="px-4 py-3 bg-[#f0f2f5] border-t shrink-0">
                                <p className="text-xs text-[#667781] text-center">
                                    Solo lectura por ahora — esto es un panel para mirar la cola filtrada, no para responder desde acá.
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                            Seleccioná una conversación
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
