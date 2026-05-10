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
}
