"use client"

import { useState, useEffect, useRef, useMemo, Fragment } from "react"
// LOGICA ACTUAL: Usamos Preparadas, no Despachadas
import { getEtiquetasPreparadas, getVentasRegistracion, limpiarRegistrosViejos, registrarVentasML } from "@/app/actions/envios"
import { consultarPadron } from "@/app/actions/afip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Search, CalendarIcon, Loader2, CheckCircle2, Package, Clock, Copy, Image as ImageIcon, CheckSquare, Square, Download, RefreshCcw, AlertTriangle } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { toBlob } from "html-to-image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateRangeCalendar } from "@/app/admin/ventas-mostrador/date-range-calendar"

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
    const [registradaFilter, setRegistradaFilter] = useState<"TODAS" | "PENDIENTES" | "REGISTRADAS">("TODAS")

    // Fecha para pedirle a n8n qué ventas traer (un solo día, es lo que soporta el workflow)
    const [fechaVenta, setFechaVenta] = useState(format(new Date(), "yyyy-MM-dd"))

    // Rango para FILTRAR lo que ya está guardado en la base (independiente de la sincronización con n8n)
    const [fechaRangoDesde, setFechaRangoDesde] = useState("")
    const [fechaRangoHasta, setFechaRangoHasta] = useState("")

    // Estados para el Modal de Confirmación y Facturación
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
    const [solicitarFactura, setSolicitarFactura] = useState(true)
    const [tipoFactura, setTipoFactura] = useState(6) // Default B
    const [cuit, setCuit] = useState("")
    const [razonSocial, setRazonSocial] = useState("")
    const [condicionIvaEncontrada, setCondicionIvaEncontrada] = useState<number | null>(null)
    const [isSearchingPadron, setIsSearchingPadron] = useState(false)

    // Referencia para capturar el diseño cuadrado
    const areaCapturaRef = useRef<HTMLDivElement>(null)

    const loadData = async () => {
        setLoading(true)
        const res = await getEtiquetasPreparadas(fecha)
        if (res.success) setEnvios(res.data)
        setLoading(false)
    }

    const loadVentasRegistracion = async () => {
        setLoadingRegistracion(true)
        const resReg = await getVentasRegistracion(fechaRangoDesde || undefined, fechaRangoHasta || undefined)
        if (resReg.success) setVentasRegistracion(resReg.data)
        setLoadingRegistracion(false)
    }

    useEffect(() => {
        loadData()
    }, [fecha])

    useEffect(() => {
        loadVentasRegistracion()
    }, [fechaRangoDesde, fechaRangoHasta])

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
        const filtered = getFilteredRegistracion().filter(v => !v.registrada);
        if (filtered.length === 0) return;

        if (selectedRegistracionIds.size === filtered.length) {
            setSelectedRegistracionIds(new Set());
        } else {
            setSelectedRegistracionIds(new Set(filtered.map(v => v.orderId)));
        }
    };

    const getFilteredRegistracion = () => {
        return ventasRegistracion.filter(v => {
            const matchesCategory = categoriaFilter === "TODOS" || v.categoria === categoriaFilter;
            const matchesSearch = v.shippingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.mla.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (v.nombre && v.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesRegistrada =
                registradaFilter === "TODAS" ||
                (registradaFilter === "PENDIENTES" && !v.registrada) ||
                (registradaFilter === "REGISTRADAS" && v.registrada);
            return matchesCategory && matchesSearch && matchesRegistrada;
        });
    };

    const categoriaCounts = useMemo(() => {
        const counts: Record<string, number> = { TODOS: 0, Full: 0, Colecta: 0, Flex: 0 };
        ventasRegistracion.forEach(v => {
            counts.TODOS++;
            if (v.categoria && counts[v.categoria] !== undefined) {
                counts[v.categoria]++;
            }
        });
        return counts;
    }, [ventasRegistracion]);

    const groupedRegistracion = useMemo(() => {
        const filtered = getFilteredRegistracion();
        const result: { id: string; ventas: any[] }[] = [];
        const groupMap = new Map<string, any[]>();

        filtered.forEach((v) => {
            // Priorizamos packId para agrupar, si no existe usamos shippingId
            const groupId = v.packId || v.shippingId;
            if (!groupMap.has(groupId)) groupMap.set(groupId, []);
            groupMap.get(groupId)!.push(v);
        });

        const renderedGroups = new Set<string>();

        filtered.forEach((v) => {
            const groupId = v.packId || v.shippingId;
            if (!renderedGroups.has(groupId)) {
                result.push({ id: groupId, ventas: groupMap.get(groupId)! });
                renderedGroups.add(groupId);
            }
        });

        return result;
    }, [ventasRegistracion, categoriaFilter, searchTerm, registradaFilter]);

    const handleFetchRegistracion = async () => {
        setLoadingRegistracion(true);
        try {
            // Limpieza automática: se saca de en medio lo ya REGISTRADO y viejo antes de traer más datos.
            // Nunca toca PENDIENTE/ERROR (son ventas sin facturar todavía).
            await limpiarRegistrosViejos();

            toast.info("Sincronizando con n8n (Full, Flex y Colecta)...");

            // Recolectamos los datos de la pestaña de Preparados
            const pedidosPreparados = filtered.map(envio => ({
                shippingId: envio.id,
                orderId: envio.orderId,
                pack: envio.packId,
                mla: envio.items?.[0]?.mla,
                variation: envio.items?.[0]?.variation
            }));

            await fetch("/api/admin/mercadolibre/registracion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "trigger_all_categories",
                    preparados: pedidosPreparados,
                    fecha: fechaVenta
                })
            });

            setTimeout(async () => {
                const res = await getVentasRegistracion(fechaRangoDesde || undefined, fechaRangoHasta || undefined);
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

    const handleProcesarSeleccionados = () => {
        if (selectedRegistracionIds.size === 0) {
            toast.warning("No hay ventas seleccionadas");
            return;
        }
        setRazonSocial("");
        setCondicionIvaEncontrada(null);
        setIsConfirmModalOpen(true);
    };

    const handleBuscarPadron = async () => {
        const cleanCuit = cuit.replace(/\D/g, '');
        if (!cuit || (cleanCuit.length < 7)) {
            toast.error("Ingresá un CUIT (11 dígitos) o DNI (7-8 dígitos) válido");
            return;
        }

        setIsSearchingPadron(true);
        try {
            const res = await consultarPadron(cuit);
            if (res.success) {
                setRazonSocial(res.nombre || "");
                setCondicionIvaEncontrada(res.condicionIva || null);

                // Sugerencia automática de tipo de factura
                if (res.condicionIva === 1) setTipoFactura(1); // Si es RI -> Factura A
                else if (res.condicionIva === 6) setTipoFactura(6); // Si es Monotributo -> Factura B (el emisor suele ser RI)
                else setTipoFactura(6); // Consumidor Final -> Factura B

                toast.success("Datos obtenidos del padrón");
            } else {
                toast.error(res.error || "No se encontraron datos");
                setCondicionIvaEncontrada(null);
            }
        } catch (error) {
            toast.error("Error al consultar el padrón");
            setCondicionIvaEncontrada(null);
        } finally {
            setIsSearchingPadron(false);
        }
    };

    const confirmarProcesar = async () => {
        setIsConfirmModalOpen(false);
        setIsProcessing(true);
        toast.info(`Registrando ${selectedRegistracionIds.size} ventas en el ERP...`);

        try {
            const ids = Array.from(selectedRegistracionIds);

            // VALIDACIÓN: No permitir facturar si no hay artículos vinculados (receta vacía o undefined)
            const ventasAProcesar = ventasRegistracion.filter(v => ids.includes(v.orderId));
            const ventasSinArticulos = ventasAProcesar.filter(v => 
                !v.ids_articulos || 
                v.ids_articulos.includes('undefined') || 
                v.ids_articulos.includes('undefinied') ||
                !v.receta_detallada || 
                v.receta_detallada.includes('Sin descripción') ||
                v.receta_detallada.includes('undefined') ||
                v.receta_detallada.includes('undefinied')
            );

            if (ventasSinArticulos.length > 0) {
                const primerId = ventasSinArticulos[0].shippingId || ventasSinArticulos[0].orderId;
                toast.error(`Error: La venta ${primerId} no tiene artículos vinculados en la base de datos (Receta vacía o indefinida). Debes vincular el MLA con sus artículos internos antes de facturar.`);
                setIsProcessing(false);
                return;
            }

            // Lógica de parámetros según tipo de factura
            let docTipo = 99;
            let docNro = "";
            let condicionIva = condicionIvaEncontrada || 5;

            if (tipoFactura === 1) { // Factura A
                docTipo = 80;
                docNro = cuit.replace(/\D/g, ''); // Limpiar a solo números

                // VALIDACIÓN CRÍTICA
                if (condicionIva !== 1) {
                    toast.error("ERROR: No se puede emitir Factura A a un cliente que no es Responsable Inscripto.");
                    setIsProcessing(false);
                    return;
                }

                condicionIva = 1;

                if (docNro.length !== 11) {
                    toast.error("El CUIT debe tener 11 dígitos");
                    setIsProcessing(false);
                    setIsConfirmModalOpen(true);
                    return;
                }
            } else if (tipoFactura === 11) { // Factura C (Uso interno o emisor Monotributista)
                condicionIva = 6;
                docTipo = 80;
                docNro = cuit.replace(/\D/g, '');
            } else {
                // Factura B
                if (cuit && cuit.length >= 7) {
                    docTipo = cuit.length === 11 ? 80 : 96; // 80=CUIT, 96=DNI
                    docNro = cuit.replace(/\D/g, '');
                }
            }

            const res = await registrarVentasML(ids, solicitarFactura, tipoFactura, docTipo, docNro, condicionIva, razonSocial);

            if (res.success) {
                toast.success(res.message || "Ventas registradas con éxito");
                if (res.erroresDetalle && res.erroresDetalle.length > 0) {
                    res.erroresDetalle.forEach((e: { orderId: string; shippingId: string; motivo: string }) => {
                        toast.error(
                            `Venta NO registrada — Envío: ${e.shippingId}\nMotivo: ${e.motivo}`,
                            { duration: 15000 }
                        );
                    });
                }
                const resReg = await getVentasRegistracion(fechaRangoDesde || undefined, fechaRangoHasta || undefined);
                if (resReg.success) setVentasRegistracion(resReg.data);
                setSelectedRegistracionIds(new Set());
            } else {
                toast.error(res.error || "Error al registrar las ventas");
            }
        } catch (error) {
            console.error(error);
            toast.error("Error al procesar el registro");
        } finally {
            setIsProcessing(false);
        }
    };

    const displayDate = format(new Date(fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es });

    return (
        <>
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
                                    <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-300 font-medium"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />Cargando datos...</TableCell></TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-400 italic">No hay registros preparados para esta fecha.</TableCell></TableRow>
                                ) : (
                                    filtered.map((envio) => (
                                        <TableRow key={envio.id} className="hover:bg-slate-50/30">
                                            <TableCell className="py-4 align-top">
                                                <div onClick={() => handleCopyText(envio.id)} className="font-mono text-[11px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">{envio.id}</div>
                                                {envio.orderId && <div onClick={() => handleCopyText(envio.orderId)} className="font-mono text-[10px] text-slate-400 cursor-pointer hover:text-blue-600 mt-1">{envio.orderId}</div>}
                                                {envio.packId && <div onClick={() => handleCopyText(envio.packId)} className="font-mono text-[10px] text-amber-600 font-bold cursor-pointer hover:text-blue-600 mt-1">Pack: {envio.packId}</div>}
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
                                                                const cleanId = id.trim(); if (!cleanId) return null;
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
                                                                const cleanNombre = nombre.trim(); if (!cleanNombre) return null;
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
                    <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-wrap">
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Fecha a sincronizar (ML)</Label>
                            <Input
                                type="date"
                                value={fechaVenta}
                                onChange={(e) => setFechaVenta(e.target.value)}
                                className="border rounded-xl px-4 py-2 text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all w-[160px]"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Ver rango guardado</Label>
                            <DateRangeCalendar
                                fechaDesde={fechaRangoDesde}
                                fechaHasta={fechaRangoHasta}
                                setFechaDesde={setFechaRangoDesde}
                                setFechaHasta={setFechaRangoHasta}
                                onApply={() => {}}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Categoría</Label>
                            <div className="flex gap-2">
                                {["TODOS", "Full", "Colecta", "Flex"].map((cat) => (
                                    <Button
                                        key={cat}
                                        variant={categoriaFilter === cat ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCategoriaFilter(cat)}
                                        className="rounded-xl text-xs font-bold gap-2"
                                    >
                                        {cat}
                                        <Badge
                                            variant={categoriaFilter === cat ? "secondary" : "outline"}
                                            className={`px-1.5 py-0 h-5 min-w-[20px] justify-center ${categoriaFilter === cat ? 'bg-white/20 text-white border-none' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            {categoriaCounts[cat] || 0}
                                        </Badge>
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Estado</Label>
                            <div className="flex gap-2">
                                {([
                                    { value: "TODAS", label: "Todas" },
                                    { value: "PENDIENTES", label: "Pendientes" },
                                    { value: "REGISTRADAS", label: "Registradas" },
                                ] as const).map(({ value, label }) => (
                                    <Button
                                        key={value}
                                        variant={registradaFilter === value ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setRegistradaFilter(value)}
                                        className={`rounded-xl text-xs font-bold ${
                                            registradaFilter === value && value === "PENDIENTES" ? "bg-amber-500 hover:bg-amber-600 border-amber-500" :
                                            registradaFilter === value && value === "REGISTRADAS" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : ""
                                        }`}
                                    >
                                        {label}
                                    </Button>
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
                                        <input
                                            type="checkbox"
                                            checked={getFilteredRegistracion().filter(v => !v.registrada).length > 0 && selectedRegistracionIds.size === getFilteredRegistracion().filter(v => !v.registrada).length}
                                            onChange={handleToggleSelectAllRegistracion}
                                            className="rounded border-slate-300"
                                        />
                                    </TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Venta / ID</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Fecha</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Productos</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Id agregados</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Agregados</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500">Nombre</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-right">Bruto</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-right">Neto</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-right">%</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-center">Categoría</TableHead>
                                    <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-center">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingRegistracion ? (
                                    <TableRow><TableCell colSpan={13} className="text-center py-20 text-slate-300 font-medium"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />Sincronizando datos...</TableCell></TableRow>
                                ) : groupedRegistracion.length === 0 ? (
                                    <TableRow><TableCell colSpan={13} className="text-center py-20 text-slate-400 italic">No se encontraron ventas para registrar.</TableCell></TableRow>
                                ) : (
                                    groupedRegistracion.map((group) => {
                                        const isPack = group.ventas[0].packId && group.ventas.length > 1;
                                        const allOrderIds = group.ventas.map(v => v.orderId);
                                        const allRegistrada = group.ventas.every(v => v.registrada);
                                        const someRegistrada = group.ventas.some(v => v.registrada);
                                        const allSelected = allOrderIds.every(id => selectedRegistracionIds.has(id));
                                        const erroresEnGrupo = group.ventas.filter(v => v.estado === "ERROR");
                                        const algunaCancelada = group.ventas.some(v => v.estadoPedidoVenta === "CANCELADO");

                                        const totalBruto = group.ventas.reduce((acc, v) => acc + Number(v.bruto || 0), 0);
                                        const totalNeto = group.ventas.reduce((acc, v) => acc + Number(v.neto || 0), 0);

                                        return (
                                            <TableRow
                                                key={group.id}
                                                className={`hover:bg-slate-50/30 ${allSelected ? 'bg-blue-50/40' : ''} ${allRegistrada ? 'opacity-80 bg-slate-50/50' : ''} ${group.ventas[0].packId ? 'border-l-4 border-l-amber-400 bg-amber-50/10' : ''}`}
                                            >
                                                <TableCell className="text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={() => {
                                                            const newSelected = new Set(selectedRegistracionIds);
                                                            if (allSelected) {
                                                                allOrderIds.forEach(id => newSelected.delete(id));
                                                            } else {
                                                                group.ventas.forEach(v => {
                                                                    if (!v.registrada) newSelected.add(v.orderId);
                                                                });
                                                            }
                                                            setSelectedRegistracionIds(newSelected);
                                                        }}
                                                        disabled={allRegistrada}
                                                        className="rounded border-slate-300 disabled:opacity-30"
                                                    />
                                                </TableCell>
                                                <TableCell className="py-4 align-top">
                                                    <div onClick={() => handleCopyText(group.ventas[0].shippingId)} className="font-mono text-[11px] font-bold text-slate-600 cursor-pointer hover:text-blue-600">{group.ventas[0].shippingId}</div>
                                                    <div className="flex flex-col mt-1">
                                                        {group.ventas.map(v => (
                                                            <div key={v.orderId} onClick={() => handleCopyText(v.orderId)} className="font-mono text-[10px] text-slate-400 cursor-pointer hover:text-blue-600">
                                                                {v.orderId}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {group.ventas[0].packId && <div onClick={() => handleCopyText(group.ventas[0].packId)} className="font-mono text-[10px] text-amber-600 font-bold cursor-pointer hover:text-blue-600 mt-1">Pack: {group.ventas[0].packId}</div>}
                                                </TableCell>
                                                <TableCell className="align-top whitespace-nowrap">
                                                    <div className="text-xs font-bold text-slate-700">{format(new Date(group.ventas[0].createdAt), "dd/MM/yy")}</div>
                                                    <div className="text-[10px] text-slate-400">{format(new Date(group.ventas[0].createdAt), "HH:mm")} hs</div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="flex flex-col gap-2">
                                                        {group.ventas.map(v => (
                                                            <div key={v.orderId} className="flex flex-col">
                                                                <p className="text-xs text-slate-600 leading-tight">
                                                                    <span className="font-bold">{v.cantidad}x</span> {v.titulo}
                                                                </p>
                                                                <div className="flex gap-2 items-center">
                                                                    <span onClick={() => handleCopyText(v.mla)} className="text-[10px] text-slate-400 font-mono cursor-pointer hover:text-blue-600">({v.mla})</span>
                                                                    {v.variation && <span className="text-[10px] text-slate-400">Var: {v.variation}</span>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="flex flex-col gap-2">
                                                        {group.ventas.map(v => (
                                                            <div key={v.orderId} className="flex flex-col gap-1">
                                                                {v.ids_articulos && v.ids_articulos !== 'undefined' && v.ids_articulos !== 'undefinied' ? v.ids_articulos.split(',').map((id: string, idx: number) => {
                                                                    const cleanId = id.trim(); if (!cleanId || cleanId === 'undefined' || cleanId === 'undefinied') return null;
                                                                    return (
                                                                        <div key={idx} onClick={() => handleCopyText(cleanId)} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 cursor-pointer hover:bg-blue-50 transition-all w-fit">
                                                                            <span className="text-blue-600 font-mono text-[9px] font-bold">{cleanId}</span>
                                                                            <Copy className="h-2.5 w-2.5 text-slate-300" />
                                                                        </div>
                                                                    );
                                                                }) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="flex flex-col gap-2">
                                                        {group.ventas.map(v => (
                                                            <div key={v.orderId} className="flex flex-col gap-1">
                                                                {v.receta_detallada && v.receta_detallada !== 'undefined' && v.receta_detallada !== 'undefinied' ? v.receta_detallada.split('|').map((r: string, idx: number) => {
                                                                    const cleanR = r.trim(); if (!cleanR || cleanR === 'undefined' || cleanR === 'undefinied') return null;
                                                                    return (
                                                                        <div key={idx} className="text-[10px] text-slate-600 border-l-2 border-amber-400 pl-2 leading-none flex items-center h-[18px]">
                                                                            {cleanR}
                                                                        </div>
                                                                    );
                                                                }) : <span className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">Vincular artículos</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-[12px] font-medium text-slate-700 align-top">
                                                    <div className="flex flex-col gap-1">
                                                        {group.ventas.map((v, i) => (
                                                            <div key={v.orderId} className={i > 0 ? "pt-1 border-t border-slate-100/50" : ""}>
                                                                {v.nombre || '-'}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {isPack && <div className="text-[9px] text-slate-400 mt-1 font-bold">({group.ventas.length} pedidos en pack)</div>}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-[12px] font-bold text-slate-600 align-top">${totalBruto.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-mono text-[12px] font-bold text-emerald-600 align-top">${totalNeto.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-mono text-[11px] font-bold text-blue-600 align-top">
                                                    {totalNeto > 0 ? `+${(((totalBruto - totalNeto) / totalNeto) * 100).toFixed(1)}%` : '-'}
                                                </TableCell>
                                                <TableCell className="text-center align-top">
                                                    <Badge variant="outline" className={`${group.ventas[0].categoria === 'Full' ? 'bg-amber-50 text-amber-600 border-amber-200' : group.ventas[0].categoria === 'Flex' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'} font-bold text-[11px] uppercase`}>{group.ventas[0].categoria}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center align-top">
                                                    {allRegistrada ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            {algunaCancelada ? (
                                                                <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-black text-[10px]" title="Se emitió Nota de Crédito para esta venta">CANCELADA (NC)</Badge>
                                                            ) : (
                                                                <>
                                                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-black text-[10px]">REGISTRADO</Badge>
                                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-emerald-600" onClick={() => {
                                                                const newSelected = new Set(selectedRegistracionIds);
                                                                if (allSelected) {
                                                                    allOrderIds.forEach(id => newSelected.delete(id));
                                                                } else {
                                                                    group.ventas.forEach(v => {
                                                                        if (!v.registrada) newSelected.add(v.orderId);
                                                                    });
                                                                }
                                                                setSelectedRegistracionIds(newSelected);
                                                            }}>
                                                                {allSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                                            </Button>
                                                            {someRegistrada && !allRegistrada && <span className="text-[8px] text-amber-600 font-black">PARCIAL</span>}
                                                            {erroresEnGrupo.length > 0 && (
                                                                <div
                                                                    className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 cursor-help"
                                                                    title={erroresEnGrupo.map(v => v.ultimoError || "Error desconocido").join(" | ")}
                                                                >
                                                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                                                    <span className="text-[8px] text-red-600 font-black">ERROR</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Modal de Confirmación de Registro y Facturación */}
            <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
                <DialogContent className="sm:max-w-[450px] rounded-3xl border-none shadow-2xl p-0 overflow-hidden bg-white">
                    <DialogHeader className="p-8 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-black text-slate-800">Confirmar Registro</DialogTitle>
                                <DialogDescription className="text-slate-500 font-medium">
                                    Se registrarán {selectedRegistracionIds.size} ventas en el ERP.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-8 space-y-6">
                        <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 transition-all hover:bg-blue-100/50">
                            <Checkbox
                                id="generar-factura"
                                checked={solicitarFactura}
                                onCheckedChange={(checked) => setSolicitarFactura(checked === true)}
                                className="h-5 w-5 rounded-md border-blue-300 accent-blue-600"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="generar-factura" className="text-sm font-bold text-blue-900 cursor-pointer">
                                    Generar Factura Legal (ARCA/AFIP)
                                </Label>
                                <p className="text-[11px] text-blue-600 font-medium">
                                    Se enviará la solicitud a ARCA por cada venta.
                                </p>
                            </div>
                        </div>

                        {solicitarFactura && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Tipo de Comprobante</Label>
                                <Select
                                    value={tipoFactura.toString()}
                                    onValueChange={(val) => {
                                        setTipoFactura(parseInt(val));
                                        setRazonSocial("");
                                    }}
                                >
                                    <SelectTrigger className="w-full h-12 rounded-xl border-slate-200 bg-white font-bold text-slate-700 focus:ring-blue-500">
                                        <SelectValue placeholder="Seleccionar tipo" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                                        <SelectItem value="6" className="font-bold text-slate-600 focus:bg-blue-50 focus:text-blue-700">Factura B (Cons. Final / Monotributo)</SelectItem>
                                        <SelectItem value="1" className="font-bold text-slate-600 focus:bg-blue-50 focus:text-blue-700">Factura A (Responsable Inscripto)</SelectItem>
                                    </SelectContent>
                                </Select>

                                {(tipoFactura === 1 || (solicitarFactura && tipoFactura === 6)) && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">CUIT / DNI del Cliente</Label>
                                            {condicionIvaEncontrada === 1 && tipoFactura === 6 && (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[9px]">AVISO: Es RI</Badge>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="20-XXXXXXXX-X"
                                                value={cuit}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setCuit(val);
                                                    if (!val) {
                                                        setRazonSocial("");
                                                        setCondicionIvaEncontrada(null);
                                                    }
                                                }}
                                                className="h-12 rounded-xl border-slate-200 bg-white font-mono text-lg font-bold text-slate-700 focus:ring-blue-500 flex-1"
                                            />
                                            <Button
                                                type="button"
                                                onClick={handleBuscarPadron}
                                                disabled={isSearchingPadron}
                                                className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4"
                                            >
                                                {isSearchingPadron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        {razonSocial && (
                                            <div className="space-y-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-1">
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div>
                                                        <Label className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Razón Social</Label>
                                                        <p className="text-sm font-black text-emerald-900">{razonSocial}</p>
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Condición IVA</Label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className={`h-2 w-2 rounded-full ${condicionIvaEncontrada === 1 ? 'bg-blue-500' :
                                                                condicionIvaEncontrada === 6 ? 'bg-amber-500' :
                                                                    'bg-slate-400'
                                                                }`} />
                                                            <p className="text-xs font-bold text-emerald-800 uppercase">
                                                                {condicionIvaEncontrada === 1 ? 'Responsable Inscripto' :
                                                                    condicionIvaEncontrada === 6 ? 'Monotributista' :
                                                                        'Consumidor Final'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            {tipoFactura === 1 ? "Ingresá los 11 dígitos del CUIT para la Factura A." : "Ingresá CUIT o DNI para Factura B nominada."}
                                        </p>
                                    </div>
                                )}

                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 items-start">
                                    <Clock className="h-4 w-4 text-amber-500 mt-0.5" />
                                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                                        <span className="font-bold">Nota:</span> Debido a las consultas simultáneas a ARCA, el proceso puede demorar unos segundos adicionales por factura para evitar errores de numeración.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsConfirmModalOpen(false)}
                            className="rounded-xl font-bold text-slate-500 hover:bg-slate-200"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={confirmarProcesar}
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-6 h-auto shadow-lg shadow-emerald-200 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            Confirmar y Registrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
