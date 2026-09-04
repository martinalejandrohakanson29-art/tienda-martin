/**
 * Banco de pruebas de casos reales documentados en Revolución Motos.
 * Estos casos provienen de incidentes reales en Chatwoot/n8n para verificar
 * que el nuevo agente resuelva con elegancia lo que antes requería parches de 450 nodos.
 */

export interface CasoPrueba {
    id: string
    titulo: string
    mensajeCliente: string
    historial?: { rol: "user" | "assistant"; contenido: string }[]
    resultadoEsperado: {
        debeLlamarHerramientas?: string[]
        debeEscalarHumano?: boolean
        debeGuardarSilencio?: boolean
        patronRespuesta?: RegExp
        descripcionEsperada: string
    }
}

export const CASOS_PRUEBA_REALES: CasoPrueba[] = [
    {
        id: "caso-1-compra-diferida",
        titulo: "Compra diferida ('junto plata y compro')",
        mensajeCliente: "junto plata y compro",
        historial: [
            { rol: "assistant", contenido: "Genial, el Kit 120 recorrido corto sale $99.000 y recorrido largo $105.000." }
        ],
        resultadoEsperado: {
            debeEscalarHumano: false,
            debeGuardarSilencio: false,
            descripcionEsperada: "Debe responder con un cierre amigable ('Dale bro! Cualquier cosa nos escribís y coordinamos..') sin pedir moto ni escalar."
        }
    },
    {
        id: "caso-2-pregunta-compuesta",
        titulo: "Pregunta compuesta (variante + envío + pieza)",
        mensajeCliente: "es para recorrido corto, soy de Misiones y tienen leva 6.5?",
        historial: [
            { rol: "assistant", contenido: "Hola! Tenemos el Kit 120 para 110cc. Para qué moto buscas?" }
        ],
        resultadoEsperado: {
            debeLlamarHerramientas: ["consultar_info_negocio"],
            debeEscalarHumano: false,
            descripcionEsperada: "Debe confirmar el tema de envíos por Andreani/Vía Cargo y atender las dudas sin perderse en el orden."
        }
    },
    {
        id: "caso-3-compatibilidad-zb",
        titulo: "Compatibilidad con Zanella ZB 110",
        mensajeCliente: "Hola! Le va el kit 120 a una Zanella ZB 110?",
        resultadoEsperado: {
            debeLlamarHerramientas: ["consultar_compatibilidad"],
            debeEscalarHumano: false,
            descripcionEsperada: "Debe consultar compatibilidad en la base y confirmar que le va perfecto."
        }
    },
    {
        id: "caso-4-consulta-mayorista",
        titulo: "Consulta de compra mayorista",
        mensajeCliente: "Hola buenas, me pasas lista de precios por mayor para revender?",
        resultadoEsperado: {
            debeLlamarHerramientas: ["escalar_a_humano"],
            debeEscalarHumano: true,
            debeGuardarSilencio: true,
            descripcionEsperada: "Debe detectar intención mayorista, escalar en silencio al equipo comercial y no emitir respuesta pública."
        }
    },
    {
        id: "caso-5-envio-general",
        titulo: "Pregunta de envíos a provincia",
        mensajeCliente: "Hacen envíos a Salta y cuánto tarda en llegar?",
        resultadoEsperado: {
            debeLlamarHerramientas: ["consultar_info_negocio"],
            debeEscalarHumano: false,
            descripcionEsperada: "Debe traer la política oficial de envíos (Andreani a domicilio, Vía Cargo a sucursal)."
        }
    },
    {
        id: "caso-6-ubicacion-local",
        titulo: "Ubicación del local en Córdoba",
        mensajeCliente: "De dónde son? Puedo pasar a retirar por el local?",
        resultadoEsperado: {
            debeLlamarHerramientas: ["consultar_info_negocio"],
            debeEscalarHumano: false,
            descripcionEsperada: "Debe informar que somos de Córdoba Capital con el dato oficial de info_negocio."
        }
    },
    {
        id: "caso-7-cierre-agradecimiento",
        titulo: "Agradecimiento simple",
        mensajeCliente: "Dale muchas gracias amigo!",
        historial: [
            { rol: "assistant", contenido: "Hacemos envíos a todo el país por Andreani a domicilio." }
        ],
        resultadoEsperado: {
            debeEscalarHumano: false,
            debeGuardarSilencio: false,
            descripcionEsperada: "Debe responder breve y amigable ('De una! Cualquier duda me avisás.') sin bucles."
        }
    },
    {
        id: "caso-8-precio-combo-variantes",
        titulo: "Precio del Kit 120 con variantes",
        mensajeCliente: "Cuánto sale el combo 120?",
        resultadoEsperado: {
            debeLlamarHerramientas: ["consultar_catalogo_y_precios"],
            debeEscalarHumano: false,
            descripcionEsperada: "Debe consultar el catálogo y dar los precios exactos sin inventar."
        }
    },
    {
        id: "caso-9-anuncio-110-pregunta-200",
        titulo: "Entró por 110 y pregunta por la 200 vaga",
        mensajeCliente: "hola, para la 200 que tenes?",
        historial: [
            { rol: "user", contenido: "¡Hola! Quiero conocer más sobre el combo 110 a 120 + Codo y carbu!!" },
            { rol: "assistant", contenido: "Buenas! Sí, tenemos stock del Kit 120. Sale $99.000 el recorrido corto y $105.000 el recorrido largo. Para qué moto buscas?" }
        ],
        resultadoEsperado: {
            debeEscalarHumano: false,
            descripcionEsperada: "No debe adivinar piezas de 200cc. Debe repreguntar qué moto 200 exacta tiene y qué busca hacerle."
        }
    }
]
