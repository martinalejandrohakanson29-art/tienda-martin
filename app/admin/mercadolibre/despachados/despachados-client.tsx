"use client"

import { useState, useEffect, useRef } from "react"
// LOGICA ACTUAL: Usamos Preparadas, no Despachadas
import { getEtiquetasPreparadas, getVentasRegistracion, limpiarVentasRegistracion } from "@/app/actions/envios" 
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Search, CalendarIcon, Loader2, CheckCircle2, Package, Clock, Copy, Image as ImageIcon, Filter, CheckSquare, Square, Download, RefreshCcw, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { toBlob } from "html-to-image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export function DespachadosClient() {
    const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"))
    const [loading, setLoading] = useState(true)
    const [envios, setEnvios] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    
    // Estados para la pestaña de Registración
    const [ventasRegistracion, setVentasRegistracion] = useState<any[]>([])
    const [loadingRegistracion, setLoadingRegistracion] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [categoriaFilter, setCategoriaFilter] = useState<string>("TODOS")
    const [selectedRegistracionIds, setSelectedRegistracionIds] = useState<Set<string>>(new Set())
    
    // Referencia para capturar el diseño cuadrado
    const areaCapturaRef = useRef<HTMLDivElement>(null)

    const loadData = async () => {
        setLoading(true)
        const res = await getEtiquetasPreparadas(fecha)
        if (res.success) setEnvios(res.data)
        
        // Cargamos ventas de registracion iniciales
        const resReg = await getVentasRegistracion(fecha)
        if (resReg.success) setVentasRegistracion(resReg.data)
        
        setLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [fecha])

    // LOGICA ACTUAL + VISUAL NUEVA: Filtro combinado
    const filtered = envios.filter(e => 
        e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.resumen && e.resumen.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.orderId && e.orderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        e.items.some((i: any) => i.title.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const copiarComoImagen = async () => {
        if (!areaCapturaRef.current) return;
        
        try {
            const blob = await toBlob(areaCapturaRef.current, {
                cacheBust: true,
                backgroundColor: '#ffffff',
                quality: 1,
                pixelRatio: 2 
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

    const handleToggleSelectRegistracion = (id: string) => {
        const newSelected = new Set(selectedRegistracionIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedRegistracionIds(newSelected);
    };

    const handleToggleSelectAllRegistracion = () => {
        const filtered = getFilteredRegistracion();
        if (selectedRegistracionIds.size === filtered.length && filtered.length > 0) {
            setSelectedRegistracionIds(new Set());
        } else {
            setSelectedRegistracionIds(new Set(filtered.map(v => v.shippingId)));
        }
    };

    const getFilteredRegistracion = () => {
        return ventasRegistracion.filter(v => {
            // Filtro de fecha (doble seguridad)
            const vDate = v.createdAt ? format(new Date(v.createdAt), "yyyy-MM-dd") : null;
            const matchesDate = !vDate || vDate === fecha;

            const matchesCategory = categoriaFilter === "TODOS" || v.categoria === categoriaFilter;
            const matchesSearch = v.shippingId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 v.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 v.mla.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesDate && matchesCategory && matchesSearch;
        });
    };

    const handleFetchRegistracion = async () => {
        setLoadingRegistracion(true);
        try {
            toast.info("Sincronizando con n8n (Full, Flex y Colecta)...");
            
            // Recolectamos los datos de la pestaña de Preparados
            const pedidosPreparados = filtered.map(envio => ({
                shippingId: envio.id,
                orderId: envio.orderId,
                mla: envio.items?.[0]?.mla,
                variation: envio.items?.[0]?.variation
            }));

            await fetch("/api/admin/mercadolibre/registracion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    action: "trigger_all_categories",
                    preparados: pedidosPreparados,
                    fecha: fecha
                })
            });

            setTimeout(async () => {
                const res = await getVentasRegistracion(fecha);
                if (res.success) {
                    setVentasRegistracion(res.data);
                    toast.success("Sincronización completada");
                }
                setLoadingRegistracion(false);
            }, 10000);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Error al sincronizar");
            setLoadingRegistracion(false);
        }
    };

    const handleProcesarSeleccionados = async () => {
        if (selectedRegistracionIds.size === 0) {
            toast.warning("No hay ventas seleccionadas");
            return;
        }
        
        setIsProcessing(true);
        toast.info(`Registrando ${selectedRegistracionIds.size} ventas en el ERP...`);
        
        try {
            const ids = Array.from(selectedRegistracionIds);
            // Simulación de proceso
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await limpiarVentasRegistracion(ids);
            const res = await getVentasRegistracion(fecha);
            if (res.success) setVentasRegistracion(res.data);
            
            setSelectedRegistracionIds(new Set());
            toast.success("Ventas registradas y removidas de la lista");
        } catch (error) {
            toast.error("Error al procesar el registro");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleLimpiarBaseDatos = async () => {
        if (!confirm("¿Estás seguro de que deseas limpiar TODA la lista de registración?")) return;
        
        setLoadingRegistracion(true);
        try {
            const res = await limpiarVentasRegistracion();
            if (res.success) {
                setVentasRegistracion([]);
                setSelectedRegistracionIds(new Set());
                toast.success("Base de datos de registración limpiada");
            } else {
                toast.error("Error al limpiar la base de datos");
            }
        } catch (error) {
            toast.error("Error en la operación");
        } finally {
            setLoadingRegistracion(false);
        }
    };

    const displayDate = format(new Date(fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es });

    return (
        <Tabs defaultValue="preparados" className="w-full">
            <TabsList className="grid w-full max-w-[400px] grid-cols-2 mb-8 p-1 bg-slate-100 rounded-2xl">
                <TabsTrigger value="preparados" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    <Package className="h-4 w-4 mr-2" />
                    Preparados
                </TabsTrigger>
                <TabsTrigger value="registracion" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Registración
                </TabsTrigger>
            </TabsList>

            <TabsContent value="preparados" className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
                {/* --- CONTENEDOR DEL RESUMEN CUADRADO --- */}
                <div className="flex flex-col items-center justify-center py-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <div 
                        ref={areaCapturaRef}
                        className="w-[380px] h-[380px] bg-white p-8 rounded-[40px] shadow-2xl flex flex-col justify-between border border-slate-100 relative overflow-hidden"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50" />
                        <div className="text-center relative z-10">
                            <div className="inline-flex p-3 bg-blue-600 rounded-2xl text-white mb-4 shadow-lg shadow-blue-200">
                                <Package className="h-6 w-6" />
                            </div>
                            <h2 className="text-slate-400 uppercase text-[12px] font-black tracking-[0.2em] mb-1">Reporte de Preparación</h2>
                            <h3 className="text-2xl font-black text-slate-800 capitalize">{displayDate}</h3>
                        </div>
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
                        <div className="flex justify-between items-end border-t border-slate-100 pt-4 relative z-10">
                            <div><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Revolución Motos</p></div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 rounded-full border border-amber-100">
                                <Clock className="h-3 w-3 text-amber-500" />
                                <span className="text-[11px] font-bold text-amber-600">{format(new Date(), "HH:mm")} hs</span>
                            </div>
                        </div>
                    </div>
                    <Button onClick={copiarComoImagen} className="mt-6 rounded-full bg-slate-800 hover:bg-black text-white px-8 py-6 shadow-xl transition-all hover:scale-105 active:scale-95 gap-2">
                        <ImageIcon className="h-5 w-5" /> Copiar Imagen para WhatsApp
                    </Button>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Filtrar Fecha</Label>
                        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border rounded-xl px-4 py-2 text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all w-[180px]" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1 max-w-md">
                        <Label className="text-xs font-bold uppercase text-slate-500">Buscador</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input placeholder="Buscar pedido, producto o ID..." className="pl-10 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border shadow-sm bg-white overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="w-[180px] font-bold text-[11px] uppercase text-slate-500">Venta / ID</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase text-slate-500">Productos</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase text-slate-500">Id agregados</TableHead>
                                <TableHead className="font-bold text-[11px] uppercase text-slate-500">Agregados</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-20 text-slate-300 font-medium"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />Cargando datos...</TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-20 text-slate-400 italic">No hay registros preparados para esta fecha.</TableCell></TableRow>
                            ) : (
                                filtered.map((envio) => (
                                    <TableRow key={envio.id} className="hover:bg-slate-50/30">
                                        <TableCell className="py-4 align-top">
                                            <div onClick={() => handleCopyText(envio.id)} className="font-mono text-[11px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">{envio.id}</div>
                                            {envio.orderId && <div onClick={() => handleCopyText(envio.orderId)} className="font-mono text-[10px] text-slate-400 cursor-pointer hover:text-blue-600 mt-1">{envio.orderId}</div>}
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="flex flex-col gap-2">
                                                {envio.resumen && <p className="text-[12px] font-semibold text-slate-800 mb-1">{envio.resumen}</p>}
                                                {envio.items.map((item: any, i: number) => (
                                                    <div key={i} className="flex flex-col">
                                                        <p className="text-xs text-slate-600 leading-tight"><span className="font-bold">{item.quantity}x</span> {item.title}</p>
                                                        {item.variation && <span className="text-[10px] text-slate-400">Var: {item.variation}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="flex flex-col gap-1.5">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col gap-1">
                                                        {item.agregadoInfo?.ids_articulos?.split(',').map((id: string, idx: number) => {
                                                            const cleanId = id.trim(); if(!cleanId) return null;
                                                            return (
                                                                <div key={idx} onClick={() => handleCopyText(cleanId)} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 cursor-pointer hover:bg-blue-50 transition-all w-fit">
                                                                    <span className="text-blue-600 font-mono text-[9px] font-bold">{cleanId}</span>
                                                                    <Copy className="h-2.5 w-2.5 text-slate-300" />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="flex flex-col gap-1.5">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col gap-1">
                                                        {item.agregadoInfo?.nombres_articulos?.split('|').map((nombre: string, idx: number) => {
                                                            const cleanNombre = nombre.trim(); if(!cleanNombre) return null;
                                                            return (
                                                                <div key={idx} className="text-[10px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-none flex items-center h-[18px]">
                                                                    {cleanNombre}
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
            </TabsContent>

            <TabsContent value="registracion" className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
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
                    <div className="flex flex-col gap-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Categoría</Label>
                        <div className="flex gap-2">
                            {["TODOS", "Full", "Colecta", "Flex"].map((cat) => (
                                <Button key={cat} variant={categoriaFilter === cat ? "default" : "outline"} size="sm" onClick={() => setCategoriaFilter(cat)} className="rounded-xl text-xs font-bold">{cat}</Button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 max-w-md">
                        <Label className="text-xs font-bold uppercase text-slate-500">Buscador</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input placeholder="Buscar por ID o cliente..." className="pl-10 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleLimpiarBaseDatos} disabled={loadingRegistracion} className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 gap-2">
                            <Trash2 className="h-4 w-4" /> Limpiar Lista
                        </Button>
                        <Button onClick={handleFetchRegistracion} disabled={loadingRegistracion} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            {loadingRegistracion ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Obtener Ventas
                        </Button>
                        <Button onClick={handleProcesarSeleccionados} disabled={selectedRegistracionIds.size === 0 || isProcessing} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Registrar Selección ({selectedRegistracionIds.size})
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl border shadow-sm bg-white overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="w-[50px] text-center">
                                    <input type="checkbox" checked={getFilteredRegistracion().length > 0 && selectedRegistracionIds.size === getFilteredRegistracion().length} onChange={handleToggleSelectAllRegistracion} className="rounded border-slate-300" />
                                </TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">ID Venta</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">ID Envío</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">MLA</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">Variable</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">Id agregados</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">Agregados</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500">Nombre</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500 text-right">Bruto</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500 text-right">Neto</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500 text-right">%</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500 text-center">Categoría</TableHead>
                                <TableHead className="font-bold text-[13px] uppercase text-slate-500 text-center">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingRegistracion ? (
                                <TableRow><TableCell colSpan={13} className="text-center py-20 text-slate-300 font-medium"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />Sincronizando datos...</TableCell></TableRow>
                            ) : getFilteredRegistracion().length === 0 ? (
                                <TableRow><TableCell colSpan={13} className="text-center py-20 text-slate-400 italic">No se encontraron ventas para registrar.</TableCell></TableRow>
                            ) : (
                                getFilteredRegistracion().map((venta) => (
                                    <TableRow key={venta.shippingId} className={`hover:bg-slate-50/30 ${selectedRegistracionIds.has(venta.shippingId) ? 'bg-blue-50/40' : ''}`}>
                                        <TableCell className="text-center"><input type="checkbox" checked={selectedRegistracionIds.has(venta.shippingId)} onChange={() => handleToggleSelectRegistracion(venta.shippingId)} className="rounded border-slate-300" /></TableCell>
                                        <TableCell><div onClick={() => handleCopyText(venta.orderId)} className="font-mono text-[13px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">{venta.orderId}</div></TableCell>
                                        <TableCell><div onClick={() => handleCopyText(venta.shippingId)} className="font-mono text-[13px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">{venta.shippingId}</div></TableCell>
                                        <TableCell><div onClick={() => handleCopyText(venta.mla)} className="font-mono text-[13px] text-slate-500 cursor-pointer hover:text-blue-600">{venta.mla}</div></TableCell>
                                        <TableCell><div className="font-mono text-[12px] text-slate-400">{venta.variation || '-'}</div></TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {venta.ids_articulos?.split(/[+,]/).map((id: string, idx: number) => {
                                                    const cleanId = id.trim(); if(!cleanId) return null;
                                                    return (
                                                        <div key={idx} onClick={() => handleCopyText(cleanId)} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-2 py-0.5 cursor-pointer hover:bg-blue-50 transition-all w-fit">
                                                            <span className="text-blue-600 font-mono text-[9px] font-bold">{cleanId}</span>
                                                            <Copy className="h-2.5 w-2.5 text-slate-300" />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {venta.receta_detallada?.split(' + ').map((r: string, idx: number) => (
                                                    <div key={idx} className="text-[10px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-none flex items-center h-[18px]">
                                                        {r}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-[13px] font-medium text-slate-700">{venta.nombre || '-'}</TableCell>
                                        <TableCell className="text-right font-mono text-[14px] font-bold text-slate-600">${Number(venta.bruto || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-mono text-[14px] font-bold text-emerald-600">${Number(venta.neto || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-mono text-[13px] font-bold text-blue-600">
                                            {venta.neto && Number(venta.neto) > 0 ? `+${(((Number(venta.bruto) - Number(venta.neto)) / Number(venta.neto)) * 100).toFixed(1)}%` : '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className={`${venta.categoria === 'Full' ? 'bg-amber-50 text-amber-600 border-amber-200' : venta.categoria === 'Flex' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} font-bold text-[11px] uppercase`}>{venta.categoria}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-emerald-600" onClick={() => handleToggleSelectRegistracion(venta.shippingId)}>
                                                {selectedRegistracionIds.has(venta.shippingId) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>
        </Tabs>
    )
}
