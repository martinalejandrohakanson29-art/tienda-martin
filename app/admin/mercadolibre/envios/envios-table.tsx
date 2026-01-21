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
    
    // Traducción de substatus con estilos más sutiles
    const getSubstatusLabel = (substatus: string) => {
        switch (substatus) {
            case 'ready_to_print': 
                return { label: "Lista para imprimir", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
            case 'printed': 
                return { label: "Impreso", className: "bg-slate-100 text-slate-600 border-slate-200" };
            default: 
                return { label: substatus?.toUpperCase() || "", className: "bg-gray-50 text-gray-500" };
        }
    }

    // Configuración estética de la logística (más suave)
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
                        <TableHead className="w-[140px] font-semibold">Shipping ID</TableHead>
                        <TableHead className="font-semibold">Estado</TableHead>
                        <TableHead className="font-semibold">Logística</TableHead>
                        <TableHead className="w-[350px] font-semibold">Productos</TableHead>
                        <TableHead className="text-right font-semibold">Ingreso</TableHead>
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
                            const substatus = getSubstatusLabel(envio.substatus);
                            
                            return (
                                <TableRow key={envio.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="font-mono text-[13px] font-medium text-slate-500">
                                        {envio.id}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1.5">
                                            {/* Estado Principal: Ahora más neutral */}
                                            <Badge 
                                                variant="outline"
                                                className={`w-fit px-2 py-0.5 text-[11px] font-medium border-slate-200 text-slate-600 ${
                                                    envio.status === "PENDIENTE" ? "bg-slate-50" : "bg-blue-50 text-blue-700 border-blue-100"
                                                }`}
                                            >
                                                {envio.status === "PENDIENTE" ? "PENDIENTE DESPACHO" : envio.status}
                                            </Badge>
                                            
                                            {/* Substatus: Diseño minimalista */}
                                            {envio.substatus && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md border w-fit font-medium ${substatus.className}`}>
                                                    {substatus.label}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant="outline" 
                                            className={`rounded-lg px-2.5 py-0.5 text-[11px] ${logistic.className}`}
                                        >
                                            {logistic.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="py-1">
                                            <p className="text-[13px] text-slate-700 font-medium mb-1.5 line-clamp-1">
                                                {envio.resumen}
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {envio.items?.map((item: any) => (
                                                    <div 
                                                        key={item.id} 
                                                        className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded border border-slate-100 flex items-center gap-1"
                                                    >
                                                        <span className="font-bold text-slate-700">{item.quantity}x</span>
                                                        <span className="truncate max-w-[150px]">{item.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="text-[11px] text-slate-400 leading-tight">
                                            <div>{new Date(envio.createdAt).toLocaleDateString('es-AR')}</div>
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
