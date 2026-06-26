// app/admin/mercadolibre/preparacion/preparacion-client.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Search,
    Camera,
    CheckCircle2,
    Package,
    Eye,
    Loader2,
    X,
    Layers,
    Barcode,
    AlertTriangle,
    Hash,
    Maximize2,
    ArrowLeft,
    StickyNote,
    MessageSquare
} from "lucide-react"
import {
    subirFotoAuditoria,
    aprobarPedido,
    rechazarPedido,
    obtenerFotosEnvio,
    crearComentarioML,
    getComentariosML,
    marcarComentarioMLLeido
} from "@/app/actions/preparacion"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

import { Html5Qrcode } from "html5-qrcode"

const getLogisticName = (type: string) => {
    const types: Record<string, string> = {
        'cross_docking': 'COLECTA',
        'self_service': 'FLEX'
    }
    return types[type] || type?.toUpperCase() || 'S/N';
}

const getAgregadoColor = (index: number) => {
    const colors = [
        "bg-blue-600 text-white border-blue-800",
        "bg-purple-600 text-white border-purple-800",
        "bg-orange-600 text-white border-orange-800",
        "bg-pink-600 text-white border-pink-800",
        "bg-indigo-600 text-white border-indigo-800",
        "bg-cyan-600 text-white border-cyan-800",
    ];
    return colors[index % colors.length];
};

const renderTextWithQuantity = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\(x\d+\))/g);
    return parts.map((part, i) => 
        /(\(x\d+\))/.test(part) ? (
            <span key={i} className="bg-red-600 text-white px-1.5 py-0.5 rounded-md font-black mx-0.5 animate-pulse">
                {part}
            </span>
        ) : part
    );
};

// Visor de imagen con zoom por zonas: al hacer click sobre una región la amplía
// usando ese punto como centro; estando ampliada, mover el puntero (o arrastrar en
// móvil) recorre la imagen. Otro click aleja. Click fuera de la imagen cierra.
function ZoomViewer({
    src,
    onClose,
    envioId,
    envioData,
    loading,
    onApprove,
    onReject,
}: {
    src: string
    onClose: () => void
    envioId?: string
    envioData?: any
    loading?: string | null
    onApprove?: (id: string) => void
    onReject?: (id: string) => void
}) {
    const SCALE = 2.8
    const imgRef = useRef<HTMLImageElement>(null)
    const [zoomed, setZoomed] = useState(false)
    const [origin, setOrigin] = useState({ x: 50, y: 50 })

    const posFrom = (clientX: number, clientY: number) => {
        const el = imgRef.current
        if (!el) return { x: 50, y: 50 }
        const rect = el.getBoundingClientRect()
        const x = ((clientX - rect.left) / rect.width) * 100
        const y = ((clientY - rect.top) / rect.height) * 100
        return {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
        }
    }

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (zoomed) {
            setZoomed(false)
        } else {
            setOrigin(posFrom(e.clientX, e.clientY))
            setZoomed(true)
        }
    }

    const allNombres: { nombre: string; colorIdx: number }[] = []
    envioData?.items?.forEach((item: any) => {
        const rawNames = item.agregadoInfo?.nombres_articulos || item.title
        rawNames.split(/[,\+\|\n]/).map((n: string) => n.trim()).filter((n: string) => n.length > 0)
            .forEach((nombre: string) => allNombres.push({ nombre, colorIdx: allNombres.length }))
    })

    const hasPanel = !!(envioId && onApprove && onReject)

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col overflow-hidden" onClick={onClose}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white z-10" onClick={onClose}>
                <X className="h-8 w-8" />
            </button>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-xs bg-black/40 px-3 py-1 rounded-full pointer-events-none z-10">
                {zoomed ? "Movete sobre la imagen para explorar · click para alejar" : "Click sobre una zona para acercar"}
            </div>

            {/* Área de imagen */}
            <div className="flex-1 flex items-center justify-center p-4 pt-14 overflow-hidden">
                <img
                    ref={imgRef}
                    src={src}
                    alt="Zoom"
                    draggable={false}
                    onClick={handleClick}
                    onMouseMove={(e) => { if (zoomed) setOrigin(posFrom(e.clientX, e.clientY)) }}
                    onTouchMove={(e) => { if (zoomed) { const t = e.touches[0]; setOrigin(posFrom(t.clientX, t.clientY)) } }}
                    className={`max-w-full max-h-full object-contain rounded shadow-2xl select-none transition-transform duration-150 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                    style={{
                        transform: zoomed ? `scale(${SCALE})` : "scale(1)",
                        transformOrigin: `${origin.x}% ${origin.y}%`,
                    }}
                />
            </div>

            {/* Panel inferior de auditoría */}
            {hasPanel && (
                <div
                    className="shrink-0 bg-black/80 backdrop-blur-md border-t border-white/10 px-3 pt-2.5 pb-3 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Código de envío y orden */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 bg-slate-700/80 text-slate-200 text-[10px] font-black px-2 py-0.5 rounded-md">
                            <Barcode className="h-3 w-3" /> ENVÍO: {envioId}
                        </span>
                        {envioData?.orderId && (
                            <span className="bg-orange-900/60 text-orange-300 text-[10px] font-black px-2 py-0.5 rounded-md">
                                ORDEN: {envioData.orderId}
                            </span>
                        )}
                    </div>

                    {/* Agregados */}
                    {allNombres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-[72px] overflow-y-auto">
                            {allNombres.map(({ nombre, colorIdx }, idx) => (
                                <div key={idx} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border-b-2 font-black text-[10px] uppercase shadow-sm ${getAgregadoColor(colorIdx)}`}>
                                    <Layers className="h-3 w-3 shrink-0 opacity-80" />
                                    <span>{renderTextWithQuantity(nombre)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Botones */}
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant="outline"
                            className="h-12 border-2 border-red-500 text-red-400 font-bold hover:bg-red-900/30 bg-transparent"
                            onClick={() => onReject!(envioId!)}
                            disabled={!!loading}
                        >
                            <X className="mr-2 h-5 w-5" /> RECHAZAR
                        </Button>
                        <Button
                            className="h-12 bg-green-600 font-bold shadow-lg hover:bg-green-700"
                            onClick={() => onApprove!(envioId!)}
                            disabled={!!loading}
                        >
                            {loading === envioId
                                ? <Loader2 className="animate-spin" />
                                : <><CheckCircle2 className="mr-2 h-5 w-5" /> APROBAR</>
                            }
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

export function PreparacionClient({ initialEnvios }: { initialEnvios: any[] }) {
    const [activeTab, setActiveTab] = useState<'pendientes' | 'revision'>('pendientes')
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState<string | null>(null)
    const [isFetchingFotos, setIsFetchingFotos] = useState(false)
    const [viewingFotos, setViewingFotos] = useState<{id: string, fotos: any[], envioData: any} | null>(null)
    const [activeFoto, setActiveFoto] = useState<string | null>(null)
    const [expandedImage, setExpandedImage] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Deep-link desde la notificación "Ir a ver": abre la pestaña de auditoría filtrada al envío.
    useEffect(() => {
        const envio = new URLSearchParams(window.location.search).get("envio")
        if (envio) {
            setActiveTab('revision')
            setSearch(envio)
        }
    }, [])

    const [selectedItem, setSelectedItem] = useState<{envioId: string, itemId: string, mla: string} | null>(null)

    const [showScanner, setShowScanner] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)

    const [comentarios, setComentarios] = useState<any[]>([])
    const [showModalComentario, setShowModalComentario] = useState(false)
    const [nuevoComentario, setNuevoComentario] = useState({ orderId: '', packId: '', texto: '' })
    const [guardandoComentario, setGuardandoComentario] = useState(false)

    useEffect(() => {
        if (showScanner) {
            const startScanner = async () => {
                await new Promise(r => setTimeout(r, 400));
                const element = document.getElementById("barcode-reader");
                if (!element) return;

                const html5QrCode = new Html5Qrcode("barcode-reader");
                scannerRef.current = html5QrCode;

                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        {
                            fps: 10,
                            qrbox: { width: 280, height: 150 },
                        },
                        (decodedText) => {
                            setSearch(decodedText);
                            setShowScanner(false);
                            toast.success(`Pedido detectado: ${decodedText}`);
                            stopScanner();
                        },
                        () => {}
                    );
                } catch (err) {
                    console.error("Error scanner:", err);
                    toast.error("No se pudo acceder a la cámara");
                    setShowScanner(false);
                }
            };
            startScanner();
        } else {
            stopScanner();
        }
        return () => { stopScanner(); };
    }, [showScanner]);

    useEffect(() => {
        const fetchComentarios = async () => {
            const res = await getComentariosML()
            if (res.success) setComentarios(res.comentarios)
        }
        fetchComentarios()
        const interval = setInterval(fetchComentarios, 12000)
        return () => clearInterval(interval)
    }, [])

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
            } catch (err) {
                console.error("Error al detener scanner:", err);
            }
        }
    };

    const getComentariosForEnvio = (envio: any) =>
        comentarios.filter(c =>
            (c.orderId && envio.orderId && c.orderId === envio.orderId) ||
            (c.packId && envio.packId && c.packId === envio.packId)
        )

    const handleCrearComentario = async () => {
        if (!nuevoComentario.orderId?.trim() && !nuevoComentario.packId?.trim()) {
            toast.error("Ingresá al menos un ID de orden o pack")
            return
        }
        if (!nuevoComentario.texto.trim()) {
            toast.error("El comentario no puede estar vacío")
            return
        }
        setGuardandoComentario(true)
        const res = await crearComentarioML(nuevoComentario)
        if (res.success) {
            toast.success("Nota guardada")
            setShowModalComentario(false)
            setNuevoComentario({ orderId: '', packId: '', texto: '' })
            const fresh = await getComentariosML()
            if (fresh.success) setComentarios(fresh.comentarios)
        } else {
            toast.error(res.error || "Error al guardar la nota")
        }
        setGuardandoComentario(false)
    }

    const handleMarcarLeido = async (comentarioId: string) => {
        await marcarComentarioMLLeido(comentarioId)
        setComentarios(prev => prev.map(c => c.id === comentarioId ? { ...c, leido: true } : c))
    }

    const filtered = initialEnvios.filter(e => {
        const shipId = e.id?.toString() || "";
        const orderId = e.orderId?.toString() || "";
        
        const matchesSearch = shipId.includes(search) || 
                             e.resumen?.toLowerCase().includes(search.toLowerCase()) ||
                             orderId.includes(search);

        const tieneFoto = Boolean(e.drivePhotoUrl);
        const yaAuditado = e.status === "AUDITADO";

        if (activeTab === 'pendientes') {
            return matchesSearch && !yaAuditado;
        } else {
            return matchesSearch && tieneFoto && !yaAuditado;
        }
    })

    const auditoriaCount = initialEnvios.filter(e => Boolean(e.drivePhotoUrl) && e.status !== "AUDITADO").length

    const unreadComentariosCount = initialEnvios.reduce((acc, envio) =>
        acc + comentarios.filter(c =>
            !c.leido && (
                (c.orderId && envio.orderId && c.orderId === envio.orderId) ||
                (c.packId && envio.packId && c.packId === envio.packId)
            )
        ).length
    , 0)

    const handleTriggerCamera = (envioId: string, itemId: string, mla: string) => {
        setSelectedItem({ envioId, itemId, mla })
        fileInputRef.current?.click()
    }

    const handleOpenViewer = async (envio: any) => {
        setIsFetchingFotos(true)
        try {
            const res = await obtenerFotosEnvio(envio.id)
            if (res.success) {
                setViewingFotos({ id: envio.id, fotos: res.fotos, envioData: envio })
                setActiveFoto(res.fotos[0]?.url || null)
            } else {
                toast.error("Error al cargar fotos")
            }
        } catch (err) {
            toast.error("Fallo la conexión con el servidor de imágenes")
        } finally {
            setIsFetchingFotos(false)
        }
    }

    const handleApprove = async (envioId: string) => {
        setLoading(envioId)
        const res = await aprobarPedido(envioId)
        if (res.success) {
            toast.success("Pedido aprobado y auditado")
            setViewingFotos(null)
        } else {
            toast.error("Error al aprobar")
        }
        setLoading(null)
    }

    const handleReject = async (envioId: string) => {
        if(!confirm("¿Deseas rechazar este pedido? Volverá a la lista de preparación.")) return;
        setLoading(envioId)
        const res = await rechazarPedido(envioId)
        if (res.success) {
            toast.warning("Pedido rechazado.")
            setViewingFotos(null)
        } else {
            toast.error("Error al rechazar")
        }
        setLoading(null)
    }

    const compressImage = (file: File): Promise<Blob> =>
        new Promise((resolve, reject) => {
            const img = new window.Image()
            img.onload = () => {
                const MAX = 1400
                let { width, height } = img
                if (width > MAX || height > MAX) {
                    if (width > height) { height = Math.round(height / width * MAX); width = MAX }
                    else { width = Math.round(width / height * MAX); height = MAX }
                }
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.82)
            }
            img.onerror = reject
            img.src = URL.createObjectURL(file)
        })

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]

        if (!file) return;
        if (!selectedItem) {
            toast.error("Error: No se detectó el pedido seleccionado.");
            return;
        }

        setLoading(selectedItem.envioId)
        const blob = await compressImage(file).catch(() => file)
        const formData = new FormData()
        formData.append('photo', blob, 'foto.jpg')
        formData.append('envioId', selectedItem.envioId)
        formData.append('itemId', selectedItem.itemId)
        formData.append('mla', selectedItem.mla)

        try {
            const res = await subirFotoAuditoria(formData)
            if (res.success) {
                toast.success("Foto guardada con éxito.")
            } else {
                toast.error(`Fallo al subir: ${res.error || 'Error desconocido'}`);
            }
        } catch (err) {
            toast.error("Error de red. Verifica tu señal o internet.");
        } finally {
            setLoading(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    if (viewingFotos) {
        const envio = viewingFotos.envioData;
        return (
            <div className="max-w-5xl mx-auto p-4 space-y-6 w-full animate-in fade-in">
                {expandedImage && (
                    <ZoomViewer
                        src={expandedImage}
                        onClose={() => setExpandedImage(null)}
                        envioId={viewingFotos.id}
                        envioData={viewingFotos.envioData}
                        loading={loading}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                )}
                <Button variant="outline" onClick={() => { setViewingFotos(null); setActiveFoto(null); }}><ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista</Button>
                
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        {activeFoto ? (
                            <>
                                <div className="aspect-square bg-white border rounded-2xl overflow-hidden cursor-zoom-in relative group" onClick={() => setExpandedImage(activeFoto)}>
                                    <Image src={activeFoto} fill sizes="(max-width: 768px) 100vw, 512px" className="object-contain" alt="Evidencia" priority />
                                    <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 font-bold z-10">
                                        FOTO {viewingFotos.fotos.findIndex((f: any) => f.url === activeFoto) + 1} / {viewingFotos.fotos.length}
                                        <Maximize2 className="h-3 w-3" />
                                    </div>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {viewingFotos.fotos.map((foto: any, i: number) => (
                                        <div key={i} className={`relative h-20 w-20 shrink-0 rounded-xl cursor-pointer border-2 transition-all overflow-hidden ${activeFoto === foto.url ? 'border-blue-500 scale-95' : 'border-transparent opacity-60'}`} onClick={() => setActiveFoto(foto.url)}>
                                            <Image src={foto.url} fill sizes="80px" className="object-cover" alt="Thumbnail" />
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="aspect-square bg-gray-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                                <AlertTriangle className="h-12 w-12 mb-4 opacity-20" />
                                <p className="font-medium">No hay fotos</p>
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                            <Button variant="outline" className="h-16 border-red-500 text-red-600 font-bold hover:bg-red-50" onClick={() => handleReject(viewingFotos.id)} disabled={!!loading}><X className="mr-2 h-6 w-6" /> RECHAZAR</Button>
                            <Button className="h-16 bg-green-600 font-bold shadow-lg hover:bg-green-700" onClick={() => handleApprove(viewingFotos.id)} disabled={!!loading}>{loading === viewingFotos.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2 h-6 w-6" />} APROBAR</Button>
                        </div>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                            <div>
                                <h2 className="text-xl font-bold mb-1">Envío: {envio.id}</h2>
                                <div className="flex gap-2 mb-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ORDEN: {envio.orderId || 'S/N'}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                        {getLogisticName(envio.logisticType)}
                                    </span>
                                </div>
                                
                                <p className="text-sm font-medium text-slate-700 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    {renderTextWithQuantity(envio.resumen)}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-500 uppercase">Artículos incluidos:</h3>
                                {envio.items.map((item: any, idx: number) => {
                                    const rawNames = item.agregadoInfo?.nombres_articulos || item.title;
                                    const nombres = rawNames.split(/[,\+\|\n]/).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
                                    
                                    return (
                                        <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="flex flex-col gap-2">
                                                {nombres.map((nombre: string, nIdx: number) => (
                                                    <div key={nIdx} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-b-4 font-black text-xs uppercase shadow-sm w-fit max-w-full ${getAgregadoColor(nIdx)}`}>
                                                        <Layers className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                                        <span className="break-words">{renderTextWithQuantity(nombre)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 text-xs text-slate-500 flex gap-4">
                                                <span>SKU: <span className="font-bold">{item.sellerSku || 'N/A'}</span></span>
                                                <span>Cant: <span className="font-bold">{item.quantity || 1}</span></span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4 w-full">
            {/* Tabs fijas compactas */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 sticky top-[80px] z-10 shadow-sm border border-slate-200 w-full">
                <button 
                    onClick={() => setActiveTab('pendientes')}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'pendientes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                    1. Preparación
                </button>
                <button 
                    onClick={() => setActiveTab('revision')}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'revision' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                    2. Auditoría Manual
                    {auditoriaCount > 0 && (
                        <span className="bg-orange-500 text-white text-[10px] px-1.5 rounded-full min-w-[18px]">
                            {auditoriaCount}
                        </span>
                    )}
                </button>
            </div>

            {/* SECCIÓN DEL BUSCADOR: Padding ajustado a p-4 para igualar las tarjetas */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-md flex gap-2 items-center w-full">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input 
                        placeholder="Escanear o buscar..." 
                        className="pl-10 h-12 rounded-xl border-none bg-slate-50 focus-visible:ring-blue-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                            <X className="h-4 w-4 text-slate-400" />
                        </button>
                    )}
                </div>
                <Button
                    variant="outline"
                    className="h-12 w-12 rounded-xl border-slate-200 bg-white shadow-sm flex items-center justify-center p-0 shrink-0 hover:bg-slate-50"
                    onClick={() => setShowScanner(true)}
                >
                    <Barcode className="h-6 w-6 text-slate-600" />
                </Button>
                <Button
                    variant="outline"
                    className={`h-12 w-12 rounded-xl shadow-sm flex items-center justify-center p-0 shrink-0 relative ${unreadComentariosCount > 0 ? 'border-amber-400 bg-amber-50 hover:bg-amber-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
                    onClick={() => setShowModalComentario(true)}
                >
                    <StickyNote className="h-6 w-6 text-amber-600" />
                    {unreadComentariosCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-black min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                            {unreadComentariosCount}
                        </span>
                    )}
                </Button>
            </div>

            {/* Listado de Pedidos */}
            <div className="grid gap-3 w-full">
                {filtered.length === 0 && (
                    <div className="text-center py-10 text-slate-400">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="text-sm font-medium">No hay pedidos en esta lista</p>
                    </div>
                )}

                {filtered.map((envio) => {
                    const tieneFoto = Boolean(envio.drivePhotoUrl);
                    
                    return (
                        <div key={envio.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md w-full overflow-hidden">
                            <div className="flex justify-between items-start mb-2">
                                <div className="space-y-1 overflow-hidden w-full">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="bg-orange-100 text-orange-700 text-[11px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <Hash className="h-3 w-3" />
                                            ORDEN: {envio.orderId || 'S/N'}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                            {getLogisticName(envio.logisticType)}
                                        </span>
                                        {tieneFoto && (
                                            <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                                <CheckCircle2 className="h-3 w-3" /> FOTO OK
                                            </span>
                                        )}
                                    </div>
                                    {/* SE ELIMINÓ 'truncate' PARA MOSTRAR TÍTULO COMPLETO */}
                                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                                        {renderTextWithQuantity(envio.resumen)}
                                    </h3>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-4 text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 w-fit">
                                <Barcode className="h-4 w-4" />
                                <span className="text-xs font-mono font-bold tracking-wider">ENVÍO: {envio.id}</span>
                            </div>

                            {tieneFoto && (
                                <Button 
                                    variant="secondary" 
                                    className="w-full mb-4 gap-2 bg-blue-50 text-blue-700 border-none hover:bg-blue-100 h-11 rounded-xl font-bold transition-colors"
                                    onClick={() => handleOpenViewer(envio)}
                                    disabled={isFetchingFotos}
                                >
                                    {isFetchingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4" /> REVISAR FOTOS</>}
                                </Button>
                            )}

                            <div className="space-y-4 pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Artículos para Preparar:</p>
                                {envio.items.map((item: any) => {
                                    const rawNames = item.agregadoInfo?.nombres_articulos || item.title;
                                    const nombres = rawNames.split(/[,\+\|\n]/).map((n: string) => n.trim()).filter((n: string) => n.length > 0);

                                    return (
                                        <div key={item.id} className="flex items-center justify-between gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 overflow-hidden">
                                            <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
                                                {nombres.map((nombre: string, idx: number) => (
                                                    <div key={idx} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-b-4 font-black text-xs uppercase shadow-sm w-fit max-w-full ${getAgregadoColor(idx)}`}>
                                                        <Layers className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                                        {/* SE ELIMINÓ 'truncate' PARA MOSTRAR TÍTULO COMPLETO */}
                                                        <span className="break-words">{renderTextWithQuantity(nombre)}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="rounded-full h-12 w-12 border-2 shrink-0 transition-all bg-white text-blue-600 border-blue-100 shadow-sm active:scale-90"
                                                onClick={() => handleTriggerCamera(envio.id, item.id, item.mla)}
                                                disabled={loading === envio.id}
                                            >
                                                {loading === envio.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>

                            {(() => {
                                const notas = getComentariosForEnvio(envio)
                                if (notas.length === 0) return null
                                return (
                                    <div className="mt-3 space-y-2">
                                        {notas.map((nota: any) => (
                                            <div key={nota.id} className={`p-3 rounded-xl border flex items-start gap-2 transition-all ${nota.leido ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-amber-50 border-amber-200'}`}>
                                                <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${nota.leido ? 'text-slate-400' : 'text-amber-600'}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${nota.leido ? 'text-slate-400' : 'text-amber-700'}`}>
                                                        Nota · {nota.creadoPor}
                                                    </p>
                                                    <p className={`text-sm ${nota.leido ? 'text-slate-500' : 'text-amber-900'}`}>{nota.texto}</p>
                                                </div>
                                                {!nota.leido && (
                                                    <button
                                                        onClick={() => handleMarcarLeido(nota.id)}
                                                        className="text-[10px] font-bold text-amber-500 hover:text-amber-700 whitespace-nowrap shrink-0 mt-0.5"
                                                    >
                                                        Leído ✓
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            })()}
                        </div>
                    )
                })}
            </div>

            {/* Modal del Scanner */}
            {/* Scanner se mantiene como modal ya que requiere DOM element renderizado sobre lo actual */}
            <Dialog open={showScanner} onOpenChange={setShowScanner}>
                <DialogContent className="p-0 overflow-hidden bg-black border-none sm:max-w-md">
                    <DialogHeader className="p-4 bg-slate-900 text-white flex-row justify-between items-center space-y-0">
                        <DialogTitle className="text-base flex items-center gap-2">
                            <Barcode className="h-5 w-5" /> Escaneando Etiqueta
                        </DialogTitle>
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setShowScanner(false)}>
                            <X className="h-5 w-5" />
                        </Button>
                    </DialogHeader>
                    <div className="relative aspect-video bg-black flex items-center justify-center">
                        <div id="barcode-reader" className="w-full h-full"></div>
                        <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/30 m-8 rounded-lg">
                            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500"></div>
                            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500"></div>
                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500"></div>
                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500"></div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal de nota de pedido */}
            <Dialog open={showModalComentario} onOpenChange={setShowModalComentario}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <StickyNote className="h-5 w-5 text-amber-500" />
                            Agregar nota de pedido
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-1">
                        <p className="text-xs text-slate-500">Ingresá el ID de orden o pack de MercadoLibre. Con uno solo alcanza.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">ID Orden</label>
                                <Input
                                    placeholder="Ej: 2000012345678"
                                    value={nuevoComentario.orderId}
                                    onChange={(e) => setNuevoComentario(prev => ({ ...prev, orderId: e.target.value }))}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">ID Pack</label>
                                <Input
                                    placeholder="Ej: 2000011111"
                                    value={nuevoComentario.packId}
                                    onChange={(e) => setNuevoComentario(prev => ({ ...prev, packId: e.target.value }))}
                                    className="h-10"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase">Nota para el operario</label>
                            <textarea
                                className="w-full min-h-[100px] p-3 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-50"
                                placeholder="Ej: Mandame la leva con 7.8 de alzada..."
                                value={nuevoComentario.texto}
                                onChange={(e) => setNuevoComentario(prev => ({ ...prev, texto: e.target.value }))}
                            />
                        </div>
                        <Button
                            className="w-full h-11 bg-amber-500 hover:bg-amber-600 font-bold text-white"
                            onClick={handleCrearComentario}
                            disabled={guardandoComentario}
                        >
                            {guardandoComentario ? <Loader2 className="animate-spin h-4 w-4" /> : 'Guardar nota'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>
    )
}
