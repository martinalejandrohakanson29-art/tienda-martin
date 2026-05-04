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
  fechaPago?: Date
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
          fechaPago: data.fechaPago,
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
              fechaPago: data.fechaPago,
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

export async function anularMovimientoProveedor(movimientoId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Obtener el movimiento
      const movimiento = await tx.movimientoProveedor.findUnique({
        where: { id: movimientoId },
        include: { proveedor: true },
      })

      if (!movimiento) {
        throw new Error("Movimiento no encontrado")
      }

      if (movimiento.anulado) {
        throw new Error("El movimiento ya está anulado")
      }

      // 2. Revertir impacto en el proveedor
      // Si el monto fue +100 (suma al saldo), restamos 100
      // Si el monto fue -100 (resta al saldo), sumamos 100
      const nuevoTotal = movimiento.proveedor.total.minus(movimiento.monto)

      await tx.proveedor.update({
        where: { id: movimiento.proveedorId },
        data: { total: nuevoTotal },
      })

      // 3. Marcar como anulado
      await tx.movimientoProveedor.update({
        where: { id: movimientoId },
        data: { anulado: true },
      })

      // 4. Intentar encontrar y anular el movimiento "gemelo" si es una transferencia
      // Esto es opcional y basado en heurística porque no están linkeados
      if (movimiento.referencia?.startsWith("MANUAL_")) {
        const isXfer = movimiento.referencia.includes("_XFER_")
        const searchRef = isXfer 
          ? movimiento.referencia.replace("_XFER_", "_") // Si es XFER, buscamos el principal
          : movimiento.referencia.replace("MANUAL_", "MANUAL_XFER_") // Si es principal, buscamos el XFER
        
        // Buscamos movimientos del mismo momento (mismo segundo aprox) con el mismo monto (negado o igual)
        // En registrarMovimientoManualProveedor, el monto del principal y emisor son opuestos si uno suma y otro resta
        // Pero en la DB se guardan como el cambio neto.
        // Principal PAGO: +Monto. Emisor XFER PAGO: -Monto.
        // Principal COBRO: -Monto. Emisor XFER COBRO: +Monto.
        // Así que siempre son opuestos.
        
        const gemelo = await tx.movimientoProveedor.findFirst({
          where: {
            referencia: { startsWith: searchRef.split('_').slice(0, 2).join('_') }, // Match parcial de referencia
            monto: movimiento.monto.negated(),
            createdAt: {
              gte: new Date(movimiento.createdAt.getTime() - 5000), // +/- 5 segundos
              lte: new Date(movimiento.createdAt.getTime() + 5000),
            },
            anulado: false,
            id: { not: movimientoId }
          },
          include: { proveedor: true }
        })

        if (gemelo) {
          // Revertir impacto en el gemelo
          const nuevoTotalGemelo = gemelo.proveedor.total.minus(gemelo.monto)
          await tx.proveedor.update({
            where: { id: gemelo.proveedorId },
            data: { total: nuevoTotalGemelo }
          })

          // Anular gemelo
          await tx.movimientoProveedor.update({
            where: { id: gemelo.id },
            data: { anulado: true }
          })
        }
      }

      return { success: true };
    });

    revalidatePath("/admin/erp/movimientos");
    revalidatePath("/admin/erp/cuenta-corriente");
    
    return { success: true, error: null };
  } catch (error: any) {
    console.error("Error al anular movimiento:", error);
    return { success: false, error: error.message || "Error al anular el movimiento" };
  }
}



