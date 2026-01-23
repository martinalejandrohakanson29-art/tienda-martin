"use client"

import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Camera, CheckCircle2, Package } from "lucide-react"
import { subirFotoAuditoria } from "@/app/actions/preparacion"
import { toast } from "sonner" // Usamos lo que ya tienes instalado

export function PreparacionClient({ initialEnvios }: { initialEnvios: any[] }) {
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedItem, setSelectedItem] = useState<any>(null)

    const filtered = initialEnvios.filter(e => 
        e.id.includes(search) || 
        e.resumen?.toLowerCase().includes(search.toLowerCase()) ||
        e.items.some((i: any) => i.mla.includes(search))
    )

    const handleTriggerCamera = (envioId: string, mla: string, resumen: string) => {
        setSelectedItem({ envioId, mla, resumen })
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedItem) return

        setLoading(selectedItem.envioId)
        const formData = new FormData()
        formData.append('photo', file)
        formData.append('envioId', selectedItem.envioId)
        formData.append('mla', selectedItem.mla)
        formData.append('resumen', selectedItem.resumen)

        try {
            const res = await subirFotoAuditoria(formData)
            if (res.success) {
                toast.success("Pedido Auditado correctamente") // Feedback visual de sonner
            } else {
                toast.error("Error: " + res.error)
            }
        } catch (err) {
            toast.error("Fallo la subida al servidor")
        } finally {
            setLoading(null)
            setSelectedItem(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input 
                    placeholder="Escanear MLA o ID Envío..." 
                    className="pl-10 h-14 text-lg rounded-2xl border-2 focus:ring-blue-500 shadow-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="grid gap-3">
                {filtered.map((envio) => (
                    <div key={envio.id} className="bg-white rounded-2xl p-4 border shadow-sm active:scale-[0.98] transition-transform">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    {envio.logisticType || 'Estándar'}
                                </span>
                                <h3 className="font-bold text-slate-900 mt-1">{envio.id}</h3>
                            </div>
                            <Button 
                                size="lg" 
                                variant={envio.status === "PREPARADO" ? "outline" : "default"}
                                className={`rounded-full w-14 h-14 p-0 shadow-lg ${envio.status === "PREPARADO" ? 'border-emerald-500 text-emerald-500' : 'bg-slate-900'}`}
                                onClick={() => handleTriggerCamera(envio.id, envio.items[0]?.mla, envio.resumen)}
                                disabled={loading === envio.id}
                            >
                                {loading === envio.id ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                ) : envio.status === "PREPARADO" ? (
                                    <CheckCircle2 className="h-7 w-7" />
                                ) : (
                                    <Camera className="h-7 w-7" />
                                )}
                            </Button>
                        </div>

                        <p className="text-sm text-slate-700 font-medium line-clamp-2 mb-3">
                            {envio.resumen}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            {envio.items.map((item: any) => (
                                <div key={item.id} className="w-full">
                                    {item.agregadoInfo?.ids_articulos?.split(',').map((sku: string, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl mb-1">
                                            <Package className="h-4 w-4 text-slate-400" />
                                            <span className="text-xs font-black text-slate-700">{sku.trim()}</span>
                                            <span className="text-[10px] text-slate-500 truncate">
                                                {item.agregadoInfo.nombres_articulos?.split('|')[idx] || ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment" 
                onChange={handleFileChange}
            />
        </div>
    )
}
