// AUDITORIA DE LOS DATOS DE COMPATIBILIDAD (costo $0, no llama al modelo)
//
// Dos chequeos:
//   1. BARRIDO DE COMPORTAMIENTO: consulta cada moto conocida contra cada kit
//      activo y marca los casos donde la moto DETECTADA no comparte ninguna
//      palabra con la moto preguntada. Eso es la firma de un match falso — asi
//      se encontro que "Corven Hunter 150" respondia con una fila de "Nt110"
//      (porque "nt" esta dentro de "hu-NT-er") y que una Motomel S2 recibia la
//      respuesta de una Honda Wave S (por el alias "s 2" dentro de "s 2022").
//   2. FILAS SOSPECHOSAS: filas cuyo `modelo_moto` no parece una moto sino el
//      texto crudo de un cliente ("guerrero chopera que yeba un cilindro...")
//      o una descripcion de pieza ("negro de fundicion"). Esas filas pueden
//      responder por motos que no son, y hay que limpiarlas a mano.
//
// Uso: node scratch/auditar-compatibilidad.cjs
require("dotenv").config({ quiet: true })
const jiti = require("jiti")(__filename, { alias: { "@": process.cwd() }, interopDefault: true })
const { consultarCompatibilidad } = jiti("../bot-agente/herramientas/compatibilidad.ts")
const { normalizarTexto } = jiti("../bot-agente/nucleo/texto.ts")
const { prisma } = jiti("../lib/prisma.ts")

// Vocabulario que describe una PIEZA o una regla, nunca una moto. Si el
// `modelo_moto` de una fila se apoya en esto, la fila esta mal cargada.
const VOCABULARIO_NO_MOTO = [
    "cilindro", "fundicion", "plateado", "recorrido", "balanceador", "varillero",
    "barillero", "cadenero", "todas las", "ningun", "cilindrada", "carburador",
]

async function barridoDeComportamiento() {
    const motos = await prisma.$queryRawUnsafe(`SELECT nombre_completo FROM motos_modelos ORDER BY nombre_completo`)
    const kits = [
        ...(await prisma.$queryRawUnsafe(`SELECT nombre FROM chat_pack_grupos WHERE activo ORDER BY id`)),
        ...(await prisma.$queryRawUnsafe(`SELECT nombre FROM chat_packs WHERE activo AND grupo_id IS NULL ORDER BY id`)),
    ].map((k) => k.nombre)

    const sospechosos = []
    const resumen = { SI: 0, NO: 0, parcial: 0, no_encontrado: 0 }
    for (const m of motos) {
        for (const kit of kits) {
            const r = await consultarCompatibilidad({ modelo_moto: m.nombre_completo, kit_nombre_o_id: kit })
            const estado = !r.encontrado ? "no_encontrado" : r.confianza === "parcial" ? "parcial" : r.compatible ? "SI" : "NO"
            resumen[estado]++
            if (r.encontrado && r.modelo_moto_detectado) {
                const pedido = new Set(normalizarTexto(m.nombre_completo).split(" ").filter((w) => w.length >= 3))
                const det = normalizarTexto(r.modelo_moto_detectado).split(" ").filter((w) => w.length >= 3)
                if (det.length && !det.some((w) => pedido.has(w))) {
                    sospechosos.push({ moto: m.nombre_completo, kit: kit.slice(0, 30), detectado: r.modelo_moto_detectado, estado })
                }
            }
        }
    }
    console.log(`\n=== BARRIDO: ${motos.length} motos x ${kits.length} kits = ${motos.length * kits.length} combinaciones ===`)
    console.table(resumen)
    if (sospechosos.length === 0) {
        console.log("Sin matches falsos: toda moto detectada comparte al menos una palabra con la preguntada.")
    } else {
        console.log(`\n!! ${sospechosos.length} MATCH(ES) FALSO(S) — el bot responde citando otra moto:`)
        console.table(sospechosos)
    }
    return sospechosos.length
}

async function filasSospechosas() {
    const like = VOCABULARIO_NO_MOTO.map((v) => `'%${v}%'`).join(", ")
    const consulta = (tabla, extra = "") => `
        SELECT '${tabla}' AS tabla, id, modelo_moto, compatible
        FROM ${tabla}
        WHERE lower(modelo_moto) LIKE ANY (ARRAY[${like}])
           OR length(modelo_moto) > 26
           OR modelo_moto LIKE '%' || chr(10) || '%'
        ${extra}`
    const filas = await prisma.$queryRawUnsafe(
        [consulta("compatibilidades"), consulta("chat_combo_compatibilidad"), consulta("chat_articulo_compatibilidad")].join(
            "\nUNION ALL\n"
        ) + "\nORDER BY 1, 2"
    )
    console.log(`\n=== FILAS SOSPECHOSAS (el modelo_moto no parece una moto): ${filas.length} ===`)
    if (filas.length === 0) {
        console.log("Ninguna. Todos los modelo_moto parecen modelos de moto.")
    } else {
        console.table(filas.map((f) => ({ tabla: f.tabla, id: Number(f.id), modelo_moto: f.modelo_moto, compatible: f.compatible })))
        console.log("Revisarlas en /admin/chatwoot (catálogo -> compatibilidades) y corregir o borrar.")
    }
    return filas.length
}

;(async () => {
    const falsos = await barridoDeComportamiento()
    const sucias = await filasSospechosas()
    console.log(`\nRESUMEN: ${falsos} match(es) falso(s) de comportamiento, ${sucias} fila(s) mal cargada(s).`)
    await prisma.$disconnect()
    // Solo los matches falsos son un fallo de CODIGO; las filas sucias son data.
    process.exit(falsos === 0 ? 0 : 1)
})()
