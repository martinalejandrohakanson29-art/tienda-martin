/**
 * "Un kit de 70 a 110" — el cliente pide partir de un motor que no potenciamos.
 * ---------------------------------------------------------------------------
 * Conv 4475 (17/09, +5493624253916): entró por el anuncio "POTENCIA TU 110" y
 * escribió *"quiero saber si vienen un kit de 70 a 110"*. Tiene una Motomel Eco
 * 70 y quería llevarla a 110 — algo que no existe en nuestra base. El bot leyó
 * "kit de 70" como la medida de un producto, el "110" como ruido, buscó por
 * cilindrada suelta y le volcó los dos combos que potencian una 110 a 120. Le
 * contestó otra pregunta: la que decía el aviso, no la que hizo él.
 *
 * El dato que lo resuelve ya está cargado y es duro: `cilindradas_base` dice
 * para qué motor es cada producto (105, 110, 125, 150, 190, 200). Si el motor
 * del que el cliente parte no está ahí, no hay nada que ofrecerle y no hay con
 * qué armar una alternativa — eso lo sabe el equipo, no el catálogo. Silencio y
 * a la bandeja técnica.
 *
 * La regla mira la BASE, no el objetivo, a propósito: "de 110 a 120" es
 * exactamente lo que vendemos y tiene que seguir de largo. Lo que deriva es de
 * dónde parte, que es el dato que el catálogo sí puede desmentir.
 *
 * Quién lee los dos números y con qué precedencia vive en
 * `nucleo/numeros-del-mensaje.ts`. Acá queda solo la regla de negocio.
 */

import { prisma } from "@/lib/prisma"
import { MARCAS_MOTO, cilindradaSinMarca, cilindradasEn, resolverMoto } from "./motos"
import { normalizarTexto } from "./texto"
import { leerNumeros, type ConversionLeida, type LecturaNumeros } from "./numeros-del-mensaje"

let cacheBases: { data: Set<number>; ts: number } | null = null

/**
 * Todos los motores que el catálogo declara potenciar (`cilindradas_base` de
 * packs, grupos y artículos activos).
 *
 * Caché de 60s, igual que `nucleo/rubros.ts` y `nucleo/motos.ts`: corre por
 * turno y el catálogo no cambia entre dos mensajes de una ráfaga.
 *
 * Si la consulta falla —o si nadie declaró una sola base— devuelve vacío y el
 * detector se abstiene. Con la tabla a medias, un motor real pasaría por ajeno
 * y el bot derivaría consultas normales de a tandas.
 */
export async function cilindradasBaseDelCatalogo(): Promise<Set<number>> {
    if (cacheBases && Date.now() - cacheBases.ts < 60_000) return cacheBases.data

    try {
        const filas = await prisma.$queryRaw<{ cc: number[] | null }[]>`
            SELECT cilindradas_base AS cc FROM chat_packs WHERE activo = true
            UNION ALL
            SELECT cilindradas_base FROM chat_pack_grupos WHERE activo = true
            UNION ALL
            SELECT cilindradas_base FROM chat_articulos WHERE activo = true
        `
        const cc = new Set<number>()
        for (const f of filas) for (const n of f.cc || []) if (Number(n) > 0) cc.add(Number(n))
        cacheBases = { data: cc, ts: Date.now() }
        return cc
    } catch {
        // Columna todavía sin migrar: el bot sigue funcionando como antes.
        return new Set()
    }
}

/**
 * ¿El cliente pide convertir DESDE un motor que no tenemos como base?
 *
 * Devuelve la conversión que hay que derivar, o `null` si no pidió una
 * conversión, si la base sí es nuestra, o si no hay bases cargadas con qué
 * opinar.
 */
export async function conversionDesdeMotorAjeno(
    mensaje: string | null | undefined,
    /** La lectura de este mismo texto, si el motor ya la hizo en este turno. */
    lecturaPrevia?: LecturaNumeros | null
): Promise<ConversionLeida | null> {
    const { conversion } = lecturaPrevia || (await leerNumeros(mensaje))
    if (!conversion) return null

    const bases = await cilindradasBaseDelCatalogo()
    if (bases.size === 0) return null
    if (bases.has(conversion.base)) return null

    return conversion
}

/**
 * EL MOTOR EN JUEGO NO ES UNO DE LOS QUE POTENCIAMOS.
 * ---------------------------------------------------------------------------
 * El gate de arriba agarra una forma de decirlo ("un kit de 70 a 110"). Probadas
 * ocho formas del mismo pedido, agarraba dos: el resto llega al modelo, y el
 * modelo no tiene con qué darse cuenta —la tool del catálogo nunca le devuelve
 * `cilindradas_base` y la guía del no-match le prohíbe decir "no lo tenemos" y
 * lo empuja a buscar otra vez—. Medido con el motor real: a *"tengo una motomel
 * eco 70, qué kit le puedo poner?"* le volcó los siete kits del catálogo.
 *
 * Así que el dato va también al otro lado: cuando el motor del cliente no está
 * en ninguna `cilindradas_base`, la tool corta con una orden sola en vez de
 * devolver productos. No depende de cómo lo escriba el cliente.
 *
 * De dónde sale el motor en juego, de más confiable a menos:
 *   1. la conversión que pidió    "de 70 a 110"
 *   2. la moto que nombró         "motomel eco 70" (`motos_modelos`)
 *   3. la cilindrada sola         "tengo una 70"
 *
 * Las tres son del motor, nunca del LLM. Si nada de eso hay, no se opina.
 */
export interface MotorAjeno {
    cilindrada: number
    /** Cómo lo supimos, para el `mensaje_para_agente` y el resumen del escalado. */
    origen: string
}

export async function motorQueNoPotenciamos(opciones: {
    /** El mensaje del cliente de este turno. */
    mensaje?: string | null
    /** La lectura de ese mensaje, si el turno ya la hizo. */
    lectura?: LecturaNumeros | null
    /** La moto en juego según el embudo (la de este mensaje o la de la charla). */
    moto?: string | null
}): Promise<MotorAjeno | null> {
    const bases = await cilindradasBaseDelCatalogo()
    if (bases.size === 0) return null

    const lectura = opciones.lectura || (opciones.mensaje ? await leerNumeros(opciones.mensaje) : null)

    // 1. La conversión que pidió: el número de la izquierda es su motor.
    const base = lectura?.conversion?.base
    if (base != null) {
        return bases.has(base)
            ? null
            : {
                  cilindrada: base,
                  origen: `pide pasar de ${base} a ${lectura!.conversion!.objetivo}`
              }
    }

    // 2. La moto que nombró, resuelta contra `motos_modelos`.
    const nombreMoto = (opciones.moto || "").trim()
    if (nombreMoto) {
        const resol = await resolverMoto(nombreMoto).catch(() => null)
        const cc = new Set<number>()
        for (const m of [resol?.modelo, ...(resol?.candidatos || [])]) {
            if (!m) continue
            if (m.cilindrada) cc.add(m.cilindrada)
            for (const n of cilindradasEn(m.nombre_completo)) cc.add(n)
        }

        // Alguna de las candidatas SÍ es una de nuestras bases: es (o puede
        // ser) una moto nuestra y el camino de siempre sigue abierto. Cuál de
        // todas tiene lo decide `consultar_compatibilidad`, no este atajo.
        if ([...cc].some((n) => bases.has(n))) return null

        // El cliente dio una cilindrada que SÍ potenciamos y el resolvedor lo
        // llevó a modelos de otra ("una eco 110" cae en la familia de la Eco 70
        // y la Econo 80, ninguna de 110). Manda lo que dijo él: no se le puede
        // contestar —ni informar al equipo— sobre un motor que no nombró.
        const ccDichas = cilindradasEn(`${nombreMoto} ${opciones.mensaje || ""}`)
        if (ccDichas.some((n) => bases.has(n))) return null

        if (cc.size > 0) {
            // Última puerta antes de cortar: si el equipo cargó UNA fila de
            // compatibilidad para ese modelo, hay camino y no somos nosotros
            // quienes lo cerramos — compat sabe más que este atajo.
            //
            // Es la red contra el único modo en que este guard puede
            // equivocarse: un kit cargado sin declarar `cilindradas_base`. Ahí
            // la moto quedaría "fuera" de un catálogo que sí la cubre, y las
            // filas de compat son la prueba de que la cubre.
            if (await tieneCompatibilidadCargada(resol?.modelo)) return null

            const menor = Math.min(...cc)
            return { cilindrada: menor, origen: `su moto es una ${nombreMoto} (${menor}cc)` }
        }
        // No resolvió a nada: todavía no hay dato, pero el mensaje puede
        // tenerlo. Sigue a los puntos 3 y 4.
    }

    // 3. La cilindrada sola, sin marca ("tengo una 70"). Mismo detector que usa
    //    el motor para tratarla como una moto en juego.
    const sola = cilindradaSinMarca(opciones.mensaje || "")
    if (sola) {
        const n = cilindradasEn(sola)[0]
        if (n != null && !bases.has(n)) return { cilindrada: n, origen: `dijo que tiene una ${sola}` }
    }

    // 4. Una MARCA conocida con una cilindrada que no es ninguna de las
    //    nuestras, sin que la moto resuelva: "tengo una motomel eco 70". El
    //    modelo exacto no lo tenemos cargado —y cuando se cargue, el punto 2 lo
    //    agarra mejor—, pero la marca alcanza para saber que está hablando de
    //    SU moto y no de una cadena de 84 eslabones.
    //
    //    Se exige la marca justamente por eso: sin ella, cualquier número raro
    //    del mensaje (eslabones, milímetros, kilómetros) se leería como un motor
    //    que no potenciamos.
    const norm = normalizarTexto(opciones.mensaje || "")
    const tokens = norm.split(" ").filter(Boolean)
    if (tokens.some((t) => MARCAS_MOTO.has(t))) {
        const delMensaje = cilindradasEn(norm)
        if (delMensaje.length > 0 && delMensaje.every((n) => !bases.has(n))) {
            return {
                cilindrada: delMensaje[0],
                origen: `nombró una moto de ${delMensaje[0]}cc que no tenemos cargada ("${norm.slice(0, 60)}")`
            }
        }
    }

    return null
}

/**
 * ¿Hay alguna fila de compatibilidad cargada para ESE modelo?
 *
 * No dice si le va o no le va —eso lo resuelve `consultar_compatibilidad` con
 * todo su criterio—: dice si el equipo ya opinó alguna vez sobre esa moto. Con
 * una sola fila, el atajo de acá se corre y deja pasar la consulta.
 *
 * Se compara contra el MODELO resuelto ("Eco 70"), nunca contra el texto que
 * escribió el cliente. El pozo de compat tiene 139 nombres escritos a mano y
 * entre ellos hay marcas solas ("motomel", "gilera", "keller"): con el texto
 * crudo, "tengo una motomel eco 70" matcheaba la fila "motomel" y el guard se
 * abstenía justo donde tenía que cortar.
 */
async function tieneCompatibilidadCargada(
    modelo: { modelo?: string | null; nombre_completo?: string | null } | null | undefined
): Promise<boolean> {
    const mod = normalizarTexto(modelo?.modelo || "")
    const completo = normalizarTexto(modelo?.nombre_completo || "")
    if (!mod && !completo) return false

    try {
        const filas = await prisma.$queryRaw<{ modelo_moto: string | null }[]>`
            SELECT modelo_moto FROM chat_combo_compatibilidad
            UNION ALL
            SELECT modelo_moto FROM chat_articulo_compatibilidad
            UNION ALL
            SELECT modelo_moto FROM compatibilidades
        `
        return filas.some((f) => {
            const m = normalizarTexto(f.modelo_moto || "")
            if (!m) return false
            if (m === completo || m === mod) return true
            // Una fila más específica que el modelo ("zanella zr 150 2022") o al
            // revés ("eco 70" dentro de "motomel eco 70"): sigue siendo la misma
            // moto. La marca sola no entra: ni incluye al modelo ni la incluye.
            return Boolean(mod) && (m.includes(mod) || mod.includes(m))
        })
    } catch {
        // Sin poder mirarlo, se prefiere NO cortar: el guard se abstiene.
        return true
    }
}
