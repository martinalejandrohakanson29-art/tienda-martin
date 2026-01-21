// app/admin/mercadolibre/envios/envios-table.tsx
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
import { Search } from "lucide-react"

interface EnviosTableProps {
    envios: any[];
}

export function EnviosTable({ envios }: EnviosTableProps) {
    const [searchTerm, setSearchTerm] = useState("")

    const filteredEnvios = envios.filter((envio) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            envio.id.toLowerCase().includes(searchLower) ||
            envio.resumen?.toLowerCase().includes(searchLower) ||
            envio.items?.some((item: any) => item.mla.toLowerCase().includes(searchLower))
        );
    });

    const getStatusConfig = (envio: any) => {
        const sub = envio.substatus;
        switch (sub) {
            case 'ready_to_print': 
                return { label: "Lista para imprimir", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
            case 'printed': 
                return { label: "Impreso", className: "bg-slate-100 text-slate-600 border-slate-200" };
            case 'ready_for_pickup': 
                return { label: "Listo para Colecta", className: "bg-blue-50 text-blue-700 border-blue-100" };
            default: 
                // Usamos un gris neutro para "Pendiente Despacho" para que no resalte tanto
                return { 
                    label: envio.status === "PENDIENTE" ? "Pendiente Despacho" : sub?.toUpperCase() || envio.status, 
                    className: "bg-gray-50 text-gray-500 border-gray-100" 
                };
        }
    }

    const getLogisticConfig = (type: string) => {
        if (type === 'self_service') return { label: "Envío Flex", className: "bg-orange-50 text-orange-700 border-orange-200" };
        if (type === 'cross_docking') return { label: "Envío Colecta", className: "bg-blue-50 text-blue-700 border-blue-100" };
        return { label: type?.replace('_', ' ') || "Sin asignar", className: "bg-gray-50 text-gray-600 border-gray-200" };
    }

    return (
        <div className="space-y-4">
            <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Buscar por MLA, ID o Producto..."
                    className="pl-9 bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="rounded-xl border shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="w-[110px] px-2 font-semibold text-[12px]">Shipping ID</TableHead>
                            <TableHead className="w-[140px] px-2 font-semibold text-[12px]">Estado</TableHead>
                            <TableHead className="w-[120px] px-2 font-semibold text-[12px]">Logística</TableHead>
                            <TableHead className="font-semibold px-4 text-[12px]">Detalle de Productos</TableHead>
                            <TableHead className="w-[300px] font-semibold px-4 text-[12px]">Agregados (Técnico)</TableHead>
                            <TableHead className="w-[110px] px-2 text-right font-semibold text-[12px]">Ingreso</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEnvios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                                    No se encontraron resultados
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
                                            <p className="text-[13px] text-slate-800 font-medium leading-relaxed">
                                                {envio.resumen}
                                            </p>
                                        </TableCell>
                                        
                                        {/* COLUMNA AGREGADOS - LÓGICA CORREGIDA */}
                                        <TableCell className="px-4 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                {envio.items.map((item: any) => (
                                                    <div key={item.id}>
                                                        {item.agregadoInfo ? (
                                                            <div className="flex flex-col gap-1">
                                                                {/* Separamos los IDs por coma y mapeamos cada uno */}
                                                                {item.agregadoInfo.ids_articulos?.split(',').map((id: string, idx: number) => {
                                                                    const nombres = item.agregadoInfo.nombres_articulos?.split(' | ') || [];
                                                                    const currentId = id.trim();
                                                                    
                                                                    // Si el ID está vacío, no renderizamos el recuadro
                                                                    if (!currentId) return null;

                                                                    return (
                                                                        <div key={`${item.id}-${idx}`} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                                                                            <span className="text-blue-600 font-mono text-[10px] font-bold">
                                                                                {currentId}
                                                                            </span>
                                                                            <span className="text-slate-600 text-[10px] font-medium border-l border-slate-200 pl-2">
                                                                                {nombres[idx]?.trim() || "Sin descripción"}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
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
        </div>
    )
}
