"use server"

import { prisma } from "@/lib/prisma"
import { consultarPadron } from "./afip"
import { triggerNotification } from "@/lib/notify"
import { ajustarStockPorVentaOCompraTx } from "@/lib/packs-stock"

// El CUIT de Proveedores se cargó históricamente con formatos distintos (con guiones,
// con prefijo "RI:"/"MON:", o crudo), así que nunca hay que buscarlo con igualdad exacta
// de string: siempre se compara solo los dígitos, o se duplica el proveedor y se rompe
// su cuenta corriente (saldos y movimientos quedan repartidos en dos registros).
async function buscarProveedorPorDigitosCuit(
    client: Pick<typeof prisma, "proveedor">,
    digitos: string,
) {
    const candidatos = await client.proveedor.findMany({
        where: { cuit: { not: null } },
        select: { id: true, razonSocial: true, cuit: true },
    })
    return candidatos.find(c => (c.cuit || "").replace(/\D/g, "") === digitos) ?? null
}

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
        const porDniCrudo = await buscarProveedorPorDigitosCuit(prisma, digitos)
        if (porDniCrudo) {
            return { encontrado: true, nombre: porDniCrudo.razonSocial, cuit: porDniCrudo.cuit! }
        }

        const padron = await consultarPadron(digitos)
        if (padron.success && padron.cuit) {
            // El DNI puede haber estado cargado ya con el CUIT completo (11 dígitos)
            // en vez del DNI crudo (8 dígitos): re-chequeamos antes de asumir que es nuevo.
            const porCuitResuelto = await buscarProveedorPorDigitosCuit(prisma, padron.cuit.replace(/\D/g, ""))
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

const TIPOS_ENVIO_VALIDOS = ["andreani", "via cargo", "retiran aca"]

export async function crearPedidoMayoristaWeb(data: {
    cuit: string
    nombre: string
    telefono: string
    tipoEnvio: string
    observaciones?: string
    items: { articuloMayoristaId: string; cantidad: number }[]
}) {
    const cuit = data.cuit.replace(/\D/g, "")
    const nombre = data.nombre.trim()
    const telefono = data.telefono.trim()
    const tipoEnvio = TIPOS_ENVIO_VALIDOS.includes(data.tipoEnvio) ? data.tipoEnvio : "andreani"
    const observaciones = (data.observaciones || "").trim()

    if (!cuit || cuit.length < 7) {
        return { success: false, error: "DNI inválido" }
    }
    if (!nombre) {
        return { success: false, error: "Falta el nombre del cliente" }
    }
    if (!telefono) {
        return { success: false, error: "Falta el WhatsApp del cliente" }
    }
    const itemsPedidos = (data.items || []).filter(i => i.cantidad > 0)
    if (itemsPedidos.length === 0) {
        return { success: false, error: "El carrito está vacío" }
    }

    try {
        const articulos = await prisma.articuloMayorista.findMany({
            where: { id: { in: itemsPedidos.map(i => i.articuloMayoristaId) }, activo: true },
            select: {
                id: true,
                nombre: true,
                titulo: true,
                precio: true,
                articuloMostradorId: true,
                variante: true,
                articuloMostrador: { select: { nombre: true } },
            },
        })
        const porId = new Map(articulos.map(a => [a.id, a]))

        const itemsVenta = itemsPedidos
            .map(i => {
                const art = porId.get(i.articuloMayoristaId)
                if (!art) return null
                const precioUnit = Number(art.precio)
                // El pedido se guarda con el nombre real de Artículos Mostrador (no el
                // nombre comercial del catálogo mayorista) para que coincida con lo que
                // se ve en /admin/ventas-mostrador y /admin/listas/articulos-mostrador.
                const nombreBase = art.articuloMostrador?.nombre || art.titulo || art.nombre
                return {
                    productoId: art.articuloMostradorId,
                    // Cuando el artículo tiene variantes (ej. medidas), la venta guarda cuál
                    // se pidió: si no, dos medidas del mismo artículo generan líneas idénticas.
                    nombre: art.variante ? `${nombreBase} (${art.variante})` : nombreBase,
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
            const existente = await buscarProveedorPorDigitosCuit(tx, cuit)

            const sujeto = existente
                ? await tx.proveedor.update({ where: { id: existente.id }, data: { esMayorista: true, telefono } })
                : await tx.proveedor.create({ data: { razonSocial: nombre, cuit, esMayorista: true, telefono } })

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
                    telefono,
                    tipoEnvio,
                    info: observaciones || null,
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
