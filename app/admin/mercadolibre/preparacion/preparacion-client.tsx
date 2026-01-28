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
    ZoomIn,
    ZoomOut
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

export function PreparacionClient({ initialEnvios }: { initialEnvios: any[] }) {
    const [activeTab, setActiveTab] = useState<'pendientes' | 'revision'>('pendientes')
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState<string | null>(null)
    const [isFetchingFotos, setIsFetchingFotos] = useState(false)
    const [viewingFotos, setViewingFotos] = useState<{id: string, fotos: any[]} | null>(null)
    const [zoom, setZoom] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedItem, setSelectedItem] = useState<any>(null)

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

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            await scannerRef.current.stop();
            scannerRef.current = null;
        }
    };

    const filtered = initialEnvios.filter(e => {
        const matchesSearch = e.id.includes(search) || 
                             e.resumen?.toLowerCase().includes(search.toLowerCase())
        if (activeTab === 'pendientes') {
            return matchesSearch && (e.status === "PENDIENTE")
        } else {
            return matchesSearch && e.status === "PREPARADO"
        }
    })

    const handleTriggerCamera = (envioId: string, mla: string) => {
        setSelectedItem({ envioId, mla })
        fileInputRef.current?.click()
    }

    const handleOpenViewer = async (envioId: string) => {
        setIsFetchingFotos(true)
        try {
            const res = await obtenerFotosEnvio(envioId)
            if (res.success) {
                setViewingFotos({ id: envioId, fotos: res.fotos })
            } else {
                toast.error("Error al cargar fotos")
            }
        } catch (err) {
            toast.error("Fallo la conexión con Drive")
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
        if(!confirm("¿Deseas rechazar este pedido? Se borrará el estado 'Preparado' y volverá a la lista para sacar fotos de nuevo.")) return;
        setLoading(envioId)
        const res = await rechazarPedido(envioId)
        if (res.success) {
            toast.warning("Pedido rechazado. Volvió a Preparación.")
            setViewingFotos(null)
        } else {
            toast.error("Error al rechazar")
        }
        setLoading(null)
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedItem) return
        setLoading(selectedItem.envioId)
        const formData = new FormData()
        formData.append('photo', file)
        formData.append('envioId', selectedItem.envioId)
        formData.append('mla', selectedItem.mla)
        try {
            const res = await subirFotoAuditoria(formData)
            if (res.success) toast.success("Foto guardada. Pedido en revisión.")
        } catch (err) {
            toast.error("Error al subir")
        } finally {
            setLoading(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-4">
            {/* TABS Y BUSCADOR (Igual que antes) */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 sticky top-[72px] z-10 shadow-sm border border-slate-200">
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
                    {initialEnvios.filter(e => e.status === 'PREPARADO').length > 0 && (
                        <span className="bg-orange-500 text-white text-[10px] px-1.5 rounded-full min-w-[18px]">
                            {initialEnvios.filter(e => e.status === 'PREPARADO').length}
                        </span>
                    )}
                </button>
            </div>

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input 
                        placeholder="Escanear o buscar..." 
                        className="pl-10 h-12 rounded-xl border-slate-200 shadow-sm bg-white focus-visible:ring-blue-500"
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
                    className="h-12 w-12 rounded-xl border-slate-200 bg-white shadow-sm flex items-center justify-center p-0 shrink-0"
                    onClick={() => setShowScanner(true)}
                >
                    <Barcode className="h-6 w-6 text-slate-600" />
                </Button>
            </div>

            <div className="grid gap-3">
                {filtered.map((envio) => (
                    <div key={envio.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{envio.logisticType}</span>
                                <h3 className="font-bold text-slate-900 leading-none mt-1">{envio.id}</h3>
                            </div>
                            <div className="flex gap-2">
                                <Button 
                                    size="icon"
                                    variant="outline"
                                    className={`rounded-full h-12 w-12 border-2 ${envio.status === 'PREPARADO' ? 'border-orange-200 bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-600'}`}
                                    onClick={() => handleTriggerCamera(envio.id, envio.items[0]?.mla)}
                                    disabled={loading === envio.id}
                                >
                                    {loading === envio.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                </Button>
                            </div>
                        </div>
                        {envio.status === "PREPARADO" && (
                            <Button 
                                variant="secondary" 
                                className="w-full mb-4 gap-2 bg-blue-50 text-blue-700 border-none hover:bg-blue-100 h-11 rounded-xl font-bold transition-colors"
                                onClick={() => handleOpenViewer(envio.id)}
                                disabled={isFetchingFotos}
                            >
                                {isFetchingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4" /> REVISAR Y AUDITAR</>}
                            </Button>
                        )}
                        <div className="space-y-2 mb-4">
                            {envio.items.map((item: any) => {
                                const rawNames = item.agregadoInfo?.nombres_articulos || item.title;
                                const nombres = rawNames.split(/[,\+\|\n]/).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
                                return (
                                    <div key={item.id} className="flex flex-col gap-1.5">
                                        {nombres.map((nombre: string, idx: number) => (
                                            <div key={idx} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-b-4 font-black text-xs uppercase shadow-sm w-fit max-w-full ${getAgregadoColor(idx)}`}>
                                                <Layers className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                                <span className="truncate">{nombre}</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex items-center gap-2 px-1 pt-2 border-t border-slate-50">
                            <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <p className="text-[11px] text-slate-500 truncate italic font-medium">{envio.resumen}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL SCANNER */}
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
                        <div className="absolute inset-0 border-2 border-blue-500/30 pointer-events-none flex items-center justify-center">
                            <div className="w-[80%] h-[40%] border-2 border-blue-400 rounded-lg shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]"></div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-900 flex justify-center">
                        <Button variant="secondary" onClick={() => setShowScanner(false)} className="w-full">Cancelar</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* --- AQUÍ ESTÁ EL CAMBIO CLAVE: VISOR INMERSIVO --- */}
            <Dialog open={!!viewingFotos} onOpenChange={() => { setViewingFotos(null); setZoom(false); }}>
                <DialogContent className="w-screen h-screen max-w-none m-0 p-0 border-none bg-black flex flex-col relative overflow-hidden">
                    
                    {/* Botón Cerrar (Flotante arriba derecha) */}
                    <button 
                        className="absolute top-4 right-4 z-50 bg-black/40 backdrop-blur-md text-white p-2 rounded-full border border-white/20 hover:bg-white/20 transition-all"
                        onClick={() => setViewingFotos(null)}
                    >
                        <X className="h-6 w-6" />
                    </button>

                    {/* Botón Zoom (Flotante arriba izquierda) */}
                    <button 
                        className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md text-white p-2 rounded-full border border-white/20 hover:bg-white/20 transition-all"
                        onClick={() => setZoom(!zoom)}
                    >
                        {zoom ? <ZoomOut className="h-6 w-6" /> : <ZoomIn className="h-6 w-6" />}
                    </button>

                    {/* Contenedor de Imagen (Ocupa todo el espacio detrás) */}
                    <div className="flex-1 w-full h-full relative flex items-center justify-center bg-black">
                        {viewingFotos?.fotos.length ? (
                            <Carousel className="w-full h-full">
                                <CarouselContent className="h-full ml-0">
                                    {viewingFotos.fotos.map((foto: any) => (
                                        <CarouselItem key={foto.id} className="h-full w-full pl-0 basis-full">
                                            {/* Lógica de Zoom:
                                                - Sin Zoom: h-full w-full object-contain (Se ve la foto ENTERA sin cortes)
                                                - Con Zoom: w-auto h-auto (Se ve en tamaño real y scrolleas)
                                            */}
                                            <div className={`w-full h-full flex items-center justify-center ${zoom ? 'overflow-auto' : 'overflow-hidden'}`}>
                                                <img 
                                                    src={foto.url} 
                                                    alt="Auditoría" 
                                                    className={`transition-all duration-300 select-none ${
                                                        zoom 
                                                            ? 'min-w-full min-h-full w-auto h-auto object-cover cursor-zoom-out' 
                                                            : 'w-full h-full object-contain cursor-zoom-in'
                                                    }`} 
                                                    onClick={() => setZoom(!zoom)}
                                                />
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                {viewingFotos.fotos.length > 1 && !zoom && (
                                    <>
                                        <CarouselPrevious className="left-4 bg-white/10 hover:bg-white/20 border-none text-white h-12 w-12" />
                                        <CarouselNext className="right-4 bg-white/10 hover:bg-white/20 border-none text-white h-12 w-12" />
                                    </>
                                )}
                            </Carousel>
                        ) : (
                            <div className="text-center text-white/40">
                                <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin opacity-50" />
                                <p>Cargando foto...</p>
                            </div>
                        )}
                    </div>
                    
                    {/* BOTONES FLOTANTES (Overlay)
                        Están en absolute bottom-0 para flotar sobre la imagen sin empujarla
                    */}
                    <div className="absolute bottom-0 left-0 right-0 z-40 p-6 pt-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center gap-4">
                        <Button 
                            variant="destructive" 
                            className="h-14 w-14 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-lg border border-red-400/30 flex items-center justify-center shrink-0"
                            onClick={() => handleReject(viewingFotos?.id!)}
                            disabled={loading === viewingFotos?.id}
                        >
                            <AlertTriangle className="h-6 w-6" />
                        </Button>

                        <Button 
                            className="flex-1 h-14 rounded-full bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-lg shadow-lg border border-emerald-400/30 backdrop-blur-sm max-w-sm" 
                            onClick={() => handleApprove(viewingFotos?.id!)} 
                            disabled={loading === viewingFotos?.id}
                        >
                            {loading === viewingFotos?.id ? <Loader2 className="animate-spin" /> : <><CheckCircle2 className="mr-2 h-6 w-6" /> APROBAR</>}
                        </Button>
                    </div>

                </DialogContent>
            </Dialog>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>
    )
}
