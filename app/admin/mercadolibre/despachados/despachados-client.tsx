"use client"

import { useState, useEffect } from "react"
import { getEtiquetasDespachadas } from "@/app/actions/envios"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, CalendarIcon, Loader2, CheckCircle2, Package, Clock } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale" // Para mostrar la fecha en español
import { toast } from "sonner"

export function DespachadosClient() {
    const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"))
    const [loading, setLoading] = useState(true)
    const [envios, setEnvios] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const res = await getEtiquetasDespachadas(fecha)
            if (res.success) setEnvios(res.data)
            setLoading(false)
        }
        load()
    }, [fecha])

    const filtered = envios.filter(e => 
        e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.resumen?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.orderId && e.orderId.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const handleCopy = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(`Copiado: ${text}`, {
            duration: 1500,
            position: 'bottom-center'
        });
    }

    // Formateamos la fecha para el reporte visual (ej: "Lunes, 21 de Enero")
    const displayDate = format(new Date(fecha + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: es });

    return (
        <div className="space-y-6">
            
            {/* --- ZONA DE REPORTE (Ideal para captura de WhatsApp) --- */}
            <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-md">
                <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-lg text-white">
                            <Package className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Reporte de Despacho</h2>
                            <div className="flex items-center gap-1.5 text-slate-500 font-medium text-sm">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                <span className="capitalize">{displayDate}</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Tarjetas de Datos */}
                    <div className="flex flex-wrap gap-3">
                        {/* Tarjeta 1: Total */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 flex flex-col items-center min-w-[120px]">
                            <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Pedidos</span>
                            <span className="text-2xl font-black text-slate-700">{filtered.length}</span>
                        </div>

                        {/* Tarjeta 2: Aprobados (Placeholder solicitado) */}
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-3 flex flex-col items-center min-w-[140px]">
                            <span className="text-[10px] uppercase font-bold text-emerald-500 mb-1 tracking-wider">Control de preparacion</span>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-sm font-bold text-emerald-700">TODO APROBADO</span>
                            </div>
                        </div>

                        {/* Tarjeta 3: Hora del reporte (Opcional, pero útil para WhatsApp) */}
                        <div className="hidden md:flex bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 flex-col items-center">
                            <span className="text-[10px] uppercase font-bold text-amber-500 mb-1">Sincronizado</span>
                            <div className="flex items-center gap-1 text-amber-700 font-mono text-sm">
                                <Clock className="h-3.5 w-3.5" />
                                {format(new Date(), "HH:mm")}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- CONTROLES Y FILTROS (No necesitas sacarle foto a esto) --- */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-dashed">
                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-bold uppercase text-slate-500 ml-1">Cambiar Fecha</Label>
                    <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white shadow-sm">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        <input 
                            type="date" 
                            value={fecha} 
                            onChange={(e) => setFecha(e.target.value)}
                            className="bg-transparent text-sm font-medium outline-none cursor-pointer"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2 flex-1 max-w-md">
                    <Label className="text-xs font-bold uppercase text-slate-500 ml-1">Buscador rápido</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Shipping ID, Venta o Producto..."
                            className="pl-10 bg-white shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* --- TABLA --- */}
            <div className="rounded-xl border shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[180px] font-semibold text-[12px]">Venta / Shipping ID</TableHead>
                            <TableHead className="font-semibold text-[12px]">Detalle de Productos</TableHead>
                            <TableHead className="font-semibold text-[12px]">Agregados</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                                    <p className="text-slate-400 mt-2">Cargando registros...</p>
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-20 text-slate-400">
                                    No se encontraron pedidos despachados para esta fecha.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((envio) => (
                                <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="py-4 space-y-1">
                                        <div 
                                            onClick={() => handleCopy(envio.id)}
                                            className="font-mono text-[11px] font-bold text-slate-600 cursor-pointer hover:text-blue-600"
                                        >
                                            {envio.id}
                                        </div>
                                        {envio.orderId && (
                                            <div 
                                                onClick={() => handleCopy(envio.orderId)}
                                                className="font-mono text-[11px] font-bold text-slate-400 cursor-pointer hover:text-blue-600"
                                            >
                                                 {envio.orderId}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <p className="text-[13px] text-slate-800 font-medium">{envio.resumen}</p>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1.5">
                                            {envio.items.map((item: any) => (
                                                <div key={item.id}>
                                                    {item.agregadoInfo?.ids_articulos?.split(',').map((id: string, idx: number) => {
                                                        const nombres = item.agregadoInfo.nombres_articulos?.split(' | ') || [];
                                                        const cleanId = id.trim();
                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                onClick={() => handleCopy(cleanId)}
                                                                className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-2 py-1 cursor-pointer hover:bg-blue-50 transition-all group"
                                                            >
                                                                <span className="text-blue-600 font-mono text-[10px] font-bold">{cleanId}</span>
                                                                <span className="text-slate-600 text-[10px] font-medium border-l pl-2">{nombres[idx]?.trim()}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
