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
import { Search, Package, DollarSign } from "lucide-react"

export function InstagramSalesClient({ data }: { data: { articles: any[], totalGeneral: number } }) {
  const [filtering, setFiltering] = useState("")

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "detalle",
      header: "Descripción del Artículo",
      cell: ({ row }) => <span className="font-medium text-slate-700">{row.getValue("detalle")}</span>,
    },
    {
      accessorKey: "cantidad",
      header: "Total Vendido",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-blue-600">{row.getValue("cantidad")}</span>
          <span className="text-xs text-slate-400">unidades</span>
        </div>
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

  return (
    <div className="w-full space-y-6">
      {/* TARJETA DE TOTAL GENERAL */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white shadow-sm border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recaudación Total Instagram</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              ${data.totalGeneral.toLocaleString('es-AR')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Suma de todos los comprobantes cargados</p>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variedad de Artículos</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              {data.articles.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Productos distintos vendidos</p>
          </CardContent>
        </Card>
      </div>

      {/* BUSCADOR Y TABLA */}
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre de artículo..."
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
                    No se encontraron artículos.
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
