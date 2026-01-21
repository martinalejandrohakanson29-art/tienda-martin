// app/admin/mercadolibre/envios/envios-table.tsx
"use client"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface EnviosTableProps {
    envios: any[];
}

export function EnviosTable({ envios }: EnviosTableProps) {
    
    // Función unificada para el estado de la etiqueta
    const getStatusConfig = (envio: any) => {
        // Priorizamos el substatus de la etiqueta de ML
        const sub = envio.substatus;

        switch (sub) {
            case 'ready_to_print': 
                return { label: "Lista para imprimir", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
            case 'printed': 
                return { label: "Impreso", className: "bg-slate-100 text-slate-600 border-slate-200" };
            case 'ready_for_pickup': 
                return { label: "Listo para Colecta", className: "bg-blue-50 text-blue-700 border-blue-100" };
            default: 
                // Si no hay substatus de etiqueta, mostramos el estado interno de despacho
                if (envio.status === "PENDIENTE") {
                    return { label: "Pendiente Despacho", className: "bg-slate-50 text-slate-500 border-slate-200" };
                }
                return { label: sub?.toUpperCase() || envio.status, className: "bg-gray-50 text-gray-500" };
        }
    }

    const getLogisticConfig = (type: string) => {
        switch (type) {
            case 'self_service':
                return { 
                    label: "Envío Flex", 
                    className: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50" 
                };
            case 'cross_docking':
                return { 
                    label: "Envío Colecta", 
                    className: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50" 
                };
            default:
                return { 
                    label: type?.replace('_', ' ') || "Sin asignar", 
                    className: "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-50" 
                };
        }
    }

    return (
        <div className="rounded-xl border shadow-sm bg-white overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50/50">
                        <TableHead className="w-[110px] px-2 font-semibold text-[12px]">Shipping ID</TableHead>
                        <TableHead className="w-[140px] px-2 font-semibold text-[12px]">Estado</TableHead>
                        <TableHead className="w-[120px] px-2 font-semibold text-[12px]">Logística</TableHead>
                        <TableHead className="font-semibold px-4 text-[12px]">Detalle de Productos</TableHead>
                        <TableHead className="w-[110px] px-2 text-right font-semibold text-[12px]">Ingreso</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {envios.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                                No hay envíos registrados.
                            </TableCell>
                        </TableRow>
                    ) : (
                        envios.map((envio) => {
                            const logistic = getLogisticConfig(envio.logisticType);
                            const statusInfo = getStatusConfig(envio);
                            
                            return (
                                <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="px-2 py-3 font-mono text-[11px] font-medium text-slate-500">
                                        {envio.id}
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                        {/* Un solo Badge con el estado prioritario */}
                                        <Badge 
                                            variant="outline"
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusInfo.className}`}
                                        >
                                            {statusInfo.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                        <Badge 
                                            variant="outline" 
                                            className={`rounded-md px-2 py-0.5 text-[10px] whitespace-nowrap ${logistic.className}`}
                                        >
                                            {logistic.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="max-w-full">
                                            <p className="text-[13px] text-slate-800 font-medium mb-1.5 leading-snug">
                                                {envio.resumen}
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {envio.items?.map((item: any) => (
                                                    <div 
                                                        key={item.id} 
                                                        className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100 flex items-center gap-1"
                                                    >
                                                        <span className="font-bold text-slate-700">{item.quantity}x</span>
                                                        <span className="truncate max-w-[250px]">{item.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-2 py-3 text-right">
                                        <div className="text-[10px] text-slate-400 leading-tight">
                                            <div className="whitespace-nowrap">{new Date(envio.createdAt).toLocaleDateString('es-AR')}</div>
                                            <div className="font-medium text-slate-500">
                                                {new Date(envio.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
