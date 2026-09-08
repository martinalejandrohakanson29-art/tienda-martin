// Pruebas deterministas (sin llamar al modelo, costo $0) de las piezas puras
// que se tocaron el 07/09 a partir de la conv 3561:
//   - quitarOracionesYaDichas   (no repetir textual lo ya dicho)
//   - partirEnHechos / construirGuiaInfoNegocio (datos en vez de guion)
//   - unirTemas / formatearMemoriaEstado (memoria de temas respondidos)
//   - calcularEsperaCadenciaHumanaMs (regresion)
//
// Uso: node scratch/probar-mejoras.cjs
require("dotenv").config({ quiet: true })
const jiti = require("jiti")(__filename, { alias: { "@": process.cwd() }, interopDefault: true })

const { quitarOracionesYaDichas, sanitizarMensajeSalida } = jiti("../bot-agente/guardrails/sanitizador.ts")
const { partirEnHechos, construirGuiaInfoNegocio } = jiti("../bot-agente/herramientas/info-negocio.ts")
const { unirTemas, formatearMemoriaEstado } = jiti("../bot-agente/nucleo/estado-persistente.ts")
const { quitarPreguntaDeMotoFinal } = jiti("../bot-agente/nucleo/texto.ts")
const { calcularEsperaCadenciaHumanaMs } = jiti("../lib/bot-agente-tiempo-real.ts")

let pasados = 0
let fallados = 0
function check(nombre, condicion, detalle) {
    if (condicion) {
        pasados++
        console.log(`  PASS  ${nombre}`)
    } else {
        fallados++
        console.log(`  FAIL  ${nombre}`)
        if (detalle !== undefined) console.log(`        ${JSON.stringify(detalle)}`)
    }
}

console.log("\n== quitarOracionesYaDichas ==")
{
    // El caso exacto de la conv 3561: el mismo cierre dos mensajes seguidos.
    const previo = "Lo despachamos por Andreani a domicilio y demora 4 a 6 días hábiles.\n\nLe va bien bro, cualquier cosa avisanos y coordinamos."
    const nuevo = "De una, a Villa Dolores te lo mandamos por Andreani a domicilio.\nLe va bien bro, cualquier cosa avisanos y coordinamos."
    const r = quitarOracionesYaDichas(nuevo, [previo])
    check("saca el cierre repetido palabra por palabra", !/cualquier cosa avisanos y coordinamos/i.test(r), r)
    check("conserva la parte nueva (Villa Dolores)", /villa dolores/i.test(r), r)
}
{
    const r = quitarOracionesYaDichas("Dale! Te lo mandamos por Andreani.", ["Dale! Otra cosa distinta."])
    check("no toca frases cortas (<4 palabras)", r.includes("Dale!"), r)
}
{
    const previo = "Sabés si tu moto es recorrido corto o largo?"
    const r = quitarOracionesYaDichas("Sabés si tu moto es recorrido corto o largo?", [previo])
    check("no borra una pregunta (repreguntar es válido)", r.trim().length > 0, r)
}
{
    const previo = "El envío es gratis a todo el país incluido en el precio."
    const r = quitarOracionesYaDichas("El envío es gratis a todo el país incluido en el precio.", [previo])
    check("nunca deja el mensaje vacío", r.trim().length > 0, r)
}
{
    const r = quitarOracionesYaDichas("Texto cualquiera de prueba.", [])
    check("sin historial devuelve igual", r === "Texto cualquiera de prueba.", r)
}

console.log("\n== partirEnHechos ==")
{
    const envios = [
        "El envío es gratis a todo el país: ya está incluido en el precio del kit, no se cobra aparte.",
        "",
        "Lo hacemos por Andreani a domicilio (la demora habitual es de 4 a 6 días hábiles). Si sos de Córdoba capital, podemos coordinar con un cadete según la zona.",
        "",
        "El envío se despacha siempre después del pago — no trabajamos con pago contra reembolso ni pago al recibir la mercadería.",
    ].join("\n")
    const hechos = partirEnHechos(envios)
    check("parte envios en 3 hechos", hechos.length === 3, hechos.length)
    check("el hecho 2 es el de la demora", /4 a 6 días/.test(hechos[1]), hechos[1])
}
{
    const hechos = partirEnHechos("Un solo párrafo sin separación.")
    check("un párrafo suelto es un solo hecho", hechos.length === 1, hechos)
}

console.log("\n== construirGuiaInfoNegocio ==")
{
    const guia = construirGuiaInfoNegocio({
        tema: "envios",
        hechos: ["gratis a todo el país", "Andreani 4 a 6 días hábiles", "se despacha después del pago"],
        preguntaCliente: "Cuánto tarda en llegar",
        yaRespondido: false,
    })
    check("numera los hechos", /\[1\]/.test(guia) && /\[3\]/.test(guia), guia)
    check("incluye la pregunta textual del cliente", /Cuánto tarda en llegar/.test(guia), guia)
    check("NO ordena recitar el bloque", !/basándote estrictamente/i.test(guia), guia)
    check("pide contestar solo lo preguntado", /SOLO el dato que responde/.test(guia), guia)
}
{
    const guia = construirGuiaInfoNegocio({
        tema: "envios",
        hechos: ["gratis a todo el país", "Andreani 4 a 6 días hábiles"],
        preguntaCliente: "Nono yo soy de villa dolores Córdoba",
        yaRespondido: true,
    })
    check("avisa que el tema ya se contestó", /YA se lo contestaste/.test(guia), guia)
    check("prohibe repetir", /NO repitas/.test(guia), guia)
    check("pide solo el matiz nuevo", /matiz nuevo/.test(guia), guia)
}

console.log("\n== unirTemas ==")
{
    check("acumula sin duplicar", JSON.stringify(unirTemas(["envios"], ["envios"])) === JSON.stringify(["envios"]), unirTemas(["envios"], ["envios"]))
    check("normaliza mayúsculas/acentos", JSON.stringify(unirTemas(["Envíos"], ["envios"])).match(/envios/) !== null, unirTemas(["Envíos"], ["envios"]))
    check("preserva el orden", JSON.stringify(unirTemas(["envios"], ["ubicacion"])) === JSON.stringify(["envios", "ubicacion"]), unirTemas(["envios"], ["ubicacion"]))
    check("tolera null", Array.isArray(unirTemas(null, ["envios"])), unirTemas(null, ["envios"]))
    check("ignora vacíos", unirTemas([], ["", "  "]).length === 0, unirTemas([], ["", "  "]))
}

console.log("\n== formatearMemoriaEstado ==")
{
    const bloque = formatearMemoriaEstado({ temasRespondidos: ["envios", "ubicacion"] })
    check("lista los temas ya contestados", /envios, ubicacion/.test(bloque), bloque)
    check("prohibe re-explicar el tema, incluso reformulado", /NO re-expliques ese tema/.test(bloque) && /reformulado con otras palabras/.test(bloque), bloque)
    check("estado vacío no genera bloque", formatearMemoriaEstado({}) === "", formatearMemoriaEstado({}))
    check("temas vacíos no generan bloque", formatearMemoriaEstado({ temasRespondidos: [] }) === "", formatearMemoriaEstado({ temasRespondidos: [] }))
}

console.log("\n== saludo suelto a mitad de charla ==")
{
    const enCurso = { esConversacionEnCurso: true }
    const primerTurno = { esConversacionEnCurso: false }
    const casos = [
        ["Como va!\n\nEl kit 200 sale $167.000.", /como va/i],
        ["Cómo andas! El kit sale $167.000.", /como andas/i],
        ["Que tal! El kit sale $167.000.", /que tal/i],
        ["Hola bro! El kit sale $167.000.", /hola/i],
    ]
    for (const [texto, rx] of casos) {
        const r = sanitizarMensajeSalida(texto, enCurso).textoLimpio
        check(`saca "${texto.split(/[!\n]/)[0]}" a mitad de charla`, !rx.test(r), r)
        check(`  y conserva el contenido`, /167\.000/.test(r), r)
    }
    // En el turno 1 el saludo SÍ va.
    const t1 = sanitizarMensajeSalida("Como va! El kit sale $167.000.", primerTurno).textoLimpio
    check("en el primer turno el saludo se conserva", /como va/i.test(t1), t1)
}

console.log("\n== quitarPreguntaDeMotoFinal ==")
{
    // Texto real del Kit 170 (chat_packs.mensaje_bienvenida, id 11).
    const kit170 = "Cuesta $99.990 envio gratis.\nel kit incluye:\n✅cilindro con piston, aros y perno\n✅leva de calle de 7.80\n\nno precisa modificaciones.\n\nA que moto se lo queres poner?"
    const r = quitarPreguntaDeMotoFinal(kit170)
    check("saca 'A que moto se lo queres poner?'", !/a que moto/i.test(r), r)
    check("conserva la ficha completa", /leva de calle de 7\.80/.test(r) && /99\.990/.test(r), r)
}
{
    // Texto real del Kit 200 (el que se mandó en la conv 3561).
    const kit200 = "🔥 KIT POTENCIADO 200cc 🔥\n✅ Cilindro Dakar 200\n\n💳 Precio: $167.000\n\na que moto se la queres poner?"
    const r = quitarPreguntaDeMotoFinal(kit200)
    check("saca la variante 'a que moto se la queres poner?'", !/a que moto/i.test(r), r)
    check("conserva el precio", /167\.000/.test(r), r)
}
{
    const conAcentos = "Combo Tapa CDI.\n\nPara qué moto lo estás buscando?"
    check("saca 'Para qué moto lo estás buscando?'", !/moto/i.test(quitarPreguntaDeMotoFinal(conAcentos)), quitarPreguntaDeMotoFinal(conAcentos))
}
{
    const otroCierre = "El kit sale $99.990.\n\nSabés si tu moto es recorrido corto o largo?"
    check("NO toca otras preguntas de cierre", quitarPreguntaDeMotoFinal(otroCierre) === otroCierre, quitarPreguntaDeMotoFinal(otroCierre))
}
{
    const sinPregunta = "El kit sale $99.990 con envío gratis."
    check("sin pregunta final devuelve igual", quitarPreguntaDeMotoFinal(sinPregunta) === sinPregunta)
}
{
    const enElMedio = "A que moto se lo queres poner?\n\nEl kit sale $99.990."
    check("no toca la pregunta si no es la última línea", quitarPreguntaDeMotoFinal(enElMedio) === enElMedio, quitarPreguntaDeMotoFinal(enElMedio))
}
{
    check("nunca deja el mensaje vacío", quitarPreguntaDeMotoFinal("A que moto se lo queres poner?").length > 0)
    check("tolera vacío/null", quitarPreguntaDeMotoFinal("") === "" && quitarPreguntaDeMotoFinal(null) === "")
}

console.log("\n== calcularEsperaCadenciaHumanaMs (regresión) ==")
{
    check("descuenta lo ya transcurrido", calcularEsperaCadenciaHumanaMs(50, 70, 20000, 0) === 30000, calcularEsperaCadenciaHumanaMs(50, 70, 20000, 0))
    check("nunca negativo", calcularEsperaCadenciaHumanaMs(50, 70, 200000, 0) === 0)
    check("nunca más que el máximo", calcularEsperaCadenciaHumanaMs(50, 70, 0, 1) === 70000)
}

console.log(`\n${pasados}/${pasados + fallados} OK  (${fallados} fallados)`)
process.exit(fallados === 0 ? 0 : 1)
