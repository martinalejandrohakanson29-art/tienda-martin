"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { obtenerVentasMLPorRango } from "./ventas-mostrador";

type RangoFechas = { from: string; to: string };

// Agrupa las ventas de ML de nuestra propia base (no n8n/API de ML) por MLA
async function agruparVentasMLPorMLA(rango: RangoFechas) {
  const res = await obtenerVentasMLPorRango(rango.from, rango.to);
  const grupos = new Map<string, { nombre: string; unidades: number; neto: number }>();

  if (!res.success || !res.data) return grupos;

  for (const v of res.data) {
    const mla = v.mlMla?.trim();
    if (!mla) continue;

    const grupo = grupos.get(mla) || {
      nombre: v.items?.[0]?.nombre || `Producto ${mla}`,
      unidades: 0,
      neto: 0,
    };
    // Todos los items de una venta ML comparten la misma cantidad (unidades del pedido)
    grupo.unidades += v.items?.[0]?.cantidad || 1;
    grupo.neto += v.total;
    grupos.set(mla, grupo);
  }

  return grupos;
}

// Reemplaza la consulta a n8n (que pegaba en vivo contra la API de ML y era lenta):
// compara dos rangos de fechas de ventas de MercadoLibre usando datos propios (tabla Venta).
export async function compararVentasMLPorRango(rango1: RangoFechas, rango2: RangoFechas) {
  try {
    const [grupoAnterior, grupoActual] = await Promise.all([
      agruparVentasMLPorMLA(rango1),
      agruparVentasMLPorMLA(rango2),
    ]);

    const mlas = Array.from(new Set([...grupoAnterior.keys(), ...grupoActual.keys()]));

    // Preferimos el título real de la publicación (más prolijo que el nombre del componente/kit)
    const productos = mlas.length > 0
      ? await prisma.productosMaestros.findMany({
          where: { mla: { in: mlas } },
          orderBy: [{ mla: 'asc' }, { variation_id: { sort: 'asc', nulls: 'first' } }],
        })
      : [];
    const nombrePublicacionMap = new Map<string, string>();
    for (const p of productos) {
      if (!nombrePublicacionMap.has(p.mla) && p.nombre_publicacion) {
        nombrePublicacionMap.set(p.mla, p.nombre_publicacion);
      }
    }

    const items = mlas.map(mla => {
      const anterior = grupoAnterior.get(mla);
      const actual = grupoActual.get(mla);
      const ventasActual = actual?.unidades || 0;
      const ventasAnterior = anterior?.unidades || 0;
      const netoActual = actual?.neto || 0;
      const netoAnterior = anterior?.neto || 0;
      const growthNeto = !netoAnterior ? (netoActual > 0 ? 100 : 0) : ((netoActual - netoAnterior) / netoAnterior) * 100;

      return {
        mla,
        nombre: nombrePublicacionMap.get(mla) || actual?.nombre || anterior?.nombre || `Producto ${mla}`,
        ventasActual,
        ventasAnterior,
        diffVentas: ventasActual - ventasAnterior,
        netoActual,
        netoAnterior,
        growthNeto,
      };
    });

    await guardarSeguimientoVentas(items);

    return { success: true, items };
  } catch (error: any) {
    console.error("Error al comparar ventas ML:", error);
    return { success: false, error: error.message, items: [] };
  }
}

export async function guardarSeguimientoVentas(datos: any[]) {
  try {
    // 1. Limpiamos los datos del análisis anterior
    await prisma.seguimientoVentas.deleteMany({});

    // 2. Guardamos la nueva comparativa
    // Usamos una transacción para asegurar que la limpieza y el guardado sean atómicos
    await prisma.$transaction(
      datos.map(item => prisma.seguimientoVentas.create({
        data: {
          mla: item.mla,
          nombre: item.nombre,
          ventasActual: item.ventasActual || 0,
          ventasAnterior: item.ventasAnterior || 0,
          diffVentas: item.diffVentas || 0,
          netoActual: item.netoActual || 0,
          netoAnterior: item.netoAnterior || 0,
          growthNeto: item.growthNeto || 0,
          ultimaActualizacion: new Date()
        }
      }))
    );

    revalidatePath("/admin/mercadolibre/seguimiento-ventas");
    return { success: true };
  } catch (error: any) {
    console.error("Error al guardar datos de ventas:", error);
    return { success: false, error: error.message };
  }
}

export async function obtenerSeguimientoVentas() {
  try {
    const data = await prisma.seguimientoVentas.findMany({
      orderBy: { netoActual: 'desc' }
    });
    // Convertimos Decimal a Number para evitar problemas de serialización en el cliente
    return data.map(item => ({
      ...item,
      netoActual: Number(item.netoActual),
      netoAnterior: Number(item.netoAnterior),
      growthNeto: Number(item.growthNeto)
    }));
  } catch (error) {
    console.error("Error al recuperar datos de ventas:", error);
    return [];
  }
}
