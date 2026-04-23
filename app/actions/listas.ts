"use server"

import { prisma } from "@/lib/prisma"

// Función para obtener todos los artículos para la vista de listas
export async function obtenerArticulosParaListas() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        packItems: {
          include: {
            componente: true
          }
        }
      }
    });
    
    return {
      success: true,
      data: articulos.map(art => ({
        id: art.id,
        nombre: art.nombre,
        precio: Number(art.precio),
        stock: art.stock,
        esPack: art.esPack || false,
        packItems: art.packItems?.map(packItem => ({
          ...packItem,
          componente: {
            ...packItem.componente,
            precio: Number(packItem.componente.precio)
          }
        })) || []
      }))
    };
  } catch (error) {
    console.error("Error al obtener artículos para listas:", error);
    return { success: false, error: "No se pudieron cargar los artículos." };
  }
}

// Función para editar un artículo desde la tabla de listas
export async function actualizarArticuloDesdeLista(id: string, nombre: string, precio: number, stock: number) {
  try {
    await prisma.articuloMostrador.update({
      where: { id },
      data: {
        nombre,
        precio,
        stock
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error al actualizar artículo:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}

// --- FUNCIONES PARA GESTIÓN DE PACKS ---

export async function obtenerPacks() {
  try {
    const packs = await prisma.articuloMostrador.findMany({
      where: { esPack: true },
      orderBy: { nombre: 'asc' },
      include: {
        packItems: {
          include: {
            componente: true
          }
        }
      }
    });
    
    return {
      success: true,
      data: packs.map(pack => ({
        id: pack.id,
        nombre: pack.nombre,
        precio: Number(pack.precio),
        stock: 0,
        esPack: true,
        packItems: pack.packItems?.map(packItem => ({
          ...packItem,
          componente: {
            ...packItem.componente,
            precio: Number(packItem.componente.precio),
            stock: packItem.componente.stock
          },
          cantidad: packItem.cantidad
        })) || []
      }))
    };
  } catch (error) {
    console.error("Error al obtener packs:", error);
    return { success: false, error: "No se pudieron cargar los packs." };
  }
}

export async function crearPackMostrador(data: { id: string, nombre: string, precio: number, componentes: { id: string, nombre: string, cantidad: number }[] }) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pack = await tx.articuloMostrador.create({
        data: {
          id: data.id,
          nombre: data.nombre,
          precio: data.precio,
          esPack: true,
          stock: 0,
        }
      });
      
      if (data.componentes && data.componentes.length > 0) {
        await tx.packMostradorItem.createMany({
          data: data.componentes.map(c => ({
            packId: pack.id,
            componenteId: c.id,
            cantidad: c.cantidad
          }))
        });
      }
      return pack;
    });
    return { success: true, data: result };
  } catch (error) {
    console.error("Error al crear pack:", error);
    return { success: false, error: "No se pudo crear el pack" };
  }
}

export async function eliminarPack(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // Eliminar los items del pack primero
      await tx.packMostradorItem.deleteMany({
        where: { packId: id }
      });
      
      // Luego eliminar el pack
      await tx.articuloMostrador.delete({
        where: { id }
      });
    });
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar pack:", error);
    return { success: false, error: "No se pudo eliminar el pack" };
  }
}

export async function actualizarPack(id: string, nombre: string, precio: number, componentes: { id: string, nombre: string, cantidad: number }[]) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar el pack
      await tx.articuloMostrador.update({
        where: { id },
        data: {
          nombre,
          precio
        }
      });
      
      // Eliminar los items antiguos
      await tx.packMostradorItem.deleteMany({
        where: { packId: id }
      });
      
      // Crear los nuevos items
      if (componentes && componentes.length > 0) {
        await tx.packMostradorItem.createMany({
          data: componentes.map(c => ({
            packId: id,
            componenteId: c.id,
            cantidad: c.cantidad
          }))
        });
      }
      
      return await tx.articuloMostrador.findUnique({
        where: { id },
        include: {
          packItems: {
            include: {
              componente: true
            }
          }
        }
      });
    });
    return { success: true, data: result };
  } catch (error) {
    console.error("Error al actualizar pack:", error);
    return { success: false, error: "No se pudo actualizar el pack" };
  }
}
// --- FUNCIONES PARA GESTIÓN DE PROVEEDORES ---

export async function obtenerProveedores() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      orderBy: { razonSocial: 'asc' },
    });
    return { success: true, data: proveedores };
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    return { success: false, error: "No se pudieron cargar los proveedores." };
  }
}

export async function actualizarProveedor(id: string, data: {
  razonSocial: string;
  cuit: string;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
}) {
  try {
    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: {
        razonSocial: data.razonSocial,
        cuit: data.cuit,
        nombreFantasia: data.nombreFantasia,
        email: data.email,
        telefono: data.telefono,
      }
    });
    return { success: true, data: proveedor };
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    return { success: false, error: "Ocurrió un error al guardar los cambios." };
  }
}

export async function crearProveedor(data: {
  razonSocial: string;
  cuit: string;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
}) {
  try {
    const proveedor = await prisma.proveedor.create({
      data: {
        razonSocial: data.razonSocial,
        cuit: data.cuit,
        nombreFantasia: data.nombreFantasia,
        email: data.email,
        telefono: data.telefono,
      }
    });
    return { success: true, data: proveedor };
  } catch (error) {
    console.error("Error al crear proveedor:", error);
    return { success: false, error: "No se pudo crear el proveedor. Es posible que el CUIT ya exista." };
  }
}

export async function eliminarProveedor(id: string) {
  try {
    await prisma.proveedor.delete({
      where: { id }
    });
    return { success: true };
  } catch (error) {
    console.error("Error al eliminar proveedor:", error);
    return { success: false, error: "No se pudo eliminar el proveedor." };
  }
}
