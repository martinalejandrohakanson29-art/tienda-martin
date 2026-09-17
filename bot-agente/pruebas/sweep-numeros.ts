/**
 * SWEEP DE NUMEROS — red anti-regresion de los detectores hermanos.
 *
 *   npx tsx bot-agente/pruebas/sweep-numeros.ts
 *   npx tsx bot-agente/pruebas/sweep-numeros.ts --actualizar
 *   npx tsx bot-agente/pruebas/sweep-numeros.ts --recolectar   (trae turnos nuevos de la BD)
 *
 * POR QUE EXISTE
 * --------------
 * Un numero suelto en el mensaje del cliente puede ser tres cosas distintas, y
 * cada una tiene su detector:
 *
 *   moto      la cilindrada que TIENE           "un econor con motor de 110"
 *   objetivo  a cuanto quiere LLEVARLA          "quiero hacerla 140"
 *   producto  la medida que PIDE                "tenes kid de cg 190?"
 *
 * Los tres miran el mismo texto y se pisan: en la conv 3338 el "110" de
 * "potenciar mi 110 a 120" se leia como objetivo (es su moto) y mandaba al
 * equipo justo al cliente que queria lo que el kit hace. Medido sobre los
 * turnos reales, 57% de los mensajes traen una cilindrada y ~1% son un
 * objetivo: la señal es rara y el ruido alrededor es enorme, asi que cualquier
 * cambio en la precedencia se paga caro y en silencio.
 *
 * Este sweep fija esa lectura sobre mensajes REALES y avisa si alguno cambia de
 * rol. Es determinista (cero llamadas al modelo; la moto sale de la BD).
 *
 * EL CORPUS ES FIJO A PROPOSITO
 * -----------------------------
 * `sweep-numeros.corpus.txt` esta versionado: el sweep NO lee la BD, asi el
 * snapshot es reproducible y no se mueve solo cuando entran turnos nuevos. Para
 * sumar casos reales: `--recolectar` (agrega los que falten, ordenados) y
 * despues `--actualizar`.
 *
 * COMO LEER EL SNAPSHOT
 * ---------------------
 *   moto=110   cilindradas que el resolvedor le atribuye a SU moto
 *   obj=140    a cuanto quiere llevar el motor (`-` si no dijo)
 *   prod=190   medida de otro producto que pide, contra el ANUNCIO DE REFERENCIA
 *              de abajo (`-` si no pide otro)
 *   conv=70->110  pide pasar de un motor a otro (`-` si no lo pidio). La base es
 *              el unico numero que el catalogo puede desmentir: ver
 *              `nucleo/conversion-pedida.ts`
 *
 * Un cambio en el snapshot NO es necesariamente un bug: si cargas motos nuevas,
 * se espera que algun `moto=-` pase a tener valor. Lo que garantiza es que
 * ninguno cambie SIN QUE TE ENTERES. Mira el diff, confirma linea por linea y
 * corre `--actualizar`.
 */
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { cilindradasEn, resolverMoto } from "../nucleo/motos"
import { detectarCilindradaObjetivo } from "../nucleo/cilindrada-objetivo"
import { leerNumeros } from "../nucleo/numeros-del-mensaje"
import { pideOtroProductoQueElAnuncio } from "../nucleo/otro-producto-anuncio"

const CORPUS = join(__dirname, "sweep-numeros.corpus.txt")
const SNAPSHOT = join(__dirname, "sweep-numeros.esperado.txt")

/**
 * Contexto de producto fijo para las columnas `obj` y `prod`. Tiene que ser uno
 * solo y estable: las dos preguntas ("pide otra medida", "quiere otra
 * cilindrada") se contestan SIEMPRE contra el producto que hay sobre la mesa, y
 * si eso variara por mensaje el snapshot dejaria de ser comparable.
 */
const ANUNCIO_REFERENCIA = "Kit 170 varillero + leva POTENCIA TU VARILLERO A 170CC! PEDI EL TUYO!!"

interface Linea {
    conv: string
    mensaje: string
}

function leerCorpus(): Linea[] {
    if (!existsSync(CORPUS)) return []
    return readFileSync(CORPUS, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
            const i = l.indexOf("|")
            return { conv: l.slice(0, i).trim(), mensaje: l.slice(i + 1).trim() }
        })
}

/** Un mensaje del cliente en una sola linea (el corpus es linea por caso). */
export function aplanar(texto: string): string {
    return texto.replace(/\s+/g, " ").trim()
}

async function clasificar(mensaje: string): Promise<string> {
    const moto = await resolverMoto(mensaje).catch(() => null)
    const ccMoto = new Set<number>()
    for (const m of [moto?.modelo, ...(moto?.candidatos || [])]) {
        if (!m) continue
        if (m.cilindrada) ccMoto.add(m.cilindrada)
        for (const n of cilindradasEn(m.nombre_completo)) ccMoto.add(n)
    }
    const objetivo = await detectarCilindradaObjetivo(mensaje)
    const producto = await pideOtroProductoQueElAnuncio(mensaje, ANUNCIO_REFERENCIA)
    const { conversion } = await leerNumeros(mensaje)

    const col = (v: string) => v.padEnd(9)
    return [
        col(`moto=${ccMoto.size ? [...ccMoto].sort((a, b) => a - b).join(",") : "-"}`),
        col(`obj=${objetivo?.cilindrada ?? "-"}`),
        col(`prod=${producto.cilindrada ?? "-"}`),
        col(`conv=${conversion ? `${conversion.base}->${conversion.objetivo}` : "-"}`)
    ].join(" ")
}

async function recolectar() {
    const { prisma } = await import("@/lib/prisma")
    const filas = await prisma.$queryRawUnsafe<{ conversation_id: any; mensaje_cliente: string }[]>(`
        SELECT conversation_id, mensaje_cliente FROM bot_agente_turnos_reales
        WHERE mensaje_cliente IS NOT NULL ORDER BY id ASC
    `)
    const corpus = leerCorpus()
    const vistos = new Set(corpus.map((l) => l.mensaje))
    let nuevos = 0
    for (const f of filas) {
        const mensaje = aplanar(f.mensaje_cliente)
        // Solo entran los que traen un numero: el resto no dice nada de esta capa.
        if (!mensaje || cilindradasEn(mensaje).length === 0) continue
        if (vistos.has(mensaje)) continue
        vistos.add(mensaje)
        corpus.push({ conv: String(f.conversation_id ?? "-"), mensaje })
        nuevos++
    }
    const cuerpo = [
        "# Corpus del sweep de numeros: mensajes REALES que traen una cilindrada.",
        "# Formato: <conversation_id> | <mensaje del cliente en una linea>",
        "# Se suma con `--recolectar`; no se edita a mano salvo para agregar un caso inventado.",
        "",
        ...corpus.map((l) => `${l.conv} | ${l.mensaje}`)
    ].join("\n")
    writeFileSync(CORPUS, cuerpo + "\n", "utf8")
    console.log(`corpus: ${corpus.length} mensajes (${nuevos} nuevos)`)
}

async function main() {
    if (process.argv.includes("--recolectar")) {
        await recolectar()
        return
    }

    const corpus = leerCorpus()
    if (corpus.length === 0) {
        console.error(`Corpus vacio. Corré: npx tsx bot-agente/pruebas/sweep-numeros.ts --recolectar`)
        process.exit(1)
    }

    const lineas: string[] = [
        `# anuncio de referencia: ${ANUNCIO_REFERENCIA}`,
        `# moto=cilindrada que tiene  obj=a cuanto quiere llevarla  prod=otra medida que pide  conv=de que motor parte -> a cual quiere llegar`,
        ""
    ]
    for (const c of corpus) {
        lineas.push(`${await clasificar(c.mensaje)} · ${c.mensaje.slice(0, 120)}`)
    }
    const actual = lineas.join("\n") + "\n"

    if (process.argv.includes("--actualizar") || !existsSync(SNAPSHOT)) {
        writeFileSync(SNAPSHOT, actual, "utf8")
        console.log(`snapshot escrito: ${corpus.length} mensajes`)
        return
    }

    // Los saltos de linea se comparan normalizados: en Windows (autocrlf) un
    // checkout deja el snapshot en CRLF y el sweep marcaba las 132 lineas como
    // cambiadas sin que ninguna lectura se hubiera movido.
    const sinCR = (t: string) => t.split(String.fromCharCode(13)).join("")
    const esperado = readFileSync(SNAPSHOT, "utf8")
    if (sinCR(esperado) === sinCR(actual)) {
        console.log(`OK · ${corpus.length} mensajes, ninguna lectura cambio`)
        return
    }

    const a = esperado.split("\n")
    const b = actual.split("\n")
    let diffs = 0
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] === b[i]) continue
        diffs++
        console.log(`\n- ${a[i] ?? "(nada)"}\n+ ${b[i] ?? "(nada)"}`)
    }
    console.log(`\n${diffs} lineas cambiaron. Si es lo que querias: --actualizar`)
    process.exit(1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
