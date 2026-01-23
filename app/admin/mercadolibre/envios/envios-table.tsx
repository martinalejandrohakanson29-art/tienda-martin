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
    XCircle, 
    AlertCircle 
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
    
    // Estados para el Modal personalizado
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
                    title: "Sincronización Iniciada",
                    description: "Pedidos Actualizados",
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
        if (isToday) return <span className="text-emerald-600 font-bold">Hoy</span>;
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    }

    const getStatusConfig = (envio: any) => {
        const sub = envio.substatus;
        const status = envio.status;
        switch (sub) {
            case 'ready_to_print': return { label: "Lista para imprimir", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
            case 'printed': return { label: "Impreso", className: "bg-slate-100 text-slate-600 border-slate-200" };
            case 'ready_for_pickup': return { label: "Listo para Colecta", className: "bg-blue-50 text-blue-700 border-blue-100" };
            case 'picked_up': return { label: "Despachado (Colecta)", className: "bg-blue-100 text-blue-800 border-blue-200" };
            case 'out_for_delivery': return { label: "En reparto (Flex)", className: "bg-orange-100 text-orange-800 border-orange-200" };
            default: return { label: status === "PENDIENTE" ? "Pendiente Despacho" : sub?.toUpperCase() || status?.toUpperCase() || "S/E", className: "bg-gray-50 text-gray-500 border-gray-100" };
        }
    }

    const getLogisticConfig = (type: string) => {
        if (type === 'self_service') return { label: "Envío Flex", className: "bg-orange-50 text-orange-700 border-orange-200" };
        if (type === 'cross_docking') return { label: "Envío Colecta", className: "bg-blue-50 text-blue-700 border-blue-100" };
        return { label: type?.replace('_', ' ') || "Sin asignar", className: "bg-gray-50 text-gray-600 border-gray-200" };
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative max-w-sm flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar por MLA, ID o Producto..."
                        className="pl-9 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <Button 
                    onClick={handleActualizar} 
                    disabled={isUpdating}
                    variant="outline"
                    className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                >
                    <RefreshCcw className={`mr-2 h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? 'Actualizando...' : 'Actualizar Pedidos'}
                </Button>
            </div>

            <div className="rounded-xl border shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[110px] px-2 font-semibold text-[12px]">Shipping ID</TableHead>
                            <TableHead className="w-[130px] px-2 font-semibold text-[12px]">Fecha Despacho</TableHead>
                            <TableHead className="w-[140px] px-2 font-semibold text-[12px]">Estado</TableHead>
                            <TableHead className="w-[120px] px-2 font-semibold text-[12px]">Logística</TableHead>
                            <TableHead className="font-semibold px-4 text-[12px]">Detalle del Pedido</TableHead>
                            <TableHead className="w-[280px] font-semibold px-4 text-[12px]">Info Técnica</TableHead>
                            <TableHead className="w-[110px] px-2 text-right font-semibold text-[12px]">Actualización</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEnvios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                                    No hay envíos pendientes
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredEnvios.map((envio) => {
                                const logistic = getLogisticConfig(envio.logisticType);
                                const statusInfo = getStatusConfig(envio);
                                
                                return (
                                    <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors border-b last:border-0">
                                        <TableCell className="px-2 py-4 font-mono text-[11px] font-medium text-slate-500">
                                            {envio.id}
                                        </TableCell>
                                        <TableCell className="px-2 py-4">
                                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                                <Calendar className="h-3 w-3 text-slate-400" />
                                                {formatDispatchDate(envio.payBefore)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-2 py-4">
                                            <Badge variant="outline" className={`rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusInfo.className}`}>
                                                {statusInfo.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-2 py-4">
                                            <Badge variant="outline" className={`rounded-md px-2 py-0.5 text-[10px] whitespace-nowrap ${logistic.className}`}>
                                                {logistic.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-4">
                                            <p className="text-[13px] text-slate-800 font-semibold leading-relaxed">
                                                {envio.resumen}
                                            </p>
                                        </TableCell>
                                        <TableCell className="px-4 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id} className="flex flex-col gap-1">
                                                        {item.agregadoInfo?.ids_articulos ? (
                                                            item.agregadoInfo.ids_articulos.split(',').map((id: string, idx: number) => {
                                                                const nombres = item.agregadoInfo.nombres_articulos?.split(' | ') || [];
                                                                return (
                                                                    <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                                                                        <span className="text-blue-600 font-mono text-[10px] font-bold shrink-0">{id.trim()}</span>
                                                                        <span className="text-slate-600 text-[10px] font-medium border-l border-slate-200 pl-2 truncate">
                                                                            {nombres[idx]?.trim() || "Sin descripción"}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="text-slate-400 italic text-[10px]">Sin info técnica</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-2 py-4 text-right text-[10px]">
                                            <div className="text-slate-400 whitespace-nowrap">{new Date(envio.createdAt).toLocaleDateString('es-AR')}</div>
                                            <div className="font-medium text-slate-500">
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

            {/* Ventana de notificación personalizada (Shadcn Dialog) */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-2">
                            {modalConfig.type === "success" ? (
                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            ) : (
                                <AlertCircle className="h-6 w-6 text-rose-500" />
                            )}
                            <DialogTitle className="text-xl">{modalConfig.title}</DialogTitle>
                        </div>
                        <DialogDescription className="text-slate-600 text-[14px] leading-relaxed">
                            {modalConfig.description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="sm:justify-start mt-4">
                        <Button 
                            type="button" 
                            variant="secondary" 
                            onClick={() => setIsModalOpen(false)}
                            className="w-full sm:w-auto"
                        >
                            Entendido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
