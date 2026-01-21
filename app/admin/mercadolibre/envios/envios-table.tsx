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
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Shipping ID</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Logística</TableHead>
                        <TableHead>Productos / Resumen</TableHead>
                        <TableHead>Fecha</TableHead>
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
                            <TableRow key={envio.id}>
                                <TableCell className="font-medium text-blue-600">
                                    {envio.id}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={envio.status === "PENDIENTE" ? "outline" : "default"}>
                                        {envio.status}
                                    </Badge>
                                    {envio.substatus && (
                                        <div className="text-[10px] text-muted-foreground mt-1 uppercase">
                                            {envio.substatus}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="capitalize">
                                    {envio.logisticType?.replace('_', ' ') || "N/A"}
                                </TableCell>
                                <TableCell>
                                    <div className="max-w-[400px]">
                                        <p className="text-sm font-semibold">{envio.resumen}</p>
                                        <ul className="text-xs text-muted-foreground mt-1">
                                            {envio.items?.map((item: any) => (
                                                <li key={item.id}>
                                                    • {item.quantity}x {item.title} ({item.mla})
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </TableCell>
                                <TableCell className="text-xs">
                                    {new Date(envio.createdAt).toLocaleString('es-AR')}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
