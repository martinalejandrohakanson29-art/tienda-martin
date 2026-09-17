import { normalizarTexto } from "./texto"

/** Segmentos con alcance propio: una negación no debe cruzar un «pero» o «sino». */
export function clausulas(texto: string): string[] {
    return texto.split(/[.!?;,\n]+|\b(?:pero|sino)\b/i).map(normalizarTexto).filter(Boolean)
}

/** Una mención no es una elección si se niega, se pregunta o se expresa duda. */
export function mencionaAfirmativamente(texto: string, termino: string): boolean {
    const clave = normalizarTexto(termino)
    if (!clave) return false
    const rx = new RegExp(`(^|\\s)${clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g")
    return clausulas(texto).some((clausula) => {
        for (const hit of clausula.matchAll(rx)) {
            const antes = clausula.slice(0, hit.index).trim()
            if (/\b(no|ni|sin|nose|sera|seria|quizas|quiza|capaz|tal vez|creo|supongo|puede ser|como se|como saber|como averiguo)\b/.test(antes)) continue
            return true
        }
        return false
    })
}

/** Se usa en ambos filtros: WhatsApp también trae preguntas sin signos. */
export function pideRespuestaExplicita(texto?: string): boolean {
    if (!texto) return false
    return /\?/.test(texto) || /\b(cuanto|cuanta|cuantos|cuantas|cuando|donde|como(?! (?:estas|esta|andas|anda|van?|te va|le va|siempre))|cual|cuales|que (?:precio|sale|cuesta|demora|incluye|trae)|repeti(?:me)?|recorda(?:me)?|decime|confirmame|pasame|mandame|no entendi|no me quedo claro)\b/.test(normalizarTexto(texto))
}

/** No convertir una hipótesis, una negación o una pregunta de confianza en un incidente. */
export function coincideIntencionDirecta(texto: string, patron: RegExp): boolean {
    return clausulas(texto).some((clausula) => {
        const rx = new RegExp(patron.source, patron.flags.replace(/g/g, "") + "g")
        return [...clausula.matchAll(rx)].some((hit) => {
            const antes = clausula.slice(0, hit.index).trim()
            return !/\b(no|ni|sin|si|supongamos|suponiendo|que pasa|que pasaria|como se|como saber|como puedo saber|como puedo estar segur[oa]|miedo|temor)\b/.test(antes)
        })
    })
}
