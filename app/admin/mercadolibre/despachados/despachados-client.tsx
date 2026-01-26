"use client"

import { useState, useEffect, useRef } from "react"
import { getEtiquetasPreparadas } from "@/app/actions/envios"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Search, CalendarIcon, Loader2, CheckCircle2, Image as ImageIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { toBlob } from "html-to-image"

export function DespachadosClient() {
    const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"))
    const [loading, setLoading] = useState(true)
    const [envios, setEnvios] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    
    const areaCapturaRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const res = await getEtiquetasPreparadas(fecha)
            if (res.success) setEnvios(res.data)
            setLoading(false)
        }
        load()
    }, [fecha])

    const filtered = envios.filter(e => 
        e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.items.some((i: any) => i.title.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const handleCopyText = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success("Copiado al portapapeles")
    }

    const downloadReportImage = async () => {
        if (!areaCapturaRef.current) return;
        
        try {
            const blob = await toBlob(areaCapturaRef.current, {
                backgroundColor: '#ffffff',
                quality: 1,
                pixelRatio: 2
            });
            
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `reporte-preparados-${fecha}.png`;
                link.href = url;
                link.click();
                toast.success("Imagen generada correctamente");
            }
        } catch (err) {
            toast.error("Error al generar la imagen");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-4 rounded-xl border shadow-sm">
                <div className="grid gap-2">
                    <Label htmlFor="fecha" className="text-xs font-semibold uppercase text-slate-500">Fecha de Preparación</Label>
                    <div className="relative">
                        <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            id="fecha"
                            type="date"
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                            className="pl-9 w-[200px] border-slate-200 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="grid gap-2 flex-1">
                    <Label htmlFor="search" className="text-xs font-semibold uppercase text-slate-500">Buscar pedido o producto</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            id="search"
                            placeholder="Ej: 43292831..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 border-slate-200 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <Button 
                    onClick={downloadReportImage}
                    variant="outline"
                    className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                    <ImageIcon className="h-4 w-4" />
                    Generar Reporte
                </Button>
            </div>

            <div 
                ref={areaCapturaRef} 
                className="bg-white border rounded-xl overflow-hidden shadow-sm"
                style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }} 
            >
                <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">Reporte de Preparación</h3>
                        <p className="text-slate-400 text-sm">
                            {format(new Date(fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black text-blue-400">{filtered.length}</span>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Pedidos Listos</p>
                    </div>
                </div>

                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[100px] text-[10px] uppercase font-bold text-slate-500">Estado</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Detalle de Productos y SKUs</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-32 text-center">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                                    <p className="text-sm text-slate-500 mt-2">Cargando preparados...</p>
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-32 text-center text-slate-500 italic">
                                    No hay pedidos preparados en esta fecha.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((envio) => (
                                <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors border-b last:border-0">
                                    <TableCell className="align-top py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[10px]">
                                                <CheckCircle2 className="h-3 w-3" />
                                                LISTO
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400">#{envio.id}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4">
                                        <div className="space-y-4">
                                            {envio.items.map((item: any, i: number) => (
                                                <div key={i} className="flex flex-col gap-2">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-slate-800 leading-tight">
                                                                {item.quantity}x {item.title}
                                                            </p>
                                                            {item.variation && (
                                                                <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                                    Var: {item.variation}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {item.agregadoInfo?.ids_articulos && (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {item.agregadoInfo.ids_articulos.split(',').map((id: string, idx: number) => {
                                                                const nombres = item.agregadoInfo.nombres_articulos.split('|');
                                                                const cleanId = id.trim();
                                                                return (
                                                                    <div 
                                                                        key={idx} 
                                                                        onClick={() => handleCopyText(cleanId)}
                                                                        className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 cursor-pointer hover:bg-blue-50 transition-all"
                                                                    >
                                                                        <span className="text-blue-600 font-mono text-[10px] font-bold">{cleanId}</span>
                                                                        <span className="text-slate-600 text-[10px] font-medium border-l pl-2">{nombres[idx]?.trim()}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
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
