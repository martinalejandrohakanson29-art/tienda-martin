// Formato usado en la UI de cada kit para compatibilidad/incompatibilidad:
// lista separada por comas (o saltos de línea), con la aclaración opcional
// entre paréntesis al final de cada ítem.
// Ej: "Zanella ZB 110 (para recorrido corto), Honda Wave NF"

export function formatearListaCompat(items: { modelo_moto: string; detalle: string | null }[]): string {
    return items
        .map((i) => (i.detalle && i.detalle.trim() ? `${i.modelo_moto} (${i.detalle.trim()})` : i.modelo_moto))
        .join(", ")
}

export function parsearListaCompat(texto: string): { modelo: string; detalle: string }[] {
    const items: string[] = []
    let profundidad = 0
    let actual = ""
    for (const ch of texto) {
        if (ch === "(") profundidad++
        else if (ch === ")") profundidad = Math.max(0, profundidad - 1)

        // Separadores de ítem: coma o salto de línea, siempre que no estemos
        // dentro de un paréntesis (una aclaración puede tener comas adentro).
        if ((ch === "," || ch === "\n" || ch === "\r") && profundidad === 0) {
            items.push(actual)
            actual = ""
        } else {
            actual += ch
        }
    }
    if (actual.trim()) items.push(actual)

    return items
        .map((raw) => separarModeloDetalle(raw.trim()))
        .filter((x) => x.modelo.length > 0)
}

// Separa "modelo (aclaración)" en sus dos partes. La aclaración es el último
// paréntesis balanceado al final del texto; se cuenta la anidación para tolerar
// aclaraciones que a su vez tienen paréntesis adentro
// (ej. "wave s (hay que alesar los cárteres (torno) — no es directo)").
function separarModeloDetalle(item: string): { modelo: string; detalle: string } {
    if (!item.endsWith(")")) return { modelo: item, detalle: "" }

    let profundidad = 0
    for (let i = item.length - 1; i >= 0; i--) {
        const ch = item[i]
        if (ch === ")") profundidad++
        else if (ch === "(") {
            profundidad--
            if (profundidad === 0) {
                const modelo = item.slice(0, i).trim()
                const detalle = item.slice(i + 1, item.length - 1).trim()
                // Sin nada antes del paréntesis no es "modelo (aclaración)",
                // es texto suelto: dejarlo tal cual como modelo.
                if (!modelo) return { modelo: item, detalle: "" }
                return { modelo, detalle }
            }
        }
    }
    // Paréntesis sin abrir que lo balancee: no tocar.
    return { modelo: item, detalle: "" }
}
