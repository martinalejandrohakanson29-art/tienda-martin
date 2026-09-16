/**
 * Semillas de la configuracion del catalogo del bot.
 *
 * El problema que resuelve: todo lo que se edita desde /admin/chatwoot vive
 * SOLO en la base. Git no sabe nada, asi que una restauracion desde backup
 * puede revertir una correccion sin que nada avise. Paso de verdad el 15/09:
 * la categoria del Kit 170 volvio al typo "Potenciacio varillero 150" y el kit
 * dejo de aparecer cuando un cliente pedia el rubro por cilindrada. Lo mismo
 * con cilindradas_base del grupo 4 y con una situacion que revivio activa.
 *
 * Modos:
 *
 *   npx tsx scripts/config-catalogo.ts verificar   (default)
 *      Compara la base contra el archivo de semillas y lista las diferencias.
 *      Sale con codigo 1 si hay drift, asi sirve en un check automatico.
 *
 *   npx tsx scripts/config-catalogo.ts exportar
 *      Regenera el archivo desde la base. Es lo que hay que correr —y
 *      commitear— despues de un cambio legitimo hecho desde el admin.
 *
 *   npx tsx scripts/config-catalogo.ts aplicar --si
 *      Escribe en la base los valores del archivo. Sin --si es un simulacro.
 *
 * Alcance a proposito: solo campos de CONFIGURACION, los que gobiernan lo que
 * el bot decide y se editan a mano. Queda afuera lo operativo de alto volumen
 * (compatibilidades, chat_articulo_compatibilidad, el estado de las
 * conversaciones): eso lo genera el aprendizaje, cambia solo y versionarlo
 * seria ruido permanente.
 *
 * "aplicar" NUNCA crea ni borra filas, solo corrige campos de filas que ya
 * existen. Una fila que falta se reporta para cargarla a mano desde el admin:
 * recrearla a ciegas desde un archivo viejo es como se pierden los datos
 * nuevos.
 */
import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()
const ARCHIVO = path.join(__dirname, "semillas-catalogo.json")

/** Una tabla versionada: por donde se la identifica y que campos se cuidan. */
interface Tabla {
    tabla: string
    /** Clave natural: sobrevive a una restauracion que renumere los id. */
    clave: string
    campos: string[]
}

const TABLAS: Tabla[] = [
    {
        tabla: "chat_pack_grupos",
        clave: "nombre",
        campos: ["categoria", "cilindradas_base", "activo", "compatibilidad_universal"]
    },
    {
        tabla: "chat_packs",
        clave: "nombre",
        campos: ["categoria", "cilindradas_base", "activo", "precio", "atributo_fijo", "criterio_variante"]
    },
    {
        tabla: "chat_articulos",
        clave: "titulo_comercial",
        campos: ["categoria", "cilindradas_base", "activo", "precio"]
    },
    {
        // La instruccion y los disparadores SI van: son la config que define el
        // comportamiento, y es exactamente lo que se pierde en un restore.
        tabla: "chat_situaciones",
        clave: "clave",
        campos: ["activo", "orden", "titulo", "disparadores", "instruccion"]
    },
    {
        // La letra de la casa es el mismo caso que las situaciones: config que
        // se escribe a mano desde el panel y que un restore se lleva. Perderla
        // no rompe nada (el bot vuelve a redactar con su voz), pero se nota en
        // como habla y nadie se acuerda de por que cambio.
        //
        // La clave natural es la frase: los id se renumeran y el `momento` se
        // repite por diseno (varias frases por momento).
        tabla: "chat_frases",
        clave: "frase",
        campos: ["momento", "activo", "orden"]
    },
    {
        // Los alias se editan a mano y el sweep de compatibilidad depende de
        // ellos: un alias perdido cambia veredictos sin tocar una linea de codigo.
        tabla: "motos_modelos",
        clave: "nombre_completo",
        campos: ["marca", "modelo", "cilindrada", "aliases"]
    }
]

/** Normaliza para comparar: los arrays de Postgres llegan como array de JS. */
function normalizar(v: unknown): string {
    if (v === null || v === undefined) return "null"
    if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x)))
    return JSON.stringify(String(v))
}

/** Los Decimal de Prisma no son comparables ni serializables directo. */
function plano(v: unknown): unknown {
    if (v !== null && typeof v === "object" && typeof (v as any).toNumber === "function") {
        return (v as any).toNumber()
    }
    return v
}

async function leerBase(t: Tabla): Promise<Record<string, unknown>[]> {
    const cols = [t.clave, ...t.campos].map((c) => '"' + c + '"').join(", ")
    const filas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        'SELECT ' + cols + ' FROM "' + t.tabla + '" ORDER BY "' + t.clave + '"'
    )
    return filas.map((f) => {
        const limpia: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(f)) limpia[k] = plano(v)
        return limpia
    })
}

interface Semillas {
    _generado: string
    _leeme: string
    datos: Record<string, Record<string, unknown>[]>
}

async function exportar(): Promise<number> {
    const datos: Record<string, Record<string, unknown>[]> = {}
    for (const t of TABLAS) datos[t.tabla] = await leerBase(t)
    const salida: Semillas = {
        _generado: new Date().toISOString(),
        _leeme: "Generado por scripts/config-catalogo.ts. No editar a mano: cambiar en /admin/chatwoot y volver a exportar.",
        datos
    }
    fs.writeFileSync(ARCHIVO, JSON.stringify(salida, null, 2) + "\n", "utf-8")
    let total = 0
    for (const t of TABLAS) {
        console.log("  " + t.tabla + ": " + datos[t.tabla].length + " filas")
        total += datos[t.tabla].length
    }
    console.log("\nExportadas " + total + " filas a " + path.relative(process.cwd(), ARCHIVO))
    console.log("Commitealo para que el proximo restore se pueda comparar contra esto.")
    return 0
}

interface Drift {
    tabla: string
    clave: string
    campo?: string
    esperado?: string
    actual?: string
    tipo: "campo" | "falta_en_base" | "sin_declarar"
}

async function comparar(semillas: Semillas): Promise<Drift[]> {
    const drift: Drift[] = []
    for (const t of TABLAS) {
        const esperadas = semillas.datos[t.tabla] ?? []
        const actuales = await leerBase(t)
        const porClave = new Map(actuales.map((f) => [String(f[t.clave]), f]))

        for (const esp of esperadas) {
            const k = String(esp[t.clave])
            const act = porClave.get(k)
            if (!act) {
                drift.push({ tabla: t.tabla, clave: k, tipo: "falta_en_base" })
                continue
            }
            for (const campo of t.campos) {
                const e = normalizar(esp[campo])
                const a = normalizar(act[campo])
                if (e !== a) {
                    drift.push({ tabla: t.tabla, clave: k, campo, esperado: e, actual: a, tipo: "campo" })
                }
            }
            porClave.delete(k)
        }
        // Lo que esta en la base y no en el archivo es NUEVO, no un error: se
        // avisa para que alguien corra "exportar" y lo versione.
        for (const k of porClave.keys()) drift.push({ tabla: t.tabla, clave: k, tipo: "sin_declarar" })
    }
    return drift
}

function imprimir(drift: Drift[]): void {
    const campos = drift.filter((d) => d.tipo === "campo")
    const faltan = drift.filter((d) => d.tipo === "falta_en_base")
    const nuevas = drift.filter((d) => d.tipo === "sin_declarar")

    if (campos.length) {
        console.log("\nDIFERENCIAS (" + campos.length + ") — la base no coincide con lo versionado:")
        for (const d of campos) {
            console.log("  [" + d.tabla + '] "' + d.clave + '" . ' + d.campo)
            console.log("      versionado: " + d.esperado)
            console.log("      en la base: " + d.actual)
        }
    }
    if (faltan.length) {
        console.log("\nFALTAN EN LA BASE (" + faltan.length + ") — cargarlas a mano desde /admin/chatwoot:")
        for (const d of faltan) console.log("  [" + d.tabla + '] "' + d.clave + '"')
    }
    if (nuevas.length) {
        console.log("\nSIN DECLARAR (" + nuevas.length + ") — son nuevas, corre \"exportar\" y commitea:")
        for (const d of nuevas) console.log("  [" + d.tabla + '] "' + d.clave + '"')
    }
}

async function verificar(): Promise<number> {
    if (!fs.existsSync(ARCHIVO)) {
        console.log("No existe " + path.relative(process.cwd(), ARCHIVO) + ". Corre primero:")
        console.log("  npx tsx scripts/config-catalogo.ts exportar")
        return 1
    }
    const semillas: Semillas = JSON.parse(fs.readFileSync(ARCHIVO, "utf-8"))
    const drift = await comparar(semillas)
    console.log("Semillas generadas el " + semillas._generado.slice(0, 16).replace("T", " "))
    if (drift.length === 0) {
        console.log("\nOK: la base coincide con la configuracion versionada.")
        return 0
    }
    imprimir(drift)
    // Una fila nueva sin declarar no es una falla: es trabajo legitimo.
    return drift.some((d) => d.tipo !== "sin_declarar") ? 1 : 0
}

async function aplicar(enSerio: boolean): Promise<number> {
    if (!fs.existsSync(ARCHIVO)) {
        console.log("No existe el archivo de semillas. Corre primero: exportar")
        return 1
    }
    const semillas: Semillas = JSON.parse(fs.readFileSync(ARCHIVO, "utf-8"))
    const drift = (await comparar(semillas)).filter((d) => d.tipo === "campo")
    if (drift.length === 0) {
        console.log("Nada que aplicar: la base ya coincide.")
        return 0
    }
    imprimir(drift)
    if (!enSerio) {
        console.log("\nSIMULACRO: no se escribio nada. Para aplicar de verdad:")
        console.log("  npx tsx scripts/config-catalogo.ts aplicar --si")
        return 0
    }
    console.log("\nAplicando:")
    for (const t of TABLAS) {
        const mios = drift.filter((d) => d.tabla === t.tabla)
        if (!mios.length) continue
        const esperadas = new Map((semillas.datos[t.tabla] ?? []).map((f) => [String(f[t.clave]), f]))
        for (const clave of new Set(mios.map((d) => d.clave))) {
            const esp = esperadas.get(clave)
            if (!esp) continue
            const campos = mios.filter((d) => d.clave === clave).map((d) => d.campo as string)
            const sets = campos.map((c, i) => '"' + c + '" = $' + (i + 1)).join(", ")
            const valores = campos.map((c) => esp[c])
            await prisma.$executeRawUnsafe(
                'UPDATE "' + t.tabla + '" SET ' + sets + ' WHERE "' + t.clave + '" = $' + (campos.length + 1),
                ...valores,
                clave
            )
            console.log("  [" + t.tabla + '] "' + clave + '": ' + campos.join(", "))
        }
    }
    console.log("\nAplicadas " + drift.length + " correcciones.")
    return 0
}

async function main(): Promise<void> {
    const modo = process.argv[2] || "verificar"
    const enSerio = process.argv.includes("--si")
    let codigo = 0
    if (modo === "exportar") codigo = await exportar()
    else if (modo === "verificar") codigo = await verificar()
    else if (modo === "aplicar") codigo = await aplicar(enSerio)
    else {
        console.log("Modos: verificar | exportar | aplicar [--si]")
        codigo = 1
    }
    await prisma.$disconnect()
    process.exit(codigo)
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
