"use client"

import { useState, useRef, useEffect } from "react"
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
    Hash 
} from "lucide-react"
import { 
    subirFotoAuditoria, 
    aprobarPedido, 
    rechazarPedido, 
    obtenerFotosEnvio 
} from "@/app/actions/preparacion"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel"

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

export function PreparacionClient({ initialEnvios }: { initialEnvios: any[] }) {
    const [activeTab, setActiveTab] = useState<'pendientes' | 'revision'>('pendientes')
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState<string | null>(null)
    const [isFetchingFotos, setIsFetchingFotos] = useState(false)
    const [viewingFotos, setViewingFotos] = useState<{id: string, fotos: any[]} | null>(null)
    const [zoom, setZoom] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    
    const [selectedItem, setSelectedItem] = useState<{envioId: string, itemId: string, mla: string} | null>(null)
    const [showScanner, setShowScanner] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)

    useEffect(() => {
        if (showScanner) {
            const startScanner = async () => {
                await new Promise(r => setTimeout(r, 100));
                const html5QrCode = new Html5Qrcode("barcode-reader");
                scannerRef.current = html5QrCode;
                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        { fps: 10, qrbox: { width: 280, height: 150 } },
                        (decodedText) => {
                            setSearch(decodedText);
                            setShowScanner(false);
                            toast.success(`Pedido detectado: ${decodedText}`);
                            stopScanner();
                        },
                        () => {}
                    );
                } catch (err) {
                    toast.error("Error de cámara");
                    setShowScanner(false);
                }
            };
            startScanner();
        } else {
            stopScanner();
        }
        return () => { stopScanner(); };
    }, [showScanner]);

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            await scannerRef.current.stop();
            scannerRef.current = null;
        }
    };

    const filtered = initialEnvios.filter(e => {
        const matchesSearch = e.id.includes(search) || 
                             e.resumen?.toLowerCase().includes(search.toLowerCase()) ||
                             e.orderId?.includes(search);
        const yaAuditado = e.status === "AUDITADO";
        if (activeTab === 'pendientes') return matchesSearch && !yaAuditado;
        return matchesSearch && Boolean(e.drivePhotoUrl) && !yaAuditado;
    })

    const auditoriaCount = initialEnvios.filter(e => Boolean(e.drivePhotoUrl) && e.status !== "AUDITADO").length;

    const handleOpenViewer = async (envioId: string) => {
        setIsFetchingFotos(true)
        try {
            const res = await obtenerFotosEnvio(envioId)
            if (res.success) setViewingFotos({ id: envioId, fotos: res.fotos })
            else toast.error("Error al cargar fotos")
        } catch (err) {
            toast.error("Error de red")
        } finally {
            setIsFetchingFotos(false)
        }
    }

    const handleApprove = async (envioId: string) => {
        setLoading(envioId)
        const res = await aprobarPedido(envioId)
        if (res.success) {
            toast.success("Pedido aprobado")
            setViewingFotos(null)
        } else toast.error("Error al aprobar")
        setLoading(null)
    }

    const handleReject = async (envioId: string) => {
        if(!confirm("¿Rechazar pedido?")) return;
        setLoading(envioId)
        const res = await rechazarPedido(envioId)
        if (res.success) {
            toast.warning("Rechazado")
            setViewingFotos(null)
        } else toast.error("Error")
        setLoading(null)
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedItem) return;
        setLoading(selectedItem.envioId)
        const formData = new FormData()
        formData.append('photo', file)
        formData.append('envioId', selectedItem.envioId)
        formData.append('itemId', selectedItem.itemId)
        formData.append('mla', selectedItem.mla)
        try {
            const res = await subirFotoAuditoria(formData)
            if (res.success) toast.success("Foto guardada.");
            else toast.error("Error al subir");
        } catch (err) {
            toast.error("Error de red");
        } finally {
            setLoading(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-4">
            {/* Navegación Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 sticky top-[72px] z-10 shadow-sm border border-slate-200">
                <button 
                    onClick={() => setActiveTab('pendientes')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'pendientes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                    1. Preparación
                </button>
                <button 
                    onClick={() => setActiveTab('revision')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'revision' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                    2. Auditoría
                    {auditoriaCount > 0 && (
                        <span className="bg-orange-500 text-white text-[9px] px-1.5 rounded-full">
                            {auditoriaCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Buscador y Scanner */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                        placeholder="Buscar..." 
                        className="pl-9 h-11 rounded-xl border-slate-200 bg-white text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="h-11 w-11 rounded-xl bg-white" onClick={() => setShowScanner(true)}>
                    <Barcode className="h-5 w-5 text-slate-600" />
                </Button>
            </div>

            {/* Listado */}
            <div className="grid gap-3">
                {filtered.map((envio) => {
                    const tieneFoto = Boolean(envio.drivePhotoUrl);
                    return (
                        <div key={envio.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded-md">
                                            #{envio.orderId || 'S/N'}
                                        </span>
                                        {tieneFoto && <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-md">FOTO OK</span>}
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                        {renderTextWithQuantity(envio.resumen)}
                                    </h3>
                                </div>
                            </div>

                            {tieneFoto && (
                                <Button 
                                    variant="secondary" 
                                    className="w-full mb-3 bg-blue-50 text-blue-700 h-10 rounded-xl text-xs font-bold"
                                    onClick={() => handleOpenViewer(envio.id)}
                                    disabled={isFetchingFotos}
                                >
                                    {isFetchingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4 mr-2" /> REVISAR FOTOS</>}
                                </Button>
                            )}

                            <div className="space-y-2 pt-2 border-t">
                                {envio.items.map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                        <span className="text-[11px] font-bold uppercase text-slate-600 truncate flex-1">
                                            {item.agregadoInfo?.nombres_articulos || item.title}
                                        </span>
                                        <Button 
                                            size="icon"
                                            className="rounded-full h-10 w-10 shrink-0 bg-blue-600 text-white"
                                            onClick={() => { setSelectedItem({ envioId: envio.id, itemId: item.id, mla: item.mla }); fileInputRef.current?.click(); }}
                                            disabled={loading === envio.id}
                                        >
                                            {loading === envio.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* --- VISOR DE FOTOS ULTRA COMPACTO --- */}
            <Dialog open={!!viewingFotos} onOpenChange={() => { setViewingFotos(null); setZoom(false); }}>
                <DialogContent className="p-0 overflow-hidden bg-slate-950 border-none w-[96vw] max-w-2xl h-[80vh] flex flex-col rounded-2xl shadow-2xl">
                    {/* Header Compacto */}
                    <DialogHeader className="p-2.5 bg-slate-900 border-b border-white/10 flex-row justify-between items-center space-y-0 flex-none z-20">
                        <DialogTitle className="text-white text-[11px] font-bold uppercase tracking-wider ml-2">Envío: {viewingFotos?.id}</DialogTitle>
                        <Button variant="ghost" size="icon" className="text-white h-7 w-7 hover:bg-white/10" onClick={() => setViewingFotos(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogHeader>
                    
                    {/* Área de Imagen Dinámica */}
                    <div className="flex-1 min-h-0 relative bg-black flex flex-col items-center justify-center overflow-hidden">
                        {viewingFotos?.fotos.length ? (
                            <Carousel className="w-full h-full flex items-center justify-center">
                                <CarouselContent className="h-full ml-0">
                                    {viewingFotos.fotos.map((foto: any) => (
                                        <CarouselItem key={foto.id} className="h-full pl-0 flex items-center justify-center">
                                            <div 
                                                className={`h-full w-full flex items-center justify-center p-1 transition-transform duration-300 ease-out ${zoom ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'}`} 
                                                onClick={() => setZoom(!zoom)}
                                            >
                                                <img 
                                                    src={foto.url} 
                                                    alt="Audit" 
                                                    className="max-h-full max-w-full w-auto h-auto object-contain shadow-2xl rounded-sm" 
                                                />
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                {viewingFotos.fotos.length > 1 && !zoom && (
                                    <>
                                        <CarouselPrevious className="left-2 bg-black/40 border-none text-white h-8 w-8" />
                                        <CarouselNext className="right-2 bg-black/40 border-none text-white h-8 w-8" />
                                    </>
                                )}
                            </Carousel>
                        ) : (
                            <div className="flex flex-col items-center text-white/30">
                                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                                <span className="text-[10px]">Cargando...</span>
                            </div>
                        )}
                    </div>
                    
                    {/* Botonera Inferior Compacta */}
                    <div className="p-3 bg-slate-900/95 border-t border-white/10 grid grid-cols-4 gap-2 flex-none z-20">
                        <Button 
                            variant="destructive" 
                            className="col-span-1 h-11 rounded-xl bg-red-600/20 text-red-500 border-red-500/20"
                            onClick={() => handleReject(viewingFotos?.id!)}
                            disabled={loading === viewingFotos?.id}
                        >
                            <AlertTriangle className="h-5 w-5" />
                        </Button>
                        <Button 
                            className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white h-11 rounded-xl font-black text-sm shadow-lg" 
                            onClick={() => handleApprove(viewingFotos?.id!)} 
                            disabled={loading === viewingFotos?.id}
                        >
                            {loading === viewingFotos?.id ? <Loader2 className="animate-spin" /> : <><CheckCircle2 className="mr-2 h-5 w-5" /> APROBAR</>}
                        </Button>
                        <Button 
                            variant="outline" 
                            className="col-span-1 h-11 rounded-xl border-white/20 text-white bg-white/5" 
                            onClick={() => setZoom(!zoom)}
                        >
                            <Search className="h-5 w-5" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>
    )
}
