import { obtenerConfiguracionAgente } from "../configuracion"
import { textoIncompatibleSugerido } from "@/lib/compat-mensaje"

/**
 * Guía para el agente cuando la moto del cliente NO es compatible.
 *
 * Por qué es determinista: la negativa es un dato conocido (hay una fila que
 * dice que no le entra, y el motivo cargado por el equipo). Mientras la
 * redacción quedó a cargo del modelo salió con preámbulo de confesión — conv
 * 3874, Wave NF: "te soy sincero: ese combo no le entra directo a la Wave NF".
 * Misma familia que el precio y el envío: el dato que ya tenemos se manda con
 * la letra de la casa, no improvisado (ver `feedback-bot-formato-precio-y-redaccion`).
 *
 * El texto sale de `chat_config.mensaje_incompatibilidad`, editable por el
 * equipo en /admin/chatwoot/catalogo, más el `detalle` de la fila. Es el MISMO
 * texto que ofrece el panel de escalados al aprender una compatibilidad, así
 * que el cliente lee lo mismo venga del bot o del equipo.
 *
 * `extras` son las pautas propias del camino que llamó (ej: "ninguna versión de
 * esa familia le entra, no le preguntes cuál tiene").
 */
export async function guiaIncompatibilidad(params: {
    moto: string
    detalle?: string | null
    extras?: string[]
}): Promise<string> {
    const config = await obtenerConfiguracionAgente().catch(() => null)
    const linea = textoIncompatibleSugerido(
        config?.mensajeIncompatibilidad || "",
        params.moto,
        (params.detalle || "").trim()
    )

    return [
        `NO ES COMPATIBLE con ${params.moto}. (dato interno)`,
        ...(params.extras || []),
        `- La negativa ya está redactada. Copiala tal cual, en su propio globo, sin agregarle ni sacarle nada:`,
        linea,
        `- Sin preámbulos de sinceridad ni disculpas ("te soy sincero", "la verdad que", "lamento decirte"): la línea sola ya lo dice todo.`,
        `- NO ofrezcas otros combos ni "alternativas" ni te ofrezcas a "buscar opciones compatibles": no tenés ninguna confirmada por el sistema.`,
        `- NO le vuelvas a preguntar la moto (ya te la dijo).`,
        `- Después de esa línea, cerrá corto y nada más.`,
    ].join("\n")
}
