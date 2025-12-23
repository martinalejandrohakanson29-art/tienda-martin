"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Check, X, RefreshCw, Loader2, Truck, FolderOpen, ArrowLeft, ChevronRight, Maximize2 } from "lucide-react"
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
    status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
    envioId: string
}

type ViewState = 'FOLDERS' | 'ITEM_LIST' | 'ITEM_DETAIL'

export default function AuditPage() {
    // Estados de Vista
    const [view, setView] = useState<ViewState>('FOLDERS')
    
    // Datos
    const [shipmentFolders, setShipmentFolders] = useState<any[]>([])
    const [items, setItems] = useState<AuditItem[]>([])
    const [selectedItem, setSelectedItem] = useState<AuditItem | null>(null)
    
    // UI States
    const [activeEvidenceImage, setActiveEvidenceImage] = useState<string | null>(null)
    const [expandedImage, setExpandedImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [envioId, setEnvioId] = useState("")
    const [error, setError] = useState("")
    const [processing, setProcessing] = useState<string | null>(null)

    // 1. Cargar carpetas al montar
    useEffect(() => {
        loadFolders()
    }, [])

    const loadFolders = async () => {
        setLoading(true)
        setView('FOLDERS')
        const res = await getShipmentFolders()
        if (res.success) {
            setShipmentFolders(res.folders || [])
        } else {
            setError(res.error || "Error cargando carpetas")
        }
        setLoading(false)
    }

    // 2. Seleccionar envío y cargar lista de items
    const selectShipment = async (idName: string) => {
        setEnvioId(idName)
        setView('ITEM_LIST')
        setLoading(true)
        setError("")
        setItems([])
        
        const res = await getAuditPendingItems(idName)
        
        if (res.error) {
            setError(res.error)
        } else {
            setItems(res.data || [])
        }
        setLoading(false)
    }

    const openItemDetail = (item: AuditItem) => {
        setSelectedItem(item)
        setActiveEvidenceImage(item.evidenceImages?.[0] || item.evidenceImageUrl)
        setView('ITEM_DETAIL')
    }

    const handleVote = async (status: 'APROBADO' | 'RECHAZADO') => {
        if (!selectedItem) return
        
        setProcessing(selectedItem.itemId)
        const res = await auditItem(selectedItem.itemId, status, selectedItem.envioId)
        
        if (res.success) {
            setItems(prev => prev.map(i => 
                i.itemId === selectedItem.itemId ? { ...i, status: status } : i
            ))
            setView('ITEM_LIST')
            setSelectedItem(null)
        } else {
            alert("Error al guardar: " + res.error)
        }
        setProcessing(null)
    }

    const ImageZoomModal = () => {
        if (!expandedImage) return null
        return (
            <div 
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 cursor-zoom-out animate-in fade-in duration-200"
                onClick={() => setExpandedImage(null)}
            >
                 <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                    <X className="h-8 w-8" />
                </button>

                <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
                    <img 
                        src={expandedImage} 
                        alt="Zoom" 
                        className="w-auto h-auto max-w-screen max-h-[90vh] object-contain rounded shadow-2xl ring-1 ring-white/20"
                    />
                </div>
            </div>
        )
    }

    // --- VISTA 1: CARPETAS ---
    if (view === 'FOLDERS') {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
                        <FolderOpen className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Seleccionar Envío</h1>
                        <p className="text-gray-500">Elige la carpeta de Drive que deseas auditar</p>
                    </div>
                    <Button variant="outline" className="ml-auto" onClick={loadFolders} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {loading ? (
                    <div className="py-20 text-center">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-500 mb-2" />
                        <p className="text-gray-500">Buscando carpetas...</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {shipmentFolders.map((folder) => {
                            // Lógica de Alerta Visual
                            const hasRechazados = folder.stats?.rechazados > 0;
                            const isFullyAprobado = folder.stats?.aprobados > 0 && folder.stats?.rechazados === 0;

                            return (
                                <Card 
                                    key={folder.id} 
                                    className={`cursor-pointer hover:shadow-md transition-all group border-l-4 ${
                                        hasRechazados 
                                            ? 'border-l-red-500 bg-red-50/30' 
                                            : isFullyAprobado 
                                                ? 'border-l-green-500 bg-green-50/30' 
                                                : 'border-l-gray-300'
                                    }`}
                                    onClick={() => selectShipment(folder.name)}
                                >
                                    <CardContent className="p-6 flex items-center gap-4">
                                        <div className={`p-3 rounded-full transition-colors ${
                                            hasRechazados ? 'bg-red-100' : isFullyAprobado ? 'bg-green-100' : 'bg-gray-100'
                                        }`}>
                                            <Truck className={`h-6 w-6 ${
                                                hasRechazados ? 'text-red-600' : isFullyAprobado ? 'text-green-600' : 'text-gray-500'
                                            }`} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg group-hover:text-blue-700">{folder.name}</h3>
                                            <div className="flex gap-3 mt-1">
                                                {folder.stats?.total > 0 ? (
                                                    <>
                                                        <span className="text-[10px] font-bold uppercase text-green-600">OK: {folder.stats.aprobados}</span>
                                                        {hasRechazados && (
                                                            <span className="text-[10px] font-bold uppercase text-red-600">Error: {folder.stats.rechazados}</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] font-bold uppercase text-gray-400">Sin auditar</span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="ml-auto h-5 w-5 text-gray-300 group-hover:text-blue-400" />
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    // --- VISTA 2: LISTA DE PRODUCTOS ---
    if (view === 'ITEM_LIST') {
        const total = items.length
        const aprobados = items.filter(i => i.status === 'APROBADO').length
        const pendientes = items.filter(i => i.status === 'PENDIENTE').length

        return (
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-white p-4 rounded-xl border shadow-sm sticky top-4 z-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => setView('FOLDERS')}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h2 className="font-bold text-lg">{envioId}</h2>
                            <div className="flex gap-3 text-xs font-mono mt-1">
                                <span className="text-gray-500">Total: {total}</span>
                                <span className="text-green-600">OK: {aprobados}</span>
                                <span className="text-orange-500">Pend: {pendientes}</span>
                            </div>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => selectShipment(envioId)} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Recargar
                    </Button>
                </div>

                {loading ? (
                     <div className="py-20 text-center text-gray-500">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-blue-500" />
                        <p>Escaneando contenido del envío...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-10 text-center bg-gray-50 rounded-lg border border-dashed">
                        <p className="text-gray-500">Esta carpeta parece vacía o no tiene imágenes.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div 
                                key={item.itemId}
                                onClick={() => openItemDetail(item)}
                                className={`
                                    bg-white border rounded-lg p-3 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all
                                    ${item.status === 'APROBADO' ? 'border-l-4 border-l-green-500' : ''}
                                    ${item.status === 'RECHAZADO' ? 'border-l-4 border-l-red-500' : ''}
                                    ${item.status === 'PENDIENTE' ? 'border-l-4 border-l-gray-300' : ''}
                                `}
                            >
                                <div className="h-16 w-16 bg-gray-100 rounded overflow-hidden shrink-0 border">
                                    {item.referenceImageUrl ? (
                                        <img src={item.referenceImageUrl} alt="Ref" className="h-full w-full object-contain" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-gray-300 text-xs text-center p-1">Sin Ref</div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-gray-800 text-sm truncate">{item.driveName}</h3>
                                        <span className="bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded-full border font-bold">
                                            x{item.quantity}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{item.title}</p>
                                </div>

                                <div className="shrink-0 pr-2">
                                    {item.status === 'APROBADO' && <Check className="h-6 w-6 text-green-500" />}
                                    {item.status === 'RECHAZADO' && <X className="h-6 w-6 text-red-500" />}
                                    {item.status === 'PENDIENTE' && <div className="h-3 w-3 rounded-full bg-gray-300" />}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // --- VISTA 3: DETALLE ---
    if (view === 'ITEM_DETAIL' && selectedItem) {
        return (
            <>
                <ImageZoomModal />
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="flex items-center gap-4 mb-4">
                        <Button variant="outline" onClick={() => setView('ITEM_LIST')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista
                        </Button>
                        <h2 className="text-xl font-bold truncate">{selectedItem.driveName}</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div 
                                className="bg-white p-1 border rounded-xl shadow-sm overflow-hidden cursor-zoom-in group relative h-[500px]"
                                onClick={() => setExpandedImage(activeEvidenceImage)}
                            >
                                 <div className="relative w-full h-full bg-gray-100 flex items-center justify-center">
                                    {activeEvidenceImage ? (
                                        <img src={activeEvidenceImage} alt="Evidencia" className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="text-gray-400">Sin imagen</div>
                                    )}
                                    <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1">
                                        FOTO {selectedItem.evidenceImages.indexOf(activeEvidenceImage!) + 1} de {selectedItem.evidenceImages.length}
                                        <Maximize2 className="h-3 w-3 opacity-70 ml-1" />
                                    </div>
                                 </div>
                            </div>

                            {selectedItem.evidenceImages.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide">
                                    {selectedItem.evidenceImages.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveEvidenceImage(img)}
                                            className={`relative h-20 w-20 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeEvidenceImage === img ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 opacity-70 hover:opacity-100'}`}
                                        >
                                            <img src={img} alt={`Foto ${idx}`} className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <Button variant="outline" className="h-14 border-red-200 text-red-600 hover:bg-red-50 text-lg" onClick={() => handleVote('RECHAZADO')} disabled={!!processing}>
                                    <X className="mr-2 h-6 w-6" /> Rechazar
                                </Button>
                                <Button className="h-14 bg-green-600 hover:bg-green-700 text-white shadow-lg text-lg" onClick={() => handleVote('APROBADO')} disabled={!!processing}>
                                    {processing ? <Loader2 className="animate-spin" /> : <Check className="mr-2 h-6 w-6" />} APROBAR
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <Card>
                                <CardContent className="p-6 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Producto Detectado</h3>
                                        <div className="flex justify-between items-start">
                                            <p className="text-lg font-medium text-gray-900 leading-tight flex-1">{selectedItem.title}</p>
                                            <div className="ml-4 text-center bg-orange-50 border border-orange-200 rounded-lg p-2 min-w-[80px]">
                                                <span className="block text-[10px] text-orange-600 font-bold uppercase">Cantidad</span>
                                                <span className="text-2xl font-black text-orange-700">{selectedItem.quantity}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm font-mono text-gray-500 mt-1">SKU: {selectedItem.sku}</p>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100">
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Agregados Requeridos</h3>
                                        {selectedItem.agregados.length > 0 ? (
                                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                                <ul className="space-y-2">
                                                    {selectedItem.agregados.map((agregado, index) => (
                                                        <li key={index} className="flex items-start gap-2 text-blue-900 font-medium">
                                                            <span className="text-blue-400 mt-1">•</span> {agregado}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 italic text-sm">Este producto no lleva agregados.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {selectedItem.referenceImageUrl && (
                                <Card className="overflow-hidden border-dashed border-2 bg-gray-50/50 hover:bg-gray-100 transition-colors">
                                    <CardContent className="p-4 flex items-center gap-4 cursor-zoom-in" onClick={() => setExpandedImage(selectedItem.referenceImageUrl)}>
                                        <div className="h-24 w-24 bg-white rounded border p-1 shrink-0 relative group">
                                            <img src={selectedItem.referenceImageUrl} alt="Referencia" className="w-full h-full object-contain" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded transition-colors" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-700 flex items-center gap-2">Imagen de Referencia <Maximize2 className="h-3 w-3 text-gray-400" /></h4>
                                            <p className="text-xs text-gray-500 mt-1 mb-2">Click para comparar con el original.</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            </>
        )
    }

    return null
}
