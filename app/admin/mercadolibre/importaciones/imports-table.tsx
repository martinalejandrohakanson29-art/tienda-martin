"use client"

import * as React from "react"
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

// CORRECCIÓN: Definición actualizada para coincidir con tu Base de Datos
export type ImportItem = {
  id: string
  sku: string
  name: string
  salesLast30: number     // Coincide con el error (antes VENTAS_ML)
  stockExternal: number
  salesVelocity: number   // Coincide con el error (antes PROMEDIO_CONSUMO)
  monthsCoverage: number  // Coincide con el error (antes cobertura)
}

export const columns: ColumnDef<ImportItem>[] = [
  {
    accessorKey: "sku",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          SKU
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "salesLast30", // Nombre corregido
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Ventas ML (30d)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-center">{row.getValue("salesLast30")}</div>,
  },
  {
    accessorKey: "salesVelocity", // Nombre corregido
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Promedio
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-center">{row.getValue("salesVelocity")}</div>,
  },
  {
    accessorKey: "monthsCoverage", // Nombre corregido
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Semáforo (Meses)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        // Usamos el campo correcto 'monthsCoverage'
        const val = parseFloat(row.getValue("monthsCoverage") || "0")

        let colorClass = "bg-gray-500"

        if (val <= 5) {
            colorClass = "bg-red-500 hover:bg-red-600"
        } else if (val >= 7) {
            colorClass = "bg-green-500 hover:bg-green-600"
        } else {
            colorClass = "bg-yellow-500 hover:bg-yellow-600"
        }

        return (
            <div className="flex justify-center">
                <Badge className={`${colorClass} text-white border-none px-3`}>
                    {val.toFixed(2)}
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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
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
                No hay resultados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
