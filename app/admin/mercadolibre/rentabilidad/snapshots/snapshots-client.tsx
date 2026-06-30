"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Camera, Images, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  crearSnapshotPrecios,
  eliminarSnapshotPrecios,
  type SnapshotPrecios,
} from "@/app/actions/snapshots-precios";
import RestaurarSnapshotDialog from "./restaurar-snapshot-dialog";

export default function SnapshotsClient({ snapshots }: { snapshots: SnapshotPrecios[] }) {
  const router = useRouter();

  const [fotoOpen, setFotoOpen] = useState(false);
  const [nombreFoto, setNombreFoto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [listaOpen, setListaOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SnapshotPrecios | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotPrecios | null>(null);

  const handleSacarFoto = async () => {
    if (!nombreFoto.trim()) {
      toast.error("Poné un nombre para la foto");
      return;
    }
    setGuardando(true);
    const result = await crearSnapshotPrecios(nombreFoto);
    setGuardando(false);
    if (result.success) {
      toast.success("Foto de precios guardada");
      setFotoOpen(false);
      setNombreFoto("");
      router.refresh();
    } else {
      toast.error(result.error || "No se pudo guardar la foto");
    }
  };

  const handleEliminar = async () => {
    if (!deleteTarget) return;
    setEliminando(true);
    const result = await eliminarSnapshotPrecios(deleteTarget.id);
    setEliminando(false);
    if (result.success) {
      toast.success("Foto eliminada");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error("No se pudo eliminar la foto");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setFotoOpen(true)}
        className="border-sky-300 text-sky-700 hover:bg-sky-50 gap-2"
      >
        <Camera className="h-4 w-4" />
        Sacar foto
      </Button>

      <Button
        variant="outline"
        onClick={() => setListaOpen(true)}
        className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
      >
        <Images className="h-4 w-4" />
        Fotos guardadas
        {snapshots.length > 0 && (
          <span className="bg-slate-200 text-slate-700 font-bold rounded-full px-1.5 py-0.5 text-[10px] leading-none">
            {snapshots.length}
          </span>
        )}
      </Button>

      {/* Dialog: Sacar foto */}
      <Dialog open={fotoOpen} onOpenChange={setFotoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sacar foto de precios</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label>Nombre *</Label>
            <Input
              placeholder="ej: configuracion junio"
              value={nombreFoto}
              onChange={(e) => setNombreFoto(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-slate-500">
              Guarda el % de descuento propio vigente hoy en cada publicación, para poder reaplicarlo más adelante cuando venza en ML.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFotoOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={handleSacarFoto} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Fotos guardadas */}
      <Dialog open={listaOpen} onOpenChange={setListaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fotos de precios guardadas</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto divide-y border rounded-lg">
            {snapshots.length === 0 && (
              <p className="text-sm text-slate-500 p-4 text-center">No hay fotos guardadas todavía.</p>
            )}
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{s.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {s.cantidadItems} publicación(es) · {new Date(s.createdAt).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => { setListaOpen(false); setRestoreTarget(s); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListaOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar foto"
        description={`¿Eliminar la foto "${deleteTarget?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleEliminar}
        isLoading={eliminando}
      />

      {restoreTarget && (
        <RestaurarSnapshotDialog
          snapshot={restoreTarget}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </>
  );
}
