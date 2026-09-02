"use client";

import { useState, useMemo, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Check,
  Edit2,
  Trash2,
  Power,
  Layers,
  History,
  Info,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Agregado } from "../rentabilidad/agregado-filter";
import {
  upsertMensajePostVentaRule,
  toggleMensajePostVentaRule,
  deleteMensajePostVentaRule,
  getMensajesPostVentaLogs,
  type MensajePostVentaRule,
  type MensajePostVentaLogItem,
} from "@/app/actions/mensajes-post-venta";

interface Props {
  agregados: Agregado[];
  initialRules: MensajePostVentaRule[];
  initialLogs: MensajePostVentaLogItem[];
}

export default function MensajesPostVentaClient({
  agregados,
  initialRules,
  initialLogs,
}: Props) {
  const [rules, setRules] = useState<MensajePostVentaRule[]>(initialRules);
  const [logs, setLogs] = useState<MensajePostVentaLogItem[]>(initialLogs);
  const [tab, setTab] = useState<"reglas" | "logs">("reglas");
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitulo, setFormTitulo] = useState("");
  const [formIdArticulo, setFormIdArticulo] = useState("");
  const [formNombreArticulo, setFormNombreArticulo] = useState("");
  const [formMensaje, setFormMensaje] = useState("");
  const [formActivo, setFormActivo] = useState(true);

  // Article Dropdown / Search State inside Modal
  const [articleSearch, setArticleSearch] = useState("");
  const [articleSelectorOpen, setArticleSelectorOpen] = useState(false);
  const [showMlasPreview, setShowMlasPreview] = useState(false);

  // View MLAs Modal for a Rule
  const [viewMlasRule, setViewMlasRule] = useState<MensajePostVentaRule | null>(null);

  // Filter for rules table
  const [filterQuery, setFilterQuery] = useState("");

  // Map of agregados by id_articulo for fast lookup
  const agregadosMap = useMemo(() => {
    const map = new Map<string, Agregado>();
    for (const a of agregados) {
      map.set(a.id_articulo, a);
    }
    return map;
  }, [agregados]);

  // Filtered articles list for dropdown in modal
  const filteredAgregados = useMemo(() => {
    const q = articleSearch.toLowerCase().trim();
    if (!q) return agregados.slice(0, 50);
    return agregados
      .filter(
        (a) =>
          a.nombre_articulo.toLowerCase().includes(q) ||
          a.id_articulo.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [agregados, articleSearch]);

  // Currently selected agregado in modal form
  const selectedAgregadoInForm = useMemo(() => {
    if (!formIdArticulo) return null;
    return agregadosMap.get(formIdArticulo) || null;
  }, [formIdArticulo, agregadosMap]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormTitulo("");
    setFormIdArticulo("");
    setFormNombreArticulo("");
    setFormMensaje(
      "¡Hola {comprador}! Muchas gracias por tu compra. Te dejamos algunas recomendaciones importantes para la instalación de tu {articulo}: \n\n1. Verificar el estado del alojamiento y lubricar antes de montar.\n2. Asegurar el torque recomendado por el fabricante.\n\n¡Cualquier consulta técnica estamos a tu disposición por este medio!"
    );
    setFormActivo(true);
    setArticleSearch("");
    setArticleSelectorOpen(false);
    setShowMlasPreview(false);
    setModalOpen(true);
  };

  const openEditModal = (rule: MensajePostVentaRule) => {
    setEditingId(rule.id);
    setFormTitulo(rule.titulo);
    setFormIdArticulo(rule.idArticulo);
    setFormNombreArticulo(rule.nombreArticulo);
    setFormMensaje(rule.mensaje);
    setFormActivo(rule.activo);
    setArticleSearch("");
    setArticleSelectorOpen(false);
    setShowMlasPreview(false);
    setModalOpen(true);
  };

  const handleSelectArticle = (ag: Agregado) => {
    setFormIdArticulo(ag.id_articulo);
    setFormNombreArticulo(ag.nombre_articulo);
    if (!formTitulo || formTitulo.startsWith("Recomendaciones")) {
      setFormTitulo(`Recomendaciones: ${ag.nombre_articulo}`);
    }
    setArticleSelectorOpen(false);
  };

  const handleSaveRule = () => {
    if (!formTitulo.trim()) {
      toast.error("Por favor ingresá un título o nombre para la regla.");
      return;
    }
    if (!formIdArticulo.trim()) {
      toast.error("Por favor seleccioná un artículo.");
      return;
    }
    if (!formMensaje.trim()) {
      toast.error("El mensaje no puede estar vacío.");
      return;
    }

    startTransition(async () => {
      const res = await upsertMensajePostVentaRule({
        id: editingId || undefined,
        titulo: formTitulo,
        idArticulo: formIdArticulo,
        nombreArticulo: formNombreArticulo || formIdArticulo,
        mensaje: formMensaje,
        activo: formActivo,
      });

      if (res.success && res.data) {
        toast.success(editingId ? "Regla actualizada con éxito." : "Regla creada con éxito.");
        setRules((prev) => {
          if (editingId) {
            return prev.map((r) => (r.id === editingId ? res.data! : r));
          }
          return [res.data!, ...prev];
        });
        setModalOpen(false);
      } else {
        toast.error(res.error || "No se pudo guardar la regla.");
      }
    });
  };

  const handleToggle = (rule: MensajePostVentaRule) => {
    const nuevoEstado = !rule.activo;
    startTransition(async () => {
      const res = await toggleMensajePostVentaRule(rule.id, nuevoEstado);
      if (res.success) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, activo: nuevoEstado } : r))
        );
        toast.success(`Regla ${nuevoEstado ? "activada" : "pausada"}.`);
      } else {
        toast.error(res.error || "Error al actualizar estado.");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta regla de mensaje post-venta?")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteMensajePostVentaRule(id);
      if (res.success) {
        setRules((prev) => prev.filter((r) => r.id !== id));
        toast.success("Regla eliminada.");
      } else {
        toast.error(res.error || "Error al eliminar regla.");
      }
    });
  };

  const handleRefreshLogs = async () => {
    startTransition(async () => {
      const res = await getMensajesPostVentaLogs(60);
      if (res.success) {
        setLogs(res.data);
        toast.success("Historial actualizado.");
      } else {
        toast.error(res.error || "Error al cargar historial.");
      }
    });
  };

  const filteredRules = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.titulo.toLowerCase().includes(q) ||
        r.nombreArticulo.toLowerCase().includes(q) ||
        r.idArticulo.toLowerCase().includes(q) ||
        r.mensaje.toLowerCase().includes(q)
    );
  }, [rules, filterQuery]);

  const stats = useMemo(() => {
    const total = rules.length;
    const activas = rules.filter((r) => r.activo).length;
    const enviados = logs.filter((l) => l.estado === "enviado").length;
    const pendientesFull = logs.filter((l) => l.estado === "pendiente_entrega_full").length;
    return { total, activas, enviados, pendientesFull };
  }, [rules, logs]);

  return (
    <div className="space-y-6">
      {/* Resumen de Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Reglas Configuradas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-400">Total de mensajes post-venta</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-emerald-100 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Reglas Activas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">{stats.activas}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-emerald-600/80">Listas para nuevas ventas</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-blue-100 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Mensajes Enviados
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600">{stats.enviados}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-blue-600/80">Entregados a compradores</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-amber-100 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Pendientes Full
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600">{stats.pendientesFull}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-amber-600/80">Se enviarán al recibir el paquete</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("reglas")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
              tab === "reglas"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            )}
          >
            <Layers className="h-4 w-4" />
            Reglas de Mensajes ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("logs")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
              tab === "logs"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            )}
          >
            <History className="h-4 w-4" />
            Historial de Envíos ({logs.length})
          </button>
        </div>

        {tab === "reglas" ? (
          <Button
            onClick={openCreateModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo Mensaje Post-Venta
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshLogs}
            disabled={isPending}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
            Actualizar Historial
          </Button>
        )}
      </div>

      {/* TAB 1: REGLAS */}
      {tab === "reglas" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por artículo, título o texto..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-9 h-9 bg-white border-slate-200"
              />
            </div>
          </div>

          {filteredRules.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-8 space-y-3">
              <Package className="h-12 w-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-700">
                {rules.length === 0
                  ? "No hay reglas de mensajes post-venta configuradas"
                  : "No se encontraron reglas con ese filtro"}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Crea una regla para enviar automáticamente recomendaciones o instrucciones cuando
                se venda un artículo o cualquiera de sus combos.
              </p>
              {rules.length === 0 && (
                <Button
                  onClick={openCreateModal}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 mt-2"
                >
                  <Plus className="h-4 w-4" />
                  Crear mi primera regla
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-12 text-center">Estado</TableHead>
                    <TableHead className="min-w-[200px]">Título / Regla</TableHead>
                    <TableHead className="min-w-[180px]">Artículo / Insumo</TableHead>
                    <TableHead className="min-w-[150px]">Publicaciones</TableHead>
                    <TableHead className="min-w-[300px]">Mensaje a Enviar</TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules.map((rule) => {
                    const ag = agregadosMap.get(rule.idArticulo);
                    const mlasCount = ag ? ag.mlas.length : 0;

                    return (
                      <TableRow key={rule.id} className="hover:bg-slate-50/70">
                        <TableCell className="text-center">
                          <Switch
                            checked={rule.activo}
                            onCheckedChange={() => handleToggle(rule)}
                            disabled={isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-slate-900 text-sm">{rule.titulo}</p>
                          <p className="text-xs text-slate-400">
                            Actualizado: {new Date(rule.updatedAt).toLocaleDateString("es-AR")}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs font-medium">
                            {rule.nombreArticulo}
                          </Badge>
                          <span className="block text-[11px] font-mono text-slate-400 mt-0.5">
                            {rule.idArticulo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setViewMlasRule(rule)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                          >
                            <Layers className="h-3.5 w-3.5 text-slate-500" />
                            {mlasCount} publicación{mlasCount !== 1 ? "es" : ""}
                          </button>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-line bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                            {rule.mensaje}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(rule)}
                              className="h-8 w-8 text-slate-500 hover:text-slate-800"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(rule.id)}
                              className="h-8 w-8 text-slate-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORIAL DE ENVÍOS */}
      {tab === "logs" && (
        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-8 space-y-2">
              <History className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">
                Aún no se han registrado envíos de mensajes post-venta automáticos.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="min-w-[140px]">Fecha / Hora</TableHead>
                    <TableHead className="min-w-[130px]">Orden ML</TableHead>
                    <TableHead className="min-w-[120px]">Comprador</TableHead>
                    <TableHead className="min-w-[140px]">Publicación / Art.</TableHead>
                    <TableHead className="min-w-[280px]">Mensaje Enviado</TableHead>
                    <TableHead className="min-w-[100px] text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/70">
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {new Date(log.createdAt).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-slate-800">
                            {log.orderId}
                          </span>
                          {log.esFull || log.tipoLogistica === "fulfillment" ? (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5 py-0 font-bold">
                              ⚡ FULL
                            </Badge>
                          ) : null}
                        </div>
                        {log.packId && log.packId !== log.orderId && (
                          <span className="block text-[10px] text-slate-400 font-mono">
                            Pack: {log.packId}
                          </span>
                        )}
                        {log.shipmentId && (
                          <span className="block text-[10px] text-slate-400 font-mono">
                            Envío: {log.shipmentId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 font-medium">
                        {log.buyerId ? `ID: ${log.buyerId}` : "-"}
                      </TableCell>
                      <TableCell>
                        {log.mla && (
                          <span className="block text-xs font-mono text-emerald-700 font-semibold">
                            {log.mla}
                          </span>
                        )}
                        {log.idArticulo && (
                          <span className="block text-[11px] text-slate-400 font-mono">
                            Art: {log.idArticulo}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-line bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                          {log.mensajeEnviado}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        {log.estado === "enviado" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1 text-[11px]">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Enviado
                          </Badge>
                        ) : log.estado === "pendiente_entrega_full" ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 gap-1 text-[11px]" title="Se enviará automáticamente cuando el comprador reciba el paquete">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Pendiente Entrega (Full)
                          </Badge>
                        ) : log.estado === "error" ? (
                          <Badge variant="destructive" className="gap-1 text-[11px]" title={log.errorDetalle || "Error"}>
                            <XCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 text-[11px]">
                            {log.estado}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CREACIÓN / EDICIÓN */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              {editingId ? "Editar Regla de Mensaje Post-Venta" : "Nueva Regla de Mensaje Post-Venta"}
            </DialogTitle>
            <DialogDescription>
              Asociá un artículo/insumo y redactá el mensaje que se enviará automáticamente a quien lo compre en Mercado Libre.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Título de la regla */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Título o Identificador de la Regla *
              </label>
              <Input
                placeholder="Ej: Recomendaciones para Cigüeñales 110"
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>

            {/* Selector de Artículo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Artículo / Insumo Activador *
              </label>

              {formIdArticulo ? (
                <div className="flex items-center justify-between p-3 bg-amber-50/80 border border-amber-200 rounded-lg">
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {formNombreArticulo}
                    </p>
                    <p className="text-xs font-mono text-amber-700">
                      Código: {formIdArticulo} · {selectedAgregadoInForm?.mlas.length || 0} publicaciones vinculadas
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setArticleSelectorOpen(true);
                    }}
                    className="border-amber-300 text-amber-800 hover:bg-amber-100"
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setArticleSelectorOpen(true)}
                  className="w-full justify-between h-11 border-dashed border-slate-300 hover:border-slate-400 text-slate-600"
                >
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    Seleccionar artículo (ej: cigüeñal, pistón, leva)...
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              )}

              {/* Dropdown de búsqueda de artículo */}
              {articleSelectorOpen && (
                <div className="mt-2 p-3 bg-white border border-slate-200 rounded-lg shadow-lg space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      autoFocus
                      placeholder="Buscar insumo por nombre o código..."
                      value={articleSearch}
                      onChange={(e) => setArticleSearch(e.target.value)}
                      className="pl-9 h-9 bg-slate-50 border-slate-200"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-md">
                    {filteredAgregados.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">
                        No se encontraron artículos con esa búsqueda.
                      </p>
                    ) : (
                      filteredAgregados.map((ag) => (
                        <button
                          key={ag.id_articulo}
                          type="button"
                          onClick={() => handleSelectArticle(ag)}
                          className={cn(
                            "w-full flex items-center justify-between p-2.5 text-left hover:bg-amber-50/70 transition-colors",
                            formIdArticulo === ag.id_articulo && "bg-amber-50 font-semibold"
                          )}
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {ag.nombre_articulo}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400">
                              {ag.id_articulo}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {ag.mlas.length} MLA{ag.mlas.length !== 1 ? "s" : ""}
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setArticleSelectorOpen(false)}
                      className="text-xs"
                    >
                      Cerrar selector
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Vista previa de publicaciones alcanzadas */}
            {selectedAgregadoInForm && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    Publicaciones alcanzadas ({selectedAgregadoInForm.mlas.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMlasPreview((v) => !v)}
                    className="text-xs text-emerald-700 hover:underline font-medium"
                  >
                    {showMlasPreview ? "Ocultar lista" : "Ver lista de MLAs"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Cualquier venta en Mercado Libre de estas {selectedAgregadoInForm.mlas.length} publicaciones (o combos que incluyan este artículo) disparará este mensaje.
                </p>

                {showMlasPreview && (
                  <div className="mt-2 max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-slate-200">
                    {selectedAgregadoInForm.mlas.map((mla) => (
                      <a
                        key={mla}
                        href={`https://articulo.mercadolibre.com.ar/${mla}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-700 hover:text-emerald-600 bg-white p-1.5 rounded border border-slate-200"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{mla}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mensaje Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Mensaje Post-Venta *
                </label>
                <span className="text-[11px] text-slate-400">
                  {formMensaje.length} caracteres
                </span>
              </div>
              <Textarea
                rows={6}
                placeholder="Escribí aquí las recomendaciones, tips de instalación o mensaje para el comprador..."
                value={formMensaje}
                onChange={(e) => setFormMensaje(e.target.value)}
                className="bg-white border-slate-200 font-mono text-xs leading-relaxed"
              />
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">Variables disponibles:</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                  &#123;comprador&#125;
                </span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                  &#123;articulo&#125;
                </span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                  &#123;orden&#125;
                </span>
              </div>
            </div>

            {/* Activo switch */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-800">Activar regla inmediatamente</p>
                <p className="text-xs text-slate-500">
                  Si está activa, comenzará a enviar este mensaje con cada nueva venta.
                </p>
              </div>
              <Switch checked={formActivo} onCheckedChange={setFormActivo} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveRule}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
            >
              {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editingId ? "Guardar Cambios" : "Crear Regla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE VER MLAS DE UNA REGLA */}
      <Dialog open={!!viewMlasRule} onOpenChange={(o) => !o && setViewMlasRule(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              Publicaciones asociadas: {viewMlasRule?.nombreArticulo}
            </DialogTitle>
            <DialogDescription>
              {viewMlasRule && (
                <>
                  Las ventas de cualquiera de las siguientes publicaciones dispararán la regla{" "}
                  <span className="font-semibold text-slate-700">&quot;{viewMlasRule.titulo}&quot;</span>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewMlasRule && (() => {
            const ag = agregadosMap.get(viewMlasRule.idArticulo);
            const mlas = ag ? ag.mlas : [];

            return (
              <div className="space-y-3 py-2">
                <p className="text-xs font-semibold text-slate-600">
                  Total: {mlas.length} publicaciones vinculadas directamente o por combos
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto p-1">
                  {mlas.map((mla) => (
                    <a
                      key={mla}
                      href={`https://articulo.mercadolibre.com.ar/${mla}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-slate-800 transition-colors"
                    >
                      <span>{mla}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewMlasRule(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
