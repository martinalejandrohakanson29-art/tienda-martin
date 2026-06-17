"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  Power,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  crearReglaAjuste,
  actualizarReglaAjuste,
  eliminarReglaAjuste,
  toggleReglaAjuste,
  type ReglaAjuste,
  type ReglaInput,
  type TipoRegla,
} from "@/app/actions/reglas-ajuste";

type FormState = {
  nombre: string;
  tipo: TipoRegla;
  prioridad: string;
  margenMin: string;
  margenMax: string;
  ventasMin: string;
  ventasMax: string;
  targetGanancia: string;
  subaPct: string;
};

const emptyForm: FormState = {
  nombre: "",
  tipo: "DESCUENTO",
  prioridad: "100",
  margenMin: "",
  margenMax: "",
  ventasMin: "",
  ventasMax: "",
  targetGanancia: "65",
  subaPct: "10",
};

function reglaToForm(r: ReglaAjuste): FormState {
  return {
    nombre: r.nombre,
    tipo: r.tipo,
    prioridad: String(r.prioridad),
    margenMin: r.margenMin != null ? String(r.margenMin) : "",
    margenMax: r.margenMax != null ? String(r.margenMax) : "",
    ventasMin: r.ventasMin != null ? String(r.ventasMin) : "",
    ventasMax: r.ventasMax != null ? String(r.ventasMax) : "",
    targetGanancia: r.targetGanancia != null ? String(r.targetGanancia) : "65",
    subaPct: r.subaPct != null ? String(r.subaPct) : "10",
  };
}

function formToInput(f: FormState): ReglaInput {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    nombre: f.nombre,
    tipo: f.tipo,
    prioridad: num(f.prioridad) ?? 100,
    margenMin: num(f.margenMin),
    margenMax: num(f.margenMax),
    ventasMin: num(f.ventasMin),
    ventasMax: num(f.ventasMax),
    targetGanancia: num(f.targetGanancia),
    subaPct: num(f.subaPct),
  };
}

function condicionTexto(r: ReglaAjuste): string {
  const partes: string[] = [];
  if (r.margenMin != null && r.margenMax != null) partes.push(`margen ${r.margenMin}–${r.margenMax}%`);
  else if (r.margenMin != null) partes.push(`margen > ${r.margenMin}%`);
  else if (r.margenMax != null) partes.push(`margen < ${r.margenMax}%`);
  if (r.ventasMin != null && r.ventasMax != null) partes.push(`ventas ${r.ventasMin}–${r.ventasMax}`);
  else if (r.ventasMin != null) partes.push(`ventas ≥ ${r.ventasMin}`);
  else if (r.ventasMax != null) partes.push(`ventas ≤ ${r.ventasMax}`);
  return partes.length ? partes.join(" · ") : "todas las publicaciones";
}

export default function ReglasClient({ reglas }: { reglas: ReglaAjuste[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReglaAjuste | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (r: ReglaAjuste) => {
    setEditId(r.id);
    setForm(reglaToForm(r));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error("Poné un nombre a la regla.");
      return;
    }
    if (form.tipo === "SUBA" && (!form.subaPct || Number(form.subaPct) <= 0)) {
      toast.error("La suba necesita un % de aumento mayor a 0.");
      return;
    }
    if (form.tipo === "DESCUENTO" && (!form.targetGanancia || Number(form.targetGanancia) < 0)) {
      toast.error("El descuento necesita un margen objetivo válido.");
      return;
    }
    setSaving(true);
    const input = formToInput(form);
    const res = editId
      ? await actualizarReglaAjuste(editId, input)
      : await crearReglaAjuste(input);
    setSaving(false);
    if (res.success) {
      toast.success(editId ? "Regla actualizada." : "Regla creada.");
      setDialogOpen(false);
      router.refresh();
    } else {
      toast.error("No se pudo guardar la regla.");
    }
  };

  const handleToggle = async (r: ReglaAjuste) => {
    setTogglingId(r.id);
    const res = await toggleReglaAjuste(r.id, !r.activa);
    setTogglingId(null);
    if (res.success) router.refresh();
    else toast.error("No se pudo cambiar el estado.");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await eliminarReglaAjuste(deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      toast.success("Regla eliminada.");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error("No se pudo eliminar la regla.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{reglas.length} regla(s) configurada(s)</p>
        <Button onClick={openNew} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
          <Plus className="h-4 w-4" /> Nueva regla
        </Button>
      </div>

      <div className="space-y-2">
        {reglas.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed">
            No hay reglas. Creá la primera con "Nueva regla".
          </div>
        )}
        {reglas.map((r) => {
          const esSuba = r.tipo === "SUBA";
          return (
            <div
              key={r.id}
              className={cn(
                "flex items-center gap-4 p-4 bg-white rounded-xl border shadow-sm",
                r.activa ? "border-slate-200" : "border-slate-200 opacity-60"
              )}
            >
              <div className="flex flex-col items-center justify-center w-10 flex-none">
                <span className="text-[10px] text-slate-400 uppercase">Prio</span>
                <span className="text-lg font-bold text-slate-700">{r.prioridad}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">{r.nombre}</span>
                  {esSuba ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1 text-[10px]">
                      <TrendingUp className="h-3 w-3" /> Suba +{r.subaPct ?? 0}%
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1 text-[10px]">
                      <TrendingDown className="h-3 w-3" /> Descuento → {r.targetGanancia ?? 0}%
                    </Badge>
                  )}
                  {!r.activa && (
                    <Badge variant="outline" className="text-[10px] text-slate-400">Inactiva</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Si <span className="font-medium text-slate-600">{condicionTexto(r)}</span>
                </p>
              </div>

              <div className="flex items-center gap-1 flex-none">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8", r.activa ? "text-emerald-600" : "text-slate-400")}
                  title={r.activa ? "Desactivar" : "Activar"}
                  onClick={() => handleToggle(r)}
                  disabled={togglingId === r.id}
                >
                  {togglingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500"
                  title="Editar"
                  onClick={() => openEdit(r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                  title="Eliminar"
                  onClick={() => setDeleteTarget(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar regla" : "Nueva regla"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej: Descuento ganancia alta"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de acción</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => set("tipo", "DESCUENTO")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 h-9 rounded-md border text-xs font-medium transition-colors",
                      form.tipo === "DESCUENTO"
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <TrendingDown className="h-3.5 w-3.5" /> Descuento
                  </button>
                  <button
                    type="button"
                    onClick={() => set("tipo", "SUBA")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 h-9 rounded-md border text-xs font-medium transition-colors",
                      form.tipo === "SUBA"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <TrendingUp className="h-3.5 w-3.5" /> Suba
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Input
                  type="number"
                  value={form.prioridad}
                  onChange={(e) => set("prioridad", e.target.value)}
                  placeholder="100"
                />
                <p className="text-[10px] text-slate-400">Menor = se evalúa antes</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-600">Condiciones (dejá vacío lo que no apliques)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500">Margen mín. %</span>
                  <Input type="number" value={form.margenMin} onChange={(e) => set("margenMin", e.target.value)} placeholder="—" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500">Margen máx. %</span>
                  <Input type="number" value={form.margenMax} onChange={(e) => set("margenMax", e.target.value)} placeholder="—" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500">Ventas 30d mín.</span>
                  <Input type="number" value={form.ventasMin} onChange={(e) => set("ventasMin", e.target.value)} placeholder="—" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500">Ventas 30d máx.</span>
                  <Input type="number" value={form.ventasMax} onChange={(e) => set("ventasMax", e.target.value)} placeholder="—" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
              {form.tipo === "DESCUENTO" ? (
                <>
                  <Label className="text-amber-700">Llevar la ganancia a (%)</Label>
                  <Input
                    type="number"
                    value={form.targetGanancia}
                    onChange={(e) => set("targetGanancia", e.target.value)}
                    placeholder="65"
                  />
                  <p className="text-[10px] text-slate-500">
                    Se calcula el descuento propio para que la ganancia baje a este margen. Solo aplica
                    si la ganancia actual es mayor.
                  </p>
                </>
              ) : (
                <>
                  <Label className="text-emerald-700">Aumentar el precio (%)</Label>
                  <Input
                    type="number"
                    value={form.subaPct}
                    onChange={(e) => set("subaPct", e.target.value)}
                    placeholder="10"
                  />
                  <p className="text-[10px] text-slate-500">
                    Sube el precio de lista real un % fijo (ej. +10%). Cambia el precio en ML, no es promoción.
                  </p>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? "Guardar cambios" : "Crear regla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar regla"
        description={`¿Eliminar la regla "${deleteTarget?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={deleting}
      />
    </div>
  );
}
