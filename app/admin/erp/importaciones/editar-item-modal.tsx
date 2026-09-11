"use client"

import React, { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Edit2, ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { PreformaItemView } from "./importaciones-client"
import { ActualizarItemPreformaInput } from "@/app/actions/preformas"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PreformaItemView | null
  onGuardar: (data: ActualizarItemPreformaInput) => Promise<void>
  onEliminar?: () => Promise<void>
  onSubirFoto?: (file: File) => Promise<void>
}

export function EditarItemModal({
  open,
  onOpenChange,
  item,
  onGuardar,
  onEliminar,
  onSubirFoto,
}: Props) {
  const [supplierItemNo, setSupplierItemNo] = useState("")
  const [descripcionOriginal, setDescripcionOriginal] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [precioUnitarioUsd, setPrecioUnitarioUsd] = useState("")
  const [logo, setLogo] = useState("")
  const [size, setSize] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [previewFoto, setPreviewFoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && item) {
      setSupplierItemNo(item.supplierItemNo || "")
      setDescripcionOriginal(item.descripcionOriginal || "")
      setCantidad(String(item.cantidad || 0))
      setPrecioUnitarioUsd(item.precioUnitarioUsd ? String(item.precioUnitarioUsd) : "")
      setLogo(item.logo || "")
      setSize(item.size || "")
      setPreviewFoto(item.fotoUrl || null)
    }
  }, [open, item])

  const handleSeleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !onSubirFoto) return

    const previewLocal = URL.createObjectURL(file)
    setPreviewFoto(previewLocal)
    setSubiendoFoto(true)
    try {
      await onSubirFoto(file)
    } finally {
      URL.revokeObjectURL(previewLocal)
      setSubiendoFoto(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    setGuardando(true)
    try {
      const cantNum = parseInt(cantidad, 10)
      const pUnitNum = parseFloat(precioUnitarioUsd)

      await onGuardar({
        supplierItemNo: supplierItemNo.trim(),
        descripcionOriginal: descripcionOriginal.trim() || null,
        cantidad: !isNaN(cantNum) && cantNum > 0 ? cantNum : 1,
        precioUnitarioUsd: !isNaN(pUnitNum) && pUnitNum > 0 ? pUnitNum : null,
        logo: logo.trim() || null,
        size: size.trim() || null,
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async () => {
    if (!onEliminar || !confirm("¿Estás seguro de eliminar este ítem de la preforma?")) return
    setEliminando(true)
    try {
      await onEliminar()
      onOpenChange(false)
    } finally {
      setEliminando(false)
    }
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                  Editar Ítem de Preforma
                </DialogTitle>
                <p className="text-xs text-slate-400 font-mono">
                  {item.supplierItemNo}
                </p>
              </div>
            </div>

            {onEliminar && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={eliminando}
                onClick={handleEliminar}
                className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl"
                title="Eliminar este ítem"
              >
                {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            )}
          </div>

          <div className="p-6 space-y-4">
            {onSubirFoto && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Foto del artículo
                </Label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    {previewFoto ? (
                      <img src={previewFoto} alt="Foto del artículo" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSeleccionarFoto}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={subiendoFoto}
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold rounded-xl w-full"
                    >
                      {subiendoFoto ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Subiendo...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          {previewFoto ? "Reemplazar foto" : "Subir foto"}
                        </>
                      )}
                    </Button>
                    <p className="text-[10px] text-slate-400">
                      Corrige la foto si quedó mal vinculada al importar el Excel
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Supplier Item No. (Código Proveedor)
              </Label>
              <Input
                required
                value={supplierItemNo}
                onChange={(e) => setSupplierItemNo(e.target.value)}
                className="rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Detalle / Descripción
              </Label>
              <Input
                value={descripcionOriginal}
                onChange={(e) => setDescripcionOriginal(e.target.value)}
                placeholder="Descripción del producto según la factura"
                className="rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Cantidad
                </Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="rounded-xl text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Precio Unitario USD
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={precioUnitarioUsd}
                  onChange={(e) => setPrecioUnitarioUsd(e.target.value)}
                  placeholder="0.00"
                  className="rounded-xl text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Marca / Logo
                </Label>
                <Input
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="Ej: L&S, OEM..."
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Medida / Size
                </Label>
                <Input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="Ej: 54mm, STD..."
                  className="rounded-xl text-xs"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={guardando}
              onClick={() => onOpenChange(false)}
              className="text-xs font-bold text-slate-500"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={guardando}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl px-4"
            >
              {guardando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
