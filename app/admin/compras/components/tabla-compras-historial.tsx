"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Search,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Trash2,
  History,
  FileText,
  Calendar,
  DollarSign,
  Filter,
  X,
  Loader2,
  Package,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obtenerComprasPaginadas } from "@/app/actions/compras";
import { toast } from "sonner";

interface TablaComprasHistorialProps {
  onEditarCompra: (compra: any) => void;
  onEliminarCompra: (compra: any) => void;
  onVerHistorial: (id: string, numeroCompra?: number) => void;
  onVerDetalle: (compra: any) => void;
  refreshTrigger?: number;
}

const formatFecha = (iso?: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

export function TablaComprasHistorial({
  onEditarCompra,
  onEliminarCompra,
  onVerHistorial,
  onVerDetalle,
  refreshTrigger = 0,
}: TablaComprasHistorialProps) {
  const [compras, setCompras] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Filtros y paginación
  const [search, setSearch] = useState("");
  const [metodoPago, setMetodoPago] = useState("TODOS");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 1,
    totalMonto: 0,
  });

  const cargarDatos = (targetPage: number = page) => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        const res = await obtenerComprasPaginadas({
          page: targetPage,
          limit,
          search: search.trim() || undefined,
          metodoPago: metodoPago !== "TODOS" ? metodoPago : undefined,
          fechaDesde: fechaDesde || undefined,
          fechaHasta: fechaHasta || undefined,
        });

        if (res.success && res.data) {
          setCompras(res.data);
          setPagination({
            totalCount: res.pagination.totalCount,
            totalPages: res.pagination.totalPages || 1,
            totalMonto: res.pagination.totalMonto,
          });
          setPage(targetPage);
        } else {
          toast.error("Error al cargar compras: " + res.error);
        }
      } catch (e) {
        toast.error("Ocurrió un error al consultar las compras.");
      } finally {
        setIsLoading(false);
      }
    });
  };

  useEffect(() => {
    cargarDatos(1);
  }, [search, metodoPago, fechaDesde, fechaHasta, limit, refreshTrigger]);

  const handleLimpiarFiltros = () => {
    setSearch("");
    setMetodoPago("TODOS");
    setFechaDesde("");
    setFechaHasta("");
  };

  return (
    <div className="flex-grow flex flex-col p-6 max-w-[1600px] mx-auto w-full gap-4 overflow-hidden h-full">
      {/* BARRA DE FILTROS Y RESUMEN */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
          <Button
            variant="outline"
            size="icon"
            onClick={() => cargarDatos(page)}
            disabled={isLoading || isPending}
            className="h-10 w-10 rounded-xl shrink-0"
            title="Recargar datos"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
          </Button>

          {/* BUSCADOR */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por proveedor, comprobante o N° compra..."
              className="h-10 rounded-xl pl-9 pr-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* FILTRO MÉTODO DE PAGO */}
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="TODOS">Todos los Métodos</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="A Cuenta Corriente">A Cuenta Corriente</option>
            <option value="Cheque">Cheque</option>
            <option value="Mercado Pago">Mercado Pago</option>
          </select>

          {/* FILTRO FECHAS */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="h-10 w-32 rounded-xl text-xs bg-slate-50 border-slate-200"
              title="Fecha Desde"
            />
            <span>a</span>
            <Input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="h-10 w-32 rounded-xl text-xs bg-slate-50 border-slate-200"
              title="Fecha Hasta"
            />
          </div>

          {(search || metodoPago !== "TODOS" || fechaDesde || fechaHasta) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLimpiarFiltros}
              className="h-9 px-2.5 text-xs text-red-600 hover:bg-red-50 rounded-xl font-semibold"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar
            </Button>
          )}
        </div>

        {/* TOTALES EN VIVO */}
        <div className="text-right pl-4 border-l border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Total en Período ({pagination.totalCount} compras)
          </p>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            ${pagination.totalMonto.toLocaleString("es-AR")}
          </p>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="flex-grow bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-grow h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm border-b border-slate-200">
              <TableRow>
                <TableHead className="w-24 text-[10px] font-bold uppercase py-3.5">N° Compra</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-3.5">Comprobante</TableHead>
                <TableHead className="w-28 text-[10px] font-bold uppercase py-3.5">Fecha Ingreso</TableHead>
                <TableHead className="w-28 text-[10px] font-bold uppercase py-3.5">Fecha Carga</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-3.5">Proveedor</TableHead>
                <TableHead className="text-center text-[10px] font-bold uppercase py-3.5">Artículos</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-3.5">Responsable</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-3.5">Método</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase py-3.5">Recargo</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase py-3.5">Descuento</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase py-3.5">Total Final</TableHead>
                <TableHead className="text-center text-[10px] font-bold uppercase py-3.5 w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-24 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-600 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Cargando compras...</p>
                  </TableCell>
                </TableRow>
              ) : compras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-24 text-center text-slate-400">
                    <Package className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No se encontraron compras</p>
                    <p className="text-xs text-slate-400 mt-1">Prueba ajustando los filtros o fechas.</p>
                  </TableCell>
                </TableRow>
              ) : (
                compras.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => onVerDetalle(c)}
                    className="hover:bg-slate-50/70 transition-colors border-b cursor-pointer group"
                  >
                    <TableCell className="py-3.5">
                      <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200 group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-200 transition-colors">
                        #{c.numeroCompra}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      {c.comprobante ? (
                        <span className="text-xs font-mono font-medium text-slate-700">{c.comprobante}</span>
                      ) : (
                        <span className="text-xs text-slate-300 italic">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      {c.fechaIngreso ? (
                        <span className="text-xs font-bold text-blue-600">{formatFecha(c.fechaIngreso)}</span>
                      ) : (
                        <span className="text-xs text-slate-300 italic">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="text-xs font-medium text-slate-700">
                        {formatFecha(c.fechaCarga || c.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 font-bold text-slate-900">
                      {c.proveedor}
                    </TableCell>
                    <TableCell className="py-3.5 text-center">
                      <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                        {c.items?.length || 0} art.
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="text-xs text-slate-600 font-medium">{c.comprador}</span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${
                          c.metodo_pago === "Efectivo"
                            ? "bg-green-100 text-green-700"
                            : c.metodo_pago === "Transferencia"
                            ? "bg-blue-100 text-blue-700"
                            : c.metodo_pago === "A Cuenta Corriente"
                            ? "bg-amber-100 text-amber-700"
                            : c.metodo_pago === "Cheque"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.metodo_pago}
                      </span>
                    </TableCell>
                    <TableCell className="text-right py-3.5 font-mono text-xs text-amber-600 font-bold">
                      {c.interes > 0 ? `+ $ ${c.interes.toLocaleString("es-AR")}` : "-"}
                    </TableCell>
                    <TableCell className="text-right py-3.5 font-mono text-xs text-emerald-600 font-bold">
                      {c.descuento > 0 ? `- $ ${c.descuento.toLocaleString("es-AR")}` : "-"}
                    </TableCell>
                    <TableCell className="text-right py-3.5 font-black text-slate-900 text-sm">
                      ${c.totalFinal.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-center py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onVerDetalle(c)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEditarCompra(c)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                          title="Editar compra"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onVerHistorial(c.id, c.numeroCompra)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Historial de cambios"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEliminarCompra(c)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Eliminar compra"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* PIE DE PAGINACIÓN */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>por página</span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Página <strong className="text-slate-900">{page}</strong> de{" "}
              <strong className="text-slate-900">{pagination.totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => cargarDatos(page - 1)}
                disabled={page <= 1 || isLoading}
                className="h-8 w-8 p-0 rounded-lg"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cargarDatos(page + 1)}
                disabled={page >= pagination.totalPages || isLoading}
                className="h-8 w-8 p-0 rounded-lg"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
