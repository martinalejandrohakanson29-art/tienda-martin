"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, Plus, Loader2, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Articulo } from "../../types";
import {
  normalizeText,
  redondearA50,
  calcularPrecioArt,
  calcularMarcacion,
  claseColorMarcacion,
  inputSinFlechas,
} from "../../constants";
import { toggleOcultarArticulo } from "@/app/actions/listas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articulos: Articulo[];
  setArticulos: React.Dispatch<React.SetStateAction<Articulo[]>>;
  onSelectProducto: (prod: Articulo, precioOverride?: number) => void;
  expandirPacks: boolean;
  setExpandirPacks: (val: boolean) => void;
}

export function BuscadorArticulosModal({
  open,
  onOpenChange,
  articulos,
  setArticulos,
  onSelectProducto,
  expandirPacks,
  setExpandirPacks,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [incluirOcultos, setIncluirOcultos] = useState(false);
  const [ocultandoArticuloId, setOcultandoArticuloId] = useState<string | null>(null);

  // Marcación al vuelo
  const [marcacionBusquedaEditId, setMarcacionBusquedaEditId] = useState<string | null>(null);
  const [marcacionBusquedaTemp, setMarcacionBusquedaTemp] = useState<string>("");
  const [preciosBusquedaOverride, setPreciosBusquedaOverride] = useState<Record<string, number>>({});

  // Navegación por teclado
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setPreciosBusquedaOverride({});
      setMarcacionBusquedaEditId(null);
      setMarcacionBusquedaTemp("");
      setSelectedIndex(0);
    }
  }, [open]);

  const poolArticulos = useMemo(() => {
    return incluirOcultos ? articulos : articulos.filter((a) => !a.oculto);
  }, [articulos, incluirOcultos]);

  const searchResults = useMemo(() => {
    const term = normalizeText(searchTerm).trim();
    if (!term) return poolArticulos.slice(0, 50);

    const words = term.split(/\s+/);
    return poolArticulos
      .filter((p) => {
        const fullText = normalizeText(`${p.nombre} ${p.id}`);
        return words.every((w) => fullText.includes(w));
      })
      .slice(0, 50);
  }, [poolArticulos, searchTerm]);

  // Reset selected index cuando cambia el resultado
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const obtenerPrecioBusqueda = (prod: Articulo): number => {
    const override = preciosBusquedaOverride[prod.id];
    return redondearA50(override !== undefined ? override : Number(prod.precio));
  };

  const obtenerPrecioBusquedaEnVivo = (prod: Articulo): number => {
    if (marcacionBusquedaEditId === prod.id && prod.costo && prod.costo > 0) {
      const tempMarc = Number(marcacionBusquedaTemp);
      if (marcacionBusquedaTemp.trim() !== "" && !isNaN(tempMarc)) {
        return calcularPrecioArt(prod.costo, tempMarc);
      }
    }
    return obtenerPrecioBusqueda(prod);
  };

  const iniciarEdicionMarcacionBusqueda = (e: React.MouseEvent, prod: Articulo) => {
    e.stopPropagation();
    if (!prod.costo || prod.costo <= 0) return;
    const precioActual = obtenerPrecioBusqueda(prod);
    const marc = calcularMarcacion(prod.costo, precioActual);
    setMarcacionBusquedaEditId(prod.id);
    setMarcacionBusquedaTemp(marc !== null ? marc.toFixed(1) : "0");
  };

  const cancelarEdicionMarcacionBusqueda = () => {
    setMarcacionBusquedaEditId(null);
    setMarcacionBusquedaTemp("");
  };

  const guardarMarcacionBusqueda = (prod: Articulo) => {
    const nuevoMargen = parseFloat(marcacionBusquedaTemp);
    if (
      isNaN(nuevoMargen) ||
      nuevoMargen < 0 ||
      !prod.costo ||
      prod.costo <= 0
    ) {
      cancelarEdicionMarcacionBusqueda();
      return;
    }
    const nuevoPrecio = calcularPrecioArt(prod.costo, nuevoMargen);
    setPreciosBusquedaOverride((prev) => ({ ...prev, [prod.id]: nuevoPrecio }));
    cancelarEdicionMarcacionBusqueda();
  };

  const handleOcultarArticulo = async (e: React.MouseEvent, prod: Articulo) => {
    e.stopPropagation();
    setOcultandoArticuloId(prod.id);
    const res = await toggleOcultarArticulo(prod.id, true);
    if (res.success) {
      setArticulos((prev) => prev.filter((a) => a.id !== prod.id));
    } else {
      alert("No se pudo ocultar el artículo: " + res.error);
    }
    setOcultandoArticuloId(null);
  };

  const handleSeleccionar = (prod: Articulo) => {
    const precioOverride = preciosBusquedaOverride[prod.id];
    onSelectProducto(prod, precioOverride);
    onOpenChange(false);
  };

  const scrollToIndex = (idx: number) => {
    if (!listRef.current) return;
    const elements = listRef.current.querySelectorAll("[data-item-index]");
    if (elements[idx]) {
      elements[idx].scrollIntoView({ block: "nearest" });
    }
  };

  // Atajos de navegación por teclado en el buscador
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (marcacionBusquedaEditId) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev < searchResults.length - 1 ? prev + 1 : prev;
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        scrollToIndex(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSeleccionar(searchResults[selectedIndex]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] p-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
        <div className="p-5 bg-white border-b border-slate-100 relative">
          <div className="flex items-center justify-between mb-3">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-600" /> Buscador Instantáneo (POS)
            </DialogTitle>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={incluirOcultos}
                  onCheckedChange={(v) => setIncluirOcultos(!!v)}
                  className="data-[state=checked]:bg-slate-600 data-[state=checked]:border-slate-600"
                />
                <span className="text-xs font-semibold text-slate-500">Incluir ocultos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={expandirPacks}
                  onCheckedChange={(v) => setExpandirPacks(!!v)}
                  className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                />
                <span className="text-xs font-semibold text-slate-500">
                  Detallar artículos del pack
                </span>
              </label>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe el nombre o ID... (Usa ↑ ↓ y Enter para elegir rápido)"
              className="flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-12 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm"
            />
          </div>
        </div>

        <div ref={listRef} className="h-[480px] overflow-y-auto p-3 bg-slate-50/30 space-y-1.5">
          {searchResults.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm font-medium">
              No se encontraron artículos para &quot;{searchTerm}&quot;
            </div>
          ) : (
            searchResults.map((prod, idx) => {
              const precioMostrado = obtenerPrecioBusquedaEnVivo(prod);
              const marc = calcularMarcacion(prod.costo, precioMostrado);
              const editandoMarc = marcacionBusquedaEditId === prod.id;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={prod.id}
                  data-item-index={idx}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSeleccionar(prod)}
                  className={`w-full flex items-center justify-between gap-4 p-3 rounded-xl transition-all border cursor-pointer select-none ${
                    isSelected
                      ? "bg-blue-50/80 border-blue-300 shadow-sm"
                      : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Plus className="h-4 w-4" />
                    </div>
                    <div className="text-left flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {prod.esPack && (
                          <span className="bg-purple-100 text-purple-700 text-xs font-bold px-1.5 py-0.5 rounded border border-purple-200 uppercase shrink-0">
                            Pack
                          </span>
                        )}
                        {prod.oculto && (
                          <span className="bg-slate-200 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded border border-slate-300 uppercase shrink-0">
                            Oculto
                          </span>
                        )}
                        <p className="font-bold text-sm text-slate-800 leading-tight">
                          {prod.nombre}
                        </p>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            prod.stock <= 0
                              ? "bg-red-50 text-red-600 border-red-200"
                              : prod.stock <= 5
                              ? "bg-orange-50 text-orange-600 border-orange-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          Stock: {prod.stock}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">ID: {prod.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {(!!prod.costo || !!prod.ultimaModificacion) && (
                      <div className="flex flex-col items-end gap-0.5">
                        {!!prod.costo && (
                          <span className="text-xs text-slate-500 font-medium">
                            Costo:{" "}
                            <span className="text-slate-700 font-semibold">
                              $ {redondearA50(Number(prod.costo)).toLocaleString("es-AR")}
                            </span>
                          </span>
                        )}
                        {!!prod.ultimaModificacion && (
                          <span
                            className="text-xs text-slate-400 font-mono"
                            title="Última actualización de precio en DB"
                          >
                            Mod:{" "}
                            {new Date(prod.ultimaModificacion).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <p className="text-base font-black text-slate-900">
                        $ {Number(precioMostrado).toLocaleString("es-AR")}
                      </p>
                      {editandoMarc ? (
                        <input
                          type="number"
                          autoFocus
                          value={marcacionBusquedaTemp}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setMarcacionBusquedaTemp(e.target.value)}
                          onBlur={() => guardarMarcacionBusqueda(prod)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") guardarMarcacionBusqueda(prod);
                            if (e.key === "Escape") cancelarEdicionMarcacionBusqueda();
                          }}
                          className={`w-20 h-8 text-xs font-bold text-center rounded-lg border border-blue-400 outline-none ${inputSinFlechas}`}
                        />
                      ) : marc !== null ? (
                        <span
                          onClick={(e) => iniciarEdicionMarcacionBusqueda(e, prod)}
                          title="Clic para editar la marcación solo para esta venta"
                          className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer hover:ring-1 hover:ring-blue-300 ${claseColorMarcacion(
                            marc
                          )}`}
                        >
                          {marc.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
                        </span>
                      ) : null}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={ocultandoArticuloId === prod.id}
                      onClick={(e) => handleOcultarArticulo(e, prod)}
                      title="Ocultar de ventas"
                      className="h-8 w-8 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg shrink-0"
                    >
                      {ocultandoArticuloId === prod.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
