// app/actions/preparacion-pedidos.ts
// Auditoría de preparación para Pedidos de Venta (Venta tipoVenta="PEDIDO").
// Replica el flujo de /admin/mercadolibre/preparacion pero a nivel de pedido completo:
// el operario sube una o varias fotos de evidencia, se notifica según reglas, y un
// auditor aprueba/rechaza. Las fotos viven en S3 bajo auditoria-pedidos/{ventaId}/.
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { triggerNotification } from "@/lib/notify"

const BUCKET_NAME = process.env.S3_BUCKET_NAME

// Link de la notificación "Pedido de venta preparado"; sirve para resolver/eliminar
// las notificaciones de un pedido en todos los usuarios al aprobar o rechazar.
const linkPedido = (ventaId: string) => `/admin/erp/pedidos-venta?audit=${ventaId}`

const EVENT_TYPE = "PEDIDO_VENTA_PREPARADO_FOTO"

// Lista las fotos de evidencia de un pedido desde S3 (URLs firmadas temporales).
export async function obtenerFotosPedido(ventaId: string) {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `auditoria-pedidos/${ventaId}/`,
        })

        const { Contents } = await s3Client.send(command)
        if (!Contents || Contents.length === 0) return { success: true, fotos: [] }

        // Ordenamos por fecha de carga para que la galería respete el orden de subida.
        const ordenados = Contents.sort(
            (a, b) => (a.LastModified?.getTime() || 0) - (b.LastModified?.getTime() || 0)
        )

        const fotos = await Promise.all(ordenados.map(async (file) => {
            const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key })
            const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 })
            return {
                id: file.Key,
                name: file.Key?.split('/').pop() || 'Foto',
                url: signedUrl,
                link: signedUrl,
            }
        }))
        return { success: true, fotos }
    } catch (error: any) {
        console.error("Error al obtener fotos del pedido en S3:", error)
        return { success: false, fotos: [] }
    }
}

/**
 * Dado un lote de IDs de venta, devuelve el estado de auditoría de cada uno que tenga
 * registro (FOTO_CARGADA | AUDITADO | RECHAZADO). Se usa para habilitar el botón
 * "Ver foto" en el listado de pedidos y en el histórico de ventas.
 */
export async function obtenerPedidosConFoto(ventaIds: string[]) {
    try {
        const ids = Array.from(new Set(ventaIds.filter(Boolean)))
        if (ids.length === 0) return { success: true, estados: {} as Record<string, string> }

        const registros = await prisma.pedidoVentaAudit.findMany({
            where: { ventaId: { in: ids } },
            select: { ventaId: true, status: true },
        })

        const estados: Record<string, string> = {}
        for (const r of registros) estados[r.ventaId] = r.status

        return { success: true, estados }
    } catch (error: any) {
        console.error("Error al verificar pedidos con foto:", error)
        return { success: false, estados: {} as Record<string, string> }
    }
}

// Lista los pedidos de venta del rango con su estado de auditoría adjunto.
// Alimenta las pestañas "Preparación" y "Auditoría".
export async function obtenerPedidosParaPreparar(fechaDesde: string, fechaHasta: string) {
    try {
        const inicioRango = new Date(`${fechaDesde}T00:00:00-03:00`)
        const finRango = new Date(`${fechaHasta}T23:59:59.999-03:00`)

        const ventas = await prisma.venta.findMany({
            where: {
                tipoVenta: "PEDIDO",
                createdAt: { gte: inicioRango, lte: finRango },
            },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        })

        const ids = ventas.map(v => v.id)
        const audits = await prisma.pedidoVentaAudit.findMany({
            where: { ventaId: { in: ids } },
        })
        const auditMap = new Map(audits.map(a => [a.ventaId, a]))

        return ventas.map(v => {
            const audit = auditMap.get(v.id)
            return {
                id: v.id,
                numeroVenta: v.numeroVenta,
                cliente: v.cliente,
                vendedor: v.vendedor,
                totalFinal: Number(v.totalFinal),
                createdAt: v.createdAt.toISOString(),
                estadoPedido: v.estadoPedido,
                tipoEnvio: v.tipoEnvio,
                info: v.info,
                items: v.items.map(i => ({
                    id: i.id,
                    productoId: i.productoId || null,
                    nombre: i.nombre,
                    cantidad: i.cantidad,
                })),
                auditStatus: audit?.status || null,
                auditUploader: audit?.uploader || null,
                auditAuditor: audit?.auditor || null,
            }
        })
    } catch (error) {
        console.error("Error al obtener pedidos para preparar:", error)
        return []
    }
}

// Sube una foto de evidencia y deja el pedido en estado FOTO_CARGADA, disparando
// la notificación de "pedido preparado" según las reglas configuradas.
export async function subirFotoPedido(formData: FormData) {
    const file = formData.get('photo') as File
    const ventaId = formData.get('ventaId') as string

    // Identificamos (de forma blanda) quién carga la foto, sin bloquear la subida.
    const session = await getServerSession(authOptions).catch(() => null)
    const username = session?.user?.name as string | undefined
    const userId = (session?.user as any)?.id as string | undefined

    try {
        if (!file || !ventaId) {
            throw new Error("Faltan datos obligatorios para la subida.")
        }

        // 1. Subir el archivo a S3
        const buffer = Buffer.from(await file.arrayBuffer())
        const fileName = `auditoria-pedidos/${ventaId}/${Date.now()}.jpg`

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        }))

        // 2. Registrar/actualizar la auditoría del pedido.
        // Notificamos solo en la primera carga (cuando pasa de "sin registro" a FOTO_CARGADA),
        // o cuando estaba RECHAZADO y se vuelve a cargar evidencia.
        const previo = await prisma.pedidoVentaAudit.findUnique({ where: { ventaId } })
        const debeNotificar = !previo || previo.status === "RECHAZADO"

        await prisma.pedidoVentaAudit.upsert({
            where: { ventaId },
            update: { status: "FOTO_CARGADA", uploader: username || previo?.uploader, reason: null },
            create: { ventaId, status: "FOTO_CARGADA", uploader: username },
        })

        const venta = await prisma.venta.findUnique({
            where: { id: ventaId },
            select: { numeroVenta: true, cliente: true },
        })

        revalidatePath('/admin/erp/pedidos-venta')

        // 3. Notificación según reglas (solo en la transición relevante).
        if (debeNotificar) {
            const ref = venta?.numeroVenta ? `#${venta.numeroVenta}` : ventaId.slice(0, 8)
            const cuerpo = `${username ? `${username} cargó` : "Se cargó"} la foto del pedido ${ref}${venta?.cliente ? ` — ${venta.cliente}` : ""}`

            await triggerNotification({
                eventType: EVENT_TYPE,
                sourceUserId: userId,
                title: `Pedido de venta preparado — ${ref}`,
                body: cuerpo,
                link: linkPedido(ventaId),
            })
        }

        return { success: true, path: fileName }
    } catch (error: any) {
        console.error("[AUDITORIA PEDIDO ERROR]", error)
        return { success: false, error: error.message || "Error al procesar la subida" }
    }
}

export async function aprobarFotoPedido(ventaId: string) {
    try {
        const session = await getServerSession(authOptions).catch(() => null)
        const auditor = session?.user?.name as string | undefined

        await prisma.pedidoVentaAudit.update({
            where: { ventaId },
            data: { status: "AUDITADO", auditor },
        })

        // La acción resuelve la alerta: la eliminamos en todos los usuarios.
        await prisma.notification.deleteMany({ where: { link: linkPedido(ventaId), eventType: EVENT_TYPE } })
        revalidatePath('/admin/erp/pedidos-venta')
        return { success: true }
    } catch (error: any) {
        console.error("Error al aprobar pedido:", error)
        return { success: false, error: error.message }
    }
}

export async function eliminarFotoPedido(ventaId: string, fotoKey: string) {
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fotoKey }))

        // Si ya no quedan fotos, borramos el registro de auditoría y las notificaciones.
        const { Contents } = await s3Client.send(new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `auditoria-pedidos/${ventaId}/`,
        }))

        if (!Contents || Contents.length === 0) {
            await prisma.pedidoVentaAudit.deleteMany({ where: { ventaId } })
            await prisma.notification.deleteMany({ where: { link: linkPedido(ventaId), eventType: EVENT_TYPE } })
        }

        revalidatePath('/admin/erp/pedidos-venta')
        return { success: true }
    } catch (error: any) {
        console.error("Error al eliminar foto del pedido:", error)
        return { success: false, error: error.message }
    }
}

export async function rechazarFotoPedido(ventaId: string, motivo?: string) {
    try {
        const session = await getServerSession(authOptions).catch(() => null)
        const auditor = session?.user?.name as string | undefined

        await prisma.pedidoVentaAudit.update({
            where: { ventaId },
            data: { status: "RECHAZADO", auditor, reason: motivo || null },
        })

        // La acción resuelve la alerta: la eliminamos en todos los usuarios.
        await prisma.notification.deleteMany({ where: { link: linkPedido(ventaId), eventType: EVENT_TYPE } })
        revalidatePath('/admin/erp/pedidos-venta')
        return { success: true }
    } catch (error: any) {
        console.error("Error al rechazar pedido:", error)
        return { success: false, error: error.message }
    }
}
