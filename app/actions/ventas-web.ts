"use server"

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-guard"
import { z } from "zod"

const ClienteWebSchema = z.object({
    nombre:    z.string().optional(),
    dni:       z.string().optional(),
    domicilio: z.string().optional(),
    ciudad:    z.string().optional(),
    provincia: z.string().optional(),
    cp:        z.string().optional(),
    telefono:  z.string().optional(),
    email:     z.string().optional(),
    referencias: z.string().optional(),
})

export async function getVentasWeb(page: number = 1, pageSize: number = 100) {
    try {
        const [ventas, total] = await Promise.all([
            prisma.webSale.findMany({
                include: { items: true },
                orderBy: { createdAt: 'desc' },
                take: pageSize,
                skip: (page - 1) * pageSize,
            }),
            prisma.webSale.count(),
        ]);
        return { ventas, total, page, pageSize };
    } catch (error) {
        console.error("Error fetching ventas web:", error);
        return { ventas: [], total: 0, page, pageSize };
    }
}

export async function updateVentaWebStatus(id: string, paymentId: string, status: string) {
    await requireAdmin();
    try {
        await prisma.webSale.update({
            where: { id },
            data: { paymentId, status }
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating status:", error);
        return { success: false };
    }
}

export async function updateVentaWebCliente(id: string, rawData: unknown) {
    await requireAdmin();

    const parsed = ClienteWebSchema.safeParse(rawData);
    if (!parsed.success) {
        return { success: false, error: "Datos de cliente inválidos" };
    }

    try {
        await prisma.webSale.update({
            where: { id },
            data: parsed.data,
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating cliente:", error);
        return { success: false };
    }
}
