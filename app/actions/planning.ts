"use server"

import { prisma } from "@/lib/prisma"

const N8N_SALES_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/3ac81569-93e4-4e90-9a64-025b79a727c5";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";
const N8N_PROCESS_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/obtener-fotos-planning";

export async function runN8nSalesWorkflow() {
    try {
        const response = await fetch(N8N_SALES_WORKFLOW_URL, {
            method: 'GET',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error("Error en n8n");
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export async function fetchSheetData(): Promise<{ 
    success: boolean; headers?: string[]; body?: string[][]; message?: string 
}> {
    try {
        const res = await fetch(SHEETS_CSV_URL, { cache: "no-store" });
        const text = await res.text();
        const rows = text.split("\n").map(row => {
            return row.split(",").map(cell => cell.replace(/^"|"$/g, '').trim()); 
        });
        const filtered = rows.filter(row => row.length > 1);
        return { success: true, headers: filtered[0] || [], body: filtered.slice(1) };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export async function sendPlanningToN8N(data: any[], shipmentName: string) {
    try {
        // 1. Llamamos a n8n enviando los datos para obtener las fotos y procesar
        const n8nResponse = await fetch(N8N_PROCESS_WORKFLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: data, shipmentName }),
        });

        if (!n8nResponse.ok) throw new Error("Error al comunicarse con n8n");
        
        // Obtenemos los datos enriquecidos (con fotos) de n8n
        const responseData = await n8nResponse.json();
        // Asumimos que n8n devuelve una propiedad 'items' con la info completa
        const processedItems = responseData.items || data;

        // 2. Guardamos en la base de datos
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: processedItems.map((item: any) => {
                        // Procesamos los agregados si vienen por separado
                        const listaAgregados = item.agregados || [item.agregado1, item.agregado2, item.agregado3, item.agregado4]
                            .filter((val: any) => val && val.trim() !== "").join(", ");

                        return {
                            itemId: item.sku || "S/D", // MLA
                            title: item.title || "Sin título",
                            sku: item.seller_sku || "S/D",
                            quantity: Number(item.quantity_to_send || 0),
                            agregados: listaAgregados,
                            // Si actualizaste el schema de Prisma, descomenta estas líneas:
                            // imageUrl: item.imageUrl || "",
                            // variation: item.variation_label || ""
                        };
                    })
                }
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error en sendPlanningToN8N:", error);
        return { success: false, message: error.message };
    }
}
