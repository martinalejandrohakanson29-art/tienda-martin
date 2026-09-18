/**
 * Validador del catálogo del bot: qué le falta a lo cargado para que el bot
 * no tenga que adivinar.
 *
 * Por qué existe: cargar un kit toca ~8 lugares en 3 tablas, y ningún campo es
 * obligatorio salvo el nombre y el mensaje. Un pack se puede activar sin una
 * sola fila de compatibilidad, sin `cilindradas_base` y sin categoría — y el
 * bot lo empieza a ofrecer 5 segundos después. El error no se ve al guardar:
 * se ve tres días más tarde en una conversación donde el bot le confirmó un
 * kit de 110 a una moto de 150.
 *
 * El criterio de cada regla no es "el campo está vacío" sino QUÉ HACE EL BOT
 * cuando está vacío. Por eso cada hallazgo lleva su consecuencia escrita: es
 * la única forma de que quien carga pueda decidir si le importa o no.
 *
 * Severidades:
 *   bloqueante — el bot va a responder MAL (no "de menos"). No se publica así.
 *   riesgo     — puede afirmar algo que nadie cargó, o quedar mudo en un caso
 *                que sí sabemos contestar.
 *   aviso      — se pierde calidad, no se rompe nada.
 *
 * Se usa desde tres lados con el mismo resultado:
 *   - el panel de catálogo (revisión antes de publicar),
 *   - `npm run catalogo:validar` (chequeo completo, sale 1 si hay bloqueantes),
 *   - el diálogo de publicación de un pack (`validarPack`).
 */
import { prisma } from "@/lib/prisma"
import { resolverMoto } from "@/bot-agente/nucleo/motos"

export type Severidad = "bloqueante" | "riesgo" | "aviso"
export type TipoEntidad = "pack" | "grupo" | "articulo" | "global"

export interface Hallazgo {
    severidad: Severidad
    entidad: TipoEntidad
    entidadId: number | null
    entidadNombre: string
    /** Campo o tabla involucrada, para que el que carga sepa dónde tocar. */
    campo: string
    /** Qué falta o qué está mal. */
    titulo: string
    /** Qué hace el bot por esto. Es lo que decide si importa. */
    consecuencia: string
    /** Dónde se arregla. */
    comoSeArregla: string
}

export interface ReporteCatalogo {
    generadoEn: string
    hallazgos: Hallazgo[]
    resumen: { bloqueantes: number; riesgos: number; avisos: number }
    /** Qué se miró, para que un reporte vacío signifique algo. */
    alcance: { packs: number; grupos: number; articulos: number; filasCompat: number }
}

// --- Lectura de la base (una sola vez por corrida) -------------------------

interface PackFila {
    id: number
    nombre: string
    precio: number | null
    activo: boolean
    grupo_id: number | null
    criterio_variante: string | null
    sinonimos_variante: string[] | null
    atributo_fijo: string | null
    atributo_fijo_contradice: string[] | null
    categoria: string | null
    cilindradas_base: number[] | null
    mensaje_bienvenida: string | null
    detalle: string | null
    foto_url: string | null
    plantillas_bienvenida: string | null
    plantillas_referral: string | null
}

interface GrupoFila {
    id: number
    nombre: string
    activo: boolean
    categoria: string | null
    cilindradas_base: number[] | null
    mensaje_bienvenida: string | null
    pregunta_variante: string | null
    plantillas_bienvenida: string | null
    plantillas_referral: string | null
    foto_url: string | null
}

interface ArticuloFila {
    id: number
    titulo_comercial: string | null
    alias: string | null
    nombre: string
    activo: boolean
    precio: number | null
    detalle: string | null
    categoria: string | null
    envio_gratis: boolean | null
    cilindradas_base: number[] | null
}

interface CompatFila {
    id: number
    modelo_moto: string
    compatible: boolean
    detalle: string | null
    grupo_id: number | null
    kit_id: number | null
    articulo_id: number | null
}

interface LegacyFila {
    id: number
    kit: string | null
    kit_id: number | null
    modelo_moto: string | null
    compatible: boolean | null
}

interface Datos {
    packs: PackFila[]
    grupos: GrupoFila[]
    articulos: ArticuloFila[]
    componentes: { pack_id: number; articulo_id: number }[]
    compatCombo: CompatFila[]
    compatArticulo: CompatFila[]
    legacy: LegacyFila[]
}

async function leerDatos(): Promise<Datos> {
    const [packs, grupos, articulos, componentes, compatCombo, compatArticulo, legacy] = await Promise.all([
        prisma.$queryRaw<PackFila[]>`
            SELECT id, nombre, precio::float AS precio, activo, grupo_id, criterio_variante, sinonimos_variante,
                   atributo_fijo, atributo_fijo_contradice, categoria, cilindradas_base, mensaje_bienvenida,
                   detalle, foto_url, plantillas_bienvenida, plantillas_referral
            FROM chat_packs ORDER BY id
        `,
        prisma.$queryRaw<GrupoFila[]>`
            SELECT id, nombre, activo, categoria, cilindradas_base, mensaje_bienvenida, pregunta_variante,
                   plantillas_bienvenida, plantillas_referral, foto_url
            FROM chat_pack_grupos ORDER BY id
        `,
        prisma.$queryRaw<ArticuloFila[]>`
            SELECT ca.id, ca.titulo_comercial, ca.alias, am.nombre, ca.activo, ca.precio::float AS precio,
                   ca.detalle, ca.categoria, ca.envio_gratis, ca.cilindradas_base
            FROM chat_articulos ca
            JOIN articulos_mostrador am ON am.id = ca.articulo_mostrador_id
            ORDER BY ca.id
        `,
        prisma.$queryRaw<{ pack_id: number; articulo_id: number }[]>`
            SELECT pack_id, articulo_id FROM chat_pack_articulos
        `,
        prisma.$queryRaw<CompatFila[]>`
            SELECT id, modelo_moto, compatible, detalle, grupo_id, kit_id, null::int AS articulo_id
            FROM chat_combo_compatibilidad
        `,
        prisma.$queryRaw<CompatFila[]>`
            SELECT id, modelo_moto, compatible, detalle, null::int AS grupo_id, null::int AS kit_id, articulo_id
            FROM chat_articulo_compatibilidad
        `,
        prisma.$queryRaw<LegacyFila[]>`SELECT id, kit, kit_id, modelo_moto, compatible FROM compatibilidades`.catch(
            () => [] as LegacyFila[]
        ),
    ])
    return { packs, grupos, articulos, componentes, compatCombo, compatArticulo, legacy }
}

// --- Utilidades compartidas ----------------------------------------------

function normalizar(txt: string): string {
    return (txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Los números "de producto" que hacen que dos nombres se pisen en el matching. */
function numerosDe(nombre: string): Set<number> {
    const nums = (nombre || "").match(/\d{2,4}/g) || []
    return new Set(nums.map(Number).filter((n) => n >= 50 && n <= 2000))
}

function nombreArticulo(a: ArticuloFila): string {
    return a.titulo_comercial || a.alias || a.nombre
}

/**
 * ¿La grafía cargada en una fila de compatibilidad resuelve a una moto del
 * catálogo? Usa el MISMO resolvedor que el bot en vivo — de nada sirve una
 * validación que apruebe grafías que después el motor no reconoce.
 */
async function resuelveLaMoto(texto: string): Promise<boolean> {
    const r = await resolverMoto(texto)
    return r.confianza === "exacta" || r.confianza === "aproximada"
}

// --- Reglas ---------------------------------------------------------------

function reglasPack(d: Datos, p: PackFila, h: Hallazgo[]) {
    const grupo = p.grupo_id != null ? d.grupos.find((g) => Number(g.id) === Number(p.grupo_id)) : null
    const componentes = d.componentes.filter((c) => Number(c.pack_id) === Number(p.id))

    const push = (severidad: Severidad, campo: string, titulo: string, consecuencia: string, comoSeArregla: string) =>
        h.push({
            severidad,
            entidad: "pack",
            entidadId: Number(p.id),
            entidadNombre: p.nombre,
            campo,
            titulo,
            consecuencia,
            comoSeArregla,
        })

    if (!p.mensaje_bienvenida || !p.mensaje_bienvenida.trim()) {
        push(
            "bloqueante",
            "mensaje_bienvenida",
            "Sin mensaje predefinido",
            "Es el texto que sale tal cual cuando el cliente entra por este kit. Sin él el bot improvisa la presentación, incluido el precio.",
            "Catálogo → Packs → Mensaje predefinido"
        )
    }

    if (!p.precio || p.precio <= 0) {
        push(
            "bloqueante",
            "precio",
            "Precio en cero",
            "La herramienta de precios devuelve $0 y el bot lo dice como si fuera el precio real.",
            "Catálogo → Packs → Precio del pack completo"
        )
    }

    if (componentes.length === 0) {
        push(
            "bloqueante",
            "chat_pack_articulos",
            "Sin artículos enganchados",
            'No puede contestar "¿qué trae el kit?" ni cotizar una pieza suelta del combo: escala todas esas consultas.',
            "Catálogo → Packs → Artículos que incluye este pack"
        )
    }

    if (p.grupo_id != null) {
        if (!p.criterio_variante || !p.criterio_variante.trim()) {
            push(
                "bloqueante",
                "criterio_variante",
                "Variante sin etiqueta",
                "El bot no puede nombrar ni elegir esta variante cuando el cliente contesta la pregunta de desambiguación.",
                "Catálogo → Packs → Etiqueta de esta variante"
            )
        }
        if (!p.sinonimos_variante || p.sinonimos_variante.length === 0) {
            push(
                "riesgo",
                "sinonimos_variante",
                "Variante sin sinónimos del cliente",
                'Solo reconoce la etiqueta exacta: si el cliente dice "corta" y la etiqueta es "recorrido corto", vuelve a preguntar lo mismo.',
                "Catálogo → Packs → Cómo la puede nombrar el cliente"
            )
        }

        const hermanos = d.packs.filter(
            (x) => Number(x.grupo_id) === Number(p.grupo_id) && Number(x.id) !== Number(p.id)
        )
        for (const hm of hermanos) {
            const propios = new Set((p.sinonimos_variante || []).map(normalizar).filter(Boolean))
            const ajenos = new Set((hm.sinonimos_variante || []).map(normalizar).filter(Boolean))
            const choque = [...propios].filter((s) => ajenos.has(s))
            if (choque.length > 0) {
                push(
                    "bloqueante",
                    "sinonimos_variante",
                    `Sinónimos repetidos con "${hm.nombre}": ${choque.join(", ")}`,
                    "Las dos variantes matchean la misma palabra: el bot elige cualquiera de las dos y le puede cobrar el precio de la otra.",
                    "Catálogo → Packs → Cómo la puede nombrar el cliente (dejar el sinónimo en una sola variante)"
                )
            }
            if (
                p.criterio_variante &&
                hm.criterio_variante &&
                normalizar(p.criterio_variante) === normalizar(hm.criterio_variante)
            ) {
                push(
                    "bloqueante",
                    "criterio_variante",
                    `Misma etiqueta de variante que "${hm.nombre}"`,
                    "Dos variantes indistinguibles en el mismo grupo: la desambiguación no puede terminar bien.",
                    "Catálogo → Packs → Etiqueta de esta variante"
                )
            }
        }

        const primeraDelGrupo = normalizar(grupo?.nombre || "").split(" ")[0] || ""
        if (grupo && primeraDelGrupo && !normalizar(p.nombre).includes(primeraDelGrupo)) {
            push(
                "aviso",
                "nombre",
                `El nombre no se parece al del grupo ("${grupo.nombre}")`,
                "El pozo de compatibilidad y la resolución de kit matchean por NOMBRE: un pack que quedó con el nombre viejo tras renombrar el grupo puede no encontrarse, o encontrar filas de otro kit.",
                "Catálogo → Packs → Nombre del pack"
            )
        }
    } else {
        // Pack suelto: la cilindrada y la categoría son propias (si tiene grupo
        // las hereda de él, y validarlas acá sería pedir dos veces lo mismo).
        if (!p.cilindradas_base || p.cilindradas_base.length === 0) {
            push(
                "riesgo",
                "cilindradas_base",
                "Sin cilindradas de destino",
                "Es la red que impide confirmar este kit a una moto de otro motor: vacío, una sola fila positiva alcanza para decirle que sí a cualquier cilindrada.",
                "Catálogo → Packs → Para qué motor es (cilindradas)"
            )
        }
        if (!p.categoria || !p.categoria.trim()) {
            push(
                "riesgo",
                "categoria",
                "Sin categoría",
                'El kit no aparece cuando el cliente pide el rubro ("tenés algo para potenciar una 110") — solo si lo nombra.',
                "Catálogo → Packs → Categoría del combo"
            )
        }
        const propias = d.compatCombo.filter((c) => Number(c.kit_id) === Number(p.id))
        if (propias.length === 0) {
            push(
                "riesgo",
                "chat_combo_compatibilidad",
                "Sin compatibilidad cargada",
                "No puede decir ni que sí ni que no a ninguna moto: deriva al equipo cada consulta de compatibilidad de este kit.",
                "Catálogo → Packs → Compatibilidad de este kit"
            )
        } else if (propias.filter((c) => c.compatible).length === 0) {
            push(
                "aviso",
                "chat_combo_compatibilidad",
                "Solo tiene motos NO compatibles cargadas",
                "Puede negar, nunca confirmar. Si es a propósito está bien; si no, falta la lista de las que sí.",
                "Catálogo → Packs → Compatible con"
            )
        }
    }

    if (p.atributo_fijo && (!p.atributo_fijo_contradice || p.atributo_fijo_contradice.length === 0)) {
        push(
            "riesgo",
            "atributo_fijo_contradice",
            "Atributo fijo sin las frases que lo desmienten",
            `El pack es siempre "${p.atributo_fijo}", pero nada descarta al cliente que pide lo contrario: se lo va a ofrecer igual.`,
            "Catálogo → Packs → Lo que este pack NO puede cambiar"
        )
    }

    if (!p.foto_url) {
        push(
            "aviso",
            "foto_url",
            "Sin foto",
            "La ficha sale sin imagen; es el mensaje que más cierra en WhatsApp.",
            "Catálogo → Packs → Foto"
        )
    }

    if (!p.detalle || !p.detalle.trim()) {
        push(
            "aviso",
            "detalle",
            "Sin detalle adicional",
            'Las preguntas que no son precio ni envío ("¿viene listo para poner?") no tienen de dónde salir: escala.',
            "Catálogo → Packs → Detalle adicional"
        )
    }

    // Colisión de nombres: el matching por nombre es lo que hace que una fila de
    // otro kit conteste por este (convs 2882 y 3894).
    const misNums = numerosDe(p.nombre)
    if (misNums.size > 0) {
        for (const otro of d.packs) {
            if (Number(otro.id) === Number(p.id)) continue
            // Hermanos del mismo grupo: comparten nombre a propósito.
            if (p.grupo_id != null && Number(otro.grupo_id) === Number(p.grupo_id)) continue
            const compartidos = [...misNums].filter((n) => numerosDe(otro.nombre).has(n))
            if (compartidos.length > 0 && normalizar(otro.nombre) !== normalizar(p.nombre)) {
                push(
                    "aviso",
                    "nombre",
                    `Comparte el número ${compartidos.join(", ")} con "${otro.nombre}"`,
                    "El filtro del pozo de compatibilidad matchea por nombre: dos kits que comparten número pueden leerse las filas entre sí.",
                    "Que los nombres se distingan por algo más que el número"
                )
                break
            }
        }
    }

    // Filas legacy que pueden hablar por este kit.
    const legacyQueMatchea = d.legacy.filter((l) => {
        if (!l.kit) return false
        if (normalizar(l.kit) === normalizar(p.nombre)) return true
        return [...numerosDe(l.kit)].some((n) => misNums.has(n))
    })
    if (legacyQueMatchea.length > 0) {
        push(
            "riesgo",
            "compatibilidades (legacy)",
            `${legacyQueMatchea.length} fila(s) viejas de la Base de Conocimiento pueden contestar por este kit`,
            "La tabla legacy `compatibilidades` entra al mismo pozo de decisión y se identifica por texto libre: son veredictos de la época de n8n que nadie revisó.",
            "Correr `npm run compat:legacy` para migrarlas o descartarlas"
        )
    }
}

function reglasGrupo(d: Datos, g: GrupoFila, h: Hallazgo[]) {
    const push = (severidad: Severidad, campo: string, titulo: string, consecuencia: string, comoSeArregla: string) =>
        h.push({
            severidad,
            entidad: "grupo",
            entidadId: Number(g.id),
            entidadNombre: g.nombre,
            campo,
            titulo,
            consecuencia,
            comoSeArregla,
        })

    const packs = d.packs.filter((p) => Number(p.grupo_id) === Number(g.id))

    if (packs.length === 0) {
        push(
            "riesgo",
            "chat_packs",
            "Grupo sin variantes",
            "No hay ningún pack real detrás: si el cliente entra por este anuncio, el bot no tiene qué ofrecerle.",
            "Catálogo → Packs → asignar al menos un pack a este grupo"
        )
    } else if (packs.length === 1) {
        push(
            "aviso",
            "chat_packs",
            "Grupo con una sola variante",
            "Un grupo existe para desambiguar entre 2+ packs; con uno solo, la pregunta de variante sobra.",
            "Catálogo → Packs → agregar la otra variante, o sacar el pack del grupo"
        )
    }

    if (!g.mensaje_bienvenida || !g.mensaje_bienvenida.trim()) {
        push(
            "bloqueante",
            "mensaje_bienvenida",
            "Sin mensaje de bienvenida",
            "Es lo que se manda cuando el cliente entra por el anuncio compartido. Sin él el bot improvisa la apertura.",
            "Catálogo → Grupos → Mensaje de bienvenida genérico"
        )
    }

    if (packs.length > 1 && (!g.pregunta_variante || !g.pregunta_variante.trim())) {
        push(
            "bloqueante",
            "pregunta_variante",
            "Sin pregunta de variante",
            "Con 2+ variantes y sin pregunta cargada, el bot tiene que inventar cómo distinguirlas.",
            "Catálogo → Grupos → Pregunta de variante"
        )
    }

    if (!g.cilindradas_base || g.cilindradas_base.length === 0) {
        push(
            "riesgo",
            "cilindradas_base",
            "Sin cilindradas de destino",
            "Sus variantes heredan la cilindrada de acá: vacío, nada impide confirmar el combo a una moto de otro motor.",
            "Catálogo → Grupos → Para qué motor es (cilindradas)"
        )
    }

    if (!g.categoria || !g.categoria.trim()) {
        push(
            "riesgo",
            "categoria",
            "Sin categoría",
            "El combo no aparece cuando el cliente pide el rubro en vez del nombre.",
            "Catálogo → Grupos → Categoría del combo"
        )
    }

    const propias = d.compatCombo.filter((c) => Number(c.grupo_id) === Number(g.id))
    if (propias.length === 0) {
        push(
            "riesgo",
            "chat_combo_compatibilidad",
            "Sin compatibilidad cargada",
            "Ninguna de sus variantes puede confirmar ni negar una moto: deriva todas esas consultas.",
            "Catálogo → Grupos → Compatibilidad del combo"
        )
    }

    if (!g.plantillas_bienvenida && !g.plantillas_referral) {
        push(
            "aviso",
            "plantillas_bienvenida",
            "Sin plantilla ni texto del anuncio",
            "El cliente que entra desde el aviso de Meta no se reconoce como tal: el bot arranca de cero y vuelve a preguntar lo que el anuncio ya decía.",
            "Catálogo → Grupos → Plantilla exacta / Descripción del anuncio"
        )
    }
}

function reglasArticulo(d: Datos, a: ArticuloFila, h: Hallazgo[]) {
    if (!a.activo) return

    const push = (severidad: Severidad, campo: string, titulo: string, consecuencia: string, comoSeArregla: string) =>
        h.push({
            severidad,
            entidad: "articulo",
            entidadId: Number(a.id),
            entidadNombre: nombreArticulo(a),
            campo,
            titulo,
            consecuencia,
            comoSeArregla,
        })

    if (a.precio != null && a.envio_gratis === null) {
        push(
            "aviso",
            "envio_gratis",
            "Se vende suelta pero no tiene definida la política de envío",
            "Mientras esté sin definir el bot no promete ni niega envío para esta pieza (es lo correcto, pero deja la pregunta sin contestar).",
            "Catálogo → Artículos → el chip de envío en la lista"
        )
    }

    if (!a.cilindradas_base || a.cilindradas_base.length === 0) {
        push(
            "riesgo",
            "cilindradas_base",
            "Sin cilindradas de destino",
            "Una fila positiva de compatibilidad de esta pieza puede confirmarse a una moto de otro motor.",
            "Catálogo → Artículos → Para qué motor es"
        )
    }

    if (!a.titulo_comercial || !a.titulo_comercial.trim()) {
        push(
            "riesgo",
            "titulo_comercial",
            "Sin título comercial",
            "El bot nombra la pieza con el nombre interno del inventario, y con ese nombre la busca en el pozo de compatibilidad.",
            "Catálogo → Artículos → Título comercial"
        )
    }

    const enPacks = d.componentes.filter((c) => Number(c.articulo_id) === Number(a.id)).length
    const compat = d.compatArticulo.filter((c) => Number(c.articulo_id) === Number(a.id))
    if (enPacks > 0 && compat.length === 0) {
        push(
            "aviso",
            "chat_articulo_compatibilidad",
            "Pieza de un combo sin compatibilidad propia",
            "Si el cliente pregunta por esta pieza suelta, el bot no puede decidir por ella sola.",
            "Catálogo → Artículos → Compatibilidad de esta pieza"
        )
    }
}

/**
 * Filas de compatibilidad cuya moto no resuelve contra `motos_modelos`.
 *
 * No es prolijidad: una fila cuya grafía el motor no reconoce es una fila que
 * no se va a aplicar nunca, o peor, que se aplica por parecido a otra moto.
 * Pasa con las que vienen del aprendizaje (guardan la grafía del cliente) y con
 * los typos cargados a mano ("Chilera 110").
 */
async function reglasMotos(d: Datos, h: Hallazgo[]) {
    const todas = [...d.compatCombo, ...d.compatArticulo]
    const distintas = [...new Set(todas.map((c) => (c.modelo_moto || "").trim()).filter(Boolean))]

    const huerfanas: string[] = []
    for (const texto of distintas) {
        if (!(await resuelveLaMoto(texto))) huerfanas.push(texto)
    }

    if (huerfanas.length > 0) {
        h.push({
            severidad: "riesgo",
            entidad: "global",
            entidadId: null,
            entidadNombre: "Compatibilidad",
            campo: "modelo_moto",
            titulo: `${huerfanas.length} grafía(s) de moto no resuelven contra el catálogo de motos`,
            consecuencia:
                "Esas filas no se aplican nunca (o se aplican por parecido a otra moto): el veredicto queda librado al matching difuso en vez del dato cargado.",
            comoSeArregla: `Chatwoot → Pendientes → asociar alias o crear el modelo. Ejemplos: ${huerfanas
                .slice(0, 12)
                .join(", ")}`,
        })
    }

    // Contradicciones: la misma moto cargada como compatible Y como no
    // compatible para el mismo producto. El pozo no tiene forma de elegir, así
    // que el veredicto pasa a depender del orden en que salen las filas.
    const porProducto = new Map<string, Map<string, Set<boolean>>>()
    const anotar = (dueno: string, c: CompatFila) => {
        if (!porProducto.has(dueno)) porProducto.set(dueno, new Map())
        const motos = porProducto.get(dueno)!
        const k = normalizar(c.modelo_moto)
        motos.set(k, new Set([...(motos.get(k) || []), c.compatible]))
    }
    for (const c of d.compatCombo) anotar(`combo:${c.grupo_id ?? ""}:${c.kit_id ?? ""}`, c)
    for (const c of d.compatArticulo) anotar(`art:${c.articulo_id}`, c)

    for (const [dueno, motos] of porProducto) {
        for (const [moto, veredictos] of motos) {
            if (veredictos.size < 2) continue
            const art = dueno.startsWith("art:")
                ? d.articulos.find((a) => Number(a.id) === Number(dueno.slice(4)))
                : null
            const nombre = dueno.startsWith("art:")
                ? art
                    ? nombreArticulo(art)
                    : `artículo #${dueno.slice(4)} (ya no existe)`
                : d.grupos.find((g) => `combo:${g.id}:` === dueno)?.nombre ||
                  d.packs.find((p) => `combo::${p.id}` === dueno)?.nombre ||
                  dueno
            h.push({
                severidad: "bloqueante",
                entidad: "global",
                entidadId: null,
                entidadNombre: nombre,
                campo: "compatible",
                titulo: `"${moto}" está cargada como compatible Y como no compatible`,
                consecuencia:
                    "El bot puede contestar cualquiera de las dos cosas para la misma moto, según qué fila salga primero.",
                comoSeArregla: "Dejar la moto en una sola de las dos listas del producto",
            })
        }
    }

    // Duplicados exactos: no rompen, pero inflan el pozo y esconden ediciones.
    const clave = (c: CompatFila, tipo: string) =>
        `${tipo}::${c.grupo_id ?? ""}::${c.kit_id ?? ""}::${c.articulo_id ?? ""}::${normalizar(c.modelo_moto)}::${c.compatible}`
    const vistos = new Map<string, number>()
    for (const c of d.compatCombo) vistos.set(clave(c, "combo"), (vistos.get(clave(c, "combo")) || 0) + 1)
    for (const c of d.compatArticulo) vistos.set(clave(c, "art"), (vistos.get(clave(c, "art")) || 0) + 1)
    const dups = [...vistos.values()].filter((n) => n > 1).length
    if (dups > 0) {
        h.push({
            severidad: "aviso",
            entidad: "global",
            entidadId: null,
            entidadNombre: "Compatibilidad",
            campo: "duplicados",
            titulo: `${dups} fila(s) de compatibilidad duplicadas exactas`,
            consecuencia: "El mismo veredicto pesa doble en el pozo y una edición puede tocar solo una de las copias.",
            comoSeArregla: "Correr `npm run compat:dedup`",
        })
    }
}

function reglasGlobales(d: Datos, h: Hallazgo[]) {
    if (d.legacy.length > 0) {
        const sinKit = d.legacy.filter((l) => l.kit_id == null).length
        h.push({
            severidad: "riesgo",
            entidad: "global",
            entidadId: null,
            entidadNombre: "Base de Conocimiento (legacy)",
            campo: "compatibilidades",
            titulo: `${d.legacy.length} filas legacy siguen entrando al pozo de compatibilidad (${sinKit} sin kit identificado)`,
            consecuencia:
                "Se identifican por texto libre, así que un kit nuevo que comparta palabras o números con ellas puede heredar veredictos de la época de n8n que nadie revisó.",
            comoSeArregla: "Correr `npm run compat:legacy` para ver qué se migra y qué se descarta",
        })
    }

    for (const g of d.grupos) {
        const nums = numerosDe(g.nombre)
        if (nums.size === 0) continue
        const choca = d.grupos.find(
            (o) => Number(o.id) !== Number(g.id) && [...numerosDe(o.nombre)].some((n) => nums.has(n))
        )
        if (choca) {
            h.push({
                severidad: "aviso",
                entidad: "grupo",
                entidadId: Number(g.id),
                entidadNombre: g.nombre,
                campo: "nombre",
                titulo: `Comparte número con el grupo "${choca.nombre}"`,
                consecuencia: "Los dos grupos pueden capturar la misma consulta cuando el cliente nombra el número.",
                comoSeArregla: "Diferenciar los nombres por algo más que el número",
            })
        }
    }
}

// --- API pública ----------------------------------------------------------

const ORDEN: Record<Severidad, number> = { bloqueante: 0, riesgo: 1, aviso: 2 }

function armarReporte(d: Datos, hallazgos: Hallazgo[]): ReporteCatalogo {
    hallazgos.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad])
    return {
        generadoEn: new Date().toISOString(),
        hallazgos,
        resumen: {
            bloqueantes: hallazgos.filter((x) => x.severidad === "bloqueante").length,
            riesgos: hallazgos.filter((x) => x.severidad === "riesgo").length,
            avisos: hallazgos.filter((x) => x.severidad === "aviso").length,
        },
        alcance: {
            packs: d.packs.length,
            grupos: d.grupos.length,
            articulos: d.articulos.length,
            filasCompat: d.compatCombo.length + d.compatArticulo.length,
        },
    }
}

/** Valida TODO el catálogo activo. Es lo que corre `npm run catalogo:validar`. */
export async function validarCatalogo(): Promise<ReporteCatalogo> {
    const d = await leerDatos()
    const h: Hallazgo[] = []
    for (const p of d.packs) if (p.activo) reglasPack(d, p, h)
    for (const g of d.grupos) if (g.activo) reglasGrupo(d, g, h)
    for (const a of d.articulos) reglasArticulo(d, a, h)
    await reglasMotos(d, h)
    reglasGlobales(d, h)
    return armarReporte(d, h)
}

/**
 * Valida UN pack y lo que lo rodea (su grupo, sus artículos): es la revisión
 * previa a publicarlo. Vale aunque el pack esté pausado — justamente el caso de
 * uso es decidir si se puede activar.
 */
export async function validarPack(packId: number): Promise<ReporteCatalogo> {
    const d = await leerDatos()
    const pack = d.packs.find((p) => Number(p.id) === Number(packId))
    if (!pack) {
        return armarReporte(d, [
            {
                severidad: "bloqueante",
                entidad: "pack",
                entidadId: packId,
                entidadNombre: `#${packId}`,
                campo: "id",
                titulo: "El pack no existe",
                consecuencia: "Nada que validar.",
                comoSeArregla: "Guardar el pack primero",
            },
        ])
    }

    const h: Hallazgo[] = []
    reglasPack(d, pack, h)
    if (pack.grupo_id != null) {
        const g = d.grupos.find((x) => Number(x.id) === Number(pack.grupo_id))
        if (g) reglasGrupo(d, g, h)
    }
    const idsArt = new Set(
        d.componentes.filter((c) => Number(c.pack_id) === Number(pack.id)).map((c) => Number(c.articulo_id))
    )
    for (const a of d.articulos) if (idsArt.has(Number(a.id))) reglasArticulo(d, a, h)

    // Motos: solo las de ESTE kit, para que la revisión previa no arrastre el
    // pasivo de todo el catálogo.
    const propias = [
        ...d.compatCombo.filter(
            (c) =>
                Number(c.kit_id) === Number(pack.id) ||
                (pack.grupo_id != null && Number(c.grupo_id) === Number(pack.grupo_id))
        ),
        ...d.compatArticulo.filter((c) => idsArt.has(Number(c.articulo_id))),
    ]
    const distintas = [...new Set(propias.map((c) => (c.modelo_moto || "").trim()).filter(Boolean))]
    const huerfanas: string[] = []
    for (const texto of distintas) {
        if (!(await resuelveLaMoto(texto))) huerfanas.push(texto)
    }
    if (huerfanas.length > 0) {
        h.push({
            severidad: "riesgo",
            entidad: "pack",
            entidadId: Number(pack.id),
            entidadNombre: pack.nombre,
            campo: "modelo_moto",
            titulo: `${huerfanas.length} moto(s) de la compatibilidad de este kit no resuelven`,
            consecuencia: "Esas filas no se van a aplicar cuando el cliente nombre esa moto.",
            comoSeArregla: `Corregir la grafía o cargar el alias: ${huerfanas.slice(0, 12).join(", ")}`,
        })
    }

    h.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad])
    return armarReporte(d, h)
}
