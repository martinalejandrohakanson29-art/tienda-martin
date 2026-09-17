/**
 * Regresion determinista de la conv 4429: una consulta de cobertura de envio
 * no se reduce a "si, llega" cuando la BD tambien informa transportista y
 * modalidad. No llama al modelo ni escribe en la base.
 *
 *   npx tsx bot-agente/pruebas/probar-cobertura-envio.ts
 */
import {
    construirGuiaInfoNegocio,
    esConsultaCoberturaEnvio
} from "../herramientas/info-negocio"

const hechos = [
    "El envío es gratis a todo el país",
    "Enviamo por Andreani a domicilio (la demora habitual es de 4 a 6 días hábiles). Si sos de Córdoba capital, podemos coordinar con un cadete según la zona.",
    "El envío se despacha siempre después del pago — no trabajamos con pago contra reembolso ni pago al recibir la mercadería."
]

const guia = construirGuiaInfoNegocio({
    tema: "envios",
    hechos,
    preguntaCliente: "Soi de Buenos Aires yo llegan",
    yaRespondido: true
})

const casos = [
    {
        titulo: "detecta una pregunta de cobertura aunque esté escrita informalmente",
        ok: esConsultaCoberturaEnvio("envios", "Soi de Buenos Aires yo llegan")
    },
    {
        titulo: "una mera aclaración de localidad no reabre toda la política",
        ok: !esConsultaCoberturaEnvio("envios", "Nono yo soy de Villa Dolores Córdoba")
    },
    {
        titulo: "detecta también la forma habitual 'hacen envíos a...'",
        ok: esConsultaCoberturaEnvio("envios", "Hacen envíos a Buenos Aires?")
    },
    {
        titulo: "la guía exige transportista y modalidad aunque el tema ya se haya tratado",
        ok:
            guia.includes("COMO se entrega") &&
            guia.includes("Andreani a domicilio") &&
            guia.includes("información NUEVA")
    },
    {
        titulo: "la guía evita agregar la condición de pago si no fue consultada",
        ok: guia.includes("No menciones la condición de pago salvo que el cliente pregunte")
    }
]

let fallos = 0
for (const caso of casos) {
    console.log(`${caso.ok ? "✅" : "❌"} ${caso.titulo}`)
    if (!caso.ok) fallos++
}

console.log(`\n${casos.length - fallos}/${casos.length} OK`)
process.exit(fallos > 0 ? 1 : 0)
