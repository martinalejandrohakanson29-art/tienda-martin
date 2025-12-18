"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Check, X, RefreshCw, Loader2, Truck, AlertTriangle, FolderOpen, ArrowLeft } from "lucide-react"
import { getAuditPendingItems, auditItem, getShipmentFolders } from "@/app/actions/audit"

export default function AuditPage() {
    // Estado de selección
    const [view, setView] = useState<'LIST' | 'AUDIT'>('LIST')
    const [shipmentFolders, setShipmentFolders] = useState<any[]>([])
    
    // Estado de auditoría
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [envioId, setEnvioId] = useState("") // El envío seleccionado
    const [error, setError] = useState("")
    const [processing, setProcessing] = useState<string | null>(null)

    // 1. Cargar lista de carpetas al inicio
    useEffect(() => {
        loadFolders()
    }, [])

    const loadFolders = async () => {
        setLoading(true)
        const res = await getShipmentFolders()
        if (res.success) {
            setShipmentFolders(res.folders || [])
        } else {
            setError(res.error || "Error cargando carpetas")
        }
        setLoading(false)
    }

    // 2. Seleccionar una carpeta y cargar sus items
    const selectShipment = async (idName: string) => {
        setEnvioId(idName)
        setView('AUDIT')
        setLoading(true)
        setError("")
        
        const res = await getAuditPendingItems(idName)
        
        if (res.error) {
            setError(res.error)
            setItems([])
        } else {
            setItems(res.data || [])
        }
        setLoading(false)
    }

    const handleVote = async (item: any, status: 'APROBADO' | 'RECHAZADO') => {
        setProcessing(item.itemId)
        const res = await auditItem(item.itemId, status, item.envioId)
        if (res.success) {
            setItems(prev => prev.filter(i => i.itemId !== item.itemId))
        } else {
            alert("Error al guardar: " + res.error)
        }
        setProcessing(null)
    }

    // VISTA: LISTA DE ENVÍOS (Selección)
    if (view === 'LIST') {
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

                {loading && shipmentFolders.length === 0 ? (
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
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // VISTA: AUDITORÍA (Items)
    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-xl border shadow-sm sticky top-4 z-10">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setView('LIST')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                             Auditoría de Envíos
                        </h1>
                        <p className="text-gray-500 text-sm">Revisando: <span className="font-bold text-blue-600">{envioId}</span></p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                        <span className="text-xs font-bold text-gray-400 uppercase block">Pendientes</span>
                        <span className="text-xl font-mono font-bold text-gray-800">{items.length}</span>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => selectShipment(envioId)} disabled={loading}>
                        <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Mensajes de Estado */}
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 border border-red-100">
                    <AlertTriangle className="h-5 w-5" /> {error}
                </div>
            )}

            {/* Lista de Pendientes */}
            {loading ? (
                <div className="py-20 text-center text-gray-500">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-blue-500" />
                    <p>Escaneando carpeta en Drive...</p>
                </div>
            ) : items.length === 0 && !error ? (
                <div className="py-20 text-center bg-green-50 rounded-xl border border-green-100">
                    <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <h2 className="text-xl font-bold text-green-800">¡Todo Completado!</h2>
                    <p className="text-green-600 mt-1">No hay fotos pendientes de auditar en esta carpeta.</p>
                    <Button variant="outline" className="mt-4 border-green-200 text-green-700 hover:bg-green-100" onClick={() => setView('LIST')}>
                        Volver a la lista
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {items.map((item) => (
    <Card key={item.itemId} className="overflow-hidden flex flex-col group hover:shadow-lg transition-all border-0 shadow-md ring-1 ring-gray-200">
        {/* IMAGEN GRANDE */}
        <div className="relative aspect-video bg-gray-100 overflow-hidden cursor-pointer" onClick={() => window.open(item.imageUrl, '_blank')}>
            <img 
                src={item.imageUrl} 
                alt={item.title} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            />
            {/* Etiqueta de Agregados sobre la foto si existen */}
            {item.agregados && (
                <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
                    ⚠️ CON AGREGADOS
                </div>
            )}
        </div>

        <CardContent className="p-5 flex-1 flex flex-col">
            <div className="mb-4">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-900 leading-tight text-lg line-clamp-2">{item.title}</h3>
                </div>
                
                <div className="flex items-center gap-2 mb-3">
                    <span className="bg-gray-100 text-gray-600 text-[10px] font-mono px-2 py-1 rounded border border-gray-200">
                        {item.itemId}
                    </span>
                    <span className="text-sm text-gray-500 font-mono border-l pl-2">
                        {item.sku}
                    </span>
                </div>

                {/* 👇 SECCIÓN NUEVA: AGREGADOS / INFO DEL SHEET */}
                {item.agregados ? (
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800">
                        <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
                            Debe Incluir:
                        </span>
                        <p className="font-medium">
                           {item.agregados}
                        </p>
                    </div>
                ) : (
                    <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-sm text-gray-400 italic">
                        Sin agregados declarados.
                    </div>
                )}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                <Button 
                    variant="outline" 
                    className="border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 h-12"
                    onClick={() => handleVote(item, 'RECHAZADO')}
                    disabled={!!processing}
                >
                    <X className="mr-2 h-5 w-5" /> Rechazar
                </Button>
                <Button 
                    className="bg-green-600 hover:bg-green-700 text-white h-12 shadow-md hover:shadow-lg transition-all"
                    onClick={() => handleVote(item, 'APROBADO')}
                    disabled={!!processing}
                >
                    {processing === item.itemId ? <Loader2 className="animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                    Aprobar
                </Button>
            </div>
        </CardContent>
    </Card>
))}
                </div>
            )}
        </div>
    )
}
