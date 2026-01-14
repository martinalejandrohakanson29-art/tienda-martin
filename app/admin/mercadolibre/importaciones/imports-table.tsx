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
import { cn } from "@/lib/utils"

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
  
  // Estado para resaltar la fila seleccionada
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)

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

  // Función para calcular colores y valores de cobertura (el "semáforo")
  const getCoverageData = (row: ImportItem) => {
    const stock = row.stockExternal || 0
    const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
    const factorMeses = periodDays / 30
    const monthlyVelocity = totalConMargen / factorMeses
    const val = monthlyVelocity > 0 ? (stock / monthlyVelocity) : (stock > 0 ? 999 : 0)

    let colorClass = ""
    if (val >= 999) colorClass = "bg-green-500"
    else if (val <= 5) colorClass = "bg-red-500"
    else if (val > 7) colorClass = "bg-green-500"
    else colorClass = "bg-yellow-500"

    return { val, colorClass, textColor: colorClass.replace('bg-', 'text-') }
  }

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

  const columns = React.useMemo<ColumnDef<ImportItem>[]>(() => {
    const baseColumns: ColumnDef<ImportItem>[] = [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => <div className="font-mono text-[10px] font-bold px-1">{row.getValue("sku")}</div>,
      },
      {
        accessorKey: "name",
        header: "Producto",
        cell: ({ row }) => {
          const { colorClass } = getCoverageData(row.original)
          return (
            <div className="flex items-center gap-2 max-w-[250px] px-1">
              {/* Círculo de estado al lado del nombre */}
              <div className={cn("h-2.5 w-2.5 rounded-full shrink-0 shadow-sm", colorClass)} title="Estado de stock" />
              <div className="font-medium text-xs truncate py-1" title={row.getValue("name")}>
                {row.getValue("name")}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "salesLast30",
        header: () => <div className="text-center text-[10px]">Ventas</div>,
        cell: ({ row }) => <div className="text-center text-xs">{row.getValue("salesLast30")}</div>,
      },
      {
        id: "salesProjected",
        accessorFn: (row) => Math.ceil(row.salesLast30 * (1 + safetyMargin / 100)),
        header: () => <div className="text-center text-blue-700 font-bold text-[10px]">Vtas +{safetyMargin}%</div>,
        cell: ({ row }) => (
            <div className="text-center font-bold text-blue-600 bg-blue-50/50 py-0.5 rounded text-xs mx-1">
                {row.getValue("salesProjected")}
            </div>
        ),
      },
      {
        accessorKey: "stockExternal",
        header: () => <div className="text-center text-[10px]">Stock</div>,
        cell: ({ row }) => <div className="text-center font-bold text-blue-600 text-xs">{row.getValue("stockExternal")}</div>,
      },
      {
        id: "calculatedVelocity",
        accessorFn: (row) => {
          const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
          const factorMeses = periodDays / 30
          return Math.ceil(totalConMargen / factorMeses)
        },
        header: () => <div className="text-center text-[10px]">Consumo Mes</div>,
        cell: ({ row }) => <div className="text-center font-semibold text-xs">{row.getValue("calculatedVelocity")}</div>,
      },
      {
        id: "dynamicCoverage", 
        header: () => <div className="text-center text-[10px]">Meses Stock</div>,
        cell: ({ row }) => {
            const { val, textColor } = getCoverageData(row.original)
            return (
              <div className={cn("text-center font-bold text-xs px-1", textColor)}>
                {val >= 999 ? "∞" : val.toFixed(1) + " m"}
              </div>
            )
        },
      },
    ];

    const poColumns: ColumnDef<ImportItem>[] = uniqueOrders.map(order => ({
      id: `po-${order.id}`,
      header: () => (
        <div className="text-center bg-blue-50/30 p-0.5 rounded border border-blue-100 min-w-[80px]">
          <div className="text-[8px] uppercase text-blue-400 font-bold truncate px-1">{order.supplier}</div>
          <div className="text-blue-800 text-[10px] font-bold">#{order.id}</div>
        </div>
      ),
      cell: ({ row }) => {
        const qty = row.original.futureArrivals?.[order.id]?.quantity;
        return (
          <div className="text-center font-bold text-orange-600 text-xs">
            {qty ? `+${qty}` : <span className="text-slate-200 font-normal">-</span>}
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center relative max-w-sm shrink-0">
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar producto..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="pl-9 h-9 text-sm bg-white shadow-sm"
          />
        </div>

        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border px-2 py-1 rounded-md text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Dias:</span>
                <span className="text-[11px] font-bold text-slate-700 bg-white px-1.5 rounded border">
                    {periodDays}
                </span>
            </div>

            <div className="flex items-center gap-2 bg-white border px-2 py-1 rounded-md shadow-sm">
                <Percent className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-[11px] font-medium text-slate-600">Margen:</span>
                <Input
                    type="number"
                    value={safetyMargin}
                    onChange={(e) => setSafetyMargin(Number(e.target.value))}
                    className="w-12 h-7 px-1 text-center text-[11px] font-bold"
                />
            </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md border bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 h-full">
          <Table containerClassName="overflow-visible" className="relative border-separate border-spacing-0 table-fixed">
            <TableHeader className="sticky top-0 z-30 shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-none">
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                        key={header.id} 
                        className="bg-slate-100 font-bold text-slate-700 h-10 py-0 px-1 sticky top-0 z-30 border-b text-[10px]"
                        style={{ width: header.getSize() }}
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
                  <TableRow 
                    key={row.id} 
                    onClick={() => setSelectedRowId(row.id)}
                    className={cn(
                        "cursor-pointer transition-colors",
                        selectedRowId === row.id ? "bg-blue-50/80 hover:bg-blue-100/80" : "hover:bg-slate-50/50"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-0 h-9 border-b border-slate-100">
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
