// Arma el mensaje predefinido de un kit a partir de sus datos (detalle,
// precio, envío). Compartido entre el formulario manual
// (app/admin/chatwoot/conocimiento/kits-tab.tsx) y la tarjeta de revisión de
// la carga asistida por chat (app/admin/chatwoot/cargar-kit) — en esta última
// el mensaje lo arma la IA durante la charla, así que este helper solo se usa
// si el dueño edita detalle/precio/envío a mano después y quiere regenerarlo.
export function generarMensajeKit(datos: { detalle: string; precio: string; envio: string }): string {
    const partes = [
        "Hola amigo, ¿cómo va?",
        datos.detalle.trim() || "[completá el detalle del kit arriba]",
        [
            datos.precio.trim() ? `El precio es ${datos.precio.trim()}` : "[completá el precio arriba]",
            datos.envio.trim() ? `con ${datos.envio.trim().toLowerCase()}` : null,
        ].filter(Boolean).join(", ") + ".",
        "¿Para qué moto lo estás buscando?",
    ]
    return partes.join("\n\n")
}
