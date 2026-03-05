"use client"

import { useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, MapPin } from "lucide-react"

export default function VentasWebClient({ ventas }: { ventas: any[] }) {
  const [selectedVenta, setSelectedVenta] = useState<any | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ventas Web (MercadoPago)</h1>
        <p className="text-muted-foreground">
          Historial de clientes que pasaron por el carrito y proceso de pago.
        </p>
      </div>

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>ID MP</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                  Aún no hay ventas registradas.
                </TableCell>
              </TableRow>
            ) : (
              ventas.map((venta) => (
                <TableRow key={venta.id}>
                  <TableCell>
                    {format(new Date(venta.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {venta.nombre || <span className="text-gray-400 italic">Sin datos</span>}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600 font-mono">
                    {venta.paymentId || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={venta.status === "APROBADO" ? "default" : "secondary"}
                           className={venta.status === "APROBADO" ? "bg-green-600" : "bg-yellow-500"}>
                      {venta.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-700">
                    ${Number(venta.total).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedVenta(venta)}>
                      <Eye className="w-4 h-4 mr-2" />
                      Detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* MODAL CON EL DETALLE DE LA COMPRA Y EL CLIENTE */}
      <Dialog open={!!selectedVenta} onOpenChange={(open) => !open && setSelectedVenta(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Detalle de la Venta Web</DialogTitle>
          </DialogHeader>

          {selectedVenta && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              
              {/* DATOS DEL CLIENTE */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-gray-500"/>
                  Datos de Envío
                </h3>
                {selectedVenta.nombre ? (
                    <div className="text-sm space-y-2 bg-slate-50 p-4 rounded-md border">
                        <p><span className="font-semibold">Nombre:</span> {selectedVenta.nombre}</p>
                        <p><span className="font-semibold">DNI:</span> {selectedVenta.dni}</p>
                        <p><span className="font-semibold">Teléfono:</span> {selectedVenta.telefono}</p>
                        <p><span className="font-semibold">Email:</span> {selectedVenta.email}</p>
                        <p><span className="font-semibold">Dirección:</span> {selectedVenta.domicilio}, {selectedVenta.ciudad}, {selectedVenta.provincia} (CP: {selectedVenta.cp})</p>
                        {selectedVenta.referencias && (
                             <p><span className="font-semibold">Referencias:</span> {selectedVenta.referencias}</p>
                        )}
                    </div>
                ) : (
                    <div className="text-sm bg-yellow-50 text-yellow-800 p-4 rounded-md border border-yellow-200">
                        El cliente inició el pago pero aún no llenó el formulario de envío.
                    </div>
                )}
              </div>

              {/* ARTÍCULOS COMPRADOS */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Artículos del Carrito</h3>
                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50">
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-center">Cant.</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedVenta.items.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell className="text-sm">{item.nombre}</TableCell>
                                    <TableCell className="text-center">{item.cantidad}</TableCell>
                                    <TableCell className="text-right">${Number(item.subtotal).toLocaleString("es-AR")}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-gray-100 font-bold">
                                <TableCell colSpan={2} className="text-right">TOTAL PAGADO:</TableCell>
                                <TableCell className="text-right text-green-700">
                                    ${Number(selectedVenta.total).toLocaleString("es-AR")}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
