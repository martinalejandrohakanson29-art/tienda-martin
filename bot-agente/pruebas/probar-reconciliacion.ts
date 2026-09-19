import "dotenv/config"
import { prisma } from "../../lib/prisma"
import { decidirCandidataReconciliacion, reconciliarEntrantesPerdidos } from "../../lib/bot-agente-tiempo-real"

// 19/09 11:23 Córdoba (14:23 UTC): el mensaje real de la conv 4601, el que el
// webhook perdió durante un reinicio del server.
const MENSAJE_4601 = Math.floor(Date.parse("2026-09-19T14:23:02Z") / 1000)
// "Ahora" simulado: 7 minutos después, el próximo tick de la reconciliación.
const AHORA = Date.parse("2026-09-19T14:30:00Z")

const conv4601 = {
    id: 4601,
    status: "open",
    last_activity_at: MENSAJE_4601,
    last_non_activity_message: {
        message_type: 0,
        private: false,
        content: "¡Hola! Quiero más información del kit170cc",
        created_at: MENSAJE_4601,
    },
}

const casos: { nombre: string; conv: any; esperado: boolean }[] = [
    { nombre: "conv 4601 REAL: entrante con texto, 7 min, nadie contestó", conv: conv4601, esperado: true },
    {
        nombre: "el mismo mensaje pero recién llegado (2 min): lo tiene el camino en vivo",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, created_at: Math.floor(AHORA / 1000) - 120 } },
        esperado: false,
    },
    {
        nombre: "el mismo mensaje de ayer (8 hs): fuera de la ventana",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, created_at: Math.floor(AHORA / 1000) - 8 * 3600 } },
        esperado: false,
    },
    {
        nombre: "ya le contestamos (último mensaje saliente)",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, message_type: 1 } },
        esperado: false,
    },
    {
        nombre: "nota privada del equipo encima del entrante",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, private: true } },
        esperado: false,
    },
    {
        nombre: "audio sin caption: no lo atiende el bot por diseño",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, content: "" } },
        esperado: false,
    },
    {
        nombre: "placeholder de Chatwoot, no algo que el cliente escribió",
        conv: { ...conv4601, last_non_activity_message: { ...conv4601.last_non_activity_message, content: "This message is unavailable." } },
        esperado: false,
    },
]

async function main() {
    let ok = 0
    console.log("--- Replay de la conv 4601 y sus casos borde ---\n")
    for (const caso of casos) {
        const d = decidirCandidataReconciliacion(caso.conv, AHORA)
        const paso = d.sembrar === caso.esperado
        if (paso) ok++
        console.log(
            `${paso ? "OK  " : "FALLA"}  ${caso.nombre}\n` +
                `        -> ${d.sembrar ? "SEMBRAR" : `descartado: ${d.motivo}`}`
        )
    }
    console.log(`\n${ok}/${casos.length} casos correctos.`)

    console.log("\n--- Contra Chatwoot real, sin escribir nada ---")
    const n = await reconciliarEntrantesPerdidos({ forzar: true, simular: true })
    console.log(`Sembraría ${n} conversación(es) ahora mismo.`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
        process.exit(0)
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
