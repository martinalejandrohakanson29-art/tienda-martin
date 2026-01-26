"use client"

import { useState, useEffect, useRef } from "react"
// LOGICA ACTUAL: Usamos Preparadas, no Despachadas
import { getEtiquetasPreparadas } from "@/app/actions/envios" 
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Search, CalendarIcon, Loader2, CheckCircle2, Package, Clock, Copy, Image as ImageIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { toBlob } from "html-to-image"

export function DespachadosClient() {
    const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"))
    const [loading, setLoading] = useState(true)
    const [envios, setEnvios] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    
    // Referencia para capturar el diseño cuadrado
    const areaCapturaRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            // LOGICA ACTUAL: Llamada a la API original
            const res = await getEtiquetasPreparadas(fecha)
            if (res.success) setEnvios(res.data)
            setLoading(false)
        }
        load()
    }, [fecha])

    // LOGICA ACTUAL + VISUAL NUEVA: Filtro combinado
    // Mantenemos la búsqueda por ID, pero agregamos la búsqueda por TITULO de items (logic original)
    const filtered = envios.filter(e => 
        e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.resumen && e.resumen.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.orderId && e.orderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        // Recuperado del original: Buscar dentro de los items
        e.items.some((i: any) => i.title.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    // Función mágica para copiar como imagen (Del snippet nuevo)
    const copiarComoImagen = async () => {
        if (!areaCapturaRef.current) return;
        
        try {
            const blob = await toBlob(areaCapturaRef.current, {
                cacheBust: true,
                backgroundColor: '#ffffff',
                quality: 1,
                pixelRatio: 2 // Mejor calidad para retina/celulares
            });
            
            if (blob) {
                const item = new ClipboardItem({ "image/png": blob });
                await navigator.clipboard.write([item]);
                toast.success("¡Imagen copiada! Ya podés pegarla en WhatsApp", {
                    position: "bottom-center",
                });
            }
        } catch (err) {
            console.error(err);
            toast.error("No se pudo copiar la imagen");
        }
    };

    const handleCopyText = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(`Copiado: ${text}`, { duration: 1500 });
    }

    const displayDate = format(new Date(fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es });

    return (
        <div className="space-y-8">
            
            {/* --- CONTENEDOR DEL RESUMEN CUADRADO (VISUAL NUEVA) --- */}
            <div className="flex flex-col items-center justify-center py-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                
                <div 
                    ref={areaCapturaRef}
                    className="w-[380px] h-[380px] bg-white p-8 rounded-[40px] shadow-2xl flex flex-col justify-between border border-slate-100 relative overflow-hidden"
                >
                    {/* Decoración de fondo */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50" />
                    
                    {/* Cabecera: Fecha */}
                    <div className="text-center relative z-10">
                        <div className="inline-flex p-3 bg-blue-600 rounded-2xl text-white mb-4 shadow-lg shadow-blue-200">
                            <Package className="h-6 w-6" />
                        </div>
                        <h2 className="text-slate-400 uppercase text-[12px] font-black tracking-[0.2em] mb-1">Reporte de Preparación</h2>
                        <h3 className="text-2xl font-black text-slate-800 capitalize">{displayDate}</h3>
                    </div>

                    {/* Cuerpo: Estadísticas en Grilla */}
                    <div className="grid grid-cols-1 gap-4 relative z-10">
                        <div className="bg-slate-50 rounded-3xl p-5 flex items-center justify-between border border-slate-100">
                            <span className="text-slate-500 font-bold text-sm">TOTAL PREPARADOS</span>
                            <span className="text-4xl font-black text-blue-600">{filtered.length}</span>
                        </div>
                        
                        <div className="bg-emerald-50 rounded-3xl p-5 flex items-center justify-between border border-emerald-100">
                            <div className="flex flex-col">
                                <span className="text-emerald-600 font-bold text-[10px] uppercase tracking-wider">ESTADO DEL PROCESO</span>
                                <span className="text-emerald-700 font-black text-sm">LISTO PARA ENVÍO</span>
                            </div>
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        </div>
                    </div>

                    {/* Pie: Hora y Marca */}
                    <div className="flex justify-between items-end border-t border-slate-100 pt-4 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Revolución Motos</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 rounded-full border border-amber-100">
                            <Clock className="h-3 w-3 text-amber-500" />
                            <span className="text-[11px] font-bold text-amber-600">{format(new Date(), "HH:mm")} hs</span>
                        </div>
                    </div>
                </div>

                {/* Botón de acción (fuera del área de captura) */}
                <Button 
                    onClick={copiarComoImagen}
                    className="mt-6 rounded-full bg-slate-800 hover:bg-black text-white px-8 py-6 shadow-xl transition-all hover:scale-105 active:scale-95 gap-2"
                >
                    <ImageIcon className="h-5 w-5" />
                    Copiar Imagen para WhatsApp
                </Button>
            </div>

            {/* --- FILTROS (VISUAL NUEVA) --- */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-col gap-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Filtrar Fecha</Label>
                    <Input 
                        type="date" 
                        value={fecha} 
                        onChange={(e) => setFecha(e.target.value)}
                        className="border rounded-xl px-4 py-2 text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all w-[180px]"
                    />
                </div>

                <div className="flex flex-col gap-2 flex-1 max-w-md">
                    <Label className="text-xs font-bold uppercase text-slate-500">Buscador</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar pedido, producto o ID..."
                            className="pl-10 rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* --- TABLA (VISUAL NUEVA + DATOS COMPLETOS) --- */}
            <div className="rounded-2xl border shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[180px] font-bold text-[11px] uppercase text-slate-500">Venta / ID</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500">Productos</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500">Agregados</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-20 text-slate-300 font-medium">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                                    Cargando datos...
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-20 text-slate-400 italic">
                                    No hay registros preparados para esta fecha.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((envio) => (
                                <TableRow key={envio.id} className="hover:bg-slate-50/30">
                                    <TableCell className="py-4 align-top">
                                        <div onClick={() => handleCopyText(envio.id)} className="font-mono text-[11px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">
                                            {envio.id}
                                        </div>
                                        {envio.orderId && (
                                            <div onClick={() => handleCopyText(envio.orderId)} className="font-mono text-[10px] text-slate-400 cursor-pointer hover:text-blue-600 mt-1">
                                                 {envio.orderId}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="align-top">
                                        {/* LOGICA ORIGINAL INTEGRADA: Mostramos items detallados si el resumen es pobre */}
                                        <div className="flex flex-col gap-2">
                                            {envio.resumen && (
                                                <p className="text-[12px] font-semibold text-slate-800 mb-1">{envio.resumen}</p>
                                            )}
                                            
                                            {/* Iteramos items como en el original para no perder detalle */}
                                            {envio.items.map((item: any, i: number) => (
                                                <div key={i} className="flex flex-col">
                                                     <p className="text-xs text-slate-600 leading-tight">
                                                        <span className="font-bold">{item.quantity}x</span> {item.title}
                                                    </p>
                                                    {item.variation && (
                                                        <span className="text-[10px] text-slate-400">Var: {item.variation}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <div className="flex flex-col gap-1.5">
                                            {envio.items.map((item: any) => (
                                                <div key={item.id}>
                                                    {item.agregadoInfo?.ids_articulos?.split(',').map((id: string, idx: number) => {
                                                        const nombres = item.agregadoInfo.nombres_articulos?.split('|') || []; // Nota: ajuste separador según original
                                                        const cleanId = id.trim();
                                                        if(!cleanId) return null;
                                                        
                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                onClick={() => handleCopyText(cleanId)}
                                                                className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 cursor-pointer hover:bg-blue-50 transition-all mb-1"
                                                            >
                                                                <span className="text-blue-600 font-mono text-[10px] font-bold">{cleanId}</span>
                                                                <span className="text-slate-600 text-[10px] font-medium border-l pl-2 truncate max-w-[150px]">{nombres[idx]?.trim()}</span>
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
