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
import { ArrowUpDown, Search, Percent, CalendarDays, Filter } from "lucide-react"
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
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  
  // 👇 NUEVO: Estado para el filtro de semáforo
  const [statusFilter, setStatusFilter] = React.useState<"all" | "red" | "yellow" | "green">("all")

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

  const calculateCoverage = React.useCallback((row: ImportItem, margin: number) => {
    const stock = row.stockExternal || 0
    const totalWithMargin = row.salesLast30 * (1 + margin / 100)
    const factorMonths = periodDays / 30
    const monthlyVelocity = totalWithMargin / factorMonths
    return monthlyVelocity > 0 ? (stock / monthlyVelocity) : (stock > 0 ? 999 : 0)
  }, [periodDays])

  const getStatusColor = (val: number) => {
    if (val >= 999) return "bg-green-500"
    if (val <= 5) return "bg-red-500"
    if (val > 7) return "bg-green-500"
    return "bg-yellow-500"
  }

  // 👇 NUEVO: Filtrado de datos por semáforo
  const filteredData = React.useMemo(() => {
    if (statusFilter === "all") return data
    return data.filter((item) => {
      const coverage = calculateCoverage(item, safetyMargin)
      if (statusFilter === "red") return coverage <= 5
      if (statusFilter === "yellow") return coverage > 5 && coverage <= 7
      if (statusFilter === "green") return coverage > 7 || coverage >= 999
      return true
    })
  }, [data, statusFilter, safetyMargin, calculateCoverage])

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
        size: 80,
        header: ({ column }) => (
            <Button 
                variant="ghost" 
                className="hover:bg-transparent p-0 h-auto text-[10px] font-bold w-full justify-center"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                SKU <ArrowUpDown className="ml-1 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => <div className="font-mono text-[10px] font-bold px-1 whitespace-nowrap text-center">{row.getValue("sku")}</div>,
      },
      {
        accessorKey: "name",
        size: 200,
        header: ({ column }) => (
            <Button 
                variant="ghost" 
                className="hover:bg-transparent p-0 h-auto text-[10px] font-bold w-full justify-center"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Producto <ArrowUpDown className="ml-1 h-3 w-3" />
            </Button>
        ),
        cell: ({ row }) => {
          const val = calculateCoverage(row.original, safetyMargin)
          const colorClass = getStatusColor(val)
          return (
            <div className="flex items-center justify-center gap-2 px-1">
              <div className="font-medium text-xs whitespace-nowrap py-1" title={row.getValue("name")}>
                {row.getValue("name")}
              </div>
              <div className={cn("h-2.5 w-2.5 rounded-full shrink-0 shadow-sm", colorClass)} title="Estado de stock" />
            </div>
          )
        },
      },
      {
        accessorKey: "salesLast30",
        size: 80,
        header: ({ column }) => (
            <div className="flex justify-center">
                <Button 
                    variant="ghost" 
                    className="hover:bg-transparent p-0 h-auto text-[10px] font-bold"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Ventas <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
            </div>
        ),
        cell: ({ row }) => <div className="text-center text-xs">{row.getValue("salesLast30")}</div>,
      },
      {
        id: "salesProjected",
        size: 90,
        accessorFn: (row) => Math.ceil(row.salesLast30 * (1 + safetyMargin / 100)),
        header: () => <div className="text-center text-blue-700 font-bold text-[10px] whitespace-nowrap">Vtas +{safetyMargin}%</div>,
        cell: ({ row }) => {
            const projected = Math.ceil(row.original.salesLast30 * (1 + safetyMargin / 100))
            return (
                <div className="text-center font-bold text-blue-600 bg-blue-50/50 py-0.5 rounded text-xs mx-1">
                    {projected}
                </div>
            )
        },
      },
      {
        accessorKey: "stockExternal",
        size: 80,
        header: ({ column }) => (
            <div className="flex justify-center">
                <Button 
                    variant="ghost" 
                    className="hover:bg-transparent p-0 h-auto text-[10px] font-bold"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Stock <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
            </div>
        ),
        cell: ({ row }) => <div className="text-center font-bold text-blue-600 text-xs">{row.getValue("stockExternal")}</div>,
      },
      {
        id: "calculatedVelocity",
        size: 90,
        accessorFn: (row) => {
          const totalConMargen = row.salesLast30 * (1 + safetyMargin / 100)
          const factorMeses = periodDays / 30
          return Math.ceil(totalConMargen / factorMeses)
        },
        header: ({ column }) => (
            <div className="flex justify-center">
                <Button 
                    variant="ghost" 
                    className="hover:bg-transparent p-0 h-auto text-[10px] font-bold text-center"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Consumo <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
            </div>
        ),
        cell: ({ row }) => {
            const totalConMargen = row.original.salesLast30 * (1 + safetyMargin / 100)
            const factorMeses = periodDays / 30
            const velocity = Math.ceil(totalConMargen / factorMeses)
            return <div className="text-center font-semibold text-xs">{velocity}</div>
        },
      },
      {
        id: "dynamicCoverage", 
        size: 80,
        accessorFn: (row) => calculateCoverage(row, safetyMargin),
        header: ({ column }) => (
            <div className="flex justify-center">
                <Button 
                    variant="ghost" 
                    className="hover:bg-transparent p-0 h-auto text-[10px] font-bold"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Meses <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
            </div>
        ),
        cell: ({ row }) => {
            const val = calculateCoverage(row.original, safetyMargin)
            const colorClass = getStatusColor(val)
            const textColor = colorClass.replace('bg-', 'text-')
            return (
              <div className={cn("text-center font-bold text-xs px-1 whitespace-nowrap", textColor)}>
                {val >= 999 ? "∞" : val.toFixed(1) + " m"}
              </div>
            )
        },
      },
    ];

    const poColumns: ColumnDef<ImportItem>[] = uniqueOrders.map(order => ({
      id: `po-${order.id}`,
      size: 70,
      header: () => (
        <div className="text-center bg-blue-50/30 p-0.5 rounded border border-blue-100">
          <div className="text-[8px] uppercase text-blue-400 font-bold text-center">{order.supplier}</div>
          <div className="text-blue-800 text-[10px] font-bold text-center">#{order.id}</div>
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
  }, [safetyMargin, periodDays, uniqueOrders, calculateCoverage]) 

  const table = useReactTable({
    data: filteredData, // 👇 AHORA USAMOS LOS DATOS FILTRADOS
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
            {/* 👇 NUEVO: FILTRO DE SEMÁFORO */}
            <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-md shadow-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Estado:</span>
                <div className="flex gap-1.5 items-center">
                    <button 
                        onClick={() => setStatusFilter("all")}
                        className={cn(
                            "text-[9px] font-bold px-2 py-0.5 rounded border transition-colors",
                            statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                        )}
                    >
                        Todos
                    </button>
                    <button 
                        onClick={() => setStatusFilter("red")}
                        title="Crítico (Menos de 5 meses)"
                        className={cn(
                            "h-4 w-4 rounded-full bg-red-500 border-2 transition-transform hover:scale-110",
                            statusFilter === "red" ? "border-slate-800 scale-110 shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                        )}
                    />
                    <button 
                        onClick={() => setStatusFilter("yellow")}
                        title="Advertencia (5 a 7 meses)"
                        className={cn(
                            "h-4 w-4 rounded-full bg-yellow-500 border-2 transition-transform hover:scale-110",
                            statusFilter === "yellow" ? "border-slate-800 scale-110 shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                        )}
                    />
                    <button 
                        onClick={() => setStatusFilter("green")}
                        title="Saludable (Más de 7 meses)"
                        className={cn(
                            "h-4 w-4 rounded-full bg-green-500 border-2 transition-transform hover:scale-110",
                            statusFilter === "green" ? "border-slate-800 scale-110 shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                        )}
                    />
                </div>
            </div>

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
                        className="bg-slate-100 font-bold text-slate-700 h-10 py-0 px-1 sticky top-0 z-30 border-b text-[10px] whitespace-nowrap text-center"
                        style={{ width: `${header.getSize()}px` }}
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
                    No se encontraron productos con ese estado.
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
