"use server"

import { prisma } from "@/lib/prisma"
import { crearResolverAgregados } from "@/lib/agregados"

// URLs de los webhooks de n8n
const N8N_PROCESS_WORKFLOW_URL = "https://n8n.revolucionmotos.tech/webhook/obtener-fotos-planning";
const N8N_SALES_WORKFLOW_URL = "https://n8n.revolucionmotos.tech/webhook/3ac81569-93e4-4e90-9a64-025b79a727c5";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

/**
 * Función robusta para parsear CSV respetando comillas y saltos de línea.
 */
function parseCSV(text: string): string[][] {
    const lines: string[][] = [];
    let row: string[] = [];
    let current = "";
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                current += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            row.push(current.trim());
            current = "";
        } else if ((char === '\r' || char === '\n') && !insideQuote) {
            if (char === '\r' && nextChar === '\n') i++;
            row.push(current.trim());
            if (row.some(cell => cell.length > 0)) {
                lines.push(row);
            }
            row = [];
            current = "";
        } else {
            current += char;
        }
    }

    if (current.length > 0 || row.length > 0) {
        row.push(current.trim());
        if (row.some(cell => cell.length > 0)) {
            lines.push(row);
        }
    }

    return lines;
}

/**
 * Ejecuta el workflow de n8n para procesar ventas y stock.
 */
export async function runN8nSalesWorkflow() {
    try {
        const response = await fetch(N8N_SALES_WORKFLOW_URL, { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error("Error en n8n al procesar ventas");
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export interface PlanningItemData {
    mla: string;
    inventoryId: string;
    title: string;
    stockFull: number;
    inTransitStock: number;
    parentItemId: string;
    isVariation: boolean;
    variationId: string | null;
    userProductId: string | null;
    variationLabel: string | null;
    sales: number;
    quantity: number;
    imageUrl: string | null;
    agregados: string[];
    familyId: string | null;
    localStock: number | null;
    recipeText: string | null;
}

/**
 * Obtiene los datos de la planilla de Google Sheets y los enriquece con la base de datos (Familia, UP, Stock Depósito Propio y Stock en Camino).
 */
export async function fetchSheetData() {
    try {
        const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo descargar la planilla de Google Sheets");
        const text = await res.text();
        const rows = parseCSV(text);
        const filtered = rows.filter(row => row.length > 1);
        
        let headers = filtered[0] || [];
        let rawBody = filtered.slice(1);

        // 1. Mapas de User Product y Family desde vista_costos_productos y productos_maestros
        const upfamMap = new Map<string, { up: string; fam: string }>();
        try {
            const costos = await prisma.$queryRaw<any[]>`
                SELECT 
                    mla, 
                    CAST(user_product_id AS VARCHAR) as user_product_id, 
                    CAST(family_id AS VARCHAR) as family_id
                FROM vista_costos_productos
            `;
            for (const c of costos) {
                if (!c.mla) continue;
                const mlaKey = String(c.mla).trim().toUpperCase();
                if (!upfamMap.has(mlaKey)) {
                    upfamMap.set(mlaKey, { up: c.user_product_id, fam: c.family_id });
                } else {
                    const existing = upfamMap.get(mlaKey)!;
                    if (!existing.up && c.user_product_id) existing.up = c.user_product_id;
                    if (!existing.fam && c.family_id) existing.fam = c.family_id;
                }
            }
        } catch (dbErr) {
            console.error("Error consultando vista_costos_productos:", dbErr);
        }

        // 2. Extraer todos los MLAs para resolver recetas y stock propio
        const mlaList = rawBody.map(r => (r[0] || "").trim()).filter(Boolean);
        const resolverAgregados = await crearResolverAgregados(mlaList);

        // 3. Traer stock físico de articulos_mostrador
        const articulos = await prisma.articuloMostrador.findMany({
            select: { id: true, nombre: true, stock: true }
        });
        const artStockMap = new Map<string, number>();
        for (const a of articulos) {
            artStockMap.set(String(a.id).trim().toLowerCase(), a.stock || 0);
            artStockMap.set(String(a.nombre).trim().toLowerCase(), a.stock || 0);
        }

        // 4. Calcular Stock en Camino (Envíos recientes procesados en los últimos 21 días)
        const hace21Dias = new Date();
        hace21Dias.setDate(hace21Dias.getDate() - 21);

        let inTransitMap = new Map<string, number>();
        try {
            const recentShipmentItems = await prisma.shipmentItem.findMany({
                where: {
                    shipment: {
                        createdAt: { gte: hace21Dias }
                    }
                }
            });

            for (const sItem of recentShipmentItems) {
                const cleanItemMla = sItem.itemId.replace("-", "").trim().toUpperCase();
                const cleanVar = (sItem.variation || "").trim().toLowerCase();
                
                // Acumulador general por MLA
                inTransitMap.set(cleanItemMla, (inTransitMap.get(cleanItemMla) || 0) + sItem.quantity);
                
                // Acumulador específico por variante
                if (cleanVar) {
                    const compound = `${cleanItemMla}_${cleanVar}`;
                    inTransitMap.set(compound, (inTransitMap.get(compound) || 0) + sItem.quantity);
                }
            }
        } catch (shipErr) {
            console.error("Error consultando envíos recientes en tránsito:", shipErr);
        }

        // 5. Mapear y enriquecer cada ítem
        const items: PlanningItemData[] = rawBody.map(row => {
            const mla = (row[0] || "").trim();
            const cleanMla = mla.replace("-", "").toUpperCase();
            const invId = (row[1] || "").trim();
            const title = (row[2] || "").trim();
            const stockFull = parseFloat((row[3] || "0").replace(/[^\d.-]/g, "")) || 0;
            const parentId = (row[5] || "").trim();
            const isVar = (row[6] || "").toLowerCase() === "true";
            const varId = (row[7] || "").trim() || null;
            const sheetUP = (row[8] || "").trim() || null;
            const varLabel = (row[9] || "").trim() || null;
            const sales = parseFloat((row[10] || "0").replace(/[^\d.-]/g, "")) || 0;
            const imgUrl = (row[12] || "").trim() || null;
            const agregadosList = [row[13], row[14], row[15], row[16]].filter(Boolean).map(a => a.trim());

            const matchMeta = upfamMap.get(cleanMla) || upfamMap.get(mla);
            const finalUP = sheetUP || matchMeta?.up || null;
            const finalFam = matchMeta?.fam || null;

            // Stock en camino
            const varKey = (varLabel || varId || "").trim().toLowerCase();
            const inTransitStock = (varKey ? inTransitMap.get(`${cleanMla}_${varKey}`) : null) ?? inTransitMap.get(cleanMla) ?? 0;

            // Calcular stock disponible en taller/depósito propio a partir de la receta
            const componentes = resolverAgregados(mla, varLabel || varId || undefined);
            let localStock: number | null = null;
            let recipeText: string | null = null;

            if (componentes.length > 0) {
                recipeText = componentes.map(c => `${c.nombre_articulo || c.id_articulo} (x${c.cantidad})`).join(' + ');
                let minPossibleKits = Infinity;
                for (const comp of componentes) {
                    const compKeyId = String(comp.id_articulo).trim().toLowerCase();
                    const compKeyName = comp.nombre_articulo ? String(comp.nombre_articulo).trim().toLowerCase() : "";
                    const availableStock = artStockMap.get(compKeyId) ?? (compKeyName ? artStockMap.get(compKeyName) : 0) ?? 0;
                    const possibleKits = Math.floor(availableStock / (comp.cantidad || 1));
                    if (possibleKits < minPossibleKits) {
                        minPossibleKits = possibleKits;
                    }
                }
                localStock = minPossibleKits === Infinity ? 0 : Math.max(0, minPossibleKits);
            } else {
                // Si no tiene receta de kit, intentar buscar por SKU o ID directo en articulos_mostrador
                const directStock = artStockMap.get(mla.toLowerCase()) ?? (finalUP ? artStockMap.get(finalUP.toLowerCase()) : null);
                if (directStock !== null && directStock !== undefined) {
                    localStock = directStock;
                }
            }

            return {
                mla,
                inventoryId: invId,
                title,
                stockFull,
                inTransitStock,
                parentItemId: parentId,
                isVariation: isVar,
                variationId: varId,
                userProductId: finalUP,
                variationLabel: varLabel,
                sales,
                quantity: 0,
                imageUrl: imgUrl,
                agregados: agregadosList,
                familyId: finalFam,
                localStock,
                recipeText
            };
        });

        // Inyectamos columnas adicionales a los headers y body para compatibilidad
        if (!headers.includes("User Product")) headers.push("User Product");
        if (!headers.includes("Familia")) headers.push("Familia");

        const body = rawBody.map(row => {
            const mlaCell = row[0] || "";
            const mlaNormalizado = mlaCell.replace("-", "").toUpperCase();
            const match = upfamMap.get(mlaNormalizado) || upfamMap.get(mlaCell);
            const newRow = [...row];
            newRow.push(match?.up || "-", match?.fam || "-");
            return newRow;
        });

        return { success: true, headers, body, items };
    } catch (error: any) {
        console.error("Error en fetchSheetData:", error);
        return { success: false, message: error.message };
    }
}

/**
 * Envía la planificación a n8n para obtener fotos y guarda el envío en la base de datos con recetas y fotos blindadas.
 */
export async function sendPlanningToN8N(data: any[], shipmentName: string) {
    try {
        // 1. LLAMADA A N8N con AbortController para evitar congelamientos si el webhook tarda
        let n8nResults: any = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const n8nResponse = await fetch(N8N_PROCESS_WORKFLOW_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data), 
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (n8nResponse.ok) {
                n8nResults = await n8nResponse.json();
            }
        } catch (webhookErr) {
            console.warn("Webhook n8n fotos no respondió a tiempo, usando fotos locales/hoja:", webhookErr);
        }

        // 2. LIMPIEZA PREVIA: Borrar cualquier envío anterior con el mismo nombre
        await prisma.shipment.deleteMany({
            where: { name: shipmentName }
        });

        // 3. CREACIÓN DEL ENVÍO Y SUS ÍTEMS EN LA DB
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: data.map((itemOri) => {
                        const infoML = Array.isArray(n8nResults) 
                            ? n8nResults.find((n: any) => n.id === itemOri.sku || n.mla === itemOri.sku) 
                            : null;
                        
                        // Prioridad foto: n8n > data de la tabla/hoja > fallback
                        const urlFoto = infoML?.imageUrl || itemOri.imageUrl || itemOri.picture_url || itemOri.fotoUrl || null;

                        const skuFinal = itemOri.seller_sku || infoML?.["USER PRODUCT ID"] || itemOri.user_product_id || itemOri.inventoryId || "S/D";

                        const listaAgregados = Array.isArray(itemOri.agregados)
                            ? itemOri.agregados.join(", ")
                            : [itemOri.agregado1, itemOri.agregado2, itemOri.agregado3, itemOri.agregado4]
                                .filter(val => val && String(val).trim() !== "").join(", ");

                        return {
                            itemId: itemOri.sku || itemOri.mla || "S/D",       
                            title: itemOri.title || "Sin título",
                            sku: skuFinal,                      
                            quantity: Number(itemOri.quantity_to_send ?? itemOri.quantity ?? 0),
                            agregados: listaAgregados,
                            imageUrl: urlFoto,                 
                            variation: itemOri.variation_label || itemOri.variation || "" 
                        };
                    })
                }
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error al guardar planificación:", error);
        return { success: false, message: error.message };
    }
}

