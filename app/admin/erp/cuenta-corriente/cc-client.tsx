"use client";

import React, { useState, useTransition, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actualizarProveedor, eliminarProveedor } from "@/app/actions/listas";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Proveedor {
  id: string;
  razonSocial: string;
  cuit: string | null;
  nombreFantasia: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  saldoAnterior: number;
  saldoVencido: number;
  dias15: number;
  dias30: number;
  dias45: number;
  dias60: number;
  mas60: number;
  total: number;
  aliasCbu?: string | null;
  esMayorista: boolean;
  ultimaCompra: string | null;
}

function BadgeMayorista({ ultimaCompra }: { ultimaCompra: string | null }) {
  if (!ultimaCompra) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
        <span className="material-symbols-outlined text-[11px]">schedule</span>
        MAY · Sin compras
      </span>
    );
  }
  const dias = Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24));
  const vencido = dias > 30;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
      vencido
        ? "bg-red-50 text-red-600 border-red-200"
        : "bg-amber-50 text-amber-700 border-amber-200"
    }`}>
      <span className="material-symbols-outlined text-[11px]">schedule</span>
      MAY · {dias === 0 ? "Hoy" : `${dias}d`}
    </span>
  );
}

interface CuentaCorrienteClientProps {
  proveedoresIniciales: Proveedor[];
}

type FilterType = "todos" | "deudores" | "acreedores";
type SortType = "nombre-asc" | "nombre-desc" | "saldo-asc" | "saldo-desc";

export default function CuentaCorrienteClient({
  proveedoresIniciales,
}: CuentaCorrienteClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState<FilterType>("todos");
  const [sortBy, setSortBy] = useState<SortType>("nombre-asc");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [isSaldosMenuOpen, setIsSaldosMenuOpen] = useState(false);
  const saldosMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSaldosMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (saldosMenuRef.current && !saldosMenuRef.current.contains(e.target as Node)) {
        setIsSaldosMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isSaldosMenuOpen]);

  // States for Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [editForm, setEditForm] = useState({
    razonSocial: "",
    nombreFantasia: "",
    cuit: "",
    email: "",
    telefono: "",
    celular: "",
    aliasCbu: ""
  });

  const processedProveedores = useMemo(() => {
    let result = proveedoresIniciales.filter((p) => {
      const matchesSearch =
        p.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.cuit && p.cuit.includes(searchTerm)) ||
        (p.nombreFantasia && p.nombreFantasia.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesFilter =
        filterBy === "todos" ? true :
          filterBy === "deudores" ? p.total > 0 :
            filterBy === "acreedores" ? p.total < 0 : true;

      return matchesSearch && matchesFilter;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "nombre-asc": return a.razonSocial.localeCompare(b.razonSocial);
        case "nombre-desc": return b.razonSocial.localeCompare(a.razonSocial);
        case "saldo-asc": return a.total - b.total;
        case "saldo-desc": return b.total - a.total;
        default: return 0;
      }
    });

    return result;
  }, [proveedoresIniciales, searchTerm, filterBy, sortBy]);

  const formatCurrency = (amount: any) => {
    const value = typeof amount === "number" ? amount : parseFloat(amount);
    if (isNaN(value)) return "$ 0,00";

    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(value);
  };

  const handleEditClick = (p: Proveedor) => {
    setSelectedProveedor(p);
    setEditForm({
      razonSocial: p.razonSocial || "",
      nombreFantasia: p.nombreFantasia || "",
      cuit: p.cuit || "",
      email: p.email || "",
      telefono: p.telefono || "",
      celular: p.celular || "",
      aliasCbu: p.aliasCbu || ""
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const handleDeleteConfirm = () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    startTransition(async () => {
      const res = await eliminarProveedor(id);
      if (res.success) {
        toast.success("Proveedor eliminado correctamente");
        router.refresh();
      } else {
        toast.error(res.error || "Error al eliminar");
      }
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProveedor) return;

    startTransition(async () => {
      const res = await actualizarProveedor(selectedProveedor.id, {
        ...editForm,
      });

      if (res.success) {
        toast.success("Proveedor actualizado");
        setIsEditModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al actualizar");
      }
    });
  };

  const handleExportExcel = () => {
    const dataToExport = processedProveedores.map((p) => ({
      "Razon Social": p.razonSocial,
      "Nombre Fantasia": p.nombreFantasia || "---",
      "CUIT": p.cuit || "---",
      "Email": p.email || "---",
      "Telefono": p.telefono || "---",
      "Celular": p.celular || "---",
      "Saldo Total": p.total,
      "Alias/CBU": p.aliasCbu || "---",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cuenta Corriente");
    XLSX.writeFile(workbook, `cuenta_corriente_proveedores_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const title = "Listado de Cuenta Corriente - Proveedores";
    const date = new Date().toLocaleDateString();

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.text(`Fecha: ${date}`, 14, 30);
    doc.text(`Filtros: ${filterBy} | Orden: ${sortBy}`, 14, 35);

    const tableData = processedProveedores.map((p) => [
      p.razonSocial,
      p.cuit || "---",
      p.nombreFantasia || "---",
      formatCurrency(p.total),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [["Proveedor", "CUIT", "Nombre Fantasía", "Saldo Total"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [43, 140, 238] },
      styles: { fontSize: 8 },
    });

    const pdfOutput = doc.output("bloburl");
    window.open(pdfOutput, "_blank");
  };

  const getDeudasConsolidadas = () => {
    const deudas = proveedoresIniciales
      .filter((p) => p.total < -1)
      .sort((a, b) => a.total - b.total);

    const totalDeuda = deudas.reduce((acc, p) => acc + p.total, 0);

    return { deudas, totalDeuda };
  };

  const handleReporteSaldosConsolidadosPDF = () => {
    const { deudas, totalDeuda } = getDeudasConsolidadas();

    const doc = new jsPDF();
    const date = new Date().toLocaleDateString("es-AR");

    doc.setFontSize(18);
    doc.text("Reporte de Saldos Consolidados", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fecha: ${date}`, 14, 30);
    doc.setTextColor(0);

    const tableData = deudas.map((p) => [
      p.razonSocial,
      p.cuit || "---",
      p.nombreFantasia || "---",
      p.aliasCbu || "---",
      formatCurrency(p.total),
    ]);

    autoTable(doc, {
      startY: 37,
      head: [["Proveedor", "CUIT", "Nombre Fantasía", "Alias / CBU", "Saldo"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [109, 40, 217] },
      styles: { fontSize: 8 },
      foot: [["", "", "", "TOTAL DEUDA", formatCurrency(totalDeuda)]],
      footStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold" },
    });

    const pdfOutput = doc.output("bloburl");
    window.open(pdfOutput, "_blank");
    setIsSaldosMenuOpen(false);
  };

  const handleReporteSaldosConsolidadosExcel = () => {
    const { deudas, totalDeuda } = getDeudasConsolidadas();

    const dataToExport = deudas.map((p) => ({
      "Proveedor": p.razonSocial,
      "CUIT": p.cuit || "---",
      "Nombre Fantasía": p.nombreFantasia || "---",
      "Alias / CBU": p.aliasCbu || "---",
      "Saldo": p.total,
    }));
    dataToExport.push({
      "Proveedor": "",
      "CUIT": "",
      "Nombre Fantasía": "",
      "Alias / CBU": "TOTAL DEUDA",
      "Saldo": totalDeuda,
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Saldos Consolidados");
    XLSX.writeFile(workbook, `saldos_consolidados_${new Date().toISOString().split('T')[0]}.xlsx`);
    setIsSaldosMenuOpen(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header section */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Cuenta Corriente
            </h1>
            <p className="text-sm text-slate-500">
              Gestión de saldos y vencimientos de proveedores
            </p>
          </div>

          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400 text-sm">
                search
              </span>
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-sm placeholder-slate-500 focus:ring-2 focus:ring-[#2b8cee]/20 focus:border-[#2b8cee] transition-all outline-none"
              placeholder="Buscar por nombre, CUIT o fantasía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Toolbar: Sorting & Filtering */}
        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-200 dark:border-slate-800">
            <span className="material-symbols-outlined text-slate-400 text-sm">filter_list</span>
            <div className="flex gap-1">
              {(["todos", "deudores", "acreedores"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterBy(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterBy === f
                    ? "bg-[#2b8cee] text-white"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                >
                  {f === "todos" ? "Todos" : f === "deudores" ? "Deudores (>0)" : "A quienes debemos (<0)"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-sm">sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="nombre-asc">Nombre (A-Z)</option>
              <option value="nombre-desc">Nombre (Z-A)</option>
              <option value="saldo-desc">Saldo (Mayor a Menor)</option>
              <option value="saldo-asc">Saldo (Menor a Mayor)</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${viewMode === "card"
                ? "bg-white dark:bg-slate-700 text-[#2b8cee] shadow-sm"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              title="Vista de Tarjetas"
            >
              <span className="material-symbols-outlined text-sm">grid_view</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${viewMode === "list"
                ? "bg-white dark:bg-slate-700 text-[#2b8cee] shadow-sm"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              title="Vista de Lista"
            >
              <span className="material-symbols-outlined text-sm">format_list_bulleted</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              title="Exportar a Excel"
            >
              <span className="material-symbols-outlined text-sm">description</span>
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              title="Vista previa PDF"
            >
              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
              PDF
            </button>
            <div className="relative" ref={saldosMenuRef}>
              <button
                onClick={() => setIsSaldosMenuOpen((v) => !v)}
                className="px-3 py-1.5 bg-violet-50 text-violet-700 hover:bg-violet-700 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                title="Reporte de Saldos Consolidados"
              >
                <span className="material-symbols-outlined text-sm">summarize</span>
                Saldos Consolidados
                <span className="material-symbols-outlined text-sm">
                  {isSaldosMenuOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {isSaldosMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={handleReporteSaldosConsolidadosPDF}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                    PDF
                  </button>
                  <button
                    onClick={handleReporteSaldosConsolidadosExcel}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">description</span>
                    Excel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="ml-auto text-xs font-medium text-slate-400">
            {processedProveedores.length} proveedores encontrados
          </div>
        </div>
      </div>

      {/* Main Content Area: Grid or List */}
      {processedProveedores.length > 0 ? (
        viewMode === "card" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processedProveedores.map((proveedor) => (
              <div
                key={proveedor.id}
                className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#2b8cee]/50 transition-all duration-300 hover:shadow-xl flex flex-col relative"
              >
                {/* Action Buttons Overlay */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEditClick(proveedor)}
                    className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#2b8cee] hover:border-[#2b8cee] transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button
                    onClick={() => handleDeleteClick(proveedor.id, proveedor.razonSocial)}
                    className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur shadow-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-500 hover:border-red-500 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#2b8cee]/10 flex items-center justify-center text-[#2b8cee] group-hover:bg-[#2b8cee] group-hover:text-white transition-colors duration-300">
                    <span className="material-symbols-outlined text-2xl">
                      business
                    </span>
                  </div>
                  <div className="text-right pr-10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      CUIT
                    </span>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      {proveedor.cuit || "---"}
                    </p>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 truncate">
                  {proveedor.razonSocial}
                </h3>
                {proveedor.nombreFantasia && (
                  <p className="text-sm text-[#2b8cee] font-medium mb-4">
                    {proveedor.nombreFantasia}
                  </p>
                )}

                <div className="flex-grow" />

                <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="material-symbols-outlined text-sm">mail</span>
                    <span className="truncate">{proveedor.email || "Sin email"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="material-symbols-outlined text-sm">call</span>
                    <span>{proveedor.telefono || proveedor.celular || "Sin contacto"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                    <span className="material-symbols-outlined text-sm">payments</span>
                    <span className="truncate">{proveedor.aliasCbu || "Sin alias/cbu"}</span>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Saldo Total
                    </span>
                    <span className={`text-xl font-black ${proveedor.total < 0 ? 'text-red-500' : proveedor.total > 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                      {formatCurrency(proveedor.total)}
                    </span>
                    {proveedor.esMayorista && (
                      <BadgeMayorista ultimaCompra={proveedor.ultimaCompra} />
                    )}
                  </div>
                  <Link
                    href={`/admin/erp/movimientos?proveedor=${proveedor.id}`}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-[#2b8cee] hover:text-white transition-all"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Proveedor</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Mayorista</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Saldo Total</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {processedProveedores.map((proveedor) => (
                    <tr
                      key={proveedor.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{proveedor.razonSocial}</span>
                          {proveedor.nombreFantasia && (
                            <span className="text-xs text-[#2b8cee]">{proveedor.nombreFantasia}</span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">{proveedor.cuit || "---"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {proveedor.esMayorista
                          ? <BadgeMayorista ultimaCompra={proveedor.ultimaCompra} />
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className={`px-6 py-4 text-right text-base font-black ${proveedor.total < 0 ? 'text-red-500' : proveedor.total > 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                        {formatCurrency(proveedor.total)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditClick(proveedor)}
                            className="p-2 text-slate-400 hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                            title="Editar"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          <Link
                            href={`/admin/erp/movimientos?proveedor=${proveedor.id}`}
                            className="p-2 text-slate-400 hover:text-[#2b8cee] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                            title="Ver movimientos"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                          </Link>
                          <button
                            onClick={() => handleDeleteClick(proveedor.id, proveedor.razonSocial)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            title="Eliminar"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-slate-400">
              search_off
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            No se encontraron proveedores
          </h3>
          <p className="text-slate-500">
            Intenta con otro término de búsqueda o verifica que el proveedor
            esté registrado.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Eliminar proveedor"
        description={`¿Estás seguro de que deseas eliminar a "${pendingDelete?.name}"? Esta acción eliminará también todos sus movimientos y no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        isLoading={isPending}
      />

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Editar Proveedor</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Razón Social</label>
                  <input
                    required
                    type="text"
                    value={editForm.razonSocial}
                    onChange={(e) => setEditForm({ ...editForm, razonSocial: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nombre de Fantasía</label>
                  <input
                    type="text"
                    value={editForm.nombreFantasia}
                    onChange={(e) => setEditForm({ ...editForm, nombreFantasia: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">CUIT / DNI</label>
                  <input
                    type="text"
                    value={editForm.cuit}
                    onChange={(e) => setEditForm({ ...editForm, cuit: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Teléfono</label>
                  <input
                    type="text"
                    value={editForm.telefono}
                    onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Celular</label>
                  <input
                    type="text"
                    value={editForm.celular}
                    onChange={(e) => setEditForm({ ...editForm, celular: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Alias / CBU</label>
                  <input
                    type="text"
                    value={editForm.aliasCbu}
                    onChange={(e) => setEditForm({ ...editForm, aliasCbu: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-[#2b8cee] transition-all outline-none"
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-[2] px-4 py-3 bg-[#2b8cee] text-white font-bold rounded-xl hover:bg-[#2b8cee]/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
