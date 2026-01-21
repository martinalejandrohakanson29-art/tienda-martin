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
    
    // Función para traducir el substatus de Mercado Libre
    const getSubstatusLabel = (substatus: string) => {
        switch (substatus) {
            case 'ready_to_print': return "Lista para imprimir";
            case 'printed': return "Impreso";
            default: return substatus?.toUpperCase() || "";
        }
    }

    // Función para traducir el status interno de nuestra web
    const getStatusLabel = (status: string) => {
        if (status === "PENDIENTE") return "PENDIENTE DE DESPACHO";
        return status;
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead className="w-[150px]">Shipping ID</TableHead>
                        <TableHead>Estado Actual</TableHead>
                        <TableHead>Tipo Logística</TableHead>
                        <TableHead className="w-[400px]">Detalle de Productos</TableHead>
                        <TableHead>Fecha Ingreso</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {envios.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                No hay envíos registrados aún.
                            </TableCell>
                        </TableRow>
                    ) : (
                        envios.map((envio) => (
                            <TableRow key={envio.id} className="hover:bg-muted/30">
                                <TableCell className="font-mono font-medium text-blue-600">
                                    {envio.id}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        {/* Estado principal de despacho */}
                                        <Badge 
                                            variant={envio.status === "PENDIENTE" ? "destructive" : "default"}
                                            className="w-fit"
                                        >
                                            {getStatusLabel(envio.status)}
                                        </Badge>
                                        
                                        {/* Estado de la etiqueta de ML */}
                                        {envio.substatus && (
                                            <span className={`text-[11px] font-bold px-1 py-0.5 rounded w-fit ${
                                                envio.substatus === 'ready_to_print' 
                                                ? 'bg-green-100 text-green-700' 
                                                : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {getSubstatusLabel(envio.substatus)}
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize">
                                        {envio.logisticType?.replace('_', ' ') || "Sin asignar"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none mb-2">
                                            {envio.resumen}
                                        </p>
                                        <div className="grid grid-cols-1 gap-1">
                                            {envio.items?.map((item: any) => (
                                                <div key={item.id} className="text-[11px] bg-muted px-2 py-1 rounded-sm border-l-2 border-primary">
                                                    <span className="font-bold">{item.quantity}x</span> {item.title} 
                                                    <span className="text-muted-foreground ml-2">({item.mla})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-[11px] text-muted-foreground">
                                    {new Date(envio.createdAt).toLocaleString('es-AR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })} hs
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
