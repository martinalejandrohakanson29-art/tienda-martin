"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// Definimos el tipo de datos que vamos a recibir
export type ContactoInput = {
  razonSocial?: string;
  apellido?: string;
  nombre?: string;
  nombreFantasia?: string;
  telefono?: string;
  cuit?: string;
  email?: string;
}

export async function getContactos() {
  try {
    const contactos = await prisma.contacto.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return contactos;
  } catch (error) {
    console.error("Error obteniendo contactos:", error);
    return [];
  }
}

export async function createContacto(data: ContactoInput) {
  try {
    const nuevoContacto = await prisma.contacto.create({
      data: {
        razonSocial: data.razonSocial || null,
        apellido: data.apellido || null,
        nombre: data.nombre || null,
        nombreFantasia: data.nombreFantasia || null,
        telefono: data.telefono || null,
        cuit: data.cuit || null,
        email: data.email || null,
      }
    });
    revalidatePath("/admin/contactos");
    return { success: true, data: nuevoContacto };
  } catch (error) {
    console.error("Error creando contacto:", error);
    return { success: false, error: "No se pudo crear el contacto" };
  }
}

export async function updateContacto(id: string, data: ContactoInput) {
  try {
    const contactoActualizado = await prisma.contacto.update({
      where: { id },
      data: {
        razonSocial: data.razonSocial || null,
        apellido: data.apellido || null,
        nombre: data.nombre || null,
        nombreFantasia: data.nombreFantasia || null,
        telefono: data.telefono || null,
        cuit: data.cuit || null,
        email: data.email || null,
      }
    });
    revalidatePath("/admin/contactos");
    return { success: true, data: contactoActualizado };
  } catch (error) {
    console.error("Error actualizando contacto:", error);
    return { success: false, error: "No se pudo actualizar el contacto" };
  }
}

export async function deleteContacto(id: string) {
  try {
    await prisma.contacto.delete({
      where: { id }
    });
    revalidatePath("/admin/contactos");
    return { success: true };
  } catch (error) {
    console.error("Error eliminando contacto:", error);
    return { success: false, error: "No se pudo eliminar el contacto" };
  }
}
