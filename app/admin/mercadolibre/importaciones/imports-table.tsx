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
import { 
  ArrowUpDown, 
  Search, 
  Percent, 
  CalendarDays, 
  RefreshCw
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"

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
  lastUpdate: Date | null
}

type StatusFilterType = "all" | "red" | "yellow" | "green"

export function ImportsTable({ data, lastUpdate }: ImportsTableProps) {
  const searchParams = useSearchParams()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [safetyMargin, setSafetyMargin] = React.useState<number>(10)
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterType>("all")
  const [projectionFilter, setProjectionFilter] = React.useState<StatusFilterType>("all")

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

  const calculateCoverage = React.useCallback((row: ImportItem, margin: number, includeFuture = false) => {
    const currentStock = row.stockExternal || 0
    const futureStock = includeFuture 
        ? Object.values(row.futureArrivals || {}).reduce((sum, arrival) => sum + arrival.quantity, 0)
        : 0
        
    const totalStock = currentStock + futureStock
    const totalWithMargin = row.salesLast30 * (1 + margin / 100)
    const factorMonths = periodDays / 30
    const monthlyVelocity = totalWithMargin / factorMonths
    
    return monthlyVelocity > 0 ? (totalStock / monthlyVelocity) : (totalStock > 0 ? 999 : 0)
  }, [periodDays])

  const getStatusColor = (val: number) => {
    if (val >= 999) return "bg-green-500"
    if (val <= 5) return "bg-red-500"
    if (val > 7) return "bg-green-500"
    return "bg-yellow-500"
  }

  const filteredData = React.useMemo(() => {
    return data.filter((item) => {
      const coverageActual = calculateCoverage(item, safetyMargin, false)
      const coverageProyectada = calculateCoverage(item, safetyMargin, true)

      const passActual = statusFilter === "all" || (
        statusFilter === "red" ? coverageActual <= 5 :
        statusFilter === "yellow" ? (coverageActual > 5 && coverageActual <= 7) :
        statusFilter === "green" ? (coverageActual > 7 || coverageActual >= 999) : true
      )

      const passProyectada = projectionFilter === "all" || (
        projectionFilter === "red" ? coverageProyectada <= 5 :
        projectionFilter === "yellow" ? (coverageProyectada > 5 && coverageProyectada <= 7) :
        projectionFilter === "green" ? (coverageProyectada > 7 || coverageProyectada >= 999) : true
      )

      return passActual && passProyectada
    })
  }, [data, statusFilter, projectionFilter, safetyMargin, calculateCoverage])

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
        size: 180,
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
          const val = calculateCoverage(row.original, safetyMargin, false)
          const colorClass = getStatusColor(val)
          return (
            <div className="flex items-center justify-center gap-2 px-1">
              <div className="font-medium text-[11px] whitespace-nowrap py-1 overflow-hidden text-ellipsis" title={row.getValue("name")}>
                {row.getValue("name")}
              </div>
              <div className={cn("h-2 w-2 rounded-full shrink-0 shadow-sm", colorClass)} title="Estado Stock Hoy" />
            </div>
          )
        },
      },
      {
        accessorKey: "salesLast30",
        size: 70,
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
        cell: ({ row }) => <div className="text-center text-[11px]">{row.getValue("salesLast30")}</div>,
      },
      {
        accessorKey: "stockExternal",
        size: 70,
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
        cell: ({ row }) => <div className="text-center font-bold text-blue-600 text-[11px]">{row.getValue("stockExternal")}</div>,
      },
      {
        id: "dynamicCoverage", 
        size: 80,
        accessorFn: (row) => calculateCoverage(row, safetyMargin, false),
        header: ({ column }) => (
            <div className="flex justify-center">
                <Button 
                    variant="ghost" 
                    className="hover:bg-transparent p-0 h-auto text-[10px] font-bold"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Meses Hoy <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
            </div>
        ),
        cell: ({ row }) => {
            const val = calculateCoverage(row.original, safetyMargin, false)
            const colorClass = getStatusColor(val)
            const textColor = colorClass.replace('bg-', 'text-')
            return (
              <div className={cn("text-center font-bold text-[11px] px-1 whitespace-nowrap", textColor)}>
                {val >= 999 ? "∞" : val.toFixed(1) + " m"}
              </div>
            )
        },
      },
    ];

    // COLUMNAS DE CARRITOS (MÁS CHICAS)
    const poColumns: ColumnDef<ImportItem>[] = uniqueOrders.map(order => ({
      id: `po-${order.id}`,
      size: 55, // Achicamos de 70 a 55
      header: () => (
        <div className="text-center bg-blue-50/30 p-0.5 rounded border border-blue-100 mx-0.5">
          <div className="text-[7px] uppercase text-blue-400 font-bold leading-tight truncate px-0.5">{order.supplier}</div>
          <div className="text-blue-800 text-[9px] font-bold">#{order.id}</div>
        </div>
      ),
      cell: ({ row }) => {
        const qty = row.original.futureArrivals?.[order.id]?.quantity;
        return (
          <div className="text-center font-bold text-orange-600 text-[10px]">
            {qty ? `+${qty}` : <span className="text-slate-200 font-normal">-</span>}
          </div>
        );
      }
    }));

    // COLUMNA PROYECTADA (AL FINAL)
    const projectedColumn: ColumnDef<ImportItem> = {
      id: "projectedCoverage", 
      size: 85,
      accessorFn: (row) => calculateCoverage(row, safetyMargin, true),
      header: ({ column }) => (
          <div className="flex justify-center">
              <Button 
                  variant="ghost" 
                  className="hover:bg-transparent p-0 h-auto text-[10px] font-bold text-orange-600"
                  onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                  Meses Proy. <ArrowUpDown className="ml-1 h-3 w-3" />
              </Button>
          </div>
      ),
      cell: ({ row }) => {
          const val = calculateCoverage(row.original, safetyMargin, true)
          const colorClass = getStatusColor(val)
          return (
            <div className="flex items-center justify-center gap-1 bg-orange-50/30 rounded-md py-0.5 mx-1 border border-orange-100/50">
              <div className={cn("text-center font-bold text-[11px]", colorClass.replace('bg-', 'text-'))}>
                {val >= 999 ? "∞" : val.toFixed(1) + " m"}
              </div>
              <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 shadow-xs", colorClass)} />
            </div>
          )
      },
    };

    return [...baseColumns, ...poColumns, projectedColumn];
  }, [safetyMargin, periodDays, uniqueOrders, calculateCoverage]) 

  const table = useReactTable({
    data: filteredData,
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
            {lastUpdate && (
                <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 bg-blue-50/50 border border-blue-100 rounded-md text-blue-600 shadow-sm">
                    <RefreshCw className="h-3 w-3 animate-[spin_3s_linear_infinite]" />
                    <span className="text-[10px] font-medium whitespace-nowrap">
                        Actualizado: {format(lastUpdate, "d/M HH.mm'hs'")}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-md shadow-sm">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Hoy:</span>
                <div className="flex gap-1 items-center">
                    <button onClick={() => setStatusFilter("all")} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", statusFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-50")}>T</button>
                    <button onClick={() => setStatusFilter("red")} className={cn("h-3.5 w-3.5 rounded-full bg-red-500 border-2", statusFilter === "red" ? "border-slate-800 scale-110" : "border-transparent opacity-60")} />
                    <button onClick={() => setStatusFilter("yellow")} className={cn("h-3.5 w-3.5 rounded-full bg-yellow-500 border-2", statusFilter === "yellow" ? "border-slate-800 scale-110" : "border-transparent opacity-60")} />
                    <button onClick={() => setStatusFilter("green")} className={cn("h-3.5 w-3.5 rounded-full bg-green-500 border-2", statusFilter === "green" ? "border-slate-800 scale-110" : "border-transparent opacity-60")} />
                </div>
            </div>

            <div className="flex items-center gap-2 bg-orange-50/50 border border-orange-100 px-3 py-1 rounded-md shadow-sm">
                <span className="text-[9px] font-bold text-orange-600 uppercase tracking-tight">Proy:</span>
                <div className="flex gap-1 items-center">
                    <button onClick={() => setProjectionFilter("all")} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", projectionFilter === "all" ? "bg-orange-600 text-white" : "bg-white border-orange-200")}>T</button>
                    <button onClick={() => setProjectionFilter("red")} className={cn("h-3.5 w-3.5 rounded-full bg-red-500 border-2", projectionFilter === "red" ? "border-orange-800 scale-110" : "border-transparent opacity-60")} />
                    <button onClick={() => setProjectionFilter("yellow")} className={cn("h-3.5 w-3.5 rounded-full bg-yellow-500 border-2", projectionFilter === "yellow" ? "border-orange-800 scale-110" : "border-transparent opacity-60")} />
                    <button onClick={() => setProjectionFilter("green")} className={cn("h-3.5 w-3.5 rounded-full bg-green-500 border-2", projectionFilter === "green" ? "border-orange-800 scale-110" : "border-transparent opacity-60")} />
                </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border px-2 py-1 rounded-md text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold text-slate-700 bg-white px-1.5 rounded border">{periodDays}d</span>
            </div>

            <div className="flex items-center gap-2 bg-white border px-2 py-1 rounded-md shadow-sm">
                <Percent className="h-3.5 w-3.5 text-blue-600" />
                <Input
                    type="number"
                    value={safetyMargin}
                    onChange={(e) => setSafetyMargin(Number(e.target.value))}
                    className="w-10 h-7 px-1 text-center text-[11px] font-bold"
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
                    No se encontraron productos con esos filtros.
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
