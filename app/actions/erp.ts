"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

export async function obtenerProveedores() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      orderBy: { razonSocial: "asc" },
    })
    return proveedores.map(p => ({
      ...p,
      total: Number(p.total),
      saldoAnterior: Number(p.saldoAnterior),
    }))
  } catch (error) {
    console.error("Error al obtener proveedores:", error)
    return []
  }
}

export async function registrarMovimientoManualProveedor(data: {
  proveedorId: string
  emisorProveedorId?: string
  monto: number
  tipo: "PAGO" | "COBRO"
  metodoPago: string
  deQuien: string
  aQuien: string
  descripcion?: string
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. IMPACTO EN EL PROVEEDOR PRINCIPAL (RECEPTOR/DESTINO)
      const proveedorPrincipal = await tx.proveedor.findUnique({
        where: { id: data.proveedorId },
      })

      if (!proveedorPrincipal) {
        throw new Error("Proveedor principal no encontrado")
      }

      const montoDecimal = new Prisma.Decimal(data.monto)
      const esPago = data.tipo === "PAGO"
      
      // Saldo principal: PAGO (+) suma saldo, COBRO (-) resta saldo
      const nuevoSaldoPrincipal = esPago 
        ? proveedorPrincipal.total.plus(montoDecimal) 
        : proveedorPrincipal.total.minus(montoDecimal)

      const tipoPrincipal = esPago ? "HABER" : "DEBE"
      const descPrincipal = `${data.tipo}: ${data.deQuien} -> ${data.aQuien}. ${data.descripcion || ""}`

      await tx.proveedor.update({
        where: { id: proveedorPrincipal.id },
        data: { total: nuevoSaldoPrincipal },
      })

      await tx.movimientoProveedor.create({
        data: {
          proveedorId: proveedorPrincipal.id,
          tipo: tipoPrincipal,
          monto: esPago ? montoDecimal : montoDecimal.negated(),
          descripcion: descPrincipal,
          referencia: `MANUAL_${data.tipo}_${data.metodoPago}`,
          saldo: nuevoSaldoPrincipal,
        },
      })

      // 2. IMPACTO EN EL EMISOR (SI ES UN PROVEEDOR)
      if (data.emisorProveedorId && data.emisorProveedorId !== data.proveedorId) {
        const proveedorEmisor = await tx.proveedor.findUnique({
          where: { id: data.emisorProveedorId },
        })

        if (proveedorEmisor) {
          // El impacto en el emisor es inverso al del principal
          // Si es PAGO (Principal +), el Emisor resta (-) -> aumenta deuda con él
          // Si es COBRO (Principal -), el Emisor suma (+) -> disminuye deuda con él
          const nuevoSaldoEmisor = esPago
            ? proveedorEmisor.total.minus(montoDecimal)
            : proveedorEmisor.total.plus(montoDecimal)

          const tipoEmisor = esPago ? "DEBE" : "HABER"
          const descEmisor = `TRANSFERENCIA ${esPago ? "EGRESO" : "INGRESO"}: ${data.deQuien} -> ${data.aQuien}. ${data.descripcion || ""}`

          await tx.proveedor.update({
            where: { id: proveedorEmisor.id },
            data: { total: nuevoSaldoEmisor },
          })

          await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedorEmisor.id,
              tipo: tipoEmisor,
              monto: esPago ? montoDecimal.negated() : montoDecimal,
              descripcion: descEmisor,
              referencia: `MANUAL_XFER_${data.tipo}`,
              saldo: nuevoSaldoEmisor,
            },
          })
        }
      }

      return { success: true }
    })

    revalidatePath("/admin/erp/movimientos")
    revalidatePath("/admin/erp/cuenta-corriente")
    
    return { success: true, data: result }
  } catch (error: any) {
    console.error("Error al registrar movimiento manual:", error)
    return { success: false, error: error.message || "Error al registrar el movimiento" }
  }
}
