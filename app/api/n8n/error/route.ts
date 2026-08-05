import { NextResponse } from "next/server";
import { triggerNotification } from "@/lib/notify";

// Receptor de fallos del workflow de n8n (workflow_mateo, el bot de WhatsApp).
// Lo llama el workflow de errores vía Error Trigger, que n8n dispara cuando una
// ejecución termina con error. Sin esto un fallo es invisible: el cliente no
// recibe respuesta y nadie se entera, porque el error queda solo en la lista de
// Executions de n8n.
//
// Entra por el mismo canal que el resto de las alertas del sistema, así que
// suena y llega al push del celular. Requiere una regla de notificación activa
// con eventType N8N_WORKFLOW_ERROR en /admin/usuarios; sin regla, triggerNotification
// no crea nada (sale por el early return de rules.length === 0).
export async function POST(request: Request) {
    // La ruta es pública (el middleware solo cubre /admin), así que el token es
    // lo único que la protege.
    const tokenEsperado = process.env.N8N_ERROR_TOKEN;
    if (!tokenEsperado) {
        console.error("[n8n/error] Falta N8N_ERROR_TOKEN, se rechaza el aviso");
        return NextResponse.json({ error: "No configurado" }, { status: 503 });
    }
    if (request.headers.get("x-n8n-token") !== tokenEsperado) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const workflow = typeof body?.workflow === "string" ? body.workflow : "workflow desconocido";
        const nodo = typeof body?.nodo === "string" && body.nodo ? body.nodo : null;
        const mensaje = typeof body?.mensaje === "string" ? body.mensaje : "";
        const executionUrl = typeof body?.executionUrl === "string" ? body.executionUrl : undefined;

        await triggerNotification({
            eventType: "N8N_WORKFLOW_ERROR",
            title: `Falló el bot de WhatsApp${nodo ? ` en "${nodo}"` : ""}`,
            // El mensaje de error de n8n puede ser larguísimo (stack traces de LLM);
            // se corta para que la notificación siga siendo legible.
            body: `${workflow}: ${mensaje.slice(0, 300)}`,
            link: executionUrl,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[n8n/error] Error al procesar el aviso:", error);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
