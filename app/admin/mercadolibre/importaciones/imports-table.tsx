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

// Definición de tipos basada en tu workflow de n8n
export type ImportItem = {
  sku: string
  VENTAS_ML: number
  PROMEDIO_CONSUMO: number
  // Asumo que tienes un campo de cobertura o meses calculado, o stock.
  // Si el semáforo se basa en "Meses de Cobertura", usaremos ese valor.
  // Si no viene directo, a veces se calcula como: Stock / Promedio.
  // Por ahora, asumiré que existe un campo 'cobertura' o aplicaré la lógica al campo relevante.
  // AJUSTA 'cobertura' AL NOMBRE REAL DE TU COLUMNA SI ES DIFERENTE.
  cobertura?: number 
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
    accessorKey: "VENTAS_ML",
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
    cell: ({ row }) => <div className="text-center">{row.getValue("VENTAS_ML")}</div>,
  },
  {
    accessorKey: "PROMEDIO_CONSUMO",
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
    cell: ({ row }) => <div className="text-center">{row.getValue("PROMEDIO_CONSUMO")}</div>,
  },
  {
    // AQUI APLICAMOS LA LOGICA DEL SEMAFORO
    // Si el campo se llama diferente en tu DB (ej: "meses_stock"), cámbialo aquí.
    accessorKey: "cobertura", 
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
        // Obtenemos el valor. Si no existe, usamos 0 para evitar errores.
        // Si tu lógica es sobre "PROMEDIO_CONSUMO", cambia row.getValue("cobertura") por row.getValue("PROMEDIO_CONSUMO")
        const val = parseFloat(row.getValue("cobertura") || "0")

        let colorClass = "bg-gray-500" // Default

        // Lógica solicitada:
        if (val <= 5) {
            colorClass = "bg-red-500 hover:bg-red-600" // Rojo: <= 5
        } else if (val >= 7) {
            colorClass = "bg-green-500 hover:bg-green-600" // Verde: >= 7
        } else {
            colorClass = "bg-yellow-500 hover:bg-yellow-600" // Amarillo: Entre 5 y 7
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
