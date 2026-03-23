import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        // 1. Recibimos los datos desde la página web (la lista de gente y los textos)
        const body = await request.json();
        const { mayoristas, mensaje } = body;

        // Validamos que haya contactos en la lista
        if (!mayoristas || mayoristas.length === 0) {
            return NextResponse.json({ error: "No hay mayoristas para enviar" }, { status: 400 });
        }

        // 2. LA URL DEL WEBHOOK DE n8n (La cambiaremos en el próximo paso)
        const N8N_WEBHOOK_URL = "https://n8n.revolucionmotos.tech/webhook/difusion-mayoristas";

        // 3. Preparamos y enviamos el paquete a n8n
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                tipo: "difusion_mayoristas",
                contactos: mayoristas,
                // Aquí mandamos los campos exactos para tu nodo "Edit Fields"
                plantilla: {
                    titulo: mensaje.titulo,
                    descripcion1: mensaje.descripcion1,
                    descripcion2: mensaje.descripcion2,
                    precio: mensaje.precio,
                    "url foto": mensaje.url_foto // Lo mandamos con espacio tal como lo pide tu n8n
                }
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
