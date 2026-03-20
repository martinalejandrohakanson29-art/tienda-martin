import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        // 1. Recibimos la lista de mayoristas que mandaste desde el panel de administrador
        const body = await request.json();
        const { mayoristas } = body;

        // Si por algún motivo llega vacío, frenamos el proceso
        if (!mayoristas || mayoristas.length === 0) {
            return NextResponse.json({ error: "No hay mayoristas para enviar" }, { status: 400 });
        }

        // 2. AQUÍ VA LA URL DE TU WEBHOOK DE n8n
        // Por ahora ponemos una de prueba, en el próximo paso te ayudo a poner la real.
        const N8N_WEBHOOK_URL = "https://tu-n8n.railway.app/webhook/difusion-mayoristas";

        // 3. Le enviamos el paquete de datos a n8n
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            // Empaquetamos la lista y le agregamos una etiqueta "difusion_mayoristas"
            body: JSON.stringify({
                tipo: "difusion_mayoristas",
                contactos: mayoristas 
            }),
        });

        if (!response.ok) {
            throw new Error("El servidor de n8n no respondió correctamente.");
        }

        // Si todo salió bien, le avisamos al panel
        return NextResponse.json({ success: true, message: "Difusión enviada a n8n correctamente" });

    } catch (error) {
        console.error("Error al enviar difusión a n8n:", error);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}
