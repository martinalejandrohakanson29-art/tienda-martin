import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Recalcula el campo `saldo` de todos los movimientos activos de un proveedor
 * en orden cronológico. Debe llamarse tras anular cualquier movimiento para
 * mantener el ledger histórico consistente.
 */
export async function recalcularSaldosProveedor(tx: TxClient, proveedorId: string) {
    const movimientos = await tx.movimientoProveedor.findMany({
        where: { proveedorId, anulado: false },
        orderBy: { fecha: "asc" },
    })
    let saldo = new Prisma.Decimal(0)
    for (const mov of movimientos) {
        saldo = saldo.plus(mov.monto)
        await tx.movimientoProveedor.update({
            where: { id: mov.id },
            data: { saldo },
        })
    }

    // Sincronizar el total del proveedor con la suma de los movimientos válidos
    await tx.proveedor.update({
        where: { id: proveedorId },
        data: { total: saldo }
    })
}

/**
 * Recalcula el campo `saldo` de todos los movimientos activos de un proveedor
 * preservando el saldo base importado (que no está representado en movimientos).
 * Usar cuando cambia el ORDEN de movimientos (ej: cambio de fecha) pero
 * proveedor.total ya es correcto y no debe modificarse.
 */
export async function recalcularSaldosProveedorConBase(tx: TxClient, proveedorId: string) {
    const proveedor = await tx.proveedor.findUnique({ where: { id: proveedorId } })
    if (!proveedor) return

    const movimientos = await tx.movimientoProveedor.findMany({
        where: { proveedorId, anulado: false },
        orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    })

    // El saldo base = total actual del proveedor menos la suma de todos los movimientos activos.
    // Representa el balance inicial importado que no tiene movimientos que lo respalden.
    const sumaMovimientos = movimientos.reduce(
        (acc, m) => acc.plus(m.monto),
        new Prisma.Decimal(0)
    )
    const saldoBase = proveedor.total.minus(sumaMovimientos)

    let saldo = saldoBase
    for (const mov of movimientos) {
        saldo = saldo.plus(mov.monto)
        await tx.movimientoProveedor.update({
            where: { id: mov.id },
            data: { saldo },
        })
    }

    // total debería ser idéntico al valor actual, pero se actualiza por consistencia
    await tx.proveedor.update({
        where: { id: proveedorId },
        data: { total: saldo },
    })
}

/**
 * Revierte el impacto de un movimiento ya anulado sobre el ledger del proveedor.
 * A diferencia de recalcularSaldosProveedor, NO reconstruye desde cero:
 * resta exactamente el monto del movimiento anulado del total del proveedor,
 * preservando cualquier saldo base importado que no esté representado en movimientos.
 * Luego ajusta el campo saldo de los movimientos posteriores al anulado.
 */
export async function revertirMovimientoEnLedger(tx: TxClient, movimientoId: string) {
    const mov = await tx.movimientoProveedor.findUnique({ where: { id: movimientoId } })
    if (!mov) return

    const proveedor = await tx.proveedor.findUnique({ where: { id: mov.proveedorId } })
    if (!proveedor) return

    // Resta exactamente lo que este movimiento sumó — sin recalcular desde cero.
    // Esto preserva el saldo base importado (que no tiene movimientos que lo respalden).
    const updateData: any = {
        total: proveedor.total.minus(mov.monto)
    }
    if (mov.tipo === "HABER" && mov.monto.greaterThan(0) && proveedor.saldoParcial !== null && proveedor.saldoParcial !== undefined) {
        updateData.saldoParcial = proveedor.saldoParcial.plus(mov.monto)
    }

    await tx.proveedor.update({
        where: { id: mov.proveedorId },
        data: updateData,
    })

    // Ajusta el campo saldo de movimientos posteriores al anulado (quedaron desfasados en mov.monto).
    const posteriores = await tx.movimientoProveedor.findMany({
        where: {
            proveedorId: mov.proveedorId,
            anulado: false,
            OR: [
                { fecha: { gt: mov.fecha } },
                { AND: [{ fecha: mov.fecha }, { createdAt: { gt: mov.createdAt } }] },
            ],
        },
    })

    for (const p of posteriores) {
        await tx.movimientoProveedor.update({
            where: { id: p.id },
            data: { saldo: p.saldo.minus(mov.monto) },
        })
    }
}
