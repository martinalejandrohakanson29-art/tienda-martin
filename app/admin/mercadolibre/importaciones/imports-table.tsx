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
import { ArrowUpDown, Search, Percent, CalendarDays } from "lucide-react"

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

export type ImportItem = {
  id: string
  sku: string
  name: string
  salesLast30: number
  stockExternal: number
  salesVelocity: number
  monthsCoverage: number
}

interface ImportsTableProps {
  data: ImportItem[]
}

export function ImportsTable({ data }: ImportsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  
  // 1. Estados para los cálculos dinámicos
  const [safetyMargin, setSafetyMargin] = React.useState<number>(10)
  const [periodDays, setPeriodDays] = React.useState<number>(30) // Por defecto 30 días

  const columns = React.useMemo<ColumnDef<ImportItem>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Producto <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="font-medium text-left">{row.getValue("name")}</div>,
    },
    {
      accessorKey: "sku",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          SKU <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: "salesLast30",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Ventas Reales <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-center">{row.getValue("salesLast30")}</div>,
    },
    // COLUMNA: Ventas Proyectadas (Total del periodo con el margen aplicado)
    {
      id: "salesProjected",
      accessorFn: (row) => Math.ceil(row.salesLast30 * (1 + safetyMargin / 100)),
      header: () => (
          <div className="text-center text-blue-700 font-bold px-4">
            Ventas +{safetyMargin}%
          </div>
      ),
      cell: ({ row }) => (
          <div className="text-center font-bold text-blue-600 bg-blue-50 py-1 rounded-md">
              {row.getValue("salesProjected")}
          </div>
      ),
    },
    {
      accessorKey: "stockExternal",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Stock <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-center font-bold">{row.getValue("stockExternal")}</div>,
    },
    // COLUMNA: CONSUMO MENSUAL (Normalizado a 30 días)
    {
      id: "calculatedVelocity",
      accessorFn: (row) => {
        const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
        // Dividimos por el factor de meses (ej: si son 90 días, dividimos por 3)
        const factorMeses = periodDays / 30
        return Math.ceil(totalConMargen / factorMeses)
      },
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Consumo Mensual <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-center font-semibold">{row.getValue("calculatedVelocity")}</div>,
    },
    // COLUMNA: MESES EN STOCK (Usa la velocidad normalizada para el cálculo)
    {
      id: "dynamicCoverage", 
      accessorFn: (row) => {
          const stock = row.stockExternal || 0
          const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
          const factorMeses = periodDays / 30
          const monthlyVelocity = totalConMargen / factorMeses
          
          return monthlyVelocity > 0 ? (stock / monthlyVelocity) : (stock > 0 ? 999 : 0)
      },
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Meses en Stock <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
          const val = row.getValue("dynamicCoverage") as number
          let textColor = "text-slate-500"
          let displayText = val.toFixed(2)

          if (val >= 999) {
              textColor = "text-green-600"
              displayText = "∞"
          } 
          else if (val <= 5) textColor = "text-red-600"
          else if (val >= 7) textColor = "text-green-600"
          else textColor = "text-yellow-600"

          return (
              <div className={`text-center font-bold ${textColor}`}>
                  {displayText}
              </div>
          )
      },
    },
  ], [safetyMargin, periodDays]) // IMPORTANTE: Se recalculan si cambia el margen o los días

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
      <div className="flex items-center justify-between gap-4">
        {/* BUSCADOR */}
        <div className="flex items-center relative max-w-sm shrink-0">
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar producto por nombre..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="pl-9 bg-white shadow-sm"
          />
        </div>

        {/* CONTROLES DINÁMICOS */}
        <div className="flex items-center gap-4">
            {/* SELECTOR DE DÍAS DEL PERIODO */}
            <div className="flex items-center gap-2 bg-white border px-3 py-1.5 rounded-md shadow-sm">
                <CalendarDays className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-slate-600">Días del Periodo:</span>
                <Input
                    type="number"
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Number(e.target.value))}
                    className="w-16 h-8 text-center font-bold"
                />
            </div>

            {/* SELECTOR DE MARGEN DINÁMICO */}
            <div className="flex items-center gap-2 bg-white border px-3 py-1.5 rounded-md shadow-sm">
                <Percent className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-slate-600">Margen de Seguridad:</span>
                <Input
                    type="number"
                    value={safetyMargin}
                    onChange={(e) => setSafetyMargin(Number(e.target.value))}
                    className="w-16 h-8 text-center font-bold"
                />
            </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md border bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 h-full">
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
