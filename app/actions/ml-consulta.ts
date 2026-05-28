"use server";

export interface VarianteML {
  mla: string;
  variation_id: string | null;
  user_product_id: string | null;
  family_id: string | null;
  titulo: string;
  nombre_variante: string;
  precio: number;
  stock: number;
  logistic_type: string;
  permalink: string;
}

export async function consultarVariantesMLA(mla: string): Promise<{
  success: boolean;
  data?: VarianteML[];
  error?: string;
}> {
  try {
    const cleanMla = mla.trim().toUpperCase();
    const url = `https://n8n.revolucionmotos.tech/webhook/consulta-variante?mla=${encodeURIComponent(cleanMla)}`;

    const response = await fetch(url, { method: "GET", cache: "no-store" });

    if (!response.ok) {
      return { success: false, error: `Error HTTP ${response.status}` };
    }

    const raw = await response.json();

    // n8n puede devolver array directo, o un objeto único
    const data: VarianteML[] = Array.isArray(raw) ? raw : [raw];

    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al conectar con n8n" };
  }
}
