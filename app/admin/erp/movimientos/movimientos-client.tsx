"use client";

import React, { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { anularMovimientoProveedor } from "@/app/actions/erp";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { obtenerProveedores, obtenerMovimientosProveedor, obtenerPagosControl } from "@/app/actions/listas";

interface Movimiento {
  id: string;
  proveedorId: string;
  fecha: string;
  tipo: string;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  saldo: number;
  anulado: boolean;
  fechaPago: string | null;
  fechaIngreso: string | null;
  proveedorNombre: string;
}

interface MovimientosClientProps {
  movimientosIniciales: Movimiento[];
  initialProveedorId?: string;
}

export default function MovimientosClient({
  movimientosIniciales,
  initialProveedorId,
}: MovimientosClientProps) {
  const router = useRouter();

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const firstDayOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");

  const [isAnulando, setIsAnulando] = useState<string | null>(null);
  const [pendingAnulacion, setPendingAnulacion] = useState<string | null>(null);

  // Si tenemos movimientos y todos son del mismo proveedor (porque vinimos filtrados),
  // ponemos el nombre en el buscador para que sea visible el filtro
  const initialSearch = useMemo(() => {
    if (initialProveedorId && movimientosIniciales.length > 0) {
      return movimientosIniciales[0].proveedorNombre;
    }
    return "";
  }, [initialProveedorId, movimientosIniciales]);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showProvList, setShowProvList] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>(movimientosIniciales);
  const [isLoadingMovs, setIsLoadingMovs] = useState(false);

  // Estados para la nueva pestaña "Control Movimientos"
  const [activeTab, setActiveTab] = useState<"historial" | "control">("historial");
  const [paymentMethod, setPaymentMethod] = useState("Todos");
  const [controlMovimientos, setControlMovimientos] = useState<any[]>([]);
  const [isLoadingControl, setIsLoadingControl] = useState(false);
  const [controlStartDate, setControlStartDate] = useState(today);
  const [controlEndDate, setControlEndDate] = useState(today);

  const paymentMethods = ["Todos", "Efectivo", "Transferencia", "Cheque", "Dólares", "Cruzada", "A Confirmar", "Otro"];

  useEffect(() => {
    const fetchProveedores = async () => {
      const res = await obtenerProveedores();
      if (res.success && res.data) setProveedores(res.data);
    };
    fetchProveedores();
  }, []);

  useEffect(() => {
    setMovimientos(movimientosIniciales);
  }, [movimientosIniciales]);

  // Sincronizar el término de búsqueda inicial si cambia (ej. al cargar el componente)
  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);

  const handleSelectProveedor = async (p: any) => {
    setSearchTerm(p.razonSocial);
    setShowProvList(false);
    setIsLoadingMovs(true);
    try {
      const res = await obtenerMovimientosProveedor(p.id);
      if (res.success && res.data) {
        setMovimientos(res.data);
      } else {
        toast.error("No se pudieron cargar los movimientos del proveedor");
      }
    } catch (error) {
      toast.error("Error al conectar con la base de datos");
    } finally {
      setIsLoadingMovs(false);
    }
  };

  const resetAllMovements = () => {
    setMovimientos(movimientosIniciales);
    setSearchTerm("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setStartDate("");
    setEndDate("");
  };

  // Estados para los filtros aplicados (solo para las fechas)
  const [appliedStartDate, setAppliedStartDate] = useState(firstDayOfMonth);
  const [appliedEndDate, setAppliedEndDate] = useState(today);
  const [sortBy, setSortBy] = useState<"fecha" | "fechaReal">("fecha");

  const handleSearch = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const handleSearchControl = async () => {
    setIsLoadingControl(true);
    try {
      const res = await obtenerPagosControl(paymentMethod, controlStartDate, controlEndDate);
      if (res.success && res.data) {
        setControlMovimientos(res.data);
      } else {
        toast.error(res.error || "Error al cargar el control de movimientos");
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setIsLoadingControl(false);
    }
  };

  const filteredMovimientos = useMemo(() => {
    const filtered = movimientos.filter((m) => {
      const matchesSearch =
        m.proveedorNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.descripcion && m.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      const movimientoDate = new Date(m.fecha);

      if (appliedStartDate) {
        const start = new Date(appliedStartDate + "T00:00:00");
        if (movimientoDate < start) return false;
      }

      if (appliedEndDate) {
        const end = new Date(appliedEndDate + "T23:59:59");
        if (movimientoDate > end) return false;
      }

      return true;
    });

    if (sortBy === "fechaReal") {
      return [...filtered].sort((a, b) => {
        const dateA = a.fechaIngreso ?? a.fechaPago;
        const dateB = b.fechaIngreso ?? b.fechaPago;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    }

    // default: por fecha de carga desc (ya viene así del servidor)
    return [...filtered].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [movimientos, searchTerm, appliedStartDate, appliedEndDate, sortBy]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);
  };

  const handleAnularConfirm = async () => {
    if (!pendingAnulacion) return;
    const id = pendingAnulacion;
    setPendingAnulacion(null);
    setIsAnulando(id);
    try {
      const result = await anularMovimientoProveedor(id);
      if (result.success) {
        toast.success("Movimiento anulado correctamente");
        router.refresh();
      } else {
        const errorMsg = (result as any).error || "Error al anular el movimiento";
        toast.error(errorMsg);
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setIsAnulando(null);
    }
  };

  const handleExportExcel = () => {
    if (filteredMovimientos.length === 0) {
      toast.error("No hay movimientos para exportar");
      return;
    }

    const dataToExport = filteredMovimientos.map((m) => ({
      Registro: format(new Date(m.fecha), "dd/MM/yyyy HH:mm", { locale: es }),
      "Fecha Real": m.fechaIngreso
        ? format(new Date(m.fechaIngreso), "dd/MM/yyyy", { locale: es })
        : m.fechaPago
          ? format(new Date(m.fechaPago), "dd/MM/yyyy", { locale: es })
          : format(new Date(m.fecha), "dd/MM/yyyy", { locale: es }),
      Proveedor: m.proveedorNombre,
      Tipo: m.tipo,
      Descripción: m.descripcion || "---",
      Monto: m.monto,
      Saldo: m.saldo,
      Anulado: m.anulado ? "SÍ" : "NO",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos");

    // Ajustar anchos de columna
    const columnWidths = [
      { wch: 20 }, // Registro
      { wch: 18 }, // Fecha Real
      { wch: 30 }, // Proveedor
      { wch: 15 }, // Tipo
      { wch: 40 }, // Descripción
      { wch: 15 }, // Monto
      { wch: 15 }, // Saldo
      { wch: 10 }, // Anulado
    ];
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, `Reporte_Movimientos_${format(new Date(), "dd-MM-yyyy_HHmm")}.xlsx`);
    toast.success("Reporte Excel generado");
  };

  const handleExportPDFCliente = () => {
    const activeMovimientos = filteredMovimientos.filter(m => !m.anulado);

    if (activeMovimientos.length === 0) {
      toast.error("No hay movimientos para exportar");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const provNombre = searchTerm || "Todos los proveedores";

    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text("Estado de Cuenta", 14, 22);

    doc.setFontSize(13);
    doc.setTextColor(60);
    doc.text(provNombre, 14, 32);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generado el: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, 14, 40);

    let startY = 48;
    if (appliedStartDate || appliedEndDate) {
      const start = appliedStartDate ? format(new Date(appliedStartDate + "T12:00:00"), "dd/MM/yyyy") : "Inicio";
      const end = appliedEndDate ? format(new Date(appliedEndDate + "T12:00:00"), "dd/MM/yyyy") : "Hoy";
      doc.text(`Período: ${start} al ${end}`, 14, 46);
      startY = 52;
    }

    const simplifyTipo = (tipo: string): string => {
      return tipo.toUpperCase() === "DEBE" ? "Pago" : "Compra";
    };

    const tableColumn = ["Fecha", "Concepto", "Monto", "Saldo"];
    const tableRows = activeMovimientos.map(m => [
      format(new Date(m.fechaIngreso ?? m.fechaPago ?? m.fecha), "dd/MM/yyyy"),
      simplifyTipo(m.tipo),
      formatCurrency(m.monto),
      formatCurrency(m.saldo),
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY,
      theme: 'grid',
      headStyles: { fillColor: [43, 140, 238], textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0.1 },
      styles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });

    const saldoActual = activeMovimientos[0]?.saldo ?? 0;
    const finalY = (doc as any).lastAutoTable.finalY;
    const saldoPositivo = saldoActual >= 0;

    const boxY = finalY + 12;
    doc.setFillColor(...(saldoPositivo ? [255, 228, 230] : [209, 250, 229]) as [number, number, number]);
    doc.roundedRect(14, boxY, pageWidth - 28, 30, 3, 3, 'F');

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text("SALDO ACTUAL", 24, boxY + 10);

    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(saldoPositivo ? [190, 18, 60] : [4, 120, 87]) as [number, number, number]);
    doc.text(formatCurrency(saldoActual), pageWidth - 18, boxY + 22, { align: 'right' });
    doc.setFont("helvetica", "normal");

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
    toast.success("Estado de cuenta generado");
  };

  const handleExportPDF = () => {
    const activeMovimientos = filteredMovimientos.filter(m => !m.anulado);

    if (activeMovimientos.length === 0) {
      toast.error("No hay movimientos para exportar");
      return;
    }

    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0); // Black
    doc.text("Reporte de Movimientos", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(60); // Dark grey
    doc.text(`Generado el: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, 14, 30);

    if (appliedStartDate || appliedEndDate) {
      const start = appliedStartDate ? format(new Date(appliedStartDate + "T12:00:00"), "dd/MM/yyyy") : "Inicio";
      const end = appliedEndDate ? format(new Date(appliedEndDate + "T12:00:00"), "dd/MM/yyyy") : "Hoy";
      doc.text(`Periodo: ${start} al ${end}`, 14, 36);
    }

    if (searchTerm) {
      doc.text(`Filtro búsqueda: "${searchTerm}"`, 14, 42);
    }

    const tableColumn = ["Registro", "F. Real", "Proveedor", "Tipo", "Descripción", "Monto", "Saldo"];
    const tableRows = activeMovimientos.map(m => [
      format(new Date(m.fecha), "dd/MM/yy HH:mm"),
      m.fechaIngreso
        ? format(new Date(m.fechaIngreso), "dd/MM/yy")
        : m.fechaPago
          ? format(new Date(m.fechaPago), "dd/MM/yy")
          : format(new Date(m.fecha), "dd/MM/yy"),
      m.proveedorNombre,
      m.tipo,
      m.descripcion || "---",
      formatCurrency(m.monto),
      formatCurrency(m.saldo)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
      styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0] },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
      }
    });

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
    toast.success("Reporte PDF generado");
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Listado de Movimientos
        </h1>
        <p className="text-sm text-slate-500">
          {activeTab === "historial"
            ? "Historial de saldos y transacciones por proveedor"
            : "Control unificado de pagos y cobros por método"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("historial")}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "historial"
            ? "bg-white dark:bg-slate-900 text-[#2b8cee] shadow-sm"
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
        >
          Historial Proveedores
        </button>
        <button
          onClick={() => setActiveTab("control")}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "control"
            ? "bg-white dark:bg-slate-900 text-[#2b8cee] shadow-sm"
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
        >
          Control Movimientos
        </button>
      </div>

      {activeTab === "historial" ? (
        <>
          {/* Header section (Filtros Historial) */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row items-end gap-3 w-full lg:w-auto">
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isLoadingMovs ? (
                      <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    ) : (
                      <span className="material-symbols-outlined text-slate-400 text-sm">
                        search
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                    placeholder="Buscar proveedor..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowProvList(true);
                    }}
                    onFocus={() => setShowProvList(true)}
                    onBlur={() => setTimeout(() => setShowProvList(false), 200)}
                  />
                  {showProvList && searchTerm.length > 0 && (
                    <div className="absolute z-[60] w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="p-2 border-b bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Proveedores en DB</span>
                      </div>
                      {proveedores.filter(p =>
                        p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(searchTerm.toLowerCase())) ||
                        p.cuit?.includes(searchTerm)
                      ).length > 0 ? (
                        proveedores.filter(p =>
                          p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          p.cuit?.includes(searchTerm)
                        ).map(p => (
                          <div
                            key={p.id}
                            className="p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors"
                            onClick={() => handleSelectProveedor(p)}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{p.razonSocial}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{p.cuit || "SIN CUIT"} {p.nombreFantasia ? `| ${p.nombreFantasia}` : ""}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 italic">No hay coincidencias en DB</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="flex flex-col gap-1 w-full md:w-40">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Desde</label>
                    <input
                      type="date"
                      className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-full md:w-40">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Hasta</label>
                    <input
                      type="date"
                      className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  {(startDate || endDate || searchTerm) && (
                    <button
                      onClick={resetAllMovements}
                      className="mt-5 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                      title="Limpiar filtros"
                    >
                      <span className="material-symbols-outlined text-xl">filter_list_off</span>
                    </button>
                  )}
                  <button
                    onClick={handleSearch}
                    className="mt-5 flex items-center gap-2 px-4 py-2 bg-[#2b8cee] hover:bg-[#1a76cc] text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-blue-200 dark:shadow-none"
                  >
                    <span className="material-symbols-outlined text-lg">search</span>
                    Buscar
                  </button>

                  <div className="flex flex-col gap-2 ml-4 pl-4 border-l border-slate-100 dark:border-slate-800">
                    <button
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200 dark:shadow-none"
                      title="Exportar a Excel"
                    >
                      <span className="material-symbols-outlined text-base">description</span>
                      Excel
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-rose-200 dark:shadow-none"
                      title="Exportar a PDF"
                    >
                      <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                      PDF
                    </button>
                    <button
                      onClick={handleExportPDFCliente}
                      className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-violet-200 dark:shadow-none"
                      title="Estado de cuenta para cliente"
                    >
                      <span className="material-symbols-outlined text-base">person_check</span>
                      Cliente
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th
                      className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer select-none transition-colors ${sortBy === "fecha" ? "text-[#2b8cee]" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                      onClick={() => setSortBy("fecha")}
                    >
                      <div className="flex items-center gap-1">
                        Registro
                        {sortBy === "fecha" && <span className="material-symbols-outlined text-sm">arrow_downward</span>}
                      </div>
                    </th>
                    <th
                      className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer select-none transition-colors ${sortBy === "fechaReal" ? "text-[#2b8cee]" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                      onClick={() => setSortBy("fechaReal")}
                    >
                      <div className="flex items-center gap-1">
                        Fecha Real
                        {sortBy === "fechaReal" && <span className="material-symbols-outlined text-sm">arrow_downward</span>}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Saldo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMovimientos.length > 0 ? (
                    filteredMovimientos.map((m) => (
                      <tr key={m.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${m.anulado ? "opacity-60 grayscale-[0.5]" : ""}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                          <div className="flex flex-col">
                            <span>{format(new Date(m.fecha), "dd/MM/yy", { locale: es })}</span>
                            <span className="text-[10px] opacity-50">{format(new Date(m.fecha), "HH:mm", { locale: es })}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                          {format(
                            new Date(m.fechaIngreso ?? m.fechaPago ?? m.fecha),
                            "dd/MM/yy",
                            { locale: es }
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-bold text-slate-900 dark:text-white ${m.anulado ? "line-through" : ""}`}>{m.proveedorNombre}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-[#2b8cee] mb-0.5">
                              {m.tipo}
                            </span>
                            <p className={`text-sm text-slate-600 dark:text-slate-400 ${m.anulado ? "italic text-red-500 line-through opacity-70" : ""}`}>
                              {m.anulado && <span className="mr-1">⚠️</span>}
                              {m.descripcion || "---"}
                            </p>
                          </div>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${m.anulado ? "text-slate-400 line-through" : (m.monto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
                          }`}>
                          {formatCurrency(m.monto)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white text-right ${m.anulado ? "text-slate-400" : ""}`}>
                          {formatCurrency(m.saldo)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {!m.anulado && (
                            <button
                              onClick={() => setPendingAnulacion(m.id)}
                              disabled={isAnulando === m.id}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                              title="Anular movimiento"
                            >
                              {isAnulando === m.id ? (
                                <span className="w-5 h-5 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin inline-block" />
                              ) : (
                                <span className="material-symbols-outlined text-lg">block</span>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">history</span>
                          <p className="text-slate-500 font-medium">No se encontraron movimientos.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* SECCIÓN CONTROL MOVIMIENTOS */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row items-end gap-3 w-full">
              <div className="flex flex-col gap-1 w-full md:w-56">
                <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Método de Pago</label>
                <select
                  className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {paymentMethods.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 w-full md:w-44">
                <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Desde</label>
                <input
                  type="date"
                  className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                  value={controlStartDate}
                  onChange={(e) => setControlStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 w-full md:w-44">
                <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Hasta</label>
                <input
                  type="date"
                  className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
                  value={controlEndDate}
                  onChange={(e) => setControlEndDate(e.target.value)}
                />
              </div>
              <button
                onClick={handleSearchControl}
                disabled={isLoadingControl}
                className="flex items-center gap-2 px-6 py-2 bg-[#2b8cee] hover:bg-[#1a76cc] text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-blue-200 dark:shadow-none disabled:opacity-50"
              >
                {isLoadingControl ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-lg">filter_alt</span>
                )}
                Listar Pagos
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">F. Registro</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha Real</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Origen</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Entidad</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Monto</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {controlMovimientos.length > 0 ? (
                    controlMovimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                          {format(new Date(m.fechaRegistro), "dd/MM/yy HH:mm", { locale: es })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-700 dark:text-slate-300">
                          {format(new Date(m.fechaReal), "dd/MM/yy", { locale: es })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                            {m.origen}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{m.entidad}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400">{m.descripcion}</span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-black text-right ${m.tipo === "PAGO" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          }`}>
                          {formatCurrency(m.monto)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${m.tipo === "PAGO" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                            }`}>
                            {m.tipo}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">payments</span>
                          <p className="text-slate-500 font-medium">No hay registros para mostrar. Selecciona filtros y busca.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {controlMovimientos.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <td colSpan={5} className="px-6 py-4 text-right text-sm text-slate-500 uppercase">Balance Total</td>
                      <td className={`px-6 py-4 text-right text-base ${controlMovimientos.reduce((acc, curr) => acc + (curr.tipo === "PAGO" ? -curr.monto : curr.monto), 0) >= 0
                        ? "text-emerald-600" : "text-rose-600"
                        }`}>
                        {formatCurrency(controlMovimientos.reduce((acc, curr) => acc + (curr.tipo === "PAGO" ? -curr.monto : curr.monto), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingAnulacion !== null}
        onOpenChange={(open) => { if (!open) setPendingAnulacion(null); }}
        title="Anular movimiento"
        description="Esta acción revertirá el impacto en el saldo del proveedor y recalculará los saldos históricos en cascada."
        confirmLabel="Anular"
        variant="danger"
        onConfirm={handleAnularConfirm}
      />
    </div>
  );
}
