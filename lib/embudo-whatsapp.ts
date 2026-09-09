


import { prisma } from "@/lib/prisma"

/**
 * EMBUDO DE WHATSAPP POR KIT (pestaña de /admin/instagram)
 * -------------------------------------------------------
 * De dónde sale: de lo que el motor del bot YA venía guardando en
 * `bot_agente_turnos_reales` (un turno por ráfaga del cliente, con el jsonb
 * `herramientas` adentro). No hay instrumentación nueva ni tabla nueva.
 *
 * La pregunta que contesta: por cada kit del catálogo, cuántas consultas entran
 * y en qué punto se apagan. "Se corta al mandarle la primera respuesta" y "se
 * corta cuando no hay compatibilidad" son dos etapas distintas del corte, no
 * una sola bolsa de perdidos.
 *
 * Límites conocidos (a la vista en la UI, para no leer de más estos números):
 *  - La serie arranca cuando arrancó el motor en vivo (07/09/2026). No hay
 *    historia anterior.
 *  - Las respuestas escritas a mano por el equipo NO dejan turno: en las charlas
 *    que siguió un humano, "el cliente no volvió" mide el tramo del bot.
 *  - El kit solo se conoce si vino por anuncio (plantilla/referral), si el
 *    catálogo devolvió un único candidato o si quedó pineado en el estado de la
 *    conversación. El resto cae en "Sin kit identificado".
 */

/** Cuánto silencio hace falta para dar una conversación por cortada. */
const HORAS_PARA_DAR_POR_CORTADA = 12

export type EtapaCorte =
    | "en_curso"
    | "sin_respuesta"
    | "tras_primera_respuesta"
    | "sin_avance"
    | "tras_precio"
    | "incompatible"
    | "tras_variante"
    | "tras_escalado"

export interface ConversacionEmbudo {
    conversationId: number
    kitClave: string
    kitNombre: string
    /** De dónde salió la atribución del kit. */
    origenKit: "anuncio" | "catalogo" | "estado" | "ninguno"
    nombre: string
    telefono: string
    primerTurno: string
    ultimoTurno: string
    turnosCliente: number
    huboRespuesta: boolean
    volvio: boolean
    cotizado: boolean
    compatConsultada: boolean
    compatOk: boolean
    compatNo: boolean
    varianteResuelta: boolean
    escalado: boolean
    motivoEscalado: string | null
    corte: EtapaCorte
    ultimoMensajeCliente: string
}

export interface FilaEmbudoKit {
    kitClave: string
    kitNombre: string
    entradas: number
    conRespuesta: number
    volvieron: number
    cotizadas: number
    compatConsultada: number
    compatOk: number
    compatNo: number
    variantes: number
    escaladas: number
    cortes: Record<EtapaCorte, number>
    /** Ventas del kit en el período por el punto de venta Instagram. */
    ventasInstagram: number
    montoInstagram: number
    /** Las mismas ventas contando todos los canales (mostrador, ML, mayorista). */
    ventasTodoCanal: number
}

/** Ventas de un kit en el período, ya separadas por canal. */
export interface VentasKit {
    ventasInstagram: number
    montoInstagram: number
    ventasTodoCanal: number
}

export interface EmbudoWhatsapp {
    desde: string | null
    hasta: string | null
    dias: number
    totalConversaciones: number
    filas: FilaEmbudoKit[]
    escaladosPorMotivo: { motivo: string; n: number }[]
    conversaciones: ConversacionEmbudo[]
    horasParaCorte: number
}

type TurnoCrudo = {
    conversation_id: bigint | number
    creado_en: Date
    mensaje_cliente: string | null
    hubo_respuesta: boolean
    escalado_humano: boolean
    motivo_escalado: string | null
    plantilla: { id?: number; tipo?: string; nombre?: string } | null
    catalogo: { g: { id: number; nombre: string }[] | null; p: { id: number; nombre: string }[] | null } | null
    compat: (boolean | null)[] | null
    variante_resuelta: boolean
}

const CORTES_VACIOS = (): Record<EtapaCorte, number> => ({
    en_curso: 0,
    sin_respuesta: 0,
    tras_primera_respuesta: 0,
    sin_avance: 0,
    tras_precio: 0,
    incompatible: 0,
    tras_variante: 0,
    tras_escalado: 0,
})

const SIN_KIT = "sin_kit"

/**
 * El motivo llega tal cual lo escribió el modelo y a veces trae la moto pegada
 * ("moto_no_registrada: Mondial 110 2017"). Para contar, sirve la familia.
 */
function familiaMotivo(motivo: string | null): string {
    if (!motivo) return "sin_motivo"
    return motivo.split(":")[0].trim().toLowerCase() || "sin_motivo"
}

/**
 * Ventas de cada kit del catálogo del chat, reconstruidas desde las ventas de
 * mostrador.
 *
 * Por qué hace falta reconstruirlas: los kits del chat NO se facturan como un
 * artículo único. El vendedor carga los componentes sueltos (cilindro + codo +
 * filtro + carburador), así que no hay una línea de venta que diga "Kit 120".
 * El puente es `chat_articulos.articulo_mostrador_id`, que ya está cargado para
 * los 15 artículos del catálogo del chat.
 *
 * Criterio: una venta cuenta para un kit cuando incluye TODOS los componentes
 * de ese kit. Con "al menos uno" cualquier venta de un cilindro suelto contaría
 * como kit y los números se irían al doble o al triple.
 *
 * OJO — esto NO está atribuido a las conversaciones: la venta de mostrador casi
 * nunca trae el teléfono cargado (en 15 días, 24 de 622), así que no se puede
 * decir "esta charla terminó en esta venta". Es el total del kit en el período,
 * para poner al lado de las consultas, no un cierre del embudo.
 */
export async function calcularVentasPorKit(desdeFecha: Date): Promise<Map<string, VentasKit>> {
    const filas = await prisma.$queryRaw<
        { pack_id: number; grupo_id: number | null; venta_id: string; monto: number; canal: string }[]
    >`
        WITH comps AS (
            SELECT p.id AS pack_id, p.grupo_id, a.articulo_mostrador_id AS art
            FROM chat_packs p
            JOIN chat_pack_articulos pa ON pa.pack_id = p.id
            JOIN chat_articulos a ON a.id = pa.articulo_id
            WHERE a.articulo_mostrador_id IS NOT NULL
        ),
        requeridos AS (
            SELECT pack_id, grupo_id, count(DISTINCT art)::int AS n FROM comps GROUP BY 1, 2
        ),
        candidatas AS (
            SELECT c.pack_id,
                   v.id AS venta_id,
                   count(DISTINCT c.art)::int AS tiene,
                   sum(i.subtotal)::float AS monto,
                   COALESCE(max(pv.nombre), '') AS canal
            FROM comps c
            JOIN ventas_mostrador_items i ON i."productoId" = c.art
            JOIN ventas_mostrador v ON v.id = i."ventaId"
            LEFT JOIN puntos_venta pv ON pv.id = v."puntoVentaId"
            WHERE v."createdAt" >= ${desdeFecha}
              AND COALESCE(v."tipoVenta", '') <> 'PEDIDO'
              AND COALESCE(v."estadoPedido", '') <> 'CANCELADO'
            GROUP BY 1, 2
        )
        SELECT r.pack_id, r.grupo_id, c.venta_id, c.monto, c.canal
        FROM requeridos r
        JOIN candidatas c ON c.pack_id = r.pack_id AND c.tiene = r.n
    `

    // Una venta puede completar dos variantes del mismo grupo (comparten
    // componentes): a nivel grupo se cuenta la venta una sola vez.
    const ventasPorClave = new Map<string, Map<string, { monto: number; canal: string }>>()
    const anotar = (clave: string, ventaId: string, monto: number, canal: string) => {
        let ventas = ventasPorClave.get(clave)
        if (!ventas) {
            ventas = new Map()
            ventasPorClave.set(clave, ventas)
        }
        const previo = ventas.get(ventaId)
        // Si ya estaba (otra variante del grupo), nos quedamos con el monto mayor.
        if (!previo || monto > previo.monto) ventas.set(ventaId, { monto, canal })
    }

    for (const f of filas) {
        anotar(`pack:${f.pack_id}`, f.venta_id, f.monto || 0, f.canal)
        if (f.grupo_id) anotar(`grupo:${f.grupo_id}`, f.venta_id, f.monto || 0, f.canal)
    }

    const salida = new Map<string, VentasKit>()
    for (const [clave, ventas] of ventasPorClave) {
        let ventasInstagram = 0
        let montoInstagram = 0
        for (const v of ventas.values()) {
            if (v.canal.toLowerCase().includes("insta")) {
                ventasInstagram++
                montoInstagram += v.monto
            }
        }
        salida.set(clave, {
            ventasInstagram,
            montoInstagram: Math.round(montoInstagram),
            ventasTodoCanal: ventas.size,
        })
    }
    return salida
}

export async function calcularEmbudoWhatsapp(dias = 15): Promise<EmbudoWhatsapp> {


    const desdeFecha = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

    // Extraemos del jsonb solo lo que hace falta. Traer `herramientas` entero
    // serían megabytes de fichas de catálogo por cada turno.
    const turnos = await prisma.$queryRaw<TurnoCrudo[]>`
        SELECT
            t.conversation_id,
            t.creado_en,
            t.mensaje_cliente,
            (t.respuesta_bot IS NOT NULL AND t.resultado_envio IN ('enviado', 'encolado')) AS hubo_respuesta,
            t.escalado_humano,
            t.motivo_escalado,
            (
                SELECT h->'argumentos'
                FROM jsonb_array_elements(t.herramientas) h
                WHERE h->>'nombre' = 'match_plantilla_publicidad'
                  AND (h->'resultado'->>'match_directo')::boolean IS TRUE
                LIMIT 1
            ) AS plantilla,
            (
                SELECT jsonb_build_object(
                    'g', (SELECT jsonb_agg(jsonb_build_object('id', g->'id', 'nombre', g->'nombre'))
                          FROM jsonb_array_elements(COALESCE(h->'resultado'->'grupos', '[]'::jsonb)) g),
                    'p', (SELECT jsonb_agg(jsonb_build_object('id', p->'id', 'nombre', p->'nombre'))
                          FROM jsonb_array_elements(COALESCE(h->'resultado'->'packs', '[]'::jsonb)) p)
                )
                FROM jsonb_array_elements(t.herramientas) h
                WHERE h->>'nombre' = 'consultar_catalogo_y_precios'
                LIMIT 1
            ) AS catalogo,
            (
                SELECT jsonb_agg(h->'resultado'->'compatible')
                FROM jsonb_array_elements(t.herramientas) h
                WHERE h->>'nombre' = 'consultar_compatibilidad'
                  AND (h->'resultado'->>'encontrado')::boolean IS TRUE
            ) AS compat,
            EXISTS (
                SELECT 1 FROM jsonb_array_elements(t.herramientas) h
                WHERE h->>'nombre' = 'resolver_variante' AND (h->'resultado'->>'resuelta')::boolean IS TRUE
            ) AS variante_resuelta
        FROM bot_agente_turnos_reales t
        WHERE t.creado_en >= ${desdeFecha}
        ORDER BY t.conversation_id, t.creado_en ASC
    `

    if (turnos.length === 0) {
        return {
            desde: null,
            hasta: null,
            dias,
            totalConversaciones: 0,
            filas: [],
            escaladosPorMotivo: [],
            conversaciones: [],
            horasParaCorte: HORAS_PARA_DAR_POR_CORTADA,
        }
    }

    const ids = Array.from(new Set(turnos.map((t) => Number(t.conversation_id))))

    // Kit que quedó pineado en la conversación: la tercera fuente de atribución,
    // para las charlas que no vinieron por anuncio ni tuvieron un catálogo de un
    // solo candidato.
    const estados = await prisma.$queryRaw<
        {
            clave: string
            grupo_pineado_id: number | null
            grupo_pineado_nombre: string | null
            pack_presentado_id: number | null
            pack_presentado_nombre: string | null
        }[]
    >`
        SELECT clave, grupo_pineado_id, grupo_pineado_nombre, pack_presentado_id, pack_presentado_nombre
        FROM chat_conversacion_estado
        WHERE clave = ANY(${ids.map(String)}::text[])
    `
    const estadoPorConv = new Map(estados.map((e) => [e.clave, e]))

    const espejo = await prisma.$queryRaw<{ id: bigint; nombre: string; telefono: string }[]>`
        SELECT id, nombre, telefono FROM chatwoot_conversaciones_espejo WHERE id = ANY(${ids}::bigint[])
    `
    const espejoPorConv = new Map(espejo.map((e) => [Number(e.id), e]))

    // --- Agregación por conversación ---
    const porConv = new Map<number, TurnoCrudo[]>()
    for (const t of turnos) {
        const id = Number(t.conversation_id)
        const lista = porConv.get(id)
        if (lista) lista.push(t)
        else porConv.set(id, [t])
    }

    const limiteCorte = Date.now() - HORAS_PARA_DAR_POR_CORTADA * 60 * 60 * 1000
    const conversaciones: ConversacionEmbudo[] = []

    for (const [conversationId, lista] of porConv) {
        let kitClave = ""
        let kitNombre = ""
        let origenKit: ConversacionEmbudo["origenKit"] = "ninguno"

        // 1) El kit del anuncio (referral de Meta) es la atribución más fuerte:
        //    es literalmente "por qué kit vino el cliente".
        for (const t of lista) {
            const p = t.plantilla
            if (p?.id && p?.tipo) {
                kitClave = `${p.tipo}:${p.id}`
                kitNombre = p.nombre || kitClave
                origenKit = "anuncio"
                break
            }
        }

        // 2) Si no vino por anuncio: el primer catálogo que devolvió un único
        //    candidato. Con dos o más no se sabe cuál miraba el cliente.
        if (!kitClave) {
            for (const t of lista) {
                const grupos = t.catalogo?.g || []
                const packs = t.catalogo?.p || []
                if (grupos.length + packs.length !== 1) continue
                const unico = grupos[0] || packs[0]
                kitClave = `${grupos.length === 1 ? "grupo" : "pack"}:${unico.id}`
                kitNombre = unico.nombre
                origenKit = "catalogo"
                break
            }
        }

        // 3) Último recurso: lo que quedó pineado en el estado de la charla.
        if (!kitClave) {
            const e = estadoPorConv.get(String(conversationId))
            if (e?.grupo_pineado_id) {
                kitClave = `grupo:${e.grupo_pineado_id}`
                kitNombre = e.grupo_pineado_nombre || kitClave
                origenKit = "estado"
            } else if (e?.pack_presentado_id) {
                kitClave = `pack:${e.pack_presentado_id}`
                kitNombre = e.pack_presentado_nombre || kitClave
                origenKit = "estado"
            }
        }

        if (!kitClave) {
            kitClave = SIN_KIT
            kitNombre = "Sin kit identificado"
        }

        const turnosCliente = lista.filter((t) => (t.mensaje_cliente || "").trim().length > 0)
        const idxPrimeraRespuesta = lista.findIndex((t) => t.hubo_respuesta)
        const huboRespuesta = idxPrimeraRespuesta >= 0

        // "Volvió" = escribió algo DESPUÉS de que le llegara la primera
        // respuesta. Es el corte que interesa: la ficha salió y no contestó.
        const volvio =
            huboRespuesta &&
            lista.slice(idxPrimeraRespuesta + 1).some((t) => (t.mensaje_cliente || "").trim().length > 0)

        const cotizado = lista.some((t) => (t.catalogo?.g?.length || 0) + (t.catalogo?.p?.length || 0) > 0)
        const compatValores = (lista.flatMap((t) => t.compat || []).filter((c) => c !== null) as boolean[])
        const compatConsultada = compatValores.length > 0
        const compatOk = compatValores.some((c) => c === true)
        const compatNo = compatValores.length > 0 && compatValores.every((c) => c === false)
        const varianteResuelta = lista.some((t) => t.variante_resuelta)

        const turnoEscalado = [...lista].reverse().find((t) => t.escalado_humano)
        const escalado = Boolean(turnoEscalado)

        const ultimo = lista[lista.length - 1]
        const activa = new Date(ultimo.creado_en).getTime() > limiteCorte

        // Orden de prioridad: primero lo que sigue vivo, después las salidas
        // laterales (equipo / incompatibilidad) y recién ahí la etapa más
        // avanzada que alcanzó la charla.
        let corte: EtapaCorte
        if (activa) corte = "en_curso"
        else if (escalado) corte = "tras_escalado"
        else if (compatNo) corte = "incompatible"
        else if (varianteResuelta) corte = "tras_variante"
        else if (cotizado) corte = "tras_precio"
        else if (!huboRespuesta) corte = "sin_respuesta"
        else if (volvio) corte = "sin_avance"
        else corte = "tras_primera_respuesta"

        conversaciones.push({
            conversationId,
            kitClave,
            kitNombre,
            origenKit,
            nombre: espejoPorConv.get(conversationId)?.nombre || "",
            telefono: espejoPorConv.get(conversationId)?.telefono || "",
            primerTurno: new Date(lista[0].creado_en).toISOString(),
            ultimoTurno: new Date(ultimo.creado_en).toISOString(),
            turnosCliente: turnosCliente.length,
            huboRespuesta,
            volvio,
            cotizado,
            compatConsultada,
            compatOk,
            compatNo,
            varianteResuelta,
            escalado,
            motivoEscalado: turnoEscalado?.motivo_escalado || null,
            corte,
            ultimoMensajeCliente: (turnosCliente[turnosCliente.length - 1]?.mensaje_cliente || "").slice(0, 180),
        })
    }

    // --- Agregación por kit ---
    const filasPorKit = new Map<string, FilaEmbudoKit>()
    for (const c of conversaciones) {
        let fila = filasPorKit.get(c.kitClave)
        if (!fila) {
            fila = {
                kitClave: c.kitClave,
                kitNombre: c.kitNombre,
                entradas: 0,
                conRespuesta: 0,
                volvieron: 0,
                cotizadas: 0,
                compatConsultada: 0,
                compatOk: 0,
                compatNo: 0,
                variantes: 0,
                escaladas: 0,
                cortes: CORTES_VACIOS(),
                ventasInstagram: 0,
                montoInstagram: 0,
                ventasTodoCanal: 0,
            }
            filasPorKit.set(c.kitClave, fila)
        }
        fila.entradas++
        if (c.huboRespuesta) fila.conRespuesta++
        if (c.volvio) fila.volvieron++
        if (c.cotizado) fila.cotizadas++
        if (c.compatConsultada) fila.compatConsultada++
        if (c.compatOk) fila.compatOk++
        if (c.compatNo) fila.compatNo++
        if (c.varianteResuelta) fila.variantes++
        if (c.escalado) fila.escaladas++
        fila.cortes[c.corte]++
    }

    // Ventas del período pegadas a cada kit. Se cuentan desde el PRIMER turno
    // que hay en la ventana, no desde `dias`: el bot está en vivo hace poco y,
    // si no, se compararían 15 días de ventas contra 3 de consultas.
    const desdeTurnos = new Date(Math.min(...turnos.map((t) => new Date(t.creado_en).getTime())))
    const ventasPorKit = await calcularVentasPorKit(desdeTurnos).catch(() => new Map<string, VentasKit>())
    for (const fila of filasPorKit.values()) {
        const v = ventasPorKit.get(fila.kitClave)
        if (!v) continue
        fila.ventasInstagram = v.ventasInstagram
        fila.montoInstagram = v.montoInstagram
        fila.ventasTodoCanal = v.ventasTodoCanal
    }

    const filas = Array.from(filasPorKit.values()).sort((a, b) => {
        // "Sin kit" siempre al final: es el cajón de lo no atribuible, no un kit.
        if (a.kitClave === SIN_KIT) return 1
        if (b.kitClave === SIN_KIT) return -1
        return b.entradas - a.entradas
    })

    const motivos = new Map<string, number>()
    for (const c of conversaciones) {
        if (!c.escalado) continue
        const clave = familiaMotivo(c.motivoEscalado)
        motivos.set(clave, (motivos.get(clave) || 0) + 1)
    }

    const fechas = turnos.map((t) => new Date(t.creado_en).getTime())

    return {
        desde: new Date(Math.min(...fechas)).toISOString(),
        hasta: new Date(Math.max(...fechas)).toISOString(),
        dias,
        totalConversaciones: conversaciones.length,
        filas,
        escaladosPorMotivo: Array.from(motivos.entries())
            .map(([motivo, n]) => ({ motivo, n }))
            .sort((a, b) => b.n - a.n),
        conversaciones: conversaciones.sort(
            (a, b) => new Date(b.ultimoTurno).getTime() - new Date(a.ultimoTurno).getTime()
        ),
        horasParaCorte: HORAS_PARA_DAR_POR_CORTADA,
    }
}
