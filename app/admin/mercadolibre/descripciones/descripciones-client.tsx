"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileText,
  Database,
  Info,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  buscarEnDescripciones,
  triggerActualizarDescripciones,
  limpiarDescripcionesViejas,
  type ResultadoBusquedaDescripcion,
} from "@/app/actions/descripciones";

// Misma lógica que el server: regex insensible a acentos para resaltar
function buildAccentRegex(term: string): RegExp | null {
  const limpio = term.trim();
  if (limpio.length < 2) return null;
  const map: Record<string, string> = {
    a: "[aáàäâ]",
    e: "[eéèëê]",
    i: "[iíìïî]",
    o: "[oóòöô]",
    u: "[uúùüû]",
    n: "[nñ]",
    c: "[cç]",
  };
  const escaped = limpio.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return new RegExp(`(${pattern})`, "gi");
}

function Highlight({ text, term }: { text: string; term: string }) {
  const regex = buildAccentRegex(term);
  if (!regex) return <>{text}</>;
  const partes = text.split(regex);
  return (
    <>
      {partes.map((parte, i) => {
        regex.lastIndex = 0;
        return regex.test(parte) ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5 font-semibold">
            {parte}
          </mark>
        ) : (
          <span key={i}>{parte}</span>
        );
      })}
    </>
  );
}

interface Props {
  total: number;
  ultimaActualizacion: string | null;
}

export function DescripcionesClient({ total, ultimaActualizacion }: Props) {
  const [termino, setTermino] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusquedaDescripcion[]>([]);
  const [totalRevisadas, setTotalRevisadas] = useState(0);
  const [yaBusco, setYaBusco] = useState(false);
  const [buscando, startBusqueda] = useTransition();
  const [actualizando, setActualizando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const router = useRouter();

  const formatoFecha = ultimaActualizacion
    ? new Date(ultimaActualizacion).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const handleBuscar = () => {
    const q = termino.trim();
    if (q.length < 2) {
      toast.error("Escribí al menos 2 caracteres.");
      return;
    }
    setBusquedaActiva(q);
    startBusqueda(async () => {
      const { resultados, totalRevisadas } = await buscarEnDescripciones(q);
      setResultados(resultados);
      setTotalRevisadas(totalRevisadas);
      setYaBusco(true);
    });
  };

  const handleActualizar = async () => {
    setActualizando(true);
    toast.info("Pidiendo descripciones a Mercado Libre vía n8n… esto puede tardar un momento.");
    try {
      const res = await triggerActualizarDescripciones();
      if (res.success) {
        toast.success(
          "Workflow disparado. Las descripciones se irán guardando; recargá la página en unos segundos para ver el total actualizado."
        );
      } else {
        toast.error(res.error || "No se pudo disparar la actualización.");
      }
    } catch {
      toast.error("Error inesperado al actualizar.");
    } finally {
      setActualizando(false);
    }
  };

  const handleLimpiar = async () => {
    if (
      !window.confirm(
        "Se eliminarán las descripciones que no entraron en la última sincronización (publicaciones pausadas o borradas). ¿Continuar?"
      )
    ) {
      return;
    }
    setLimpiando(true);
    try {
      const res = await limpiarDescripcionesViejas();
      if (res.success) {
        toast.success(
          res.eliminadas && res.eliminadas > 0
            ? `Se eliminaron ${res.eliminadas} descripción(es) vieja(s).`
            : "No había descripciones viejas para limpiar."
        );
        router.refresh();
      } else {
        toast.error(res.error || "No se pudo limpiar.");
      }
    } catch {
      toast.error("Error inesperado al limpiar.");
    } finally {
      setLimpiando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Barra de estado + actualización */}
      <Card className="border-l-4 border-l-violet-500 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-2xl font-bold leading-none text-slate-800">{total}</p>
                <p className="text-xs text-slate-500">descripciones en memoria</p>
              </div>
            </div>
            {formatoFecha && (
              <div className="hidden sm:block border-l pl-6">
                <p className="text-sm font-semibold text-slate-700">{formatoFecha}</p>
                <p className="text-xs text-slate-500">última actualización</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleLimpiar}
              disabled={limpiando || actualizando || total === 0}
              variant="outline"
              className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {limpiando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {limpiando ? "Limpiando…" : "Limpiar viejas"}
            </Button>
            <Button
              onClick={handleActualizar}
              disabled={actualizando}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${actualizando ? "animate-spin" : ""}`} />
              {actualizando ? "Disparando…" : "Actualizar descripciones"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Buscador */}
      <Card className="shadow-sm">
        <CardContent className="py-5 space-y-3">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Search className="h-4 w-4 text-violet-600" />
            Buscar palabra en las publicaciones
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                placeholder='Ej: "cigüeñal", "kit arrastre", "Honda Wave"…'
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                className="pl-9 h-12 text-lg"
              />
            </div>
            <Button
              onClick={handleBuscar}
              disabled={buscando}
              className="bg-slate-800 hover:bg-slate-900 text-white h-12 px-6 gap-2"
            >
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Info className="h-3 w-3" />
            La búsqueda ignora mayúsculas y acentos (cigueñal = cigüeñal).
          </p>
        </CardContent>
      </Card>

      {/* Resultados */}
      {yaBusco && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-slate-700">
              {resultados.length > 0 ? (
                <>
                  <span className="text-violet-700">{resultados.length}</span> publicacion
                  {resultados.length === 1 ? "" : "es"} con “{busquedaActiva}”
                </>
              ) : (
                <>Sin coincidencias para “{busquedaActiva}”</>
              )}
            </p>
            <p className="text-xs text-slate-400">{totalRevisadas} revisadas</p>
          </div>

          {resultados.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-slate-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                No se encontró esa palabra en ninguna descripción.
              </CardContent>
            </Card>
          )}

          {resultados.map((r) => (
            <Card key={r.mla} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-violet-700 text-sm">{r.mla}</span>
                      <span className="bg-yellow-100 text-yellow-800 text-[11px] font-bold px-1.5 py-0.5 rounded">
                        {r.ocurrencias} {r.ocurrencias === 1 ? "vez" : "veces"}
                      </span>
                    </div>
                    {r.titulo && (
                      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">
                        <Highlight text={r.titulo} term={busquedaActiva} />
                      </p>
                    )}
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                      <Highlight text={r.snippet} term={busquedaActiva} />
                    </p>
                  </div>
                  {r.permalink && (
                    <a
                      href={r.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                    >
                      Ver <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
