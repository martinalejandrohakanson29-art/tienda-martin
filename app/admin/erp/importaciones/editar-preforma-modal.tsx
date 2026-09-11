"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Edit3, Loader2, DollarSign, Building2, Calendar, FileDigit } from "lucide-react"
import { PreformaView } from "./importaciones-client"
import { ActualizarPreformaInput } from "@/app/actions/preformas"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  preforma: PreformaView | null
  onGuardar: (data: ActualizarPreformaInput) => Promise<void>
}

export function EditarPreformaModal({
  open,
  onOpenChange,
  preforma,
  onGuardar,
}: Props) {
  const [numeroFactura, setNumeroFactura] = useState("")
  const [proveedor, setProveedor] = useState("")
  const [fechaEmision, setFechaEmision] = useState("")
  const [totalFob, setTotalFob] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [estado, setEstado] = useState<"EN_CURSO" | "FINALIZADO">("EN_CURSO")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (open && preforma) {
      setNumeroFactura(preforma.numeroFactura || "")
      setProveedor(preforma.proveedor || "")
      setFechaEmision(
        preforma.fechaEmision ? preforma.fechaEmision.split("T")[0] : ""
      )
      setTotalFob(preforma.totalFob ? String(preforma.totalFob) : "")
      setObservaciones((preforma as any).observaciones || "")
      setEstado(preforma.estado === "FINALIZADO" ? "FINALIZADO" : "EN_CURSO")
    }
  }, [open, preforma])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preforma) return

    setGuardando(true)
    try {
      const fobNum = parseFloat(totalFob)
      await onGuardar({
        numeroFactura: numeroFactura.trim() || null,
        proveedor: proveedor.trim() || null,
        fechaEmision: fechaEmision ? new Date(fechaEmision) : null,
        totalFob: !isNaN(fobNum) && fobNum > 0 ? fobNum : null,
        observaciones: observaciones.trim() || null,
        estado,
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  if (!preforma) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Editar Preforma #{preforma.numero}
              </DialogTitle>
              <p className="text-xs text-slate-400 truncate max-w-sm">
                {preforma.nombreArchivo}
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <FileDigit className="w-3.5 h-3.5 text-slate-400" />
                  N° Factura / Invoice
                </Label>
                <Input
                  value={numeroFactura}
                  onChange={(e) => setNumeroFactura(e.target.value)}
                  placeholder="Ej: PI-2024-001"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Fecha de Emisión
                </Label>
                <Input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Proveedor / Vendedor
              </Label>
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Ej: Guangzhou Longsheng Imp & Exp Co."
                className="rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  Total FOB (USD)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalFob}
                  onChange={(e) => setTotalFob(e.target.value)}
                  placeholder="0.00"
                  className="rounded-xl text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Estado
                </Label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="EN_CURSO">⏳ En curso</option>
                  <option value="FINALIZADO">✅ Finalizado</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Observaciones / Notas
              </Label>
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas internas del pedido, contenedor, pagos anticipados..."
                className="rounded-xl text-xs resize-none"
              />
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
                "Guardar Cambios"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
