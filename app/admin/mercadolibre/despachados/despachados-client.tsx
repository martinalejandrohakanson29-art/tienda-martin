// app/admin/mercadolibre/despachados/despachados-client.tsx
"use client"

import { useState, useEffect } from "react"
import { getEtiquetasDespachadas } from "@/app/actions/envios"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, CalendarIcon, PackageCheck, Loader2 } from "lucide-react"
import { format } from "date-fns"

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
        e.resumen?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Header de Filtros */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border shadow-sm">
                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-bold uppercase text-slate-500 ml-1">Fecha de Despacho</Label>
                    <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-slate-50">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        <input 
                            type="date" 
                            value={fecha} 
                            onChange={(e) => setFecha(e.target.value)}
                            className="bg-transparent text-sm font-medium outline-none"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                    <Label className="text-xs font-bold uppercase text-slate-500 ml-1">Buscador rápido</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por ID o Producto..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-6 py-2 flex flex-col items-center justify-center min-w-[140px]">
                    <span className="text-[10px] uppercase font-black text-emerald-600">Total Despachados</span>
                    <span className="text-2xl font-bold text-emerald-700">{filtered.length}</span>
                </div>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[150px] font-semibold text-[12px]">Venta / Shipping ID</TableHead>
                            <TableHead className="font-semibold text-[12px]">Detalle de Productos</TableHead>
                            <TableHead className="w-[350px] font-semibold text-[12px]">Configuración Técnica (Agregados)</TableHead>
                            <TableHead className="w-[120px] text-right font-semibold text-[12px]">Hora Despacho</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                                    <p className="text-slate-400 mt-2">Cargando registros...</p>
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-20 text-slate-400">
                                    No se encontraron pedidos despachados para esta fecha.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((envio) => (
                                <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="py-4">
                                        <div className="font-mono text-[11px] font-bold text-slate-600">{envio.id}</div>
                                        <div className="text-[10px] text-slate-400">Ref: {envio.orderId || 'S/D'}</div>
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
                                                        return (
                                                            <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                                                                <span className="text-blue-600 font-mono text-[10px] font-bold">{id.trim()}</span>
                                                                <span className="text-slate-600 text-[10px] font-medium border-l pl-2">{nombres[idx]?.trim()}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1 text-emerald-600 font-bold text-[13px]">
                                            <PackageCheck className="h-3 w-3" />
                                            {new Date(envio.updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
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
