import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { chatwootConfig } from "@/lib/chatwoot-bot";

// La app no puede conectarse directo al Redis del bot (firewall/allowlist de IP que
// solo deja pasar al servidor de n8n, confirmado el 2026-08-18). En vez de eso, un
// workflow chico en n8n ("Utilidad - Limpiar Pin de Prueba", que sí tiene la
// credencial "Redis account 2" funcionando) expone un webhook para hacer el borrado.
const N8N_LIMPIAR_PIN_URL = "https://n8n.revolucionmotos.tech/webhook/limpiar-pin-prueba";

// Botón "Borrar historial de un número" en /admin/chatwoot/prueba: a
// diferencia de "Reiniciar conocimiento" (que borra TODO sin distinguir),
// este borra solo lo atado a un número puntual -- pensado para limpiar
// conversaciones de prueba (ej. +5493513784909, el número que se usa hace
// dias para probar el workflow) sin tocar el conocimiento real del negocio
// ni el historial de otros clientes.
//
// El conversation_id de Chatwoot no se guarda en ningún lado de nuestra
// base junto al teléfono, así que hay que resolverlo consultando la API
// real de Chatwoot (buscar el contacto por teléfono, listar sus
// conversaciones) antes de poder borrar por conversation_id en
// preguntas_*_pendientes / respuestas_pendientes.
//
// También borra en Redis el kit pineado (`kit_pineado:{telefono}`, TTL 96hs)
// y la pausa del bot por conversación (`bot_pausado:{conversation_id}`, TTL
// 30 días) -- hasta el 2026-08-18 este botón solo tocaba Postgres, así que un
// pin viejo (o una pausa vieja) podía sobrevivir el "reset" y arrastrar el
// bot por un camino distinto al esperado en la siguiente prueba (encontrado
// auditando en vivo con Martín: +5493513784909 seguía con un kit pineado de
// una prueba anterior después de "limpiar" la conversación).
export async function DELETE(request: Request) {
    try {
        await requireAdmin();

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body inválido" }, { status: 400 });
        }
        const telefonoInput = typeof (body as { telefono?: unknown })?.telefono === "string" ? (body as { telefono: string }).telefono.trim() : "";
        if (!telefonoInput) return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });
        const telefono = telefonoInput.startsWith("+") ? telefonoInput : `+${telefonoInput}`;

        const { api, token } = chatwootConfig();
        const conversationIds = new Set<number>();
        let chatwootError: string | null = null;

        if (!token) {
            chatwootError = "Falta CHATWOOT_API_TOKEN: no se pudo resolver el conversation_id real, solo se borra por teléfono";
        } else {
            try {
                const busqueda = telefono.replace("+", "");
                const resBusqueda = await fetch(`${api}/accounts/1/contacts/search?q=${encodeURIComponent(busqueda)}`, {
                    headers: { api_access_token: token },
                });
                if (!resBusqueda.ok) throw new Error(`Chatwoot respondió ${resBusqueda.status} al buscar el contacto`);
                const dataBusqueda = await resBusqueda.json();
                const contactos: Array<{ id: number; phone_number?: string }> = dataBusqueda?.payload || [];
                const contacto = contactos.find((c) => c.phone_number === telefono);

                if (contacto) {
                    const resConv = await fetch(`${api}/accounts/1/contacts/${contacto.id}/conversations`, {
                        headers: { api_access_token: token },
                    });
                    if (!resConv.ok) throw new Error(`Chatwoot respondió ${resConv.status} al listar conversaciones`);
                    const dataConv = await resConv.json();
                    const conversaciones: Array<{ id?: number }> = dataConv?.payload || dataConv || [];
                    for (const c of conversaciones) if (c?.id) conversationIds.add(Number(c.id));
                }
            } catch (error) {
                chatwootError = error instanceof Error ? error.message : "Error consultando Chatwoot";
            }
        }

        const idsArray = [...conversationIds];

        const queries = [
            prisma.$executeRaw`DELETE FROM conversaciones_historial WHERE session_key = ${telefono}`,
            prisma.$executeRaw`DELETE FROM bot_conversacion_lock WHERE telefono = ${telefono}`,
        ];
        for (const id of idsArray) {
            queries.push(
                prisma.$executeRaw`DELETE FROM preguntas_tecnicas_pendientes WHERE conversation_id = ${id}`,
                prisma.$executeRaw`DELETE FROM preguntas_negocio_pendientes WHERE conversation_id = ${id}`,
                prisma.$executeRaw`DELETE FROM preguntas_precio_pendientes WHERE conversation_id = ${id}`,
                prisma.$executeRaw`DELETE FROM respuestas_pendientes WHERE conversation_id = ${id}`
            );
        }
        const resultados = await prisma.$transaction(queries);
        const filasBorradas = resultados.reduce((a, b) => a + b, 0);

        let redisKeysBorradas = 0;
        let redisError: string | null = null;
        try {
            const webhookToken = process.env.CHATWOOT_WEBHOOK_TOKEN;
            const url = webhookToken ? `${N8N_LIMPIAR_PIN_URL}?token=${encodeURIComponent(webhookToken)}` : N8N_LIMPIAR_PIN_URL;
            const resRedis = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telefono, conversationIds: idsArray }),
            });
            const dataRedis = await resRedis.json().catch(() => ({}));
            if (!resRedis.ok) throw new Error(dataRedis?.error || `n8n respondió ${resRedis.status}`);
            redisKeysBorradas = typeof dataRedis.clavesBorradas === "number" ? dataRedis.clavesBorradas : 0;
        } catch (error) {
            redisError = error instanceof Error ? error.message : "Error llamando al workflow de limpieza de Redis";
        }

        return NextResponse.json({
            success: true,
            telefono,
            conversationIds: idsArray,
            filasBorradas,
            redisKeysBorradas,
            avisoChatwoot: chatwootError,
            avisoRedis: redisError,
        });
    } catch (error) {
        const noAutorizado = error instanceof Error && error.message === "No autorizado";
        return NextResponse.json(
            { error: noAutorizado ? "No autorizado" : error instanceof Error ? error.message : "Error interno del servidor" },
            { status: noAutorizado ? 401 : 500 }
        );
    }
}
