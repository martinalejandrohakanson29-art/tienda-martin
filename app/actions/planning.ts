"use server"

import { prisma } from "@/lib/prisma"

// URLs de los webhooks de n8n
const N8N_PROCESS_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/obtener-fotos-planning";
const N8N_SALES_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/3ac81569-93e4-4e90-9a64-025b79a727c5";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

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

/**
 * Obtiene los datos de la planilla de Google Sheets.
 */
export async function fetchSheetData() {
    try {
        const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
        const text = await res.text();
        const rows = text.split("\n").map(row => row.split(",").map(cell => cell.replace(/^"|"$/g, '').trim()));
        const filtered = rows.filter(row => row.length > 1);
        return { success: true, headers: filtered[0] || [], body: filtered.slice(1) };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

/**
 * Envía la planificación a n8n para obtener fotos y guarda el envío en la base de datos.
 * Incluye corrección para evitar errores de duplicados en el nombre del envío.
 */
export async function sendPlanningToN8N(data: any[], shipmentName: string) {
    try {
        // 1. LLAMADA A N8N: Solicitamos las fotos y datos de Mercado Libre
        const n8nResponse = await fetch(N8N_PROCESS_WORKFLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data), 
        });

        if (!n8nResponse.ok) throw new Error("Error al obtener fotos de n8n");
        
        // Recibimos la respuesta de n8n
        const n8nResults = await n8nResponse.json();

        // 2. LIMPIEZA PREVIA: Evitamos el error "Unique constraint failed on the fields: (name)"
        // Borramos cualquier envío anterior que tenga el mismo nombre antes de crear el nuevo.
        await prisma.shipment.deleteMany({
            where: { name: shipmentName }
        });

        // 3. CREACIÓN DEL ENVÍO Y SUS ÍTEMS EN LA DB
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: data.map((itemOri) => {
                        // Buscamos la respuesta de n8n que coincida con el MLA
                        const infoML = Array.isArray(n8nResults) 
                            ? n8nResults.find((n: any) => n.id === itemOri.sku) 
                            : null;
                        
                        // Capturamos la URL de la imagen que ya viene "limpia" desde n8n
                        const urlFoto = infoML?.imageUrl || null;

                        // Si n8n no trae el SKU de vendedor, usamos el que ya teníamos de la planilla
                        const skuFinal = infoML?.["USER PRODUCT ID"] || itemOri.seller_sku || "S/D";

                        // Unimos los agregados en un solo texto
                        const listaAgregados = [itemOri.agregado1, itemOri.agregado2, itemOri.agregado3, itemOri.agregado4]
                            .filter(val => val && val.trim() !== "").join(", ");

                        return {
                            itemId: itemOri.sku || "S/D",       
                            title: itemOri.title || "Sin título",
                            sku: skuFinal,                      
                            quantity: Number(itemOri.quantity_to_send || 0),
                            agregados: listaAgregados,
                            imageUrl: urlFoto,                 
                            variation: itemOri.variation_label || "" 
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
