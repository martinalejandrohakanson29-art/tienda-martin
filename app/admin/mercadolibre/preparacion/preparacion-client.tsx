"use client"

import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { 
    Search, 
    Camera, 
    CheckCircle2, 
    Package, 
    Eye, 
    CheckCircle,
    Loader2,
    X,
    Layers
} from "lucide-react"
import { 
    subirFotoAuditoria, 
    aprobarPedido, 
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

// Colores llamativos para los bloques de nombres
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

    const filtered = initialEnvios.filter(e => {
        const matchesSearch = e.id.includes(search) || 
                             e.resumen?.toLowerCase().includes(search.toLowerCase())
        
        if (activeTab === 'pendientes') {
            return matchesSearch && (e.status === "PENDIENTE" || e.status === "PREPARADO")
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
            toast.success("Pedido aprobado correctamente")
            setViewingFotos(null)
        } else {
            toast.error("Error al aprobar")
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
            if (res.success) toast.success("Foto guardada")
        } catch (err) {
            toast.error("Error al subir")
        } finally {
            setLoading(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-4">
            {/* TABS NAVEGACIÓN */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 sticky top-[72px] z-10 shadow-sm border border-slate-200">
                <button 
                    onClick={() => setActiveTab('pendientes')}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'pendientes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                    Preparación
                </button>
                <button 
                    onClick={() => setActiveTab('revision')}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'revision' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                    Aprobación
                    {initialEnvios.filter(e => e.status === 'PREPARADO').length > 0 && (
                        <span className="bg-emerald-500 text-white text-[10px] px-1.5 rounded-full min-w-[18px]">
                            {initialEnvios.filter(e => e.status === 'PREPARADO').length}
                        </span>
                    )}
                </button>
            </div>

            {/* BUSCADOR */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input 
                    placeholder="Escanear o buscar..." 
                    className="pl-10 h-12 rounded-xl border-slate-200 shadow-sm bg-white"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* LISTADO DINÁMICO */}
            <div className="grid gap-3">
                {filtered.map((envio) => (
                    <div key={envio.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{envio.logisticType}</span>
                                <h3 className="font-bold text-slate-900 leading-none mt-1">{envio.id}</h3>
                            </div>
                            
                            <div className="flex gap-2">
                                <Button 
                                    size="icon"
                                    variant="outline"
                                    className={`rounded-full h-12 w-12 border-2 ${envio.status === 'PREPARADO' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'}`}
                                    onClick={() => handleTriggerCamera(envio.id, envio.items[0]?.mla)}
                                    disabled={loading === envio.id}
                                >
                                    {loading === envio.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                </Button>

                                {envio.status === 'PREPARADO' && (
                                    <Button 
                                        size="icon"
                                        className="rounded-full h-12 w-12 bg-emerald-600 text-white shadow-lg"
                                        onClick={() => handleApprove(envio.id)}
                                        disabled={loading === envio.id}
                                    >
                                        <CheckCircle className="h-6 w-6" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {envio.status === "PREPARADO" && (
                            <Button 
                                variant="secondary" 
                                className="w-full mb-4 gap-2 bg-blue-50 text-blue-700 border-none hover:bg-blue-100 h-11 rounded-xl font-bold"
                                onClick={() => handleOpenViewer(envio.id)}
                                disabled={isFetchingFotos}
                            >
                                {isFetchingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4" /> REVISAR FOTOS</>}
                            </Button>
                        )}

                        {/* SECCIÓN DE PRODUCTOS (NOMBRES DE AGREGADOS) */}
                        <div className="space-y-2 mb-4">
                            {envio.items.map((item: any) => {
                                // Priorizamos nombres_articulos. Si no hay, usamos el title del item.
                                const nombresString = item.agregadoInfo?.nombres_articulos;
                                const nombres = nombresString ? nombresString.split(',') : [item.title];
                                
                                return (
                                    <div key={item.id} className="flex flex-col gap-1.5">
                                        {nombres.map((nombre: string, idx: number) => (
                                            <div 
                                                key={idx} 
                                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-b-4 font-black text-xs uppercase shadow-sm w-fit max-w-full ${getAgregadoColor(idx)}`}
                                            >
                                                <Layers className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                                <span className="truncate">{nombre.trim()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center gap-2 px-1 pt-2 border-t border-slate-50">
                            <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <p className="text-[11px] text-slate-500 truncate italic">{envio.resumen}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* --- VISOR DE FOTOS --- */}
            <Dialog open={!!viewingFotos} onOpenChange={() => { setViewingFotos(null); setZoom(false); }}>
                <DialogContent className="p-0 overflow-hidden bg-slate-950 border-none h-[90vh] max-w-lg flex flex-col rounded-t-3xl sm:rounded-3xl">
                    <DialogHeader className="p-4 bg-slate-900/80 backdrop-blur-md border-b border-white/10 flex-row justify-between items-center space-y-0">
                        <DialogTitle className="text-white text-base">Fotos Envío {viewingFotos?.id}</DialogTitle>
                        <Button variant="ghost" size="icon" className="text-white" onClick={() => setViewingFotos(null)}>
                            <X className="h-5 w-5" />
                        </Button>
                    </DialogHeader>

                    <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
                        {viewingFotos?.fotos.length ? (
                            <Carousel className="w-full h-full flex items-center">
                                <CarouselContent className="h-full">
                                    {viewingFotos.fotos.map((foto: any) => (
                                        <CarouselItem key={foto.id} className="flex items-center justify-center h-full">
                                            <div 
                                                className={`relative transition-transform duration-300 ease-out h-full w-full flex items-center justify-center ${zoom ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'}`}
                                                onClick={() => setZoom(!zoom)}
                                            >
                                                <img 
                                                    src={foto.url} 
                                                    alt="Auditoría" 
                                                    className="max-h-full max-w-full object-contain select-none"
                                                />
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                {viewingFotos.fotos.length > 1 && !zoom && (
                                    <>
                                        <CarouselPrevious className="left-4 bg-white/10 hover:bg-white/20 border-none text-white" />
                                        <CarouselNext className="right-4 bg-white/10 hover:bg-white/20 border-none text-white" />
                                    </>
                                )}
                            </Carousel>
                        ) : (
                            <div className="text-center text-white/40">
                                <Eye className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                <p>No se encontraron fotos</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-slate-900 border-t border-white/10 flex gap-3">
                        <Button 
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-14 rounded-2xl font-bold text-lg shadow-xl"
                            onClick={() => handleApprove(viewingFotos?.id!)}
                            disabled={loading === viewingFotos?.id}
                        >
                            {loading === viewingFotos?.id ? <Loader2 className="animate-spin" /> : <><CheckCircle2 className="mr-2" /> APROBAR TODO</>}
                        </Button>
                        <Button 
                            variant="outline" 
                            className="h-14 w-14 rounded-2xl border-white/20 text-white bg-white/5"
                            onClick={() => setZoom(!zoom)}
                        >
                            <Search className="h-6 w-6" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>
    )
}
