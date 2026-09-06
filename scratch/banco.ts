import "dotenv/config"
import { correrBancoPruebas } from "@/bot-agente/pruebas/correr-banco"
import { prisma } from "@/lib/prisma"

const soloIds = process.argv.slice(2).filter((a) => a.startsWith("caso-"))

async function main() {
    const modelo = process.env.BANCO_MODELO || "deepseek-v4-flash"
    const baseUrl = process.env.BANCO_BASEURL || "https://api.deepseek.com"
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.BANCO_APIKEY

    console.log(`Modelo: ${modelo} @ ${baseUrl}\n`)
    const rep = await correrBancoPruebas({ modelo, baseUrl, apiKey }, soloIds.length ? soloIds : undefined)

    for (const r of rep.resultados) {
        const tag = r.ok ? "PASS" : "FAIL"
        console.log(`[${tag}] ${r.id} — ${r.titulo}`)
        if (!r.ok) {
            for (const f of r.fallos) console.log(`        · ${f}`)
            if (r.error) console.log(`        · error: ${r.error}`)
            console.log(`        herramientas: ${r.observado.herramientas.join(", ") || "ninguna"}`)
            console.log(`        bot: ${JSON.stringify(r.observado.mensajeFinal)?.slice(0, 200)}`)
        }
    }
    console.log(`\n${rep.pasados}/${rep.total} OK  (${rep.fallados} fallados)`)
    await prisma.$disconnect()
    process.exit(rep.fallados === 0 ? 0 : 1)
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
