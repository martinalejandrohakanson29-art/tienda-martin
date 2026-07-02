// Almacén temporal en memoria para PDFs generados en el cliente.
// El cliente sube el PDF por POST y lo abre después con una URL GET que
// termina en el nombre de archivo: el visor de Chrome no conserva el
// Content-Disposition de una navegación POST y al descargar proponía un
// nombre genérico.
// Se cuelga de globalThis para sobrevivir al hot-reload en desarrollo.

type EntradaPdf = { buffer: Buffer; expira: number };

const TTL_MS = 10 * 60 * 1000; // 10 minutos: suficiente para ver/descargar/refrescar

const g = globalThis as unknown as { __resumenPdfStore?: Map<string, EntradaPdf> };
const store = g.__resumenPdfStore ?? (g.__resumenPdfStore = new Map());

export function guardarPdf(buffer: Buffer): string {
  const ahora = Date.now();
  for (const [id, entrada] of store) {
    if (entrada.expira < ahora) store.delete(id);
  }
  const id = crypto.randomUUID();
  store.set(id, { buffer, expira: ahora + TTL_MS });
  return id;
}

export function obtenerPdf(id: string): Buffer | null {
  const entrada = store.get(id);
  if (!entrada) return null;
  if (entrada.expira < Date.now()) {
    store.delete(id);
    return null;
  }
  return entrada.buffer;
}
