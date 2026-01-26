"use client"

import { useState, useMemo } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { 
    Search, 
    Calendar, 
    RefreshCcw, 
    CheckCircle2, 
    AlertCircle,
    Package,
    Truck,
    Clock,
    Copy,
    Printer,
    Filter
} from "lucide-react"
import { actualizarPedidos, imprimirEtiquetas } from "@/app/actions/envios"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"

interface EnviosTableProps {
    envios: any[];
}

type FilterType = 'flex' | 'colecta' | 'imprimir' | 'impreso';

export function EnviosTable({ envios }: EnviosTableProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [isUpdating, setIsUpdating] = useState(false)
    const [isPrinting, setIsPrinting] = useState(false) // Nuevo estado para loading de impresión
    
    // Estado para filtros
    const [activeFilters, setActiveFilters] = useState<Record<FilterType, boolean>>({
        flex: false,
        colecta: false,
        imprimir: false,
        impreso: false
    });

    // Estado para selección de filas
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalConfig, setModalConfig] = useState({
        title: "",
        description: "",
        type: "success" as "success" | "error" | "info"
    })

    const router = useRouter()

    // --- LÓGICA DE FILTRADO ---
    const filteredEnvios = useMemo(() => {
        return envios.filter((envio) => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = (
                envio.id.toString().toLowerCase().includes(searchLower) ||
                envio.orderId?.toString().toLowerCase().includes(searchLower) ||
                envio.resumen?.toLowerCase().includes(searchLower) ||
                envio.items?.some((item: any) => item.mla.toLowerCase().includes(searchLower))
            );

            if (!matchesSearch) return false;

            const activeLogistics = [];
            if (activeFilters.flex) activeLogistics.push('self_service');
            if (activeFilters.colecta) activeLogistics.push('cross_docking');

            const activeStatuses = [];
            if (activeFilters.imprimir) activeStatuses.push('ready_to_print');
            if (activeFilters.impreso) activeStatuses.push('printed', 'ready_for_pickup');

            const matchesLogistic = activeLogistics.length === 0 || activeLogistics.includes(envio.logisticType);
            const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(envio.substatus);

            return matchesLogistic && matchesStatus;
        });
    }, [envios, searchTerm, activeFilters]);

    // --- LÓGICA DE SELECCIÓN ---
    const toggleRow = (id: string) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedRows(newSelected);
    };

    const toggleAll = () => {
        if (selectedRows.size === filteredEnvios.length && filteredEnvios.length > 0) {
            setSelectedRows(new Set());
        } else {
            const newSelected = new Set(filteredEnvios.map(e => e.id));
            setSelectedRows(newSelected);
        }
    };

    // --- MANEJADOR DE IMPRESIÓN ---
    const handlePrint = async () => {
        if (selectedRows.size === 0) return;
        
        setIsPrinting(true);
        try {
            const idsToPrint = Array.from(selectedRows);
            const result = await imprimirEtiquetas(idsToPrint);

            if (result.success && result.pdfBase64) {
                // Convertir Base64 a Blob y abrir en nueva pestaña
                const byteCharacters = atob(result.pdfBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                
                window.open(url, '_blank');
                
                // Opcional: Limpiar selección después de imprimir
                // setSelectedRows(new Set());
            } else {
                setModalConfig({
                    title: "Error de Impresión",
                    description: result.error || "No se pudo generar el PDF.",
                    type: "error"
                });
                setIsModalOpen(true);
            }
        } catch (error) {
            setModalConfig({
                title: "Error Inesperado",
                description: "Hubo un problema al intentar imprimir.",
                type: "error"
            });
            setIsModalOpen(true);
        } finally {
            setIsPrinting(false);
        }
    }

    const handleActualizar = async () => {
        setIsUpdating(true);
        try {
            const result = await actualizarPedidos();
            if (result.success) {
                setModalConfig({
                    title: "¡Sincronización Exitosa!",
                    description: "Los pedidos se han actualizado correctamente.",
                    type: "success"
                });
                setIsModalOpen(true);
                router.refresh();
            } else {
                setModalConfig({
                    title: "Error de Sincronización",
                    description: result.error || "No se pudo contactar con el servidor.",
                    type: "error"
                });
                setIsModalOpen(true);
            }
        } catch (error) {
            setModalConfig({
                title: "Error Inesperado",
                description: "Ocurrió un problema al procesar la solicitud.",
                type: "error"
            });
            setIsModalOpen(true);
        } finally {
            setIsUpdating(false);
        }
    }

    const toggleFilter = (filter: FilterType) => {
        setActiveFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    }

    const formatDispatchDate = (dateString: string | null) => {
        if (!dateString) return <span className="text-slate-400 italic text-[11px]">No definida</span>;
        const date = new Date(dateString);
        const today = new Date();
        const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
        
        return (
            <div className={`flex items-center justify-center gap-1 font-bold text-[12px] ${isToday ? 'text-emerald-600' : 'text-slate-600'}`}>
                <Calendar className="h-3 w-3 opacity-70" />
                {isToday ? 'HOY' : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
            </div>
        );
    }

    const getStatusConfig = (envio: any) => {
        const sub = envio.substatus;
        const status = envio.status;
        switch (sub) {
            case 'ready_to_print': return { label: "IMPRIMIR", className: "bg-rose-50 text-rose-700 border-rose-200", icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
            case 'printed': return { label: "Impreso", className: "bg-blue-50 text-blue-700 border-blue-200", icon: <Package className="w-3 h-3 mr-1" /> };
            case 'ready_for_pickup': return { label: "Impreso", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Truck className="w-3 h-3 mr-1" /> };
            default: return { label: status === "PENDIENTE" ? "Pendiente" : sub?.toUpperCase() || "S/E", className: "bg-slate-50 text-slate-600 border-slate-200", icon: <Clock className="w-3 h-3 mr-1" /> };
        }
    }

    const getLogisticConfig = (type: string) => {
        if (type === 'self_service') return { label: "FLEX", className: "text-orange-600" };
        if (type === 'cross_docking') return { label: "COLECTA", className: "text-blue-600" };
        return { label: "ESTÁNDAR", className: "text-slate-500" };
    }

    const counts = useMemo(() => {
        return {
            flex: envios.filter(e => e.logisticType === 'self_service').length,
            colecta: envios.filter(e => e.logisticType === 'cross_docking').length,
            imprimir: envios.filter(e => e.substatus === 'ready_to_print').length,
            impreso: envios.filter(e => ['printed', 'ready_for_pickup'].includes(e.substatus)).length
        }
    }, [envios]);

    return (
        <div className="space-y-4">
            {/* BARRA SUPERIOR */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-2.5 rounded-lg border shadow-sm">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                        placeholder="Buscar envío o venta..."
                        className="pl-8 h-9 text-sm bg-slate-50 border-slate-200 rounded-md"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                     {/* BOTÓN IMPRIMIR */}
                     {selectedRows.size > 0 && (
                        <Button 
                            variant="outline"
                            size="sm"
                            disabled={isPrinting}
                            className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-50"
                            onClick={handlePrint}
                        >
                            <Printer className={`mr-2 h-3.5 w-3.5 ${isPrinting ? 'animate-bounce' : ''}`} />
                            {isPrinting ? 'Generando PDF...' : `Imprimir (${selectedRows.size})`}
                        </Button>
                    )}

                    <Button 
                        onClick={handleActualizar} 
                        disabled={isUpdating}
                        size="sm"
                        className="w-full sm:w-auto bg-slate-900 h-9 px-4 text-xs font-bold"
                    >
                        <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                        {isUpdating ? 'Sincronizando...' : 'Sincronizar'}
                    </Button>
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 mr-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Filtrar por:</span>
                </div>
                
                <div className="flex items-center gap-2 border-r border-slate-200 pr-4 mr-2">
                    <FilterBadge 
                        label="Flex" 
                        active={activeFilters.flex} 
                        count={counts.flex} 
                        onClick={() => toggleFilter('flex')}
                        colorClass="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700 data-[state=active]:border-orange-200"
                    />
                    <FilterBadge 
                        label="Colecta" 
                        active={activeFilters.colecta} 
                        count={counts.colecta} 
                        onClick={() => toggleFilter('colecta')}
                        colorClass="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <FilterBadge 
                        label="Imprimir" 
                        active={activeFilters.imprimir} 
                        count={counts.imprimir} 
                        onClick={() => toggleFilter('imprimir')}
                        colorClass="data-[state=active]:bg-rose-100 data-[state=active]:text-rose-700 data-[state=active]:border-rose-200"
                    />
                    <FilterBadge 
                        label="Impreso" 
                        active={activeFilters.impreso} 
                        count={counts.impreso} 
                        onClick={() => toggleFilter('impreso')}
                        colorClass="data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-200"
                    />
                </div>

                {Object.values(activeFilters).some(Boolean) && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setActiveFilters({flex: false, colecta: false, imprimir: false, impreso: false})}
                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-600 ml-auto"
                    >
                        Limpiar filtros
                    </Button>
                )}
            </div>

            {/* TABLA */}
            <div className="rounded-lg border border-slate-200 shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead className="w-[40px] px-3">
                                <input 
                                    type="checkbox" 
                                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
                                    checked={selectedRows.size === filteredEnvios.length && filteredEnvios.length > 0}
                                    onChange={toggleAll}
                                />
                            </TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">ID Envío / Venta</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter text-center">Despacho</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">Estado / Logística</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter w-[500px]">Producto</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">ID / AGREGADO</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter text-right">Creado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEnvios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10">
                                    <p className="text-sm text-slate-400 font-medium">No hay envíos que coincidan</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEnvios.map((envio) => {
                                const logistic = getLogisticConfig(envio.logisticType);
                                const statusInfo = getStatusConfig(envio);
                                const isSelected = selectedRows.has(envio.id);
                                
                                return (
                                    <TableRow 
                                        key={envio.id} 
                                        className={`group transition-colors border-b last:border-0 ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                                    >
                                        <TableCell className="px-3 py-2">
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
                                                checked={isSelected}
                                                onChange={() => toggleRow(envio.id)}
                                            />
                                        </TableCell>

                                        <TableCell className="px-3 py-2 font-mono text-[11px] font-bold">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-blue-600">{envio.id}</span>
                                                <span className="text-slate-400 font-medium text-[9px]"> {envio.orderId || 'S/D'}</span>
                                            </div>
                                        </TableCell>
                                        
                                        <TableCell className="px-3 py-2 text-center">
                                            {formatDispatchDate(envio.payBefore)}
                                        </TableCell>

                                        <TableCell className="px-3 py-2">
                                            <div className="flex flex-row items-center gap-2">
                                                <Badge variant="outline" className={`whitespace-nowrap rounded px-1.5 py-0 text-[10px] font-bold uppercase border ${statusInfo.className}`}>
                                                    {statusInfo.label}
                                                </Badge>
                                                <span className={`text-[10px] font-black px-0.5 tracking-tighter whitespace-nowrap ${logistic.className}`}>
                                                    {logistic.label}
                                                </span>
                                            </div>
                                        </TableCell>

                                       <TableCell className="px-3 py-2 w-[500px]">
                                            <p className="text-[12px] text-slate-800 font-medium leading-tight line-clamp-2">
                                                {envio.resumen}
                                            </p>
                                        </TableCell>

                                        <TableCell className="px-3 py-2">
                                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col gap-1">
                                                        {item.agregadoInfo?.ids_articulos ? (
                                                            item.agregadoInfo.ids_articulos.split(',').map((id: string, idx: number) => {
                                                                const nombres = item.agregadoInfo.nombres_articulos?.split(' | ') || [];
                                                                const currentId = id.trim();
                                                                return (
                                                                    <div 
                                                                        key={idx} 
                                                                        onClick={() => copyToClipboard(currentId)}
                                                                        title="Clic para copiar ID"
                                                                        className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 cursor-pointer active:scale-95 transition-all px-2 py-0.5 rounded text-[10px] border border-slate-200 w-fit"
                                                                    >
                                                                        <span className="font-bold text-slate-700 uppercase">{currentId}</span>
                                                                        <span className="text-slate-300 mx-0.5">|</span>
                                                                        <span className="text-slate-600 font-medium whitespace-nowrap">
                                                                            {nombres[idx]?.trim() || "N/A"}
                                                                        </span>
                                                                        <Copy className="w-2.5 h-2.5 ml-1 text-slate-400 opacity-0 group-hover:opacity-100" />
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="text-slate-400 italic text-[10px]">Sin SKU</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-3 py-2 text-right">
                                            <div className="text-slate-600 font-bold text-[10px]">
                                                {new Date(envio.createdAt).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit'})}
                                            </div>
                                            <div className="text-slate-400 text-[9px]">
                                                {new Date(envio.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[350px] rounded-xl">
                    <DialogHeader className="flex flex-col items-center text-center">
                        <div className={`p-2 rounded-full mb-2 ${modalConfig.type === "success" ? "bg-emerald-100" : "bg-rose-100"}`}>
                            {modalConfig.type === "success" ? (
                                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                            ) : (
                                <AlertCircle className="h-6 w-6 text-rose-600" />
                            )}
                        </div>
                        <DialogTitle className="text-lg font-bold">{modalConfig.title}</DialogTitle>
                        <DialogDescription className="text-slate-500 text-sm">
                            {modalConfig.description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button 
                            onClick={() => setIsModalOpen(false)}
                            className="w-full bg-slate-900 h-10 text-sm"
                        >
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function FilterBadge({ label, active, count, onClick, colorClass }: { label: string, active: boolean, count: number, onClick: () => void, colorClass: string }) {
    return (
        <button
            onClick={onClick}
            data-state={active ? "active" : "inactive"}
            className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all
                ${colorClass}
                data-[state=inactive]:bg-white data-[state=inactive]:text-slate-500 data-[state=inactive]:border-slate-200 data-[state=inactive]:hover:bg-slate-50
            `}
        >
            {active && <CheckCircle2 className="w-3 h-3" />}
            {label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/50' : 'bg-slate-100'}`}>
                {count}
            </span>
        </button>
    )
}
