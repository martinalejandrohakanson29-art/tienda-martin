"use client";

// Preparación / Auditoría de Pedidos de Venta.
// Replica el flujo de /admin/mercadolibre/preparacion pero a nivel de pedido completo:
//  - mode="preparacion": el operario sube una o varias fotos de evidencia por pedido.
//  - mode="auditoria":   un revisor ve las fotos y aprueba/rechaza el pedido.
// Las notificaciones se disparan según reglas (evento PEDIDO_VENTA_PREPARADO_FOTO).

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Camera,
  CheckCircle2,
  Package,
  Eye,
  Loader2,
  X,
  ArrowLeft,
  Hash,
  ShoppingBag,
  AlertTriangle,
  ClipboardCheck,
  Trash2,
} from "lucide-react";
import {
  obtenerPedidosParaPreparar,
  subirFotoPedido,
  obtenerFotosPedido,
  aprobarFotoPedido,
  rechazarFotoPedido,
  eliminarFotoPedido,
} from "@/app/actions/preparacion-pedidos";
import { formatPrice } from "@/lib/utils";
import { toast } from "sonner";

type Pedido = {
  id: string;
  numeroVenta: number;
  cliente: string;
  vendedor: string;
  totalFinal: number;
  createdAt: string;
  estadoPedido: string | null;
  tipoEnvio: string | null;
  info: string | null;
  items: { id: string; productoId: string | null; nombre: string; cantidad: number }[];
  auditStatus: string | null;
  auditUploader: string | null;
  auditAuditor: string | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  FOTO_CARGADA: { label: "FOTO CARGADA", cls: "bg-amber-100 text-amber-700" },
  AUDITADO: { label: "APROBADO", cls: "bg-emerald-100 text-emerald-700" },
  RECHAZADO: { label: "RECHAZADO", cls: "bg-red-100 text-red-700" },
};

export default function PreparacionPedidosClient({ mode }: { mode: "preparacion" | "auditoria" }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [fechaDesde, setFechaDesde] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Visor de fotos / panel de auditoría
  const [viewing, setViewing] = useState<{ pedido: Pedido; fotos: any[] } | null>(null);
  const [activeFoto, setActiveFoto] = useState<string | null>(null);
  const [fetchingFotos, setFetchingFotos] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingFotoKey, setDeletingFotoKey] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const data = await obtenerPedidosParaPreparar(fechaDesde, fechaHasta);
      setPedidos(data as Pedido[]);
    } catch (e) {
      toast.error("No se pudieron cargar los pedidos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta]);

  // Deep-link desde la notificación "Ir a ver": ?audit=<ventaId>
  useEffect(() => {
    if (mode !== "auditoria") return;
    const audit = new URLSearchParams(window.location.search).get("audit");
    if (audit) setSearch(audit);
  }, [mode]);

  const filtered = pedidos.filter((p) => {
    const term = search.toLowerCase();
    const matches =
      !search ||
      p.id.toLowerCase().includes(term) ||
      String(p.numeroVenta).includes(term) ||
      p.cliente?.toLowerCase().includes(term);

    if (!matches) return false;

    if (mode === "preparacion") {
      // En preparación mostramos los pedidos que todavía no fueron aprobados.
      return p.auditStatus !== "AUDITADO";
    }
    // En auditoría solo los que tienen foto cargada esperando revisión.
    return p.auditStatus === "FOTO_CARGADA";
  });

  const handleTriggerCamera = (pedidoId: string) => {
    setSelectedId(pedidoId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedId) {
      toast.error("No se detectó el pedido seleccionado.");
      return;
    }

    setLoadingId(selectedId);
    const formData = new FormData();
    formData.append("photo", file);
    formData.append("ventaId", selectedId);

    try {
      const res = await subirFotoPedido(formData);
      if (res.success) {
        toast.success("Foto guardada con éxito.");
        await cargar();
      } else {
        toast.error(`Fallo al subir: ${res.error || "Error desconocido"}`);
      }
    } catch (err) {
      toast.error("Error de red. Verificá tu conexión.");
    } finally {
      setLoadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenViewer = async (pedido: Pedido) => {
    setFetchingFotos(true);
    try {
      const res = await obtenerFotosPedido(pedido.id);
      if (res.success) {
        setViewing({ pedido, fotos: res.fotos });
        setActiveFoto(res.fotos[0]?.url || null);
      } else {
        toast.error("Error al cargar fotos");
      }
    } catch {
      toast.error("Fallo la conexión con el servidor de imágenes");
    } finally {
      setFetchingFotos(false);
    }
  };

  const handleApprove = async (ventaId: string) => {
    setLoadingId(ventaId);
    const res = await aprobarFotoPedido(ventaId);
    if (res.success) {
      toast.success("Pedido aprobado y auditado");
      setViewing(null);
      await cargar();
    } else {
      toast.error("Error al aprobar");
    }
    setLoadingId(null);
  };

  const handleReject = async (ventaId: string) => {
    const motivo = window.prompt("Motivo del rechazo (opcional):");
    if (motivo === null) return; // canceló el prompt → no rechazamos
    setLoadingId(ventaId);
    const res = await rechazarFotoPedido(ventaId, motivo || undefined);
    if (res.success) {
      toast.warning("Pedido rechazado.");
      setViewing(null);
      await cargar();
    } else {
      toast.error("Error al rechazar");
    }
    setLoadingId(null);
  };

  const handleDeleteFoto = async (foto: { id: string; url: string }) => {
    if (!viewing) return;
    if (!window.confirm("¿Eliminar esta foto? La acción no se puede deshacer.")) return;
    setDeletingFotoKey(foto.id);
    try {
      const res = await eliminarFotoPedido(viewing.pedido.id, foto.id);
      if (res.success) {
        const nuevasFotos = viewing.fotos.filter((f) => f.id !== foto.id);
        if (nuevasFotos.length === 0) {
          setViewing(null);
          setActiveFoto(null);
          toast.success("Foto eliminada. El pedido vuelve a estado sin foto.");
          await cargar();
        } else {
          setViewing({ ...viewing, fotos: nuevasFotos });
          setActiveFoto(activeFoto === foto.url ? nuevasFotos[0].url : activeFoto);
          toast.success("Foto eliminada.");
        }
      } else {
        toast.error("Error al eliminar la foto.");
      }
    } catch {
      toast.error("Fallo la conexión.");
    } finally {
      setDeletingFotoKey(null);
    }
  };

  // ─── Visor de fotos + panel de detalle / auditoría ───────────────────────────
  if (viewing) {
    const p = viewing.pedido;
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-6 w-full animate-in fade-in">
        {expanded && (
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setExpanded(null)}
          >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white">
              <X className="h-8 w-8" />
            </button>
            <img src={expanded} alt="Zoom" className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl" />
          </div>
        )}

        <Button variant="outline" onClick={() => { setViewing(null); setActiveFoto(null); }}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista
        </Button>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            {activeFoto ? (
              <>
                <div
                  className="aspect-square bg-white border rounded-2xl overflow-hidden cursor-zoom-in relative"
                  onClick={() => setExpanded(activeFoto)}
                >
                  <img src={activeFoto} className="w-full h-full object-contain" alt="Evidencia" />
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full font-bold">
                    FOTO {viewing.fotos.findIndex((f) => f.url === activeFoto) + 1} / {viewing.fotos.length}
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {viewing.fotos.map((foto, i) => (
                    <div
                      key={i}
                      className={`relative h-20 w-20 shrink-0 rounded-xl border-2 overflow-hidden ${activeFoto === foto.url ? "border-blue-500 scale-95" : "border-transparent opacity-60"}`}
                    >
                      <img
                        src={foto.url}
                        className="w-full h-full object-cover cursor-pointer"
                        alt="Thumbnail"
                        onClick={() => setActiveFoto(foto.url)}
                      />
                      {mode === "preparacion" && (
                        <button
                          className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-0.5 disabled:opacity-50"
                          onClick={(e) => { e.stopPropagation(); handleDeleteFoto(foto); }}
                          disabled={deletingFotoKey === foto.id}
                          title="Eliminar foto"
                        >
                          {deletingFotoKey === foto.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="aspect-square bg-gray-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                <AlertTriangle className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium">No hay fotos cargadas</p>
              </div>
            )}

            {mode === "auditoria" && (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  className="h-16 border-red-500 text-red-600 font-bold hover:bg-red-50"
                  onClick={() => handleReject(p.id)}
                  disabled={!!loadingId}
                >
                  <X className="mr-2 h-6 w-6" /> RECHAZAR
                </Button>
                <Button
                  className="h-16 bg-green-600 font-bold shadow-lg hover:bg-green-700"
                  onClick={() => handleApprove(p.id)}
                  disabled={!!loadingId}
                >
                  {loadingId === p.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2 h-6 w-6" />} APROBAR
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-1">Pedido #{p.numeroVenta}</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    {p.cliente || "Sin cliente"}
                  </span>
                  {p.auditStatus && STATUS_BADGE[p.auditStatus] && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_BADGE[p.auditStatus].cls}`}>
                      {STATUS_BADGE[p.auditStatus].label}
                    </span>
                  )}
                </div>
                {p.info && (
                  <p className="text-sm text-slate-700 p-3 bg-amber-50 rounded-xl border border-amber-100 whitespace-pre-wrap">
                    {p.info}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-500 uppercase">Artículos del pedido:</h3>
                {p.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="font-semibold text-slate-800 uppercase text-sm">{item.nombre}</span>
                    <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">x{item.cantidad}</span>
                  </div>
                ))}
              </div>

              {p.auditUploader && (
                <p className="text-xs text-slate-400">Cargó: <span className="font-bold">{p.auditUploader}</span></p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Listado ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 w-full max-w-5xl mx-auto">
      {/* Filtros de fecha + buscador */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-end">
        <div className="flex gap-3 w-full md:w-auto">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Desde</label>
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-11" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Hasta</label>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-11" />
          </div>
        </div>
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Buscar por N° pedido o cliente..."
            className="pl-10 h-11 rounded-xl bg-slate-50 border-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Listado */}
      <div className="grid gap-3 w-full">
        {cargando ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">
              {mode === "auditoria" ? "No hay pedidos esperando auditoría" : "No hay pedidos en esta lista"}
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const badge = p.auditStatus ? STATUS_BADGE[p.auditStatus] : null;
            const tieneFoto = p.auditStatus === "FOTO_CARGADA" || p.auditStatus === "AUDITADO" || p.auditStatus === "RECHAZADO";

            return (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md w-full">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-amber-100 text-amber-700 text-[11px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Hash className="h-3 w-3" /> PEDIDO #{p.numeroVenta}
                      </span>
                      {p.tipoEnvio && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{p.tipoEnvio}</span>
                      )}
                      {badge && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${badge.cls}`}>
                          <CheckCircle2 className="h-3 w-3" /> {badge.label}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-slate-400" />
                      {p.cliente || "Sin cliente"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {p.vendedor} · {formatPrice(p.totalFinal)} ·{" "}
                      {new Date(p.createdAt).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>

                {/* Artículos */}
                <div className="space-y-1.5 mb-4 pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Artículos:</p>
                  {p.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 uppercase">{item.nombre}</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">x{item.cantidad}</span>
                    </div>
                  ))}
                </div>

                {/* Acciones */}
                <div className="flex gap-2">
                  {tieneFoto && (
                    <Button
                      variant="secondary"
                      className="flex-1 gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 h-11 rounded-xl font-bold"
                      onClick={() => handleOpenViewer(p)}
                      disabled={fetchingFotos}
                    >
                      {fetchingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4" /> {mode === "auditoria" ? "REVISAR" : "VER FOTOS"}</>}
                    </Button>
                  )}

                  {mode === "preparacion" && (
                    <Button
                      className="flex-1 gap-2 h-11 rounded-xl font-bold bg-amber-600 hover:bg-amber-700"
                      onClick={() => handleTriggerCamera(p.id)}
                      disabled={loadingId === p.id}
                    >
                      {loadingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Camera className="h-4 w-4" /> {tieneFoto ? "AGREGAR FOTO" : "SUBIR FOTO"}</>}
                    </Button>
                  )}

                  {mode === "auditoria" && (
                    <Button
                      className="flex-1 gap-2 h-11 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleOpenViewer(p)}
                      disabled={fetchingFotos}
                    >
                      <ClipboardCheck className="h-4 w-4" /> AUDITAR
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
      />
    </div>
  );
}
