"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
    Check, X, RefreshCw, Loader2, FolderOpen, 
    ArrowLeft, Maximize2, BellRing, CheckCircle2, AlertCircle 
} from "lucide-react"
import { getAuditPendingItems, auditItem, getShipmentFolders } from "@/app/actions/audit"

type AuditItem = {
    itemId: string
    driveName: string
    title: string
    sku: string
    quantity: number
    agregados: string[]
    referenceImageUrl: string | null
    evidenceImageUrl: string
    evidenceImages: string[] 
    status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | string
    envioId: string
}

export default function AuditPage() {
    const [view, setView] = useState<'FOLDERS' | 'ITEM_LIST' | 'ITEM_DETAIL'>('FOLDERS')
    const [shipmentFolders, setShipmentFolders] = useState<any[]>([])
    const [items, setItems] = useState<AuditItem[]>([])
    const [selectedItem, setSelectedItem] = useState<AuditItem | null>(null)
    const [activeEvidenceImage, setActiveEvidenceImage] = useState<string | null>(null)
    const [expandedImage, setExpandedImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [envioId, setEnvioId] = useState("")
    const [processing, setProcessing] = useState<string | null>(null)

    useEffect(() => { loadFolders() }, [])

    const loadFolders = async () => {
        setLoading(true)
        setView('FOLDERS')
        const res = await getShipmentFolders()
        if (res.success) setShipmentFolders(res.folders || [])
        setLoading(false)
    }

    // CORRECCIÓN AQUÍ: Recibimos el ID, no el nombre
    const selectShipment = async (id: string) => {
        setEnvioId(id)
        setView('ITEM_LIST')
        setLoading(true)
        // Buscamos en S3 usando el ID correcto
        const res = await getAuditPendingItems(id)
        if (res.success) setItems(res.data || [])
        setLoading(false)
    }

    const handleVote = async (status: 'APROBADO' | 'RECHAZADO') => {
        if (!selectedItem) return
        setProcessing(selectedItem.itemId)
        const res = await auditItem(selectedItem.itemId, status, selectedItem.envioId)
        if (res.success) {
            setItems(prev => prev.map(i => i.itemId === selectedItem.itemId ? { ...i, status } : i))
            setView('ITEM_LIST')
            setSelectedItem(null)
        }
        setProcessing(null)
    }

    const ImageZoomModal = () => {
        if (!expandedImage) return null
        return (
            <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setExpandedImage(null)}>
                <button className="absolute top-4 right-4 text-white/70"><X className="h-8 w-8" /></button>
                <img src={expandedImage} alt="Zoom" className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl" />
            </div>
        )
    }

    if (view === 'FOLDERS') {
        return (
            <div className="max-w-5xl mx-auto space-y-6 p-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-lg"><FolderOpen className="h-6 w-6" /></div>
                    <div>
                        <h1 className="text-2xl font-bold">Auditoría de Envíos</h1>
                        <p className="text-gray-500">Estado de revisión de imágenes</p>
                    </div>
                    <Button variant="outline" className="ml-auto" onClick={loadFolders} disabled={loading}>
                        <RefreshCw className={loading ? 'animate-spin' : ''} />
                    </Button>
                </div>
                {loading ? <Loader2 className="animate-spin mx-auto h-12 w-12 text-blue-500" /> : (
                    <div className="grid gap-6 md:grid-cols-2">
                        {shipmentFolders.map((folder) => {
                            const stats = folder.stats
                            const tieneRechazados = stats.rechazados > 0
                            const faltanAprobar = stats.total - (stats.aprobados + stats.rechazados)
                            const ok = stats.total > 0 && faltanAprobar === 0 && !tieneRechazados

                            return (
                                <Card 
                                    key={folder.id} 
                                    // CORRECCIÓN AQUÍ: Pasamos folder.id en lugar de folder.name
                                    onClick={() => selectShipment(folder.id)} 
                                    className={`cursor-pointer border-t-8 transition-all hover:shadow-lg ${ok ? 'border-t-green-500 bg-green-50/20' : tieneRechazados ? 'border-t-red-500 bg-red-50/20' : 'border-t-orange-400 bg-orange-50/20'}`}
                                >
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="font-bold text-xl">{folder.name}</h3>
                                            {ok ? <CheckCircle2 className="text-green-600 h-8 w-8" /> : tieneRechazados ? <BellRing className="text-red-600 h-8 w-8 animate-bounce" /> : <AlertCircle className="text-orange-500 h-8 w-8" />}
                                        </div>
                                        <div className={`p-2 rounded font-bold text-sm mb-4 ${ok ? 'bg-green-100 text-green-700' : tieneRechazados ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {ok ? "COMPLETO Y OK" : (
                                                <div className="flex flex-col">
                                                    <span>REQUIERE ACCIÓN</span>
                                                    <span className="text-xs opacity-80">
                                                        {faltanAprobar > 0 && `• Faltan ${faltanAprobar} por procesar `}
                                                        {tieneRechazados && `• Hay ${stats.rechazados} con error`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase">
                                            <div className="bg-white border rounded p-2">Total: {stats.total}</div>
                                            <div className="bg-white border rounded p-2 text-green-600">Ok: {stats.aprobados}</div>
                                            <div className="bg-white border rounded p-2 text-red-600">Mal: {stats.rechazados}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    if (view === 'ITEM_LIST') {
        return (
            <div className="max-w-3xl mx-auto p-4 space-y-4 font-sans">
                <Button variant="ghost" onClick={() => setView('FOLDERS')} className="mb-2"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
                {loading ? <Loader2 className="animate-spin mx-auto h-10 w-10 text-blue-500" /> : items.length === 0 ? (
                   // Mensaje de ayuda si está vacío
                   <div className="text-center py-10 text-gray-500">
                       <p>No se encontraron imágenes para este envío.</p>
                       <p className="text-xs">Verifica que las fotos se hayan subido a la carpeta: {envioId}</p>
                   </div>
                ) : items.map(item => (
                    <Card key={item.itemId} onClick={() => { setSelectedItem(item); setActiveEvidenceImage(item.evidenceImages[0]); setView('ITEM_DETAIL') }} className={`cursor-pointer border-l-4 hover:shadow-md transition-all ${item.status === 'APROBADO' ? 'border-l-green-500' : item.status === 'RECHAZADO' ? 'border-l-red-500' : 'border-l-gray-300'}`}>
                        <CardContent className="p-4 flex items-center gap-4">
                            <img src={item.evidenceImageUrl} className="h-16 w-16 object-cover rounded border" alt="Thumbnail" />
                            <div className="flex-1 min-w-0">
                                <p className="font-bold truncate text-sm">{item.driveName}</p>
                                <p className="text-[10px] text-gray-500">SKU: {item.sku} | Cant: {item.quantity}</p>
                            </div>
                            {item.status === 'APROBADO' ? <Check className="text-green-500" /> : item.status === 'RECHAZADO' ? <X className="text-red-500" /> : <div className="h-3 w-3 bg-gray-300 rounded-full" />}
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (view === 'ITEM_DETAIL' && selectedItem) {
        return (
            <div className="max-w-5xl mx-auto p-4 space-y-6">
                <ImageZoomModal />
                <Button variant="outline" onClick={() => setView('ITEM_LIST')}><ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista</Button>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="aspect-square bg-white border rounded-2xl overflow-hidden cursor-zoom-in relative group" onClick={() => setExpandedImage(activeEvidenceImage)}>
                            <img src={activeEvidenceImage!} className="w-full h-full object-contain" alt="Evidencia" />
                            <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 font-bold">
                                FOTO {selectedItem.evidenceImages.indexOf(activeEvidenceImage!) + 1} / {selectedItem.evidenceImages.length}
                                <Maximize2 className="h-3 w-3" />
                            </div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {selectedItem.evidenceImages.map((img, i) => (
                                <img key={i} src={img} onClick={() => setActiveEvidenceImage(img)} className={`h-20 w-20 object-cover rounded-xl cursor-pointer border-2 transition-all ${activeEvidenceImage === img ? 'border-blue-500 scale-95' : 'border-transparent opacity-60'}`} alt="Thumbnail" />
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Button variant="outline" className="h-16 border-red-500 text-red-600 font-bold hover:bg-red-50" onClick={() => handleVote('RECHAZADO')} disabled={!!processing}><X className="mr-2 h-6 w-6" /> RECHAZAR</Button>
                            <Button className="h-16 bg-green-600 font-bold shadow-lg hover:bg-green-700" onClick={() => handleVote('APROBADO')} disabled={!!processing}>{processing ? <Loader2 className="animate-spin" /> : <Check className="mr-2 h-6 w-6" />} APROBAR</Button>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <Card className="rounded-2xl shadow-sm">
                            <CardContent className="p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold mb-1">{selectedItem.title}</h2>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        SKU: {selectedItem.sku}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl text-center">
                                        <p className="text-[10px] text-orange-600 font-black uppercase mb-1">Unidades</p>
                                        <p className="text-4xl font-black text-orange-700">{selectedItem.quantity}</p>
                                    </div>
                                    
                                    <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                                        <p className="text-[10px] text-purple-600 font-black uppercase mb-1">Agregados</p>
                                        <div className="text-sm font-medium text-purple-900">
                                            {selectedItem.agregados && selectedItem.agregados.length > 0 ? (
                                                <ul className="list-disc list-inside">
                                                    {selectedItem.agregados.map((a, i) => <li key={i}>{a}</li>)}
                                                </ul>
                                            ) : (
                                                <p className="italic opacity-60">Sin agregados adicionales</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        {selectedItem.referenceImageUrl && (
                            <Card className="overflow-hidden border-dashed border-2 bg-gray-50/50 cursor-zoom-in rounded-2xl" onClick={() => setExpandedImage(selectedItem.referenceImageUrl)}>
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="h-24 w-24 bg-white rounded-lg border p-1 shrink-0">
                                        <img src={selectedItem.referenceImageUrl} alt="Ref" className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-700 text-sm">Imagen de Referencia</h4>
                                        <p className="text-xs text-gray-500">Haz clic para comparar con el producto original.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        )
    }
    return null
}
