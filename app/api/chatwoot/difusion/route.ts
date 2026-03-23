import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        // 1. Recibimos la lista de mayoristas y el mensaje configurado desde el frontend
        const body = await request.json();
        const { mayoristas, mensaje } = body;

        // Validamos que haya datos
        if (!mayoristas || mayoristas.length === 0) {
            return NextResponse.json({ error: "No hay mayoristas para enviar" }, { status: 400 });
        }

        // 2. AQUÍ VA LA URL DE TU WEBHOOK DE n8n
        // (La cambiaremos cuando configuremos el Webhook en n8n)
        const N8N_WEBHOOK_URL = "https://tu-n8n.railway.app/webhook/difusion-mayoristas";

        // 3. Le enviamos el paquete de datos a n8n
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            // Empaquetamos todo junto para que n8n pueda leerlo fácil
            body: JSON.stringify({
                tipo: "difusion_mayoristas",
                contactos: mayoristas,
                contenidoMensaje: mensaje // Aquí viaja el titulo, precio, url_foto, etc.
            }),
        });

        if (!response.ok) {
            throw new Error("El servidor de n8n no respondió correctamente.");
        }

        return NextResponse.json({ success: true, message: "Difusión enviada a n8n correctamente" });

    } catch (error) {
        console.error("Error al enviar difusión a n8n:", error);
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
}
