"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Check, X, RefreshCw, Loader2, Truck, AlertTriangle, FolderOpen, ArrowLeft, ChevronRight, Eye } from "lucide-react"
import { getAuditPendingItems, auditItem, getShipmentFolders } from "@/app/actions/audit"

// Definimos el tipo para mayor claridad
type AuditItem = {
    itemId: string
    driveName: string
    title: string
    sku: string
    agregados: string[]
    referenceImageUrl: string | null
    evidenceImageUrl: string
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
    
    // Estados de carga / info
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

    // 3. Abrir detalle de un item
    const openItemDetail = (item: AuditItem) => {
        setSelectedItem(item)
        setView('ITEM_DETAIL')
    }

    // 4. Acción de Votar (Aprobar/Rechazar)
    const handleVote = async (status: 'APROBADO' | 'RECHAZADO') => {
        if (!selectedItem) return
        
        setProcessing(selectedItem.itemId)
        const res = await auditItem(selectedItem.itemId, status, selectedItem.envioId)
        
        if (res.success) {
            // Actualizamos la lista localmente
            setItems(prev => prev.map(i => 
                i.itemId === selectedItem.itemId ? { ...i, status: status } : i
            ))
            
            // Volvemos a la lista automáticamente
            setView('ITEM_LIST')
            setSelectedItem(null)
        } else {
            alert("Error al guardar: " + res.error)
        }
        setProcessing(null)
    }

    // --- RENDERIZADO: VISTA 1 (SELECCIÓN DE CARPETA) ---
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
                        {shipmentFolders.map((folder) => (
                            <Card 
                                key={folder.id} 
                                className="cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
                                onClick={() => selectShipment(folder.name)}
                            >
                                <CardContent className="p-6 flex items-center gap-4">
                                    <div className="bg-gray-100 p-3 rounded-full group-hover:bg-blue-50 transition-colors">
                                        <Truck className="h-6 w-6 text-gray-500 group-hover:text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg group-hover:text-blue-700">{folder.name}</h3>
                                        <p className="text-xs text-gray-400 font-mono">ID: {folder.id}</p>
                                    </div>
                                    <ChevronRight className="ml-auto h-5 w-5 text-gray-300 group-hover:text-blue-400" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // --- RENDERIZADO: VISTA 2 (LISTA DE ITEMS) ---
    if (view === 'ITEM_LIST') {
        // Contadores
        const total = items.length
        const aprobados = items.filter(i => i.status === 'APROBADO').length
        const pendientes = items.filter(i => i.status === 'PENDIENTE').length

        return (
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header de la Lista */}
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
                                {/* Foto Referencia (Pequeña) */}
                                <div className="h-16 w-16 bg-gray-100 rounded overflow-hidden shrink-0 border">
                                    {item.referenceImageUrl ? (
                                        <img src={item.referenceImageUrl} alt="Ref" className="h-full w-full object-contain" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-gray-300 text-xs text-center p-1">Sin Ref</div>
                                    )}
                                </div>

                                {/* Texto */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-800 text-sm truncate">{item.driveName}</h3>
                                    <p className="text-xs text-gray-500 truncate">{item.title}</p>
                                    {item.agregados.length > 0 && (
                                        <span className="inline-block bg-blue-50 text-blue-700 text-[10px] px-1.5 rounded mt-1">
                                            +{item.agregados.length} agregados
                                        </span>
                                    )}
                                </div>

                                {/* Icono Estado */}
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

    // --- RENDERIZADO: VISTA 3 (DETALLE DE AUDITORÍA) ---
    if (view === 'ITEM_DETAIL' && selectedItem) {
        return (
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header Navegación */}
                <div className="flex items-center gap-4 mb-4">
                    <Button variant="outline" onClick={() => setView('ITEM_LIST')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista
                    </Button>
                    <h2 className="text-xl font-bold truncate">{selectedItem.driveName}</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* COLUMNA IZQUIERDA: EVIDENCIA (FOTO OPERARIO) */}
                    <div className="space-y-4">
                        <div className="bg-white p-1 border rounded-xl shadow-sm overflow-hidden">
                             <div className="relative aspect-square bg-gray-100">
                                <img 
                                    src={selectedItem.evidenceImageUrl} 
                                    alt="Evidencia" 
                                    className="w-full h-full object-contain"
                                />
                                <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                    FOTO DEL PAQUETE
                                </div>
                             </div>
                        </div>
                        
                        {/* Botonera de Acción */}
                        <div className="grid grid-cols-2 gap-4">
                            <Button 
                                variant="outline" 
                                className="h-14 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 text-lg"
                                onClick={() => handleVote('RECHAZADO')}
                                disabled={!!processing}
                            >
                                <X className="mr-2 h-6 w-6" /> Rechazar
                            </Button>
                            <Button 
                                className="h-14 bg-green-600 hover:bg-green-700 text-white shadow-lg text-lg"
                                onClick={() => handleVote('APROBADO')}
                                disabled={!!processing}
                            >
                                {processing ? <Loader2 className="animate-spin" /> : <Check className="mr-2 h-6 w-6" />}
                                APROBAR
                            </Button>
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: DATOS Y REFERENCIA */}
                    <div className="space-y-6">
                        {/* Datos del Sheet */}
                        <Card>
                            <CardContent className="p-6 space-y-4">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Producto Detectado</h3>
                                    <p className="text-lg font-medium text-gray-900 leading-tight">{selectedItem.title}</p>
                                    <p className="text-sm font-mono text-gray-500 mt-1">SKU: {selectedItem.sku}</p>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Agregados Requeridos</h3>
                                    {selectedItem.agregados.length > 0 ? (
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                            <ul className="space-y-2">
                                                {selectedItem.agregados.map((agregado, index) => (
                                                    <li key={index} className="flex items-start gap-2 text-blue-900 font-medium">
                                                        <span className="text-blue-400 mt-1">•</span>
                                                        {agregado}
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

                        {/* Foto de Referencia (Si existe) */}
                        {selectedItem.referenceImageUrl && (
                            <Card className="overflow-hidden border-dashed border-2 bg-gray-50/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="h-24 w-24 bg-white rounded border p-1 shrink-0">
                                        <img 
                                            src={selectedItem.referenceImageUrl} 
                                            alt="Referencia" 
                                            className="w-full h-full object-contain" 
                                        />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-700">Imagen de Referencia</h4>
                                        <p className="text-xs text-gray-500 mt-1">Así se ve la publicación en Mercado Libre.</p>
                                        <Button variant="link" size="sm" className="h-auto p-0 text-blue-500 mt-1" onClick={() => window.open(selectedItem.referenceImageUrl!, '_blank')}>
                                            Ver original <Eye className="ml-1 h-3 w-3" />
                                        </Button>
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
