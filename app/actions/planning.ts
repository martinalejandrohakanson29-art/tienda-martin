"use server"

import { prisma } from "@/lib/prisma"

const N8N_SALES_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/3ac81569-93e4-4e90-9a64-025b79a727c5";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

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
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: data.map((item) => {
                        const listaAgregados = [item.agregado1, item.agregado2, item.agregado3, item.agregado4]
                            .filter(val => val && val.trim() !== "").join(", ");
                        return {
                            itemId: item.sku || "S/D",
                            title: item.title || "Sin título",
                            sku: item.seller_sku || "S/D",
                            quantity: Number(item.quantity_to_send || 0),
                            agregados: listaAgregados
                        };
                    })
                }
            }
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
// En app/actions/planning.ts

// URL del Webhook de n8n para obtener fotos y procesar (ajustar según tu n8n)
const N8N_PROCESS_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/obtener-fotos-planning";

export async function sendPlanningToN8N(data: any[], shipmentName: string) {
    try {
        // 1. Llamamos a n8n enviando los datos de la planificación
        const response = await fetch(N8N_PROCESS_WORKFLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: data, shipmentName }),
        });

        if (!response.ok) throw new Error("Error al comunicarse con n8n");
        
        // 2. n8n nos devuelve la lista de items con las URLs de las fotos incorporadas
        const { itemsWithImages } = await response.json();

        // 3. Creamos el envío y sus ítems en la base de datos
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: itemsWithImages.map((item: any) => ({
                        itemId: item.sku || "S/D",
                        title: item.title || "Sin título",
                        sku: item.seller_sku || "S/D",
                        quantity: Number(item.quantity_to_send || 0),
                        agregados: item.agregados,
                        imageUrl: item.imageUrl, // Guardamos la URL devuelta por n8n
                        variation: item.variation_label || ""
                    }))
                }
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error en proceso:", error);
        return { success: false, message: error.message };
    }
}
