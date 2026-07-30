"use server"

import { prisma } from "@/lib/prisma"
import { consultarPadron } from "./afip"
import { triggerNotification } from "@/lib/notify"
import { ajustarStockPorVentaOCompraTx } from "@/lib/packs-stock"

// Checkout público de /mayoristas: identifica al cliente por DNI/CUIT contra
// la tabla de Proveedores (que además de proveedores guarda a los clientes
// mayoristas, distinguidos por esMayorista) y, si no está, contra el padrón
// A13/A5 de ARCA (mismo mecanismo que /admin/listas/proveedores).
export async function buscarClienteMayoristaPorDni(dni: string) {
    const digitos = dni.replace(/\D/g, "")
    if (digitos.length < 7) {
        return { encontrado: false, cuit: digitos }
    }

    try {
        const porDniCrudo = await prisma.proveedor.findFirst({
            where: { cuit: digitos },
            select: { razonSocial: true, cuit: true },
        })
        if (porDniCrudo) {
            return { encontrado: true, nombre: porDniCrudo.razonSocial, cuit: porDniCrudo.cuit! }
        }

        const padron = await consultarPadron(digitos)
        if (padron.success && padron.cuit) {
            // El DNI puede haber estado cargado ya con el CUIT completo (11 dígitos)
            // en vez del DNI crudo (8 dígitos): re-chequeamos antes de asumir que es nuevo.
            const porCuitResuelto = await prisma.proveedor.findFirst({
                where: { cuit: padron.cuit },
                select: { razonSocial: true, cuit: true },
            })
            if (porCuitResuelto) {
                return { encontrado: true, nombre: porCuitResuelto.razonSocial, cuit: porCuitResuelto.cuit! }
            }
            return { encontrado: true, nombre: padron.nombre || "", cuit: padron.cuit }
        }

        return { encontrado: false, cuit: digitos }
    } catch (error) {
        console.error("[buscarClienteMayoristaPorDni] Error:", error)
        return { encontrado: false, cuit: digitos }
    }
}

export async function crearPedidoMayoristaWeb(data: {
    cuit: string
    nombre: string
    items: { articuloMayoristaId: string; cantidad: number }[]
}) {
    const cuit = data.cuit.replace(/\D/g, "")
    const nombre = data.nombre.trim()

    if (!cuit || cuit.length < 7) {
        return { success: false, error: "DNI inválido" }
    }
    if (!nombre) {
        return { success: false, error: "Falta el nombre del cliente" }
    }
    const itemsPedidos = (data.items || []).filter(i => i.cantidad > 0)
    if (itemsPedidos.length === 0) {
        return { success: false, error: "El carrito está vacío" }
    }

    try {
        const articulos = await prisma.articuloMayorista.findMany({
            where: { id: { in: itemsPedidos.map(i => i.articuloMayoristaId) }, activo: true },
            select: { id: true, nombre: true, titulo: true, precio: true, articuloMostradorId: true },
        })
        const porId = new Map(articulos.map(a => [a.id, a]))

        const itemsVenta = itemsPedidos
            .map(i => {
                const art = porId.get(i.articuloMayoristaId)
                if (!art) return null
                const precioUnit = Number(art.precio)
                return {
                    productoId: art.articuloMostradorId,
                    nombre: art.titulo || art.nombre,
                    cantidad: i.cantidad,
                    precio_unit: precioUnit,
                    subtotal: precioUnit * i.cantidad,
                }
            })
            .filter((i): i is NonNullable<typeof i> => i !== null)

        if (itemsVenta.length === 0) {
            return { success: false, error: "Los artículos del pedido ya no están disponibles" }
        }

        const totalFinal = itemsVenta.reduce((sum, i) => sum + i.subtotal, 0)

        const result = await prisma.$transaction(async (tx) => {
            const existente = await tx.proveedor.findFirst({ where: { cuit } })

            const sujeto = existente
                ? await tx.proveedor.update({ where: { id: existente.id }, data: { esMayorista: true } })
                : await tx.proveedor.create({ data: { razonSocial: nombre, cuit, esMayorista: true } })

            const venta = await tx.venta.create({
                data: {
                    cliente: nombre,
                    vendedor: "Mayorista Web",
                    total: totalFinal,
                    totalFinal,
                    tipoVenta: "PEDIDO",
                    metodo_pago: "A Confirmar",
                    dni: cuit,
                    docNro: cuit,
                    sujetoId: sujeto.id,
                    items: { create: itemsVenta },
                },
            })

            await ajustarStockPorVentaOCompraTx(
                tx,
                itemsVenta
                    .filter(i => i.productoId)
                    .map(i => ({ articuloId: i.productoId as string, cantidad: i.cantidad, nombreHint: i.nombre })),
                "decrement",
            )

            return venta
        }, { timeout: 20000 })

        triggerNotification({
            eventType: "PEDIDO_MAYORISTA_WEB",
            title: `Nuevo pedido mayorista web #${result.numeroVenta}`,
            body: `${nombre} — ${itemsVenta.length} artículo(s) — $${totalFinal.toLocaleString("es-AR")}`,
            link: "/admin/ventas-mostrador",
        })

        return { success: true, numeroVenta: result.numeroVenta }
    } catch (error) {
        console.error("[crearPedidoMayoristaWeb] Error:", error)
        return { success: false, error: "No se pudo generar el pedido" }
    }
}
