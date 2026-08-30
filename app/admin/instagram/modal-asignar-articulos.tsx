"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Package, 
  Layers, 
  Check, 
  Loader2, 
  Boxes,
  X,
  Megaphone
} from "lucide-react";
import { vincularArticulosACampana } from "@/app/actions/marketing";

export interface ArticuloOpcion {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  esPack: boolean;
}

export interface AsignarTargetInfo {
  campaignId: string;
  adId?: string | null;
  name: string;
  type: "camp" | "ad";
  initialItemIds: string[];
}

interface ModalAsignarArticulosProps {
  isOpen: boolean;
  onClose: () => void;
  target: AsignarTargetInfo | null;
  articulosDisponibles: ArticuloOpcion[];
  onGuardado: (campaignId: string, adId: string | undefined, selectedIds: string[]) => void;
}

const quitarAcentos = (texto: string) => {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
};

export function ModalAsignarArticulos({
  isOpen,
  onClose,
  target,
  articulosDisponibles,
  onGuardado
}: ModalAsignarArticulosProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"TODOS" | "ARTICULOS" | "PACKS" | "SELECCIONADOS">("TODOS");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (target && isOpen) {
      setSelectedIds(target.initialItemIds || []);
      setSearchTerm("");
      setFiltroTipo("TODOS");
      setErrorMsg(null);
    }
  }, [target, isOpen]);

  const toggleSeleccion = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = (ids: string[]) => {
    setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const articulosFiltrados = useMemo(() => {
    let list = articulosDisponibles;

    if (filtroTipo === "ARTICULOS") {
      list = list.filter(a => !a.esPack);
    } else if (filtroTipo === "PACKS") {
      list = list.filter(a => a.esPack);
    } else if (filtroTipo === "SELECCIONADOS") {
      list = list.filter(a => selectedIds.includes(a.id));
    }

    if (!searchTerm.trim()) return list;

    const busquedaLimpia = quitarAcentos(searchTerm.toLowerCase().trim());
    const palabrasBuscadas = busquedaLimpia.split(/\s+/);

    return list.filter(art => {
      const nombreLimpio = quitarAcentos(art.nombre.toLowerCase());
      const idLimpio = quitarAcentos(art.id.toLowerCase());
      return palabrasBuscadas.every(palabra => 
        nombreLimpio.includes(palabra) || idLimpio.includes(palabra)
      );
    });
  }, [articulosDisponibles, searchTerm, filtroTipo, selectedIds]);

  const handleGuardar = async () => {
    if (!target) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const res = await vincularArticulosACampana(
        target.campaignId, 
        selectedIds, 
        target.adId || undefined
      );
      if (res.success) {
        onGuardado(target.campaignId, target.adId || undefined, selectedIds);
        onClose();
      } else {
        setErrorMsg(res.error || "No se pudieron guardar las vinculaciones.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!target) return null;

  const isAd = target.type === "ad";

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white">
        <DialogHeader className="p-6 pb-4 border-b bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isAd ? "bg-cyan-100 text-cyan-800" : "bg-purple-100 text-purple-800"}`}>
              {isAd ? <Megaphone className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold text-slate-900">
                  {isAd ? "Asignar Artículos al Anuncio" : "Asignar Artículos a la Campaña"}
                </DialogTitle>
                <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 ${
                  isAd ? "bg-cyan-50 text-cyan-800 border-cyan-200" : "bg-purple-50 text-purple-800 border-purple-200"
                }`}>
                  {isAd ? "Nivel Anuncio" : "Nivel Campaña"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                {isAd ? "Anuncio: " : "Campaña: "}
                <strong className="text-slate-900 font-semibold">{target.name}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* BUSCADOR Y FILTROS */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre o ID (ej: leva 110, pack cilindro)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 text-sm focus-visible:bg-white"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setFiltroTipo("TODOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  filtroTipo === "TODOS" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("ARTICULOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  filtroTipo === "ARTICULOS" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Artículos
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("PACKS")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  filtroTipo === "PACKS" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Packs
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("SELECCIONADOS")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  filtroTipo === "SELECCIONADOS" ? "bg-purple-600 text-white shadow-xs" : "text-purple-700 hover:bg-purple-50"
                }`}
              >
                <span>Vinculados</span>
                <span className="inline-flex items-center justify-center bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                  {selectedIds.length}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Mostrando <strong>{articulosFiltrados.length}</strong> de {articulosDisponibles.length} productos
            </span>
            <div className="flex items-center gap-3">
              {articulosFiltrados.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectAllFiltered(articulosFiltrados.map(a => a.id))}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Seleccionar visibles
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-red-500 hover:underline font-medium"
                >
                  Limpiar selección ({selectedIds.length})
                </button>
              )}
            </div>
          </div>

          {/* LISTADO */}
          <div className="flex-1 overflow-y-auto border rounded-xl divide-y bg-slate-50/40 p-1">
            {articulosFiltrados.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Package className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-600">No se encontraron artículos o packs</p>
                <p className="text-xs text-slate-400">Probá modificando el término de búsqueda o cambiando el filtro.</p>
              </div>
            ) : (
              articulosFiltrados.map(art => {
                const isSelected = selectedIds.includes(art.id);
                return (
                  <div
                    key={art.id}
                    onClick={() => toggleSeleccion(art.id)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "bg-purple-50/80 border border-purple-200 shadow-xs"
                        : "hover:bg-white bg-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected 
                          ? "bg-purple-600 border-purple-600 text-white" 
                          : "border-slate-300 bg-white"
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {art.nombre}
                          </p>
                          {art.esPack && (
                            <Badge variant="outline" className="bg-purple-100/70 text-purple-800 border-purple-300 text-[10px] px-1.5 py-0">
                              <Layers className="h-2.5 w-2.5 mr-1" /> Pack
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                          <span>Stock: <strong className={art.stock > 0 ? "text-emerald-700" : "text-red-600"}>{art.stock} un.</strong></span>
                          <span>•</span>
                          <span>Costo: ${art.costo.toLocaleString("es-AR")}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold font-mono text-emerald-700">
                        ${art.precio.toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {errorMsg}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 px-6 border-t bg-slate-50/70 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">
              Total asignados: <strong className="text-purple-700 font-bold text-sm">{selectedIds.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleGuardar}
              disabled={isSaving}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold gap-1.5 shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Guardar Asignación
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
