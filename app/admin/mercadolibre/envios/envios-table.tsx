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
    Info,
    Clock,
    Layers
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
                    description: "Los pedidos se han actualizado correctamente con la base de datos.",
                    type: "success"
                });
                setIsModalOpen(true);
                router.refresh();
            } else {
                setModalConfig({
                    title: "Error de Sincronización",
                    description: result.error || "No se pudo contactar con el servidor de n8n.",
                    type: "error"
                });
                setIsModalOpen(true);
            }
        } catch (error) {
            setModalConfig({
                title: "Error Inesperado",
                description: "Ocurrió un problema al intentar procesar la solicitud.",
                type: "error"
            });
            setIsModalOpen(true);
        } finally {
            setIsUpdating(false);
        }
    }

    const filteredEnvios = envios.filter((envio) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            envio.id.toLowerCase().includes(searchLower) ||
            envio.resumen?.toLowerCase().includes(searchLower) ||
            envio.items?.some((item: any) => item.mla.toLowerCase().includes(searchLower))
        );
    });

    const formatDispatchDate = (dateString: string | null) => {
        if (!dateString) return <span className="text-slate-400 italic">No definida</span>;
        const date = new Date(dateString);
        const today = new Date();
        const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
        
        return (
            <div className={`flex items-center gap-1.5 font-semibold ${isToday ? 'text-emerald-600' : 'text-slate-700'}`}>
                <Calendar className="h-3.5 w-3.5 opacity-70" />
                {isToday ? 'Hoy' : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
            </div>
        );
    }

    const getStatusConfig = (envio: any) => {
        const sub = envio.substatus;
        const status = envio.status;
        switch (sub) {
            case 'ready_to_print': return { label: "Listo para imprimir", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
            case 'printed': return { label: "Impreso", className: "bg-blue-100 text-blue-700 border-blue-200", icon: <Package className="w-3 h-3 mr-1" /> };
            case 'ready_for_pickup': return { label: "Listo para Colecta", className: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: <Truck className="w-3 h-3 mr-1" /> };
            default: return { label: status === "PENDIENTE" ? "Pendiente" : sub?.toUpperCase() || "S/E", className: "bg-slate-100 text-slate-600 border-slate-200", icon: <Clock className="w-3 h-3 mr-1" /> };
        }
    }

    const getLogisticConfig = (type: string) => {
        if (type === 'self_service') return { label: "Flex", className: "bg-orange-100 text-orange-700 border-orange-200" };
        if (type === 'cross_docking') return { label: "Colecta", className: "bg-blue-100 text-blue-700 border-blue-200" };
        return { label: "Estándar", className: "bg-slate-100 text-slate-600 border-slate-200" };
    }

    return (
        <div className="space-y-6">
            {/* Header / Search Area */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar por MLA, ID o Producto..."
                        className="pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-all rounded-lg"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <Button 
                    onClick={handleActualizar} 
                    disabled={isUpdating}
                    className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white shadow-md transition-all active:scale-95"
                >
                    <RefreshCcw className={`mr-2 h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? 'Procesando...' : 'Sincronizar Pedidos'}
                </Button>
            </div>

            {/* Table Area */}
            <div className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Envío ID</TableHead>
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider text-center">Despacho</TableHead>
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Estado</TableHead>
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Producto</TableHead>
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Detalles Técnicos</TableHead>
                            <TableHead className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider text-right">Sincronización</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEnvios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-20">
                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                        <Package className="h-12 w-12 mb-3 opacity-20" />
                                        <p className="text-lg font-medium">No se encontraron envíos</p>
                                        <p className="text-sm">Intenta con otro término de búsqueda</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEnvios.map((envio) => {
                                const logistic = getLogisticConfig(envio.logisticType);
                                const statusInfo = getStatusConfig(envio);
                                
                                return (
                                    <TableRow key={envio.id} className="group hover:bg-blue-50/30 transition-colors border-b">
                                        <TableCell className="px-4 py-5 font-mono text-[12px] font-semibold text-blue-600/80">
                                            #{envio.id}
                                        </TableCell>
                                        
                                        <TableCell className="px-4 py-5 text-center">
                                            {formatDispatchDate(envio.payBefore)}
                                        </TableCell>

                                        <TableCell className="px-4 py-5 space-y-2">
                                            <Badge variant="outline" className={`flex items-center w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ${statusInfo.className}`}>
                                                {statusInfo.icon}
                                                {statusInfo.label}
                                            </Badge>
                                            <div className={`text-[10px] font-bold px-2 uppercase tracking-tight opacity-70`}>
                                                {logistic.label}
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-4 py-5 max-w-[300px]">
                                            <p className="text-[13px] text-slate-900 font-bold leading-snug group-hover:text-blue-700 transition-colors">
                                                {envio.resumen}
                                            </p>
                                        </TableCell>

                                        <TableCell className="px-4 py-5">
                                            <div className="flex flex-wrap gap-2">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col gap-1 w-full">
                                                        {item.agregadoInfo?.ids_articulos ? (
                                                            item.agregadoInfo.ids_articulos.split(',').map((id: string, idx: number) => {
                                                                const nombres = item.agregadoInfo.nombres_articulos?.split(' | ') || [];
                                                                return (
                                                                    <div key={idx} className="flex items-center gap-2 bg-slate-100/50 hover:bg-white border border-slate-200 rounded-md p-1.5 transition-all">
                                                                        <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-mono text-[10px] font-bold">{id.trim()}</span>
                                                                        <span className="text-slate-600 text-[10px] font-medium truncate">
                                                                            {nombres[idx]?.trim() || "N/A"}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="text-slate-400 italic text-[10px] flex items-center gap-1">
                                                                <Info className="h-3 w-3" /> Sin info técnica
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-4 py-5 text-right">
                                            <div className="text-slate-500 font-medium text-[11px]">
                                                {new Date(envio.createdAt).toLocaleDateString('es-AR')}
                                            </div>
                                            <div className="font-bold text-slate-400 text-[10px]">
                                                {new Date(envio.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Modal de Notificación */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl">
                    <DialogHeader className="flex flex-col items-center text-center">
                        <div className={`p-3 rounded-full mb-4 ${modalConfig.type === "success" ? "bg-emerald-100" : "bg-rose-100"}`}>
                            {modalConfig.type === "success" ? (
                                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                            ) : (
                                <AlertCircle className="h-8 w-8 text-rose-600" />
                            )}
                        </div>
                        <DialogTitle className="text-xl font-bold text-slate-900">{modalConfig.title}</DialogTitle>
                        <DialogDescription className="text-slate-500 pt-2 text-[15px]">
                            {modalConfig.description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button 
                            type="button" 
                            onClick={() => setIsModalOpen(false)}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-6"
                        >
                            Entendido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
