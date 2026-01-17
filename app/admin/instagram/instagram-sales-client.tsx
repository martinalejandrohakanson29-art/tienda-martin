"use client"

import React, { useState } from "react"
import { 
  ColumnDef, 
  flexRender, 
  getCoreRowModel, 
  useReactTable, 
  getPaginationRowModel,
  getFilteredRowModel 
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Package, DollarSign, Truck } from "lucide-react"

interface InstagramData {
  articles: any[]
  totalGeneral: number
  totalEnvios: number
}

export function InstagramSalesClient({ data }: { data: InstagramData }) {
  const [filtering, setFiltering] = useState("")

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "detalle",
      header: "Descripción del Artículo",
      cell: ({ row }) => (
        <span className="font-medium text-slate-700">
          {row.getValue("detalle")}
        </span>
      ),
    },
    {
      accessorKey: "cantidad",
      header: "Total Vendido",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-blue-600">
            {Number(row.getValue("cantidad"))}
          </span>
          <span className="text-xs text-slate-400">unidades</span>
        </div>
      ),
    },
    {
      accessorKey: "recaudado",
      header: "Monto Recaudado",
      cell: ({ row }) => (
        <span className="font-bold text-green-600">
          ${Number(row.getValue("recaudado")).toLocaleString('es-AR')}
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: data.articles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter: filtering },
    onGlobalFilterChange: setFiltering,
  })

  // Cálculo de ventas reales sin contar el costo de los envíos
  const ventasNetas = data.totalGeneral - data.totalEnvios

  return (
    <div className="w-full space-y-6">
      {/* TARJETAS DE RESUMEN */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-sm border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Netas</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              ${ventasNetas.toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Recaudación real (sin fletes)</p>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cobrado Envíos</CardTitle>
            <Truck className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">
              ${data.totalEnvios.toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Suma de cargos de envío</p>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Artículos Distintos</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {data.articles.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Variedad de productos vendidos</p>
          </CardContent>
        </Card>
      </div>

      {/* BUSCADOR Y TABLA */}
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nombre..."
            value={filtering}
            onChange={(e) => setFiltering(e.target.value)}
            className="pl-8 bg-white"
          />
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="font-semibold text-slate-900">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-slate-50/50">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No hay datos disponibles.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex items-center justify-end space-x-2 py-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
