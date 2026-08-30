import { Articulo, ItemVenta } from "./types";

export const METODOS_PAGO = [
  { value: "Efectivo", label: "💵 Efectivo", color: "#16a34a" },
  { value: "Tarjeta de Crédito", label: "💳 Tarjeta de Crédito", color: "#2563eb" },
  { value: "Tarjeta de Débito", label: "🏧 Tarjeta de Débito", color: "#0891b2" },
  { value: "MercadoLibre", label: "🟡 MercadoLibre", color: "#b45309" },
  { value: "MercadoPago", label: "🔵 MercadoPago", color: "#0284c7" },
  { value: "Cruzada", label: "🔁 Cruzada", color: "#0d9488" },
  { value: "A Cuenta Corriente", label: "📒 A Cuenta Corriente", color: "#059669" },
  { value: "A Confirmar", label: "⏳ A Confirmar", color: "#64748b" },
];

export function colorMetodoPago(value: string): string {
  return METODOS_PAGO.find((m) => m.value === value)?.color ?? "#cbd5e1";
}

export function normalizeText(text?: string | number | null): string {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const redondearA50 = (n: number): number => Math.round(n / 50) * 50;

export const calcularPrecioArt = (costo: number, margen: number): number => {
  return redondearA50(costo * (1 + margen / 100));
};

export const formatearPrecioMiles = (n: number): string => {
  return redondearA50(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
};

export const esActualizacionVieja = (fecha?: string | null): boolean => {
  if (!fecha) return false;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 2);
  return new Date(fecha) < limite;
};

export const calcularMarcacion = (costo?: number | null, precio?: number | null): number | null => {
  if (!costo || costo <= 0 || precio == null) return null;
  return ((precio - costo) / costo) * 100;
};

export const claseColorMarcacion = (marc: number): string => {
  if (marc >= 60) return "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200";
  if (marc >= 50) return "bg-green-50 text-green-600 border-green-200";
  if (marc >= 40) return "bg-orange-50 text-orange-600 border-orange-200";
  return "bg-red-50 text-red-600 border-red-200";
};

export const inputSinFlechas = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export function expandirPackEnComponentes(packId: string, articulos: Articulo[]): ItemVenta[] {
  const pack = articulos.find((a) => a.id === packId);
  if (!pack || !pack.esPack || !pack.packItems) return [];

  const componentes: ItemVenta[] = [];
  for (const packItem of pack.packItems) {
    componentes.push({
      id: packItem.componenteId,
      productoId: packItem.componenteId,
      nombre: packItem.componente.nombre,
      cantidad: packItem.cantidad,
      precio_unit: Number(packItem.componente.precio),
      subtotal: Number(packItem.cantidad * packItem.componente.precio),
      stock: packItem.componente.stock,
      esPack: false,
    });
  }
  return componentes;
}

export function expandirPacksEnItems(items: ItemVenta[], articulos: Articulo[]): ItemVenta[] {
  const resultado: ItemVenta[] = [];
  for (const item of items) {
    if (item.esPack && item.packComponentes) {
      resultado.push(...item.packComponentes);
    } else {
      resultado.push(item);
    }
  }
  return resultado;
}

export const transformDriveLink = (url: string) => {
  if (!url) return "";
  if (url.includes("drive.google.com") && url.includes("/d/")) {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
  }
  return url;
};
