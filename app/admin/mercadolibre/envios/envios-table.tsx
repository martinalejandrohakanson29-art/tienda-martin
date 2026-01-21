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
    
    // Traducción de substatus con estilos sutiles
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

    // Configuración de logística (Colores suaves para no saturar)
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
                        {/* Columnas con anchos reducidos para optimizar espacio */}
                        <TableHead className="w-[110px] px-2 font-semibold">Shipping ID</TableHead>
                        <TableHead className="w-[150px] px-2 font-semibold">Estado</TableHead>
                        <TableHead className="w-[120px] px-2 font-semibold">Logística</TableHead>
                        
                        {/* Columna de Productos sin ancho fijo para que use todo el resto del lugar */}
                        <TableHead className="font-semibold px-4">Detalle de Productos</TableHead>
                        
                        <TableHead className="w-[110px] px-2 text-right font-semibold">Ingreso</TableHead>
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
                                    <TableCell className="px-2 py-3 font-mono text-[12px] font-medium text-slate-500">
                                        {envio.id}
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                        <div className="flex flex-col gap-1">
                                            {/* Estado Principal Neutral */}
                                            <Badge 
                                                variant="outline"
                                                className={`w-fit px-1.5 py-0 text-[10px] font-medium border-slate-200 text-slate-600 ${
                                                    envio.status === "PENDIENTE" ? "bg-slate-50" : "bg-blue-50 text-blue-700 border-blue-100"
                                                }`}
                                            >
                                                {envio.status === "PENDIENTE" ? "PENDIENTE DESPACHO" : envio.status}
                                            </Badge>
                                            
                                            {/* Substatus Minimalista */}
                                            {envio.substatus && (
                                                <span className={`text-[9px] px-1 py-0 rounded border w-fit font-medium ${substatus.className}`}>
                                                    {substatus.label}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                        <Badge 
                                            variant="outline" 
                                            className={`rounded-md px-2 py-0 text-[10px] whitespace-nowrap ${logistic.className}`}
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
                                                        <span className="truncate max-w-[200px]">{item.title}</span>
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
