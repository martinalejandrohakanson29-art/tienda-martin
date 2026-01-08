"use server"

import { prisma } from "@/lib/prisma"

// Ajusta esta URL si cambia el webhook de tu workflow de Fotos
const N8N_PROCESS_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/obtener-fotos-planning";
const N8N_SALES_WORKFLOW_URL = "https://n8n-on-render-production-52f0.up.railway.app/webhook/3ac81569-93e4-4e90-9a64-025b79a727c5";
const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

export async function runN8nSalesWorkflow() {
    try {
        const response = await fetch(N8N_SALES_WORKFLOW_URL, { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error("Error en n8n");
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

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

export async function sendPlanningToN8N(data: any[], shipmentName: string) {
    try {
        // 1. LLAMADA A N8N: Enviamos los items para que n8n busque las fotos en Mercado Libre
        const n8nResponse = await fetch(N8N_PROCESS_WORKFLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data), 
        });

        if (!n8nResponse.ok) throw new Error("Error al obtener fotos de n8n");
        
        // n8n nos devuelve el array con fotos [ {id: 'MLA...', pictures: [...]}, ... ]
        const n8nResults = await n8nResponse.json();

        // 2. CREACIÓN DEL ENVÍO EN LA BASE DE DATOS
        await prisma.shipment.create({
            data: {
                name: shipmentName,
                items: {
                    create: data.map((itemOri) => {
                        // Buscamos la información que n8n trajo para este ítem específico
                        const infoML = Array.isArray(n8nResults) 
                            ? n8nResults.find(n => n.id === itemOri.sku) 
                            : null;
                        
                        // Extraemos la primera foto válida del array 'pictures' de n8n
                        const urlFoto = infoML?.pictures?.find((p: any) => p && p.secure_url)?.secure_url || null;

                        // Unimos los agregados (N, O, P, Q) en un solo texto
                        const listaAgregados = [itemOri.agregado1, itemOri.agregado2, itemOri.agregado3, itemOri.agregado4]
                            .filter(val => val && val.trim() !== "").join(", ");

                        return {
                            itemId: itemOri.sku || "S/D",       // El MLA
                            title: itemOri.title || "Sin título",
                            sku: itemOri.seller_sku || "S/D",  // El código de vendedor
                            quantity: Number(itemOri.quantity_to_send || 0),
                            agregados: listaAgregados,
                            imageUrl: urlFoto,                 // <--- ¡AHORA SÍ CARGA LA FOTO!
                            variation: itemOri.variation_label || "" // <--- ¡CARGA LA VARIANTE!
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
