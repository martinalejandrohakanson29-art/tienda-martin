"use client"

import { useState } from "react"
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
} from "lucide-react"
import { actualizarPedidos } from "@/app/actions/envios"
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

export function EnviosTable({ envios }: EnviosTableProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [isUpdating, setIsUpdating] = useState(false)
    
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalConfig, setModalConfig] = useState({
        title: "",
        description: "",
        type: "success" as "success" | "error" | "info"
    })

    const router = useRouter()

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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    }

    // LÓGICA DE BÚSQUEDA ACTUALIZADA: Ahora busca también por orderId (Venta)
    const filteredEnvios = envios.filter((envio) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            envio.id.toString().toLowerCase().includes(searchLower) ||
            envio.orderId?.toString().toLowerCase().includes(searchLower) || // Búsqueda por ID de Venta
            envio.resumen?.toLowerCase().includes(searchLower) ||
            envio.items?.some((item: any) => item.mla.toLowerCase().includes(searchLower))
        );
    });

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
            case 'ready_to_print': return { label: "Listo Imprimir", className: "bg-rose-50 text-rose-700 border-rose-200", icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
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

    return (
        <div className="space-y-3">
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

            <div className="rounded-lg border border-slate-200 shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">ID Envío / Venta</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter text-center">Despacho</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">Estado / Logística</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">Producto</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter">SKU / Técnica (Click copiar)</TableHead>
                            <TableHead className="h-9 px-3 font-bold text-slate-500 text-[10px] uppercase tracking-tighter text-right">Creado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEnvios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10">
                                    <p className="text-sm text-slate-400 font-medium">No hay envíos</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEnvios.map((envio) => {
                                const logistic = getLogisticConfig(envio.logisticType);
                                const statusInfo = getStatusConfig(envio);
                                
                                return (
                                    <TableRow key={envio.id} className="group hover:bg-slate-50/50 transition-colors border-b last:border-0">
                                        {/* COLUMNA ID ACTUALIZADA */}
                                        <TableCell className="px-3 py-2 font-mono text-[11px] font-bold">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-blue-600">{envio.id}</span>
                                                <span className="text-slate-400 font-medium text-[9px]">V: {envio.orderId || 'S/D'}</span>
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

                                        <TableCell className="px-3 py-2 max-w-[200px]">
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
