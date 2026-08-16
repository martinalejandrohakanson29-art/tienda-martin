// Formato usado en la UI de cada kit para compatibilidad/incompatibilidad:
// lista separada por comas, con la aclaración opcional entre paréntesis.
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
        if (ch === ")") profundidad = Math.max(0, profundidad - 1)
        if (ch === "," && profundidad === 0) {
            items.push(actual)
            actual = ""
        } else {
            actual += ch
        }
    }
    if (actual.trim()) items.push(actual)

    return items
        .map((raw) => {
            const trimmed = raw.trim()
            const m = trimmed.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
            if (m) return { modelo: m[1].trim(), detalle: m[2].trim() }
            return { modelo: trimmed, detalle: "" }
        })
        .filter((x) => x.modelo.length > 0)
}
