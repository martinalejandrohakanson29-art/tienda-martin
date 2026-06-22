"use server";

import { prisma } from "@/lib/prisma";

const N8N_DESCRIPCIONES_URL = "https://n8n.revolucionmotos.tech/webhook/consulta-descripcion";

export interface ResultadoBusquedaDescripcion {
  mla: string;
  titulo: string | null;
  permalink: string | null;
  ocurrencias: number;
  snippet: string;
}

// Convierte un término en una regex insensible a mayúsculas y acentos (español).
// Ej: "ciguenal" / "cigüeñal" matchean ambos a "cigüeñal".
function buildAccentRegex(term: string): RegExp {
  const map: Record<string, string> = {
    a: "[aáàäâ]",
    e: "[eéèëê]",
    i: "[iíìïî]",
    o: "[oóòöô]",
    u: "[uúùüû]",
    n: "[nñ]",
    c: "[cç]",
  };
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return new RegExp(pattern, "gi");
}

// Dispara el workflow de n8n que recorre las publicaciones activas y nos
// devuelve sus descripciones al webhook /api/webhooks/n8n/descripciones.
export async function triggerActualizarDescripciones() {
  try {
    const res = await fetch(N8N_DESCRIPCIONES_URL, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      return { success: false, error: `n8n respondió HTTP ${res.status}` };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al disparar actualización de descripciones:", error);
    return { success: false, error: error.message || "No se pudo conectar con n8n" };
  }
}

// Borra las descripciones que NO entraron en la última sincronización:
// son publicaciones que se pausaron o se eliminaron y quedaron colgadas.
// Una corrida completa actualiza todas las activas en pocos minutos, así que
// usamos un margen de 6 horas respecto de la fila más reciente para no borrar
// nada que esté entrando en una sincronización en curso.
export async function limpiarDescripcionesViejas() {
  try {
    const ultima = await prisma.descripcionPublicacion.findFirst({
      orderBy: { fecha_actualizacion: "desc" },
      select: { fecha_actualizacion: true },
    });
    if (!ultima) {
      return { success: true, eliminadas: 0 };
    }

    const corte = new Date(ultima.fecha_actualizacion.getTime() - 6 * 60 * 60 * 1000);

    const res = await prisma.descripcionPublicacion.deleteMany({
      where: { fecha_actualizacion: { lt: corte } },
    });

    return { success: true, eliminadas: res.count };
  } catch (error: any) {
    console.error("Error al limpiar descripciones viejas:", error);
    return { success: false, error: error.message || "Error al limpiar" };
  }
}

export async function getDescripcionesStats() {
  const total = await prisma.descripcionPublicacion.count();
  const ultima = await prisma.descripcionPublicacion.findFirst({
    orderBy: { fecha_actualizacion: "desc" },
    select: { fecha_actualizacion: true },
  });
  return {
    total,
    ultimaActualizacion: ultima?.fecha_actualizacion ?? null,
  };
}

// Busca una palabra/frase en todas las descripciones guardadas.
// Carga las filas y filtra en memoria para soportar búsqueda insensible a acentos.
export async function buscarEnDescripciones(
  termino: string
): Promise<{ resultados: ResultadoBusquedaDescripcion[]; totalRevisadas: number }> {
  const limpio = termino.trim();
  if (limpio.length < 2) {
    return { resultados: [], totalRevisadas: 0 };
  }

  const filas = await prisma.descripcionPublicacion.findMany({
    select: { mla: true, titulo: true, permalink: true, descripcion: true },
  });

  const regex = buildAccentRegex(limpio);
  const resultados: ResultadoBusquedaDescripcion[] = [];

  for (const fila of filas) {
    const texto = `${fila.titulo ?? ""}\n${fila.descripcion ?? ""}`;
    regex.lastIndex = 0;
    const matches = texto.match(regex);
    if (!matches || matches.length === 0) continue;

    // Snippet alrededor de la primera coincidencia dentro de la descripción
    regex.lastIndex = 0;
    const m = regex.exec(fila.descripcion ?? "");
    let snippet = "";
    if (m) {
      const idx = m.index;
      const inicio = Math.max(0, idx - 60);
      const fin = Math.min((fila.descripcion ?? "").length, idx + m[0].length + 90);
      snippet =
        (inicio > 0 ? "…" : "") +
        (fila.descripcion ?? "").slice(inicio, fin).replace(/\s+/g, " ").trim() +
        (fin < (fila.descripcion ?? "").length ? "…" : "");
    } else {
      // La coincidencia estaba en el título
      snippet = (fila.descripcion ?? "").slice(0, 140).replace(/\s+/g, " ").trim();
    }

    resultados.push({
      mla: fila.mla,
      titulo: fila.titulo,
      permalink: fila.permalink,
      ocurrencias: matches.length,
      snippet,
    });
  }

  // Más ocurrencias primero
  resultados.sort((a, b) => b.ocurrencias - a.ocurrencias);

  return { resultados, totalRevisadas: filas.length };
}
