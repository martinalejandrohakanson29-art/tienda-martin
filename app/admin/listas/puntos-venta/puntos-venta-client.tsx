"use client"

import React, { useState } from "react"
import { Plus, Edit, Trash2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { crearPuntoVenta, actualizarPuntoVenta, eliminarPuntoVenta } from "@/app/actions/puntos-venta"

export default function PuntosVentaClient({ puntosIniciales }: { puntosIniciales: any[] }) {
  const [puntos, setPuntos] = useState(puntosIniciales)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [currentId, setCurrentId] = useState("")
  const [nombre, setNombre] = useState("")
  const [color, setColor] = useState("#000000")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  const openNewModal = () => {
    setIsEditMode(false)
    setNombre("")
    setColor("#3B82F6")
    setCurrentId("")
    setIsModalOpen(true)
  }

  const openEditModal = (p: any) => {
    setIsEditMode(true)
    setNombre(p.nombre)
    setColor(p.color || "#000000")
    setCurrentId(p.id)
    setIsModalOpen(true)
  }

  const mostrarMensajeExito = (mensaje: string) => {
    setSuccessMessage(mensaje)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
  }

  const handleSave = async () => {
    if (!nombre.trim()) return
    setIsSubmitting(true)
    if (isEditMode) {
      const res = await actualizarPuntoVenta(currentId, nombre.trim(), color)
      if (res.success) {
        setPuntos(prev => prev.map(p => p.id === currentId ? { ...p, nombre: nombre.trim(), color } : p))
        setIsModalOpen(false)
        mostrarMensajeExito("Actualizado correctamente")
      } else {
        alert(res.error)
      }
    } else {
      const res = await crearPuntoVenta(nombre.trim(), color)
      if (res.success) {
        setPuntos(prev => [...prev, res.data])
        setIsModalOpen(false)
        mostrarMensajeExito("Creado correctamente")
      } else {
        alert(res.error)
      }
    }
    setIsSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este punto de venta?")) return
    const res = await eliminarPuntoVenta(id)
    if (res.success) {
      setPuntos(prev => prev.filter(p => p.id !== id))
      mostrarMensajeExito("Eliminado correctamente")
    } else {
      alert(res.error)
    }
  }

  return (
    <div className="p-6 h-full flex flex-col relative">
      {showSuccess && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold">{successMessage}</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Listado de Puntos de Venta</h2>
        <Button onClick={openNewModal} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Plus className="h-4 w-4" /> Nuevo Punto de Venta
        </Button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow>
              <TableHead className="font-bold text-slate-700">Nombre</TableHead>
              <TableHead className="font-bold text-slate-700">Color</TableHead>
              <TableHead className="font-bold text-slate-700 w-[150px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {puntos.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: p.color || '#000000' }}></div>
                    <span className="text-xs text-slate-500 font-mono">{p.color || '#000000'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={() => openEditModal(p)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {puntos.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                  No hay puntos de venta registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-800">
              {isEditMode ? "Editar Punto de Venta" : "Nuevo Punto de Venta"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-sm font-bold text-slate-700 uppercase tracking-wide">Nombre</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej. Instagram, Mostrador..."
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color" className="text-sm font-bold text-slate-700 uppercase tracking-wide">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="color"
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer"
                />
                <Input
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="#000000"
                  className="bg-slate-50 border-slate-200 font-mono flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting || !nombre.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
