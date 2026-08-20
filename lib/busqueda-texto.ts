// Buscadores tipo "todas las palabras están, sin importar el orden" — para no
// depender de que el usuario tipee las palabras en el mismo orden del nombre
// (ej. "aire filtro" debe encontrar "Filtro Aire 39x60 First").
export function matchTodasPalabras(texto: string, query: string): boolean {
    const palabras = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (palabras.length === 0) return true
    const textoLower = texto.toLowerCase()
    return palabras.every((p) => textoLower.includes(p))
}
