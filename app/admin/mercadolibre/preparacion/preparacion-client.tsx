"use client"

import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Camera, CheckCircle2, Package, Eye, CheckCircle } from "lucide-react"
import { subirFotoAuditoria, aprobarPedido } from "@/app/actions/preparacion"
import { toast } from "sonner"

export function PreparacionClient({ initialEnvios }: { initialEnvios: any[] }) {
    const [activeTab, setActiveTab] = useState<'pendientes' | 'revision'>('pendientes')
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedItem, setSelectedItem] = useState<any>(null)

    // Filtrado por pestaña y búsqueda
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

    const handleApprove = async (envioId: string) => {
        setLoading(envioId)
        const res = await aprobarPedido(envioId)
        if (res.success) {
            toast.success("Pedido aprobado y finalizado")
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
            if (res.success) toast.success("Foto guardada correctamente")
        } catch (err) {
            toast.error("Error en la subida")
        } finally {
            setLoading(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-4">
            {/* TABS NAVEGACIÓN MÓVIL */}
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
                        <span className="bg-emerald-500 text-white text-[10px] px-1.5 rounded-full">
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
                    className="pl-10 h-12 rounded-xl border-slate-200"
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
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{envio.logisticType}</span>
                                <h3 className="font-bold text-slate-900">{envio.id}</h3>
                            </div>
                            
                            <div className="flex gap-2">
                                {/* Botón Cámara (Siempre visible para Preparación) */}
                                <Button 
                                    size="icon"
                                    variant="outline"
                                    className={`rounded-full h-12 w-12 ${envio.status === 'PREPARADO' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'}`}
                                    onClick={() => handleTriggerCamera(envio.id, envio.items[0]?.mla)}
                                    disabled={loading === envio.id}
                                >
                                    {loading === envio.id ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Camera className="h-5 w-5" />}
                                </Button>

                                {/* Botón Aprobar (Solo en pestaña Revisión o si está Preparado) */}
                                {envio.status === 'PREPARADO' && (
                                    <Button 
                                        size="icon"
                                        className="rounded-full h-12 w-12 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                                        onClick={() => handleApprove(envio.id)}
                                        disabled={loading === envio.id}
                                    >
                                        <CheckCircle className="h-6 w-6" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Link a Drive si existe */}
                        {envio.drivePhotoUrl && (
                            <a 
                                href={envio.drivePhotoUrl} 
                                target="_blank" 
                                className="flex items-center gap-2 text-xs text-blue-600 font-semibold mb-3 bg-blue-50 p-2 rounded-lg"
                            >
                                <Eye className="h-4 w-4" /> Ver Fotos en Google Drive
                            </a>
                        )}

                        <p className="text-sm text-slate-600 mb-3">{envio.resumen}</p>

                        <div className="space-y-1">
                            {envio.items.map((item: any) => (
                                <div key={item.id} className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <span className="font-black text-slate-700">{item.agregadoInfo?.ids_articulos || 'S/SKU'}</span>
                                    <p className="text-slate-500 truncate">{item.title}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>
    )
}
