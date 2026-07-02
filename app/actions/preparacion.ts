// app/actions/preparacion.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { triggerNotification } from "@/lib/notify"

const BUCKET_NAME = process.env.S3_BUCKET_NAME

// Link usado en la notificación "Pedido preparado"; sirve para resolver/eliminar
// las notificaciones de un envío en todos los usuarios cuando se aprueba o rechaza.
const linkEnvio = (envioId: string) => `/admin/mercadolibre/preparacion?envio=${envioId}`

export async function obtenerFotosEnvio(envioId: string) {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `auditoria/${envioId}/`,
        });

        const { Contents } = await s3Client.send(command);
        if (!Contents || Contents.length === 0) return { success: true, fotos: [] };

        const fotos = await Promise.all(Contents.map(async (file) => {
            const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.Key });
            const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
            return {
                id: file.Key,
                name: file.Key?.split('/').pop() || 'Foto',
                url: signedUrl, 
                link: signedUrl
            };
        }));
        return { success: true, fotos };
    } catch (error: any) {
        console.error("Error al obtener fotos de S3:", error);
        return { success: false, fotos: [] };
    }
}

/**
 * Dado un lote de IDs de envío, devuelve cuáles tienen al menos una foto
 * de auditoría cargada (existe un registro en ShipmentAudit).
 * Se usa para habilitar/deshabilitar el botón "Ver foto" en el listado de ventas.
 */
export async function obtenerEnviosConFoto(envioIds: string[]) {
    try {
        const ids = Array.from(new Set(envioIds.filter(Boolean)));
        if (ids.length === 0) return { success: true, envioIds: [] as string[] };

        const registros = await prisma.shipmentAudit.findMany({
            where: { envioId: { in: ids } },
            select: { envioId: true },
            distinct: ['envioId'],
        });

        return { success: true, envioIds: registros.map((r) => r.envioId) };
    } catch (error: any) {
        console.error("Error al verificar envíos con foto:", error);
        return { success: false, envioIds: [] as string[] };
    }
}

// Mensaje de conflicto cuando otro auditor ya resolvió el envío mientras esta
// pantalla estaba abierta (evita que dos personas aprueben/rechacen lo mismo).
const mensajeYaAuditadoEnvio = (status: string, auditor: string | null) =>
    `El envío ya no está pendiente de auditoría (estado: ${status}${auditor ? `, por ${auditor}` : ""}).`

export async function aprobarPedido(envioId: string) {
    try {
        const session = await getServerSession(authOptions).catch(() => null)
        const auditor = session?.user?.name as string | undefined

        // updateMany + where status="PREPARADO" actúa como lock optimista: si otro
        // auditor ya cambió el estado, count queda en 0 y no pisamos su resultado.
        const count = await prisma.$transaction(async (tx) => {
            const res = await tx.etiquetaML.updateMany({
                where: { id: envioId, status: "PREPARADO" },
                data: { status: "AUDITADO", auditor },
            })
            if (res.count > 0) {
                await tx.shipmentAudit.updateMany({ where: { envioId }, data: { status: "AUDITADO", auditor } })
            }
            return res.count
        })

        if (count === 0) {
            const actual = await prisma.etiquetaML.findUnique({ where: { id: envioId }, select: { status: true, auditor: true } })
            return {
                success: false,
                conflict: true,
                status: actual?.status ?? null,
                auditor: actual?.auditor ?? null,
                error: actual ? mensajeYaAuditadoEnvio(actual.status, actual.auditor) : "El envío ya no existe.",
            }
        }

        // La acción resuelve la alerta de preparación: la eliminamos en todos los usuarios.
        // Acotado al eventType para no afectar la alerta de auditoría (se resuelve en /tools/audit).
        await prisma.notification.deleteMany({ where: { link: linkEnvio(envioId), eventType: "PEDIDO_PREPARADO_FOTO" } })
        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, auditor }
    } catch (error: any) {
        console.error("Error al aprobar:", error)
        return { success: false, error: error.message }
    }
}

export async function rechazarPedido(envioId: string) {
    try {
        const session = await getServerSession(authOptions).catch(() => null)
        const auditor = session?.user?.name as string | undefined

        const count = await prisma.$transaction(async (tx) => {
            const res = await tx.etiquetaML.updateMany({
                where: { id: envioId, status: "PREPARADO" },
                data: { status: "PENDIENTE", auditor },
            })
            if (res.count > 0) {
                await tx.shipmentAudit.updateMany({ where: { envioId }, data: { status: "PENDIENTE", auditor } })
            }
            return res.count
        })

        if (count === 0) {
            const actual = await prisma.etiquetaML.findUnique({ where: { id: envioId }, select: { status: true, auditor: true } })
            return {
                success: false,
                conflict: true,
                status: actual?.status ?? null,
                auditor: actual?.auditor ?? null,
                error: actual ? mensajeYaAuditadoEnvio(actual.status, actual.auditor) : "El envío ya no existe.",
            }
        }

        // La acción resuelve la alerta de preparación: la eliminamos en todos los usuarios.
        // Acotado al eventType para no afectar la alerta de auditoría (se resuelve en /tools/audit).
        await prisma.notification.deleteMany({ where: { link: linkEnvio(envioId), eventType: "PEDIDO_PREPARADO_FOTO" } })
        revalidatePath('/admin/mercadolibre/preparacion')
        return { success: true, auditor }
    } catch (error: any) {
        console.error("Error al rechazar:", error)
        return { success: false, error: error.message }
    }
}

/** * ACCIÓN CORREGIDA: Usa itemId único para evitar colisiones en pedidos multi-item
 */
export async function subirFotoAuditoria(formData: FormData) {
    const file = formData.get('photo') as File
    const envioId = formData.get('envioId') as string
    const itemId = formData.get('itemId') as string // ID único del registro del ítem (EtiquetaMLItem)
    const mla = formData.get('mla') as string      // Mantenemos el MLA para el nombre del archivo

    console.log(`[AUDITORIA] Iniciando subida: Envio ${envioId}, Item ${itemId}, File: ${file?.name}`);

    // Identificamos (de forma blanda) quién carga la foto, sin bloquear la subida si falla.
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id as string | undefined;
    const username = session?.user?.name as string | undefined;

    try {
        if (!file || !envioId || !itemId || !mla) {
            console.error("[AUDITORIA] Faltan datos obligatorios en el FormData");
            throw new Error("Faltan datos obligatorios para la subida.");
        }

        // 1. Preparar el archivo para S3
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `auditoria/${envioId}/${mla}_${Date.now()}.jpg`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
        });

        await s3Client.send(command);

        // 2. Lógica de Base de Datos con Transacción
        // Capturamos si el pedido recién ahora alcanza el estado PREPARADO (para notificar una sola vez).
        let notificarPreparado = false;
        let envioInfo: { orderId: string | null; resumen: string | null } = { orderId: null, resumen: null };

        await prisma.$transaction(async (tx) => {
            // A. Registrar auditoría usando el itemId único del producto en la etiqueta
            // Esto evita que variaciones del mismo MLA colisionen
            await tx.shipmentAudit.upsert({
                where: { itemId_envioId: { itemId: itemId, envioId: envioId } },
                update: { status: "FOTO_CARGADA", createdAt: new Date() },
                create: { itemId: itemId, envioId: envioId, status: "FOTO_CARGADA" }
            });

            // B. Contar el progreso real del pedido
            const totalItems = await tx.etiquetaMLItem.count({ where: { etiquetaId: envioId } });
            const fotosCargadas = await tx.shipmentAudit.count({
                where: { envioId: envioId, status: "FOTO_CARGADA" }
            });

            console.log(`[DB] Progreso Pedido ${envioId}: ${fotosCargadas}/${totalItems}`);

            // C. Si todos los productos tienen su foto, marcar el pedido global como PREPARADO
            if (fotosCargadas >= totalItems) {
                // Leemos el estado previo para detectar la transición real (evita notificar
                // de nuevo al re-subir una foto de un pedido ya PREPARADO o AUDITADO).
                const etiquetaPrevia = await tx.etiquetaML.findUnique({
                    where: { id: envioId },
                    select: { status: true, orderId: true, resumen: true },
                });

                await tx.etiquetaML.update({
                    where: { id: envioId },
                    data: {
                        status: "PREPARADO",
                        drivePhotoUrl: fileName // Referencia a la última foto cargada
                    }
                });

                if (etiquetaPrevia && etiquetaPrevia.status !== "PREPARADO" && etiquetaPrevia.status !== "AUDITADO") {
                    notificarPreparado = true;
                    envioInfo = { orderId: etiquetaPrevia.orderId, resumen: etiquetaPrevia.resumen };
                }
            }
        });

        revalidatePath('/admin/mercadolibre/preparacion')

        // 3. Notificación (opción B): se dispara solo cuando el pedido queda completo.
        if (notificarPreparado) {
            const cuerpoPreparado = `${username ? `${username} cargó` : "Se cargaron"} las fotos del envío ${envioId}${envioInfo.resumen ? ` — ${envioInfo.resumen}` : ""}`;

            await triggerNotification({
                eventType: "PEDIDO_PREPARADO_FOTO",
                sourceUserId: userId,
                title: `Pedido preparado${envioInfo.orderId ? ` — Orden ${envioInfo.orderId}` : ""}`,
                body: cuerpoPreparado,
                link: linkEnvio(envioId),
            });

            // Evento aparte para quienes auditan en /admin/tools/audit. Se resuelve al
            // aprobar/rechazar ahí (ver auditItem), de forma independiente al evento anterior.
            await triggerNotification({
                eventType: "ENVIO_LISTO_AUDITORIA",
                sourceUserId: userId,
                title: `Envío listo para auditar${envioInfo.orderId ? ` — Orden ${envioInfo.orderId}` : ""}`,
                body: cuerpoPreparado,
                link: linkEnvio(envioId),
            });
        }

        return { success: true, path: fileName }

    } catch (error: any) {
        console.error("[AUDITORIA ERROR SERVIDOR]", error);
        return {
            success: false,
            error: error.message || "Error al procesar la subida"
        };
    }
}

export async function crearComentarioML(data: {
    codigo: string
    texto: string
}) {
    const session = await getServerSession(authOptions).catch(() => null)
    const username = (session?.user?.name as string) || "Desconocido"

    try {
        if (!data.codigo?.trim()) {
            return { success: false, error: "Ingresá el código de la venta" }
        }
        if (!data.texto?.trim()) {
            return { success: false, error: "El comentario no puede estar vacío" }
        }
        const codigo = data.codigo.trim()
        const comentario = await prisma.comentarioML.create({
            data: {
                orderId: codigo,
                packId: codigo,
                texto: data.texto.trim(),
                creadoPor: username,
            }
        })
        return { success: true, comentario }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getComentariosML() {
    try {
        const comentarios = await prisma.comentarioML.findMany({
            orderBy: { createdAt: "desc" }
        })
        return { success: true, comentarios }
    } catch (error: any) {
        return { success: false, comentarios: [] as any[] }
    }
}

export async function marcarComentarioMLLeido(id: string) {
    try {
        await prisma.comentarioML.update({ where: { id }, data: { leido: true } })
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
