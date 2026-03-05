"use server"

// 👇 AQUÍ ESTÁ EL CAMBIO: agregamos las llaves { } alrededor de prisma
import { prisma } from "@/lib/prisma"

export async function getVentasWeb() {
    try {
        const ventas = await prisma.webSale.findMany({
            include: {
                items: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return ventas;
    } catch (error) {
        console.error("Error fetching ventas web:", error);
        return [];
    }
}

export async function updateVentaWebStatus(id: string, paymentId: string, status: string) {
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

export async function updateVentaWebCliente(id: string, clienteData: any) {
    try {
        await prisma.webSale.update({
            where: { id },
            data: {
                nombre: clienteData.nombre,
                dni: clienteData.dni,
                domicilio: clienteData.domicilio,
                ciudad: clienteData.ciudad,
                provincia: clienteData.provincia,
                cp: clienteData.cp,
                telefono: clienteData.telefono,
                email: clienteData.email,
                referencias: clienteData.referencias
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating cliente:", error);
        return { success: false };
    }
}
