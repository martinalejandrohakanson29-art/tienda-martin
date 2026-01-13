"use client"

import * as React from "react"
import {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export type ImportItem = {
  id: string
  sku: string
  name: string
  salesLast30: number
  stockExternal: number
  salesVelocity: number
  monthsCoverage: number
}

export const columns: ColumnDef<ImportItem>[] = [
  // 1. PRODUCTO (Primero)
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Producto <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="font-medium text-left">{row.getValue("name")}</div>,
  },
  // 2. SKU
  {
    accessorKey: "sku",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        SKU <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  // 3. VENTAS (30d)
  {
    accessorKey: "salesLast30",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Ventas (30d) <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-center">{row.getValue("salesLast30")}</div>,
  },
  // 4. VENTAS + 10% (Nueva Columna Calculada)
  {
    id: "salesPlus10",
    header: ({ column }) => (
        <Button variant="ghost" disabled className="cursor-default text-black font-bold">
          Ventas +10%
        </Button>
    ),
    cell: ({ row }) => {
        // Obtenemos el valor de ventas y calculamos el 10% extra
        const sales = parseFloat(row.getValue("salesLast30") || "0")
        // Math.ceil para redondear hacia arriba (ej: 4.4 -> 5) para seguridad de stock
        const projected = Math.ceil(sales * 1.10) 
        
        return (
            <div className="text-center font-bold text-blue-600 bg-blue-50 py-1 rounded-md">
                {projected}
            </div>
        )
    },
  },
  // 5. STOCK
  {
    accessorKey: "stockExternal",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Stock <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-center font-bold">{row.getValue("stockExternal")}</div>,
  },
  // 6. PROMEDIO MENSUAL (Antes Promedio Diario)
  {
    accessorKey: "salesVelocity",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Promedio Mensual <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-center">{row.getValue("salesVelocity")}</div>,
  },
  // 7. MESES EN STOCK (Antes Semáforo)
  {
    accessorKey: "monthsCoverage", 
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Meses en Stock <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
        const val = parseFloat(row.getValue("monthsCoverage") || "0")
        let colorClass = "bg-gray-500"
        let displayText = val.toFixed(2)

        if (val >= 999) {
            colorClass = "bg-green-500 hover:bg-green-600"
            displayText = "∞"
        } 
        else if (val <= 5) colorClass = "bg-red-500 hover:bg-red-600"
        else if (val >= 7) colorClass = "bg-green-500 hover:bg-green-600"
        else colorClass = "bg-yellow-500 hover:bg-yellow-600"

        return (
            <div className="flex justify-center">
                <Badge className={`${colorClass} text-white border-none px-1.5 py-0 text-[9px] font-bold min-w-[35px] justify-center`}>
                    {displayText}
                </Badge>
            </div>
        )
    },
  },
]

interface ImportsTableProps {
  data: ImportItem[]
}

export function ImportsTable({ data }: ImportsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  })

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* BUSCADOR FIJO ARRIBA */}
      <div className="flex items-center relative max-w-sm shrink-0">
        <Search className="absolute left-3 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar producto por nombre..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
          className="pl-9 bg-white shadow-sm"
        />
      </div>

      {/* CONTENEDOR DE TABLA CON SCROLL INTERNO */}
      <div className="flex-1 min-h-0 rounded-md border bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Aquí sucede la magia: overflow-auto y h-full */}
        <div className="overflow-auto flex-1 h-full">
          {/* containerClassName="overflow-visible" libera el scroll interno de la UI table para que funcione el sticky header */}
          <Table containerClassName="overflow-visible" className="relative">
            <TableHeader className="sticky top-0 z-30 bg-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                        key={header.id} 
                        className="bg-slate-100 font-bold text-slate-700 py-3"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                    No se encontraron productos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
