"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { z } from "zod"
import { revertirMovimientoEnLedger } from "@/lib/proveedor-ledger"

const registrarMovimientoSchema = z.object({
  proveedorId: z.string().min(1, "Se requiere el proveedor"),
  emisorProveedorId: z.string().optional(),
  monto: z.number().positive("El monto debe ser mayor a 0"),
  tipo: z.enum(["PAGO", "COBRO"]),
  metodoPago: z.string().min(1, "Se requiere el método de pago"),
  deQuien: z.string().min(1, "Se requiere indicar el emisor"),
  aQuien: z.string().min(1, "Se requiere indicar el receptor"),
  descripcion: z.string().optional(),
  fechaPago: z.date().optional(),
})

// Usamos el tipo oficial de Prisma para el cliente de transacción
type TxClient = Prisma.TransactionClient

export async function registrarMovimientoManualProveedor(data: {
  proveedorId: string
  emisorProveedorId?: string
  monto: number
  tipo: "PAGO" | "COBRO"
  metodoPago: string
  deQuien: string
  aQuien: string
  descripcion?: string
  fechaPago?: Date
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  const validated = registrarMovimientoSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message }
  }

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

      // PAGO (+) suma saldo del proveedor, COBRO (-) resta saldo del proveedor
      const nuevoSaldoPrincipal = esPago
        ? proveedorPrincipal.total.plus(montoDecimal)
        : proveedorPrincipal.total.minus(montoDecimal)

      const updateDataPrincipal: any = { total: nuevoSaldoPrincipal }
      if (esPago && proveedorPrincipal.saldoParcial && proveedorPrincipal.saldoParcial.greaterThan(0)) {
        const nuevoSaldoParcial = proveedorPrincipal.saldoParcial.minus(montoDecimal)
        updateDataPrincipal.saldoParcial = nuevoSaldoParcial.greaterThan(0) ? nuevoSaldoParcial : new Prisma.Decimal(0)
      }

      await tx.proveedor.update({
        where: { id: proveedorPrincipal.id },
        data: updateDataPrincipal,
      })

      // Capturamos el movimiento creado para poder linkearlo si hay gemelo
      const movPrincipal = await tx.movimientoProveedor.create({
        data: {
          proveedorId: proveedorPrincipal.id,
          tipo: esPago ? "HABER" : "DEBE",
          monto: esPago ? montoDecimal : montoDecimal.negated(),
          descripcion: `${data.tipo}: ${data.deQuien} -> ${data.aQuien}. ${data.descripcion || ""}`,
          referencia: `MANUAL_${data.tipo}_${data.metodoPago}`,
          saldo: nuevoSaldoPrincipal,
          fechaPago: data.fechaPago,
        },
      })

      // 2. IMPACTO EN EL EMISOR (SI ES UN PROVEEDOR) + ENLACE GEMELO
      if (data.emisorProveedorId && data.emisorProveedorId !== data.proveedorId) {
        const proveedorEmisor = await tx.proveedor.findUnique({
          where: { id: data.emisorProveedorId },
        })

        if (proveedorEmisor) {
          // El impacto en el emisor es inverso al del principal
          const nuevoSaldoEmisor = esPago
            ? proveedorEmisor.total.minus(montoDecimal)
            : proveedorEmisor.total.plus(montoDecimal)

          const updateDataEmisor: any = { total: nuevoSaldoEmisor }
          if (!esPago && proveedorEmisor.saldoParcial && proveedorEmisor.saldoParcial.greaterThan(0)) {
            const nuevoSaldoParcialEmisor = proveedorEmisor.saldoParcial.minus(montoDecimal)
            updateDataEmisor.saldoParcial = nuevoSaldoParcialEmisor.greaterThan(0) ? nuevoSaldoParcialEmisor : new Prisma.Decimal(0)
          }

          await tx.proveedor.update({
            where: { id: proveedorEmisor.id },
            data: updateDataEmisor,
          })

          const movGemelo = await tx.movimientoProveedor.create({
            data: {
              proveedorId: proveedorEmisor.id,
              tipo: esPago ? "DEBE" : "HABER",
              monto: esPago ? montoDecimal.negated() : montoDecimal,
              descripcion: `TRANSFERENCIA ${esPago ? "EGRESO" : "INGRESO"}: ${data.deQuien} -> ${data.aQuien}. ${data.descripcion || ""}`,
              referencia: `MANUAL_XFER_${data.tipo}_${data.metodoPago}`,
              saldo: nuevoSaldoEmisor,
              fechaPago: data.fechaPago,
            },
          })

          // Enlace bidireccional: permite anulación directa sin heurística de tiempo
          await tx.movimientoProveedor.update({
            where: { id: movPrincipal.id },
            data: { gemeloCId: movGemelo.id },
          })
          await tx.movimientoProveedor.update({
            where: { id: movGemelo.id },
            data: { gemeloCId: movPrincipal.id },
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

export async function anularMovimientoProveedor(movimientoId: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Cargar el movimiento con su proveedor
      const movimiento = await tx.movimientoProveedor.findUnique({
        where: { id: movimientoId },
      })

      if (!movimiento) throw new Error("Movimiento no encontrado")
      if (movimiento.anulado) throw new Error("El movimiento ya está anulado")

      // 2. Marcar el movimiento principal como anulado
      await tx.movimientoProveedor.update({
        where: { id: movimientoId },
        data: { anulado: true },
      })

      // 3. Anular gemelo via ID directo (O(1), sin ventana de tiempo ni regex)
      if (movimiento.gemeloCId) {
        const gemelo = await tx.movimientoProveedor.findUnique({
          where: { id: movimiento.gemeloCId },
        })

        if (gemelo && !gemelo.anulado) {
          await tx.movimientoProveedor.update({
            where: { id: gemelo.id },
            data: { anulado: true },
          })

          // Revertir el impacto del gemelo en el ledger del emisor (incremental, preserva saldo base)
          await revertirMovimientoEnLedger(tx, gemelo.id)
        }
      }

      // 4. Revertir el impacto del movimiento principal en el ledger del receptor
      await revertirMovimientoEnLedger(tx, movimientoId)
    })

    revalidatePath("/admin/erp/movimientos")
    revalidatePath("/admin/erp/cuenta-corriente")

    return { success: true, error: null }
  } catch (error: any) {
    console.error("Error al anular movimiento:", error)
    return { success: false, error: error.message || "Error al anular el movimiento" }
  }
}
