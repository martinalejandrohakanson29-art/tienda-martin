// app/admin/mercadolibre/importaciones/imports-table.tsx
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
import { useSearchParams } from "next/navigation"

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

// Definimos el tipo extendido para incluir los ingresos futuros
export type ImportItem = {
  id: string
  sku: string
  name: string
  salesLast30: number
  stockExternal: number
  salesVelocity: number
  monthsCoverage: number
  futureArrivals?: Record<string, { quantity: number, supplier: string }>
}

interface ImportsTableProps {
  data: ImportItem[]
}

export function ImportsTable({ data }: ImportsTableProps) {
  const searchParams = useSearchParams()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [safetyMargin, setSafetyMargin] = React.useState<number>(10)

  // 1. CÁLCULO AUTOMÁTICO DE DÍAS (Tu lógica original)
  const periodDays = React.useMemo(() => {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!from || !to) return 30
    const startDate = new Date(from)
    const endDate = new Date(to)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 30
  }, [searchParams])

  // 2. IDENTIFICAR CARRITOS ÚNICOS PARA LAS COLUMNAS DINÁMICAS
  const uniqueOrders = React.useMemo(() => {
    const orderMap = new Map<string, string>();
    data.forEach(product => {
      if (product.futureArrivals) {
        Object.entries(product.futureArrivals).forEach(([id, info]) => {
          if (id && id !== "undefined") orderMap.set(id, info.supplier);
        });
      }
    });
    return Array.from(orderMap.entries())
      .map(([id, supplier]) => ({ id, supplier }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [data]);

  // 3. DEFINICIÓN DE COLUMNAS (Lógica original + Nuevos Colores + Columnas de Carritos)
  const columns = React.useMemo<ColumnDef<ImportItem>[]>(() => {
    const baseColumns: ColumnDef<ImportItem>[] = [
      {
        accessorKey: "sku",
        header: ({ column }) => (
          <Button variant="ghost" className="-ml-4" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            SKU <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-mono text-xs font-bold">{row.getValue("sku")}</div>,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button variant="ghost" className="-ml-4" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Producto <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium text-left max-w-[280px] truncate" title={row.getValue("name")}>{row.getValue("name")}</div>,
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
      {
        id: "salesProjected",
        accessorFn: (row) => Math.ceil(row.salesLast30 * (1 + safetyMargin / 100)),
        header: () => <div className="text-center text-blue-700 font-bold px-2">Ventas +{safetyMargin}%</div>,
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
        cell: ({ row }) => <div className="text-center font-bold text-blue-600">{row.getValue("stockExternal")}</div>,
      },
      {
        id: "calculatedVelocity",
        accessorFn: (row) => {
          const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
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
            Meses Stock <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
            const val = row.getValue("dynamicCoverage") as number
            let color = ""
            
            // --- NUEVA LÓGICA DEL SEMÁFORO ---
            if (val >= 999) {
                color = "text-green-600"
            } else if (val <= 5) {
                color = "text-red-600"    // Menor o igual a 5: ROJO
            } else if (val > 7) {
                color = "text-green-600"   // Mayor a 7: VERDE
            } else {
                color = "text-yellow-600"  // Entre 5 y 7: AMARILLO
            }

            return (
              <div className={`text-center font-bold ${color}`}>
                {val >= 999 ? "∞" : val.toFixed(1) + " m"}
              </div>
            )
        },
      },
    ];

    // Columnas de carritos (Ingresos Futuros)
    const poColumns: ColumnDef<ImportItem>[] = uniqueOrders.map(order => ({
      id: `po-${order.id}`,
      header: () => (
        <div className="text-center bg-blue-50/50 p-1 rounded border border-blue-100 min-w-[120px]">
          <div className="text-[9px] uppercase text-blue-500 font-bold">{order.supplier}</div>
          <div className="text-blue-800 text-xs font-bold">Carrito #{order.id}</div>
        </div>
      ),
      cell: ({ row }) => {
        const qty = row.original.futureArrivals?.[order.id]?.quantity;
        return (
          <div className="text-center font-bold text-orange-600">
            {qty ? `+${qty}` : <span className="text-slate-300 font-normal">-</span>}
          </div>
        );
      }
    }));

    return [...baseColumns, ...poColumns];
  }, [safetyMargin, periodDays, uniqueOrders])

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
      {/* SECCIÓN DE BÚSQUEDA Y CONFIGURACIÓN */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center relative max-w-sm shrink-0">
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar producto por nombre..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="pl-9 bg-white shadow-sm"
          />
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 border px-3 py-1.5 rounded-md shadow-inner text-slate-500">
                <CalendarDays className="h-4 w-4" />
                <span className="text-sm font-medium">Dias consultados:</span>
                <span className="text-sm font-bold text-slate-700 bg-white px-2 py-0.5 rounded border">
                    {periodDays}
                </span>
            </div>

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

      {/* CONTENEDOR DE LA TABLA CON SCROLL Y TÍTULOS FIJOS */}
      <div className="flex-1 min-h-0 rounded-md border bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 h-full">
          <Table containerClassName="overflow-visible" className="relative border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-none">
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                        key={header.id} 
                        className="bg-slate-100 font-bold text-slate-700 py-3 sticky top-0 z-30 border-b"
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
