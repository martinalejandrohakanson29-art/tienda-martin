"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { Search, Plus, Package, Loader2, ArrowUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buscarArticulosParaCompra } from "@/app/actions/compras";

export interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  costo?: number;
  margenGanancia?: number;
}

interface ModalBuscarArticuloProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectArticulo: (articulo: Articulo) => void;
  onCrearNuevoArticulo: () => void;
  articulosIniciales?: Articulo[];
}

export function ModalBuscarArticulo({
  isOpen,
  onOpenChange,
  onSelectArticulo,
  onCrearNuevoArticulo,
  articulosIniciales = [],
}: ModalBuscarArticuloProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<Articulo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Inicializar o buscar al abrir
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSelectedIndex(0);
      setResults(articulosIniciales.slice(0, 15));
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, articulosIniciales]);

  // Debounce search
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const term = searchTerm.trim();
      if (!term) {
        setResults(articulosIniciales.slice(0, 15));
        setSelectedIndex(0);
        return;
      }

      startTransition(async () => {
        const res = await buscarArticulosParaCompra(term, 25);
        if (res.success && res.data) {
          setResults(res.data);
          setSelectedIndex(0);
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, articulosIniciales]);

  // Manejo de navegación con teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
      scrollSelectedIntoView((selectedIndex + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      scrollSelectedIntoView((selectedIndex - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const scrollSelectedIntoView = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[index] as HTMLElement;
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const handleSelect = (art: Articulo) => {
    onSelectArticulo(art);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl">
        <div className="p-6 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-white">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Search className="h-5 w-5" />
                </div>
                <span>Buscador de Artículos</span>
              </div>
              <span className="text-xs text-slate-400 font-mono font-normal">
                Usa <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↑</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↓</kbd> y <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Enter</kbd>
              </span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Busca por código, SKU o nombre del producto para agregarlo a la compra.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe para buscar... (ej: 'Cubierta 110', 'Batería', 'ART-001')"
              className="flex h-12 w-full rounded-2xl border border-slate-700 bg-slate-800/90 px-12 text-base text-white placeholder:text-slate-500 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
            {isPending && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-400 animate-spin" />
            )}
          </div>
        </div>

        <div
          ref={listRef}
          className="max-h-[380px] min-h-[220px] overflow-y-auto p-3 space-y-1.5 bg-slate-50/50"
        >
          {results.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No se encontraron artículos</p>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                No hay coincidencias para "{searchTerm}"
              </p>
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onCrearNuevoArticulo();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl shadow"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Crear nuevo artículo
              </Button>
            </div>
          ) : (
            results.map((prod, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleSelect(prod)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all border text-left ${
                    isSelected
                      ? "bg-white border-emerald-500 shadow-md ring-1 ring-emerald-500/30 scale-[1.005]"
                      : "bg-white border-slate-200/70 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col gap-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {prod.nombre}
                      </span>
                      {prod.esPack && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                          Pack
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-[10px] text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                        {prod.id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          prod.stock > 5
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : prod.stock > 0
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        Stock: {prod.stock}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end flex-col gap-0.5 shrink-0">
                    <div className="text-xs font-semibold text-slate-500">
                      Costo: <span className="font-bold text-slate-800">${Number(prod.costo || 0).toLocaleString("es-AR")}</span>
                    </div>
                    <div className="text-sm font-black text-emerald-600">
                      PVP: ${Number(prod.precio || 0).toLocaleString("es-AR")}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onCrearNuevoArticulo();
            }}
            className="text-emerald-700 hover:bg-emerald-50 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Dar de alta nuevo artículo
          </Button>
          <span>
            Mostrando {results.length} resultado{results.length === 1 ? "" : "s"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
