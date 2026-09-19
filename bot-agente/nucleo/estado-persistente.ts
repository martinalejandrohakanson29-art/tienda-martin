import { prisma } from "@/lib/prisma"
import { formatearPrecioAR, normalizarTexto } from "./texto"

/**
 * ESTADO PERSISTENTE DEL EMBUDO (memoria explícita, agnóstica al eje de variante)
 * -----------------------------------------------------------------------------
 * Antes: se intentaba adivinar del historial (regex "corto o largo") qué quedaba
 * resuelto. Se rompía en cuanto el eje cambiaba (color, mm...).
 *
 * Ahora: el motor guarda en `chat_conversacion_estado`, al final de cada turno,
 * lo que efectivamente resolvieron las herramientas:
 *   - combo pineado (consultar_catalogo_y_precios devolvió 1 solo grupo)
 *   - variante resuelta (resolver_variante devolvió `resuelta: true`)
 *   - moto confirmada (consultar_compatibilidad devolvió compatible)
 * y lo lee al empezar el siguiente turno para armar el bloque MEMORIA DE ESTADO.
 *
 * Degradación: si la tabla no existe todavía o no hay `clave`, todo es no-op y
 * el bot funciona igual (sin memoria persistente).
 */

export interface EstadoConversacion {
    grupoPineado?: { id: number; nombre: string } | null
    varianteResuelta?: { packId: number; etiqueta: string; precio: number } | null
    motoConfirmada?: string | null
    /**
     * Moto que el cliente NOMBRÓ en esta charla, haya pasado o no por
     * `consultar_compatibilidad`. No es lo mismo que `motoConfirmada`: esa dice
     * "ya sabemos que le entra", esta solo dice "el cliente tiene una de estas".
     *
     * Conv 4206 (15/09): el cliente dijo "Una 110 DLX" y preguntó otra cosa en
     * el turno siguiente. Los dos controles que impiden afirmar sobre la moto
     * del cliente —el aviso de `catalogo-precios.ts` y el BACKSTOP DE LA MOTO
     * del motor— miran SOLO el mensaje del turno actual, así que ninguno la vio
     * y el bot ofreció "para la 110 DLX" el kit dakar 200 y el 220.
     *
     * A diferencia del resto del embudo, este dato NO se revierte cuando un
     * turno se descarta (ver `EntregaRevertible`): lo puso el cliente, no es
     * una afirmación nuestra de "esto ya se lo dijiste".
     */
    motoMencionada?: string | null
    /**
     * Pack SUELTO (kit sin grupo de variantes) que ya se le presentó al cliente
     * con su ficha y su foto. Evita repetir la bienvenida y reenviar la imagen
     * en los turnos siguientes. Equivalente a `grupoPineado` pero para packs.
     */
    packPresentado?: { id: number; nombre: string; precio: number } | null
    /**
     * Temas de negocio (`info_negocio.tema`) que YA se le contestaron al cliente
     * en esta conversación: "envios", "ubicacion", "medios de pago"...
     *
     * Es el antídoto contra el volcado repetido: `consultar_info_negocio` devolvía
     * el bloque oficial entero en cada turno sin saber si ya se había dicho, y el
     * modelo lo re-emitía porque la guía de la herramienta le gana a la regla de
     * "no repitas" del prompt. Con esta lista la herramienta cambia su guía y el
     * bloque MEMORIA DE ESTADO lo recuerda.
     */
    temasRespondidos?: string[]
    /**
     * Consulta que YA se derivó al equipo y sigue esperando respuesta humana.
     * Se limpia sola cuando un humano del equipo contesta en el chat.
     *
     * Antes no quedaba rastro del escalado: el turno siguiente arrancaba en
     * blanco y el bot hablaba por encima de una consulta que él mismo había
     * derivado (conv 3637, 08/09: escaló el escape para varillero S2, el
     * cliente insistió con "??" y contestó sobre otro kit).
     */
    escaladoPendiente?: { motivo: string; resumen: string; en: string } | null
    /**
     * Negativa de compatibilidad que YA se le dio al cliente en esta charla.
     *
     * Las herramientas de compat no tienen memoria: miran "moto + kit" y
     * devuelven el veredicto de la fila, y la guía le ordena al modelo copiar
     * la línea tal cual. Sin este rastro el cliente podía decir cualquier cosa
     * ("ya lo tengo modificado", "no importa, lo compro igual") y recibía la
     * MISMA negativa palabra por palabra (conv 3874, Wave NF).
     */
    negativaEntregada?: { moto: string; kit: string; detalle: string; en: string } | null
    /**
     * Cuántas veces ya se le repreguntó la moto al cliente en esta charla.
     *
     * El bot puede preguntar "cuál Gilera tenés?" cuando el cliente dio solo la
     * marca, pero no puede vivir preguntando: pasado `TOPE_REPREGUNTAS_MOTO` la
     * consulta se deriva al equipo. Sin este contador la repregunta no tendría
     * freno, que es el riesgo que trae permitirla (conv 3947).
     */
    repreguntasMoto?: number
    /**
     * El bot le preguntó al cliente CUÁL de varios kits busca y todavía no
     * eligió. Los candidatos van como "grupo:3"/"pack:7".
     *
     * Conv 4499 (18/09): el cliente clickeó dos anuncios, el bot le preguntó en
     * cuál estaba interesado y él contestó "En el kit 120 / el que trae el
     * cilindro carburador y escape". Esa respuesta llegó con el referral de un
     * TERCER aviso pegado por Meta, y la guarda de "entró por el anuncio y pide
     * otra medida" (conv 4386) leyó el 120 como un producto ajeno al aviso:
     * silencio total y a la bandeja, con la ficha de ese combo cargada.
     *
     * Mientras la elección siga abierta, un aviso que el cliente NO escribió no
     * decide el turno: lo que escribió es la respuesta a nuestra pregunta.
     */
    eleccionPendiente?: { candidatos: string[]; en: string } | null
    /**
     * Cuándo se escribió por última vez este estado, o sea cuándo fue el último
     * turno de la charla. Es de SOLO LECTURA (lo pone la base en cada guardado):
     * sirve para saber si lo que hay acá adentro es de la charla de ahora o de
     * una anterior — ver `esCharlaNueva`.
     */
    ultimoTurnoEn?: string | null
}

/**
 * Silencio a partir del cual lo anterior se considera otra charla (el cliente
 * volvió a los días). Mismo umbral con el que `armarHistorialPrevio`
 * (`lib/bot-agente-tiempo-real.ts`) corta el historial: si ahí el tramo viejo se
 * marca como "charla anterior", acá la memoria de ese tramo tampoco puede
 * pasar por memoria de hoy.
 */
export const GAP_NUEVA_SESION_MS = 6 * 60 * 60 * 1000

/**
 * ¿El cliente está volviendo después de un silencio largo? Entonces lo que dice
 * la memoria de ENTREGA ("esto ya se lo mostraste") es de otra charla.
 *
 * Conv 3726 (16/09): el 09/09 entró por el anuncio del Kit 170, recibió la ficha
 * y dijo "te confirmo esta semana". El 16/09 volvió a clickear el MISMO anuncio
 * y, como `packPresentado` seguía puesto, la bienvenida oficial no salió y el
 * bot le contestó "Para la Sapucai 150 ya te confirmé que entra... decime qué
 * dato puntual querés saber": un cliente que entra de cero por una publicidad se
 * quedó sin precio y con un reproche.
 */
export function esCharlaNueva(estado: EstadoConversacion): boolean {
    if (!estado.ultimoTurnoEn) return false
    return Date.now() - new Date(estado.ultimoTurnoEn).getTime() > GAP_NUEVA_SESION_MS
}

const VACIO: EstadoConversacion = {}

/**
 * Un escalado deja de pesar en la memoria pasado un dia: si el equipo nunca
 * contesto en el chat (lo resolvio por afuera, el cliente cambio de tema),
 * no queremos que el bot siga mudo para siempre por una consulta de anteayer.
 */
const ESCALADO_PENDIENTE_VIGENCIA_MS = 24 * 60 * 60 * 1000

/**
 * La negativa pesa una semana. Es más que el escalado a propósito: el cliente
 * que se va a mandar a alesar el motor vuelve a los días, y volver a recibir el
 * "no le va" cuando escribe de nuevo es justo el destrato que evitamos.
 */
const NEGATIVA_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

/**
 * La elección abierta dura lo que dura la charla: el cliente que vuelve a los
 * días no está contestando la pregunta de la semana pasada.
 */
const ELECCION_PENDIENTE_VIGENCIA_MS = GAP_NUEVA_SESION_MS

/** Clave canónica de un tema para comparar sin duplicar por mayúsculas/acentos. */
export function normalizarTema(tema: string): string {
    return normalizarTexto(tema)
}

/** Une temas sin duplicados, preservando el orden en que se fueron respondiendo. */
export function unirTemas(previos: string[] | null | undefined, nuevos: string[]): string[] {
    const salida: string[] = []
    const vistos = new Set<string>()
    for (const t of [...(previos || []), ...nuevos]) {
        const clave = normalizarTema(t)
        if (!clave || vistos.has(clave)) continue
        vistos.add(clave)
        salida.push(clave)
    }
    return salida
}

function vigente(en: Date | null, ventanaMs: number): boolean {
    if (!en) return false
    return Date.now() - new Date(en).getTime() < ventanaMs
}

function escaladoVigente(en: Date | null): boolean {
    return vigente(en, ESCALADO_PENDIENTE_VIGENCIA_MS)
}

export async function cargarEstadoConversacion(clave?: string): Promise<EstadoConversacion> {
    if (!clave) return { ...VACIO }
    try {
        const filas = await prisma.$queryRaw<
            {
                grupo_pineado_id: number | null
                grupo_pineado_nombre: string | null
                variante_pack_id: number | null
                variante_etiqueta: string | null
                variante_precio: any
                moto_confirmada: string | null
                moto_mencionada: string | null
                actualizado_en: Date | null
                pack_presentado_id: number | null
                pack_presentado_nombre: string | null
                pack_presentado_precio: any
                temas_respondidos: string[] | null
                escalado_pendiente_motivo: string | null
                escalado_pendiente_resumen: string | null
                escalado_pendiente_en: Date | null
                negativa_moto: string | null
                negativa_kit: string | null
                negativa_detalle: string | null
                negativa_en: Date | null
                repreguntas_moto: number | null
                eleccion_pendiente_candidatos: string[] | null
                eleccion_pendiente_en: Date | null
            }[]
        >`
            SELECT grupo_pineado_id, grupo_pineado_nombre, variante_pack_id,
                   variante_etiqueta, variante_precio, moto_confirmada, moto_mencionada, actualizado_en,
                   pack_presentado_id, pack_presentado_nombre, pack_presentado_precio,
                   COALESCE(temas_respondidos, '{}') AS temas_respondidos,
                   escalado_pendiente_motivo, escalado_pendiente_resumen, escalado_pendiente_en,
                   negativa_moto, negativa_kit, negativa_detalle, negativa_en,
                   COALESCE(repreguntas_moto, 0) AS repreguntas_moto,
                   eleccion_pendiente_candidatos, eleccion_pendiente_en
            FROM chat_conversacion_estado
            WHERE clave = ${clave}
            LIMIT 1
        `
        const f = filas?.[0]
        if (!f) return { ...VACIO }

        return {
            grupoPineado: f.grupo_pineado_id
                ? { id: f.grupo_pineado_id, nombre: f.grupo_pineado_nombre || "" }
                : null,
            varianteResuelta: f.variante_pack_id
                ? {
                      packId: f.variante_pack_id,
                      etiqueta: f.variante_etiqueta || "",
                      precio: Number(f.variante_precio) || 0
                  }
                : null,
            motoConfirmada: f.moto_confirmada || null,
            motoMencionada: f.moto_mencionada || null,
            ultimoTurnoEn: f.actualizado_en ? new Date(f.actualizado_en).toISOString() : null,
            packPresentado: f.pack_presentado_id
                ? {
                      id: f.pack_presentado_id,
                      nombre: f.pack_presentado_nombre || "",
                      precio: Number(f.pack_presentado_precio) || 0
                  }
                : null,
            temasRespondidos: f.temas_respondidos || [],
            escaladoPendiente: escaladoVigente(f.escalado_pendiente_en)
                ? {
                      motivo: f.escalado_pendiente_motivo || "otro",
                      resumen: f.escalado_pendiente_resumen || "",
                      en: (f.escalado_pendiente_en || new Date()).toISOString()
                  }
                : null,
            repreguntasMoto: Number(f.repreguntas_moto) || 0,
            eleccionPendiente: vigente(f.eleccion_pendiente_en, ELECCION_PENDIENTE_VIGENCIA_MS)
                ? {
                      candidatos: f.eleccion_pendiente_candidatos || [],
                      en: (f.eleccion_pendiente_en || new Date()).toISOString()
                  }
                : null,
            negativaEntregada:
                f.negativa_moto && vigente(f.negativa_en, NEGATIVA_VIGENCIA_MS)
                    ? {
                          moto: f.negativa_moto,
                          kit: f.negativa_kit || "",
                          detalle: f.negativa_detalle || "",
                          en: (f.negativa_en || new Date()).toISOString()
                      }
                    : null
        }
    } catch (err) {
        console.warn("[estado] no se pudo leer chat_conversacion_estado:", (err as any)?.message)
        return { ...VACIO }
    }
}

/**
 * MEMORIA DE ENTREGA: los campos del estado que no son un dato aprendido sino
 * una afirmacion sobre el cliente — "esto YA lo vio".
 *
 * El motor los escribe cuando termina de redactar el turno, pero el turno
 * todavia puede no salir: llega otro mensaje del cliente durante la demora de
 * cadencia humana, contesta un humano, se cae el envio a Chatwoot. Ahi la
 * memoria queda mintiendo, y la mentira es cara: el turno siguiente lee "ya se
 * lo dijiste" y el bot se calla para siempre sobre algo que el cliente nunca
 * leyo.
 *
 * Conv 3964 (11/09, Crypton 105): el motor resolvio bien la incompatibilidad y
 * redacto la negativa, pero el cliente escribio "Ahi q agrandar algo?" durante
 * la demora y el turno se descarto. `negativaEntregada` ya estaba guardada, asi
 * que el recalculo leyo "la negativa ya se la diste" y escalo en silencio: el
 * cliente no recibio NADA y espero una hora a que contestara una persona.
 *
 * Por eso quien envia (`lib/bot-agente-tiempo-real.ts`) saca una foto de estos
 * campos ANTES del turno y la restaura si el turno no llego al cliente.
 *
 * Conv 3997 (11/09, Keller 110): el combo venia del anuncio, el cliente contesto
 * "Ah una keller 110" y el motor resolvio bien — le va, falta la leva — pero un
 * segundo mensaje ("soy de Santiago del Estero") descarto el turno. Como
 * `motoConfirmada` NO se revertia, el recalculo leyo "Moto ya confirmada
 * compatible: no la vuelvas a preguntar ni consultes compatibilidad de nuevo" y
 * solo contesto el envio: la charla de la moto no volvio a aparecer nunca.
 *
 * Por eso el grupo pineado, la moto y la variante tambien se revierten. Como
 * DATO siguen siendo verdad, pero la memoria no los guarda como dato: los tres
 * se le sirven al modelo como "ya se lo dijiste" ("ya recibio la ficha y la
 * foto", "no consultes compatibilidad de nuevo", "el precio final esta 100%
 * determinado"), y esa afirmacion es falsa si el turno no salio. Perderlos no
 * cuesta nada: el mensaje del cliente sigue en la rafaga y en el historial, asi
 * que el recalculo los vuelve a resolver con las mismas herramientas. Y si se
 * habian aprendido en un turno ANTERIOR que si salio, la foto los devuelve tal
 * cual estaban — revertir solo borra lo que aprendio el turno descartado.
 *
 * El escalado persistido es la excepcion y no se toca: ese no le promete nada al
 * cliente, le avisa al bot que el equipo ya tiene la consulta en la bandeja.
 *
 * `motoMencionada` es la otra excepcion, por el mismo motivo al reves: la moto
 * la nombro el CLIENTE, no se la afirmamos nosotros. Que el turno no haya salido
 * no borra que la dijo — su mensaje sigue en el historial — y revertirla
 * reabriria justo el hueco que vino a tapar (conv 4206).
 */
export interface EntregaRevertible {
    grupoPineado: EstadoConversacion["grupoPineado"]
    varianteResuelta: EstadoConversacion["varianteResuelta"]
    motoConfirmada: string | null
    packPresentado: EstadoConversacion["packPresentado"]
    negativaEntregada: EstadoConversacion["negativaEntregada"]
    temasRespondidos: string[]
    repreguntasMoto: number
}

/** Foto de la memoria de entrega tal como estaba antes de arrancar el turno. */
export function fotoEntrega(estado: EstadoConversacion): EntregaRevertible {
    return {
        grupoPineado: estado.grupoPineado ?? null,
        varianteResuelta: estado.varianteResuelta ?? null,
        motoConfirmada: estado.motoConfirmada ?? null,
        packPresentado: estado.packPresentado ?? null,
        negativaEntregada: estado.negativaEntregada ?? null,
        temasRespondidos: [...(estado.temasRespondidos || [])],
        repreguntasMoto: estado.repreguntasMoto ?? 0
    }
}

/**
 * Devuelve la memoria de entrega al estado de `previo`. Se llama cuando el
 * turno se descarto sin llegar al cliente.
 *
 * Escribe los valores EXACTOS (no es un merge): `temasRespondidos` se pisa en
 * vez de acumularse, que es justo lo que `guardarEstadoConversacion` no puede
 * hacer. No toca ninguna columna fuera de la foto.
 *
 * `incluirAprendido: false` deja quieto lo que el turno aprendio (grupo, moto,
 * variante) y revierte solo la entrega pura. Es para el unico descarte donde
 * OTRO tramo del bot si le hablo al cliente en paralelo (el lote reencolado):
 * ahi el estado nuevo puede ser del tramo que si salio, y pisarlo con la foto
 * vieja hace que el turno siguiente repita la ficha y la foto.
 */
export async function revertirEntregaNoEnviada(
    clave: string | undefined,
    previo: EntregaRevertible | null | undefined,
    opciones?: { incluirAprendido?: boolean }
): Promise<void> {
    if (!clave || !previo) return
    const incluirAprendido = opciones?.incluirAprendido !== false
    const sets = [
        "pack_presentado_id = $2",
        "pack_presentado_nombre = $3",
        "pack_presentado_precio = $4",
        "temas_respondidos = $5",
        "negativa_moto = $6",
        "negativa_kit = $7",
        "negativa_detalle = $8",
        "negativa_en = $9",
        "repreguntas_moto = $10"
    ]
    const params: any[] = [
        clave,
        previo.packPresentado?.id ?? null,
        previo.packPresentado?.nombre ?? null,
        previo.packPresentado?.precio ?? null,
        previo.temasRespondidos || [],
        previo.negativaEntregada?.moto ?? null,
        previo.negativaEntregada?.kit ?? null,
        previo.negativaEntregada?.detalle ?? null,
        previo.negativaEntregada?.en ? new Date(previo.negativaEntregada.en) : null,
        previo.repreguntasMoto ?? 0
    ]
    if (incluirAprendido) {
        sets.push(
            "grupo_pineado_id = $11",
            "grupo_pineado_nombre = $12",
            "variante_pack_id = $13",
            "variante_etiqueta = $14",
            "variante_precio = $15",
            "moto_confirmada = $16"
        )
        params.push(
            previo.grupoPineado?.id ?? null,
            previo.grupoPineado?.nombre ?? null,
            previo.varianteResuelta?.packId ?? null,
            previo.varianteResuelta?.etiqueta ?? null,
            previo.varianteResuelta?.precio ?? null,
            previo.motoConfirmada ?? null
        )
    }
    try {
        await prisma.$executeRawUnsafe(
            `UPDATE chat_conversacion_estado SET ${sets.join(", ")}, actualizado_en = NOW() WHERE clave = $1`,
            ...params
        )
    } catch (err) {
        console.warn("[estado] no se pudo revertir la memoria de entrega:", (err as any)?.message)
    }
}

/**
 * Aplica un patch (merge) al estado. Solo pisa los campos presentes en `patch`.
 * No-op si no hay `clave` o si la tabla no existe.
 */
export async function guardarEstadoConversacion(
    clave: string | undefined,
    patch: EstadoConversacion
): Promise<void> {
    if (!clave) return
    if (
        patch.grupoPineado === undefined &&
        patch.varianteResuelta === undefined &&
        patch.motoConfirmada === undefined &&
        patch.motoMencionada === undefined &&
        patch.packPresentado === undefined &&
        patch.temasRespondidos === undefined &&
        patch.escaladoPendiente === undefined &&
        patch.negativaEntregada === undefined &&
        patch.repreguntasMoto === undefined &&
        patch.eleccionPendiente === undefined
    ) {
        return
    }

    try {
        const actual = await cargarEstadoConversacion(clave)
        patch = ajustarCambioDeProducto(actual, patch)
        const merged: EstadoConversacion = {
            grupoPineado: patch.grupoPineado !== undefined ? patch.grupoPineado : actual.grupoPineado,
            varianteResuelta:
                patch.varianteResuelta !== undefined ? patch.varianteResuelta : actual.varianteResuelta,
            motoConfirmada:
                patch.motoConfirmada !== undefined ? patch.motoConfirmada : actual.motoConfirmada,
            motoMencionada:
                patch.motoMencionada !== undefined ? patch.motoMencionada : actual.motoMencionada,
            packPresentado:
                patch.packPresentado !== undefined ? patch.packPresentado : actual.packPresentado,
            // Los temas se ACUMULAN (nunca se pisan): lo que ya se contestó no
            // se "des-contesta" en un turno posterior.
            temasRespondidos: unirTemas(actual.temasRespondidos, patch.temasRespondidos || []),
            escaladoPendiente:
                patch.escaladoPendiente !== undefined ? patch.escaladoPendiente : actual.escaladoPendiente,
            negativaEntregada:
                patch.negativaEntregada !== undefined ? patch.negativaEntregada : actual.negativaEntregada,
            repreguntasMoto:
                patch.repreguntasMoto !== undefined ? patch.repreguntasMoto : actual.repreguntasMoto,
            eleccionPendiente:
                patch.eleccionPendiente !== undefined ? patch.eleccionPendiente : actual.eleccionPendiente
        }

        await prisma.$executeRawUnsafe(
            `INSERT INTO chat_conversacion_estado
                (clave, grupo_pineado_id, grupo_pineado_nombre, variante_pack_id, variante_etiqueta, variante_precio, moto_confirmada, moto_mencionada, pack_presentado_id, pack_presentado_nombre, pack_presentado_precio, temas_respondidos, escalado_pendiente_motivo, escalado_pendiente_resumen, escalado_pendiente_en, negativa_moto, negativa_kit, negativa_detalle, negativa_en, repreguntas_moto, eleccion_pendiente_candidatos, eleccion_pendiente_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
             ON CONFLICT (clave) DO UPDATE SET
                grupo_pineado_id = EXCLUDED.grupo_pineado_id,
                grupo_pineado_nombre = EXCLUDED.grupo_pineado_nombre,
                variante_pack_id = EXCLUDED.variante_pack_id,
                variante_etiqueta = EXCLUDED.variante_etiqueta,
                variante_precio = EXCLUDED.variante_precio,
                moto_confirmada = EXCLUDED.moto_confirmada,
                moto_mencionada = EXCLUDED.moto_mencionada,
                pack_presentado_id = EXCLUDED.pack_presentado_id,
                pack_presentado_nombre = EXCLUDED.pack_presentado_nombre,
                pack_presentado_precio = EXCLUDED.pack_presentado_precio,
                temas_respondidos = EXCLUDED.temas_respondidos,
                escalado_pendiente_motivo = EXCLUDED.escalado_pendiente_motivo,
                escalado_pendiente_resumen = EXCLUDED.escalado_pendiente_resumen,
                escalado_pendiente_en = EXCLUDED.escalado_pendiente_en,
                negativa_moto = EXCLUDED.negativa_moto,
                negativa_kit = EXCLUDED.negativa_kit,
                negativa_detalle = EXCLUDED.negativa_detalle,
                negativa_en = EXCLUDED.negativa_en,
                repreguntas_moto = EXCLUDED.repreguntas_moto,
                eleccion_pendiente_candidatos = EXCLUDED.eleccion_pendiente_candidatos,
                eleccion_pendiente_en = EXCLUDED.eleccion_pendiente_en,
                actualizado_en = NOW()`,
            clave,
            merged.grupoPineado?.id ?? null,
            merged.grupoPineado?.nombre ?? null,
            merged.varianteResuelta?.packId ?? null,
            merged.varianteResuelta?.etiqueta ?? null,
            merged.varianteResuelta?.precio ?? null,
            merged.motoConfirmada ?? null,
            merged.motoMencionada ?? null,
            merged.packPresentado?.id ?? null,
            merged.packPresentado?.nombre ?? null,
            merged.packPresentado?.precio ?? null,
            merged.temasRespondidos ?? [],
            merged.escaladoPendiente?.motivo ?? null,
            merged.escaladoPendiente?.resumen ?? null,
            merged.escaladoPendiente?.en ? new Date(merged.escaladoPendiente.en) : null,
            merged.negativaEntregada?.moto ?? null,
            merged.negativaEntregada?.kit ?? null,
            merged.negativaEntregada?.detalle ?? null,
            merged.negativaEntregada?.en ? new Date(merged.negativaEntregada.en) : null,
            merged.repreguntasMoto ?? 0,
            merged.eleccionPendiente?.candidatos ?? null,
            merged.eleccionPendiente?.en ? new Date(merged.eleccionPendiente.en) : null
        )
    } catch (err) {
        console.warn("[estado] no se pudo guardar chat_conversacion_estado:", (err as any)?.message)
    }
}

/** No mezclar una ficha nueva con el precio/variante del producto anterior. */
export function ajustarCambioDeProducto(actual: EstadoConversacion, patch: EstadoConversacion): EstadoConversacion {
    if (patch.grupoPineado && patch.grupoPineado.id !== actual.grupoPineado?.id) {
        return { ...patch, packPresentado: null, varianteResuelta: patch.varianteResuelta ?? null }
    }
    if (patch.packPresentado && patch.packPresentado.id !== actual.packPresentado?.id) {
        return { ...patch, grupoPineado: null, varianteResuelta: patch.varianteResuelta ?? null }
    }
    return patch
}

/**
 * ¿El mensaje del cliente es solo una insistencia, sin contenido nuevo? ("??",
 * "hola?", "ahi?", "y?"). Se usa para no gastar un turno de modelo cuando hay
 * un escalado esperando respuesta del equipo: la insistencia se contesta sola
 * cuando el compañero responde.
 */
export function esInsistenciaSinContenido(mensaje: string): boolean {
    const texto = normalizarTexto(mensaje || "")
    if (!texto) return true
    if (texto.length > 24) return false
    const insistencias = new Set([
        "",
        "y",
        "y bien",
        "ahi",
        "ahi estas",
        "estas",
        "estas ahi",
        "hola",
        "hola hola",
        "holaa",
        "buenas",
        "alo",
        "hey",
        "che",
        "sigues ahi",
        "seguis ahi",
        "me contestas",
        "no me contestas",
        "hay alguien",
        "alguien ahi",
        "respondeme",
        "contesta",
        "contestame",
        "esperando",
        "sigo esperando"
    ])
    return insistencias.has(texto)
}

/**
 * Cierra el escalado pendiente si un humano del equipo ya contestó en el chat
 * después de que se escaló: a partir de ahí la charla es del compañero y la
 * memoria no tiene que seguir arrastrando el pendiente.
 */
export async function cerrarEscaladoPendienteSiRespondioHumano(
    clave: string | undefined,
    ultimaRespuestaHumanaMs: number | null
): Promise<void> {
    if (!clave || !ultimaRespuestaHumanaMs) return
    const estado = await cargarEstadoConversacion(clave)
    if (!estado.escaladoPendiente) return
    if (Date.parse(estado.escaladoPendiente.en) > ultimaRespuestaHumanaMs) return
    await guardarEstadoConversacion(clave, { escaladoPendiente: null })
}

/** Borra el estado de una conversación (reinicio de chat). */
export async function limpiarEstadoConversacion(clave?: string): Promise<void> {
    if (!clave) return
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM chat_conversacion_estado WHERE clave = $1`, clave)
    } catch {
        /* no-op */
    }
}

/**
 * Atrasa el reloj del estado (solo para el banco de pruebas): deja la memoria
 * como si el último turno de la charla hubiera sido hace N días. Es la única
 * forma de probar las reglas que distinguen "se lo dijimos recién" de "se lo
 * dijimos la semana pasada" — ver `esCharlaNueva`.
 */
export async function envejecerEstadoParaPruebas(clave: string | undefined, dias: number): Promise<void> {
    if (!clave || !dias) return
    try {
        await prisma.$executeRawUnsafe(
            `UPDATE chat_conversacion_estado SET actualizado_en = NOW() - ($2 || ' days')::interval WHERE clave = $1`,
            clave,
            String(dias)
        )
    } catch {
        /* no-op */
    }
}

/** Bloque que se inyecta al contexto del modelo. Vacío si no hay nada firme. */
export function formatearMemoriaEstado(estado: EstadoConversacion): string {
    const lineas: string[] = []

    if (estado.grupoPineado?.nombre) {
        lineas.push(`- Combo ya elegido por el cliente: "${estado.grupoPineado.nombre}". Ya recibió la ficha y la foto. No vuelvas a listar opciones, no repitas la ficha completa ni reenvíes la foto, no preguntes cuál combo busca.`)
    }
    if (estado.packPresentado?.nombre) {
        const precio = estado.packPresentado.precio ? ` (${formatearPrecioAR(estado.packPresentado.precio)})` : ""
        lineas.push(
            `- Kit ya presentado al cliente: "${estado.packPresentado.nombre}"${precio}. Ya recibió la ficha completa, el precio y la foto. Si da su moto o hace una consulta puntual, confirmá corto — NO repitas la ficha, la lista de "qué incluye", el precio ya dado ni reenvíes la foto. Contestá lo que preguntó antes de cerrar.`
        )
    }
    if (estado.motoConfirmada) {
        lineas.push(`- Moto informada anteriormente: "${estado.motoConfirmada}". No la repreguntes. La compatibilidad anterior no valida otro producto ni otra moto: antes de afirmar que le entra el producto consultado, verificá esa combinación con la herramienta.`)
    }
    if (estado.varianteResuelta?.etiqueta) {
        const precio = estado.varianteResuelta.precio
            ? ` (${formatearPrecioAR(estado.varianteResuelta.precio)})`
            : ""
        lineas.push(
            `- Variante resuelta del producto anterior: "${estado.varianteResuelta.etiqueta}"${precio}. Conservála solo si siguen hablando del mismo producto y la misma moto. No traslades esta variante ni su precio a un producto nuevo. Contestá lo que el cliente haya preguntado.`
        )
    }
    if (estado.temasRespondidos && estado.temasRespondidos.length > 0) {
        lineas.push(
            `- Temas que YA le contestaste en esta charla: ${estado.temasRespondidos.join(", ")}. Si el cliente vuelve a tocar uno de esos temas sin preguntar nada nuevo (te da un dato, aclara, corrige), NO re-expliques ese tema: ni el mismo texto, ni reformulado con otras palabras, ni "resumido". Respondé en UN renglón, natural, diciéndole qué significa ese dato para él (que llega igual, que no cambia nada, que queda anotado). Solo si hace una pregunta nueva sobre el tema, contestá esa pregunta y nada más.`
        )
    }

    if (estado.negativaEntregada?.moto) {
        lineas.push(
            `- Ya explicaste la incompatibilidad de "${estado.negativaEntregada.kit || "el producto consultado anteriormente"}" con "${estado.negativaEntregada.moto}". Si insiste sobre ESA MISMA combinación o modifica esa moto, escalá con motivo 'compatibilidad_dudosa'. Si consulta por OTRO producto concreto, consultá su compatibilidad: la negativa anterior no lo abarca.\n` +
                `- Si pide una alternativa SIN identificar un producto concreto ("y algo para esa no tenes?", "que le puedo poner?"), no inventes opciones para esa moto: escalá con motivo 'compatibilidad_dudosa'.`
        )
    }

    if (estado.escaladoPendiente?.resumen) {
        lineas.push(
            `- Consulta YA derivada al equipo y todavia SIN respuesta humana: "${estado.escaladoPendiente.resumen}". Un compañero la va a contestar. No la contestes vos, no la re-preguntes y no prometas nada sobre eso (ni "ya te averiguo", ni "te aviso"). Si el cliente vuelve sobre esa consulta o insiste (\"??\", \"hola?\", \"y?\"), ejecutá escalar_a_humano y guardá silencio total. Solo respondé si pregunta algo NUEVO y distinto que sí podés resolver con las herramientas.`
        )
    }

    if (lineas.length === 0) return ""
    return "### MEMORIA DE ESTADO DE ESTA CONVERSACION (no la contradigas ni repreguntes lo ya resuelto):\n" + lineas.join("\n")
}
