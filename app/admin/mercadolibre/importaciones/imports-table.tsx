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
  TableMeta,
} from "@tanstack/react-table"
import { 
  ArrowUpDown, 
  Search, 
  Percent, 
  CalendarDays, 
  RefreshCw,
  RotateCcw
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

// --- INTERFACES ---

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

declare module '@tanstack/react-table' {
  interface TableMeta<TData> {
    manualInputs: Record<string, number>
    setManualInputs: React.Dispatch<React.SetStateAction<Record<string, number>>>
  }
}

interface ImportsTableProps {
  data: ImportItem[]
  lastUpdate: Date | null
}

type StatusFilterType = "all" | "red" | "yellow" | "green"

export function ImportsTable({ data, lastUpdate }: ImportsTableProps) {
  const searchParams = useSearchParams()
  
  // 2) ORDENAR POR VENTAS DE MAYOR A MENOR POR DEFECTO
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "salesLast30", desc: true }
  ])
  
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [safetyMargin, setSafetyMargin] = React.useState<number>(10)
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  const [manualInputs, setManualInputs] = React.useState<Record<string, number>>({})
  
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterType>("all")
  const [projectionFilter, setProjectionFilter] = React.useState<StatusFilterType>("all")

  const periodDays = React.useMemo(() => {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!from || !to) return 30
    try {
      const diffTime = Math.abs(new Date(to).getTime() - new Date(from).getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return diffDays > 0 ? diffDays : 30
    } catch { return 30 }
  }, [searchParams])

  const calculateCoverageValue = React.useCallback((
    row: ImportItem, 
    margin: number, 
    includeFuture: boolean, 
    currentManualInputs: Record<string, number>
  ) => {
    const currentStock = row.stockExternal || 0
    let futureStock = 0
    
    if (includeFuture) {
      futureStock += Object.values(row.futureArrivals || {}).reduce((sum, a) => sum + a.quantity, 0)
      futureStock += (currentManualInputs[row.id] || 0)
    }
        
    const totalStock = currentStock + futureStock
    const adjustedSales = row.salesLast30 * (1 + margin / 100)
    const monthlyVelocity = adjustedSales / (periodDays / 30)
    
    if (monthlyVelocity <= 0) return totalStock > 0 ? 999 : 0
    return totalStock / monthlyVelocity
  }, [periodDays])

  const getStatusColor = (val: number) => {
    if (val >= 999) return "bg-green-500"
    if (val <= 1.5) return "bg-red-600"
    if (val <= 3) return "bg-yellow-500"
    return "bg-green-500"
  }

  const filteredData = React.useMemo(() => {
    return data.filter((item) => {
      const covActual = calculateCoverageValue(item, safetyMargin, false, {})
      const covProyectada = calculateCoverageValue(item, safetyMargin, true, manualInputs)

      const matchActual = statusFilter === "all" || (
        statusFilter === "red" ? covActual <= 1.5 :
        statusFilter === "yellow" ? (covActual > 1.5 && covActual <= 3) :
        statusFilter === "green" ? covActual > 3 : true
      )

      const matchProj = projectionFilter === "all" || (
        projectionFilter === "red" ? covProyectada <= 1.5 :
        projectionFilter === "yellow" ? (covProyectada > 1.5 && covProyectada <= 3) :
        projectionFilter === "green" ? covProyectada > 3 : true
      )

      return matchActual && matchProj
    })
  }, [data, statusFilter, projectionFilter, safetyMargin, manualInputs, calculateCoverageValue])

  const uniqueOrders = React.useMemo(() => {
    const orderMap = new Map<string, string>();
    data.forEach(p => {
      if (p.futureArrivals) {
        Object.entries(p.futureArrivals).forEach(([id, info]) => {
          if (id && id !== "undefined") orderMap.set(id, info.supplier);
        });
      }
    });
    return Array.from(orderMap.entries()).map(([id, supplier]) => ({ id, supplier }));
  }, [data]);

  const columns = React.useMemo<ColumnDef<ImportItem>[]>(() => {
    const cols: ColumnDef<ImportItem>[] = [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => <div className="font-mono text-[10px] font-bold text-center">{row.original.sku}</div>,
        size: 80,
      },
      {
        accessorKey: "name",
        header: "Producto",
        size: 200,
        cell: ({ row }) => {
          const val = calculateCoverageValue(row.original, safetyMargin, false, {})
          return (
            // 1) PRODUCTO CENTRADO (Cambiado items-center por justify-center)
            <div className="flex items-center justify-center gap-2 px-2 overflow-hidden text-center">
              <div className={cn("h-2 w-2 rounded-full shrink-0", getStatusColor(val))} />
              <span className="truncate text-[11px] font-medium" title={row.original.name}>
                {row.original.name}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: "salesLast30",
        header: "Ventas",
        size: 70,
        cell: ({ row }) => <div className="text-center text-[11px]">{row.original.salesLast30}</div>,
      },
      {
        accessorKey: "stockExternal",
        header: "Stock",
        size: 70,
        cell: ({ row }) => <div className="text-center font-bold text-blue-600 text-[11px]">{row.original.stockExternal}</div>,
      },
      {
        id: "currentCoverage",
        header: "Meses en stock hoy",
        size: 80,
        cell: ({ row }) => {
          const val = calculateCoverageValue(row.original, safetyMargin, false, {})
          return (
            <div className={cn("text-center font-bold text-[11px]", getStatusColor(val).replace('bg-', 'text-'))}>
              {val >= 999 ? "∞" : `${val.toFixed(1)}m`}
            </div>
          )
        }
      }
    ];

    uniqueOrders.forEach(order => {
      cols.push({
        id: `po-${order.id}`,
        header: () => (
          <div className="text-[8px] leading-tight">
            <div className="text-blue-500 uppercase">{order.supplier}</div>
            <div className="text-slate-900 font-bold">#{order.id}</div>
          </div>
        ),
        size: 60,
        cell: ({ row }) => {
          const qty = row.original.futureArrivals?.[order.id]?.quantity
          return qty ? <div className="text-center font-bold text-orange-600 text-[10px]">+{qty}</div> : null
        }
      })
    })

    cols.push({
      id: "simulation",
      header: "SIMULAR",
      size: 90,
      cell: ({ row, table }) => (
        <div className="px-1">
          <Input
            type="number"
            value={table.options.meta?.manualInputs[row.original.id] || ""}
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : parseInt(e.target.value)
              table.options.meta?.setManualInputs(prev => ({ ...prev, [row.original.id]: val }))
            }}
            className="h-7 text-[11px] text-center border-purple-200 bg-purple-50/30 focus:ring-purple-500"
            placeholder="0"
          />
        </div>
      )
    })

    cols.push({
      id: "projected",
      header: "Stock Final con importaciones",
      size: 90,
      cell: ({ row, table }) => {
        const currentInputs = table.options.meta?.manualInputs || {}
        const val = calculateCoverageValue(row.original, safetyMargin, true, currentInputs)
        const color = getStatusColor(val)
        return (
          <div className="flex justify-center mx-1">
             <div className={cn("px-2 py-0.5 rounded text-[11px] font-black border", 
              color.replace('bg-', 'text-').replace('500', '700'),
              color.replace('bg-', 'bg-').replace('500', '50')
            )}>
              {val >= 999 ? "∞" : `${val.toFixed(1)}m`}
            </div>
          </div>
        )
      }
    })

    return cols
  }, [uniqueOrders, safetyMargin, calculateCoverageValue])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    meta: {
      manualInputs,
      setManualInputs
    }
  })

  return (
    <div className="flex flex-col h-full space-y-4 p-2">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2 rounded-lg border">
        <div className="flex items-center relative w-64">
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar SKU o nombre..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(e) => table.getColumn("name")?.setFilterValue(e.target.value)}
            className="pl-9 h-9 bg-white"
          />
        </div>

        <div className="flex items-center gap-3">
          {Object.keys(manualInputs).length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setManualInputs({})}
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-100 h-8"
            >
              <RotateCcw className="mr-2 h-3 w-3" /> Limpiar Simulación
            </Button>
          )}

          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Estado:</span>
            <div className="flex gap-1">
              {(['all', 'red', 'yellow', 'green'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all",
                    f === 'all' && "bg-slate-200 border-slate-300",
                    f === 'red' && "bg-red-500 border-red-200",
                    f === 'yellow' && "bg-yellow-500 border-yellow-200",
                    f === 'green' && "bg-green-500 border-green-200",
                    statusFilter === f ? "ring-2 ring-blue-500 scale-110" : "opacity-40"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm">
            <Percent className="h-3 w-3 text-blue-500" />
            <Input
              type="number"
              value={safetyMargin}
              onChange={(e) => setSafetyMargin(Number(e.target.value))}
              className="w-12 h-7 p-1 text-center text-xs font-bold border-none focus:ring-0"
            />
          </div>

          {lastUpdate && (
             <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {format(lastUpdate, "HH:mm")}
             </div>
          )}
        </div>
      </div>

      <div className="flex-1 border rounded-lg overflow-hidden bg-white">
        <div className="overflow-auto h-[calc(100vh-250px)]">
          <Table className="relative border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-slate-100 shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                      key={header.id} 
                      // 3) AGRANDAR TAMAÑO FUENTE TÍTULOS (De 10px a 12px)
                      className="h-10 text-[12px] font-bold text-slate-700 border-b border-r text-center px-1"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div 
                          className={cn(
                            header.column.getCanSort() ? "cursor-pointer select-none flex items-center justify-center gap-1" : ""
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() && <ArrowUpDown className="h-3 w-3" />}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow 
                  key={row.id}
                  onClick={() => setSelectedRowId(row.id)}
                  className={cn(
                    "hover:bg-slate-50 transition-colors cursor-pointer",
                    // 4) CAMBIO A GRIS SUAVE AL PRESIONAR (bg-slate-100)
                    selectedRowId === row.id ? "bg-slate-100 shadow-inner" : ""
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="h-9 p-0 border-b border-r border-slate-100">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
