import assert from "node:assert/strict"
import { detectarEscaladoDeterminista } from "../motor"
import { matchearVariantes, resolverVariante } from "../herramientas/resolver-variante"
import { ejecutarHerramienta } from "../herramientas"
import { quitarOracionesYaDichas, quitarHechosYaDichos, extraerHechos } from "../guardrails/sanitizador"
import { mismaConsultaCompatibilidad, tieneVeredictoCompatibilidad } from "../nucleo/consulta-compatibilidad"
import { ajustarCambioDeProducto } from "../nucleo/estado-persistente"

/** Pruebas de comportamiento determinista, incluidas en el banco junto al LLM. */
export const CASOS_CINCO_HUECOS: { id: string; titulo: string; ejecutar: () => void | Promise<void> }[] = [
    {
        id: "hueco-1-polaridad-variantes",
        titulo: "Negaciones y dudas no seleccionan una variante; las correcciones sí",
        ejecutar() {
            const variantes = [{ etiqueta: "Recorrido corto", sinonimos: ["corto"] }, { etiqueta: "Recorrido largo", sinonimos: ["largo"] }]
            for (const texto of ["no es largo", "no sé si es largo", "creo que es largo", "quizás sea largo"]) {
                assert.equal(matchearVariantes(texto, variantes).length, 0, texto)
            }
            assert.deepEqual(matchearVariantes("es largo", variantes), [variantes[1]])
            assert.deepEqual(matchearVariantes("no es corto, es largo", variantes), [variantes[1]])
            assert.deepEqual(matchearVariantes("no es corto sino largo", variantes), [variantes[1]])
        }
    },
    {
        id: "hueco-1-resolver-duda-real",
        titulo: "El resolver real no cotiza largo cuando el cliente no sabe",
        async ejecutar() {
            for (const mensaje of ["no sé si es largo", "no es largo"]) {
                const r = await resolverVariante({ combo: "3", mensaje_cliente: mensaje, __embudo: { grupoPineadoId: 3 } })
                assert.equal(r.encontrado, true)
                assert.equal(r.resuelta, false, mensaje)
                assert.equal(r.variante_pack_id, undefined)
                assert.ok(r.pregunta_directa, "Debe devolver la pregunta/guía para resolver la duda")
            }
        }
    },
    {
        id: "hueco-1-texto-original",
        titulo: "Una paráfrasis del modelo no puede borrar la negación del cliente",
        async ejecutar() {
            const r = await ejecutarHerramienta("resolver_variante", { combo: "3", mensaje_cliente: "largo" }, {
                mensajeCliente: "no sé si es largo", embudo: { grupoPineadoId: 3 }
            })
            assert.equal(r.resultado.resuelta, false)
        }
    },
    {
        id: "hueco-2-compatibilidad-no-se-hereda",
        titulo: "La moto del embudo requiere compatibilidad positiva con el nuevo combo",
        async ejecutar() {
            const r = await resolverVariante({ combo: "3", mensaje_cliente: "recorrido largo", __embudo: {
                grupoPineadoId: 2, motoConfirmada: "Yamaha YBR 125", motoMencionada: "Yamaha YBR 125"
            } })
            assert.equal(r.resuelta, false)
            assert.ok(r.escalar || r.incompatible, "Una confirmación anterior no habilita el combo para otra base")
            const nuevaMoto = await resolverVariante({ combo: "3", mensaje_cliente: "recorrido largo", __embudo: {
                grupoPineadoId: 3, motoConfirmada: "Zanella ZB 110", motoDelMensaje: "Yamaha YBR 125"
            } })
            assert.equal(nuevaMoto.resuelta, false)
            assert.ok(nuevaMoto.escalar || nuevaMoto.incompatible)
        }
    },
    {
        id: "hueco-2-evidencia-positiva",
        titulo: "Resolver un precio no respalda una afirmación sobre la moto; una negativa oficial sí se puede informar",
        ejecutar() {
            for (const [nombre, resultado] of [
                ["consultar_compatibilidad", { encontrado: false }],
                ["resolver_variante", { encontrado: true, resuelta: true, precio: 99990 }],
                ["resolver_variante", { encontrado: false }]
            ] as const) {
                assert.equal(tieneVeredictoCompatibilidad([{ nombre, argumentos: {}, resultado }]), false)
            }
            for (const compatible of [true, false]) {
                assert.equal(tieneVeredictoCompatibilidad([{ nombre: "consultar_compatibilidad", argumentos: {}, resultado: { encontrado: true, compatible } }]), true)
            }
        }
    },
    {
        id: "hueco-2-cambio-producto",
        titulo: "El nuevo combo no conserva la variante ni la ficha de otro producto",
        ejecutar() {
            const anterior = { grupoPineado: { id: 3, nombre: "Combo Tapa CDI + Cilindro 120" }, varianteResuelta: { packId: 5, etiqueta: "Largo", precio: 189000 } }
            assert.equal(ajustarCambioDeProducto(anterior, { grupoPineado: { id: 2, nombre: "Combo Escape pwr + Leva 6.40" } }).varianteResuelta, null)
            const nueva = { packId: 4, etiqueta: "Leva larga", precio: 125000 }
            assert.equal(ajustarCambioDeProducto(anterior, { grupoPineado: { id: 2, nombre: "Escape" }, varianteResuelta: nueva }).varianteResuelta, nueva)
            assert.equal(ajustarCambioDeProducto(anterior, { packPresentado: { id: 11, nombre: "Kit 170 varillero + leva", precio: 99990 } }).grupoPineado, null)
        }
    },
    {
        id: "hueco-3-escalados-contextuales",
        titulo: "Confianza, negaciones e hipótesis no son agresiones o pedidos de humano",
        ejecutar() {
            for (const texto of ["Cómo sé que no son estafadores?", "No necesito hablar con un humano, solo quiero el precio", "Qué pasa si el paquete llegó roto?", "No quiero hacer un reclamo"]) {
                assert.equal(detectarEscaladoDeterminista(texto), null, texto)
            }
            for (const [texto, motivo] of [
                ["Son unos estafadores", "cliente_agresivo"],
                ["Quiero hablar con un humano", "cliente_pide_humano"],
                ["No me llegó el pedido", "reclamo_postventa"],
                ["La caja vino rota", "reclamo_postventa"],
                ["No quiero el precio, pasame con un humano", "cliente_pide_humano"]
            ]) assert.equal(detectarEscaladoDeterminista(texto)?.motivo, motivo, texto)
        }
    },
    {
        id: "hueco-4-repregunta-con-y-sin-signos",
        titulo: "Repetir el plazo pedido conserva la respuesta en ambos filtros",
        ejecutar() {
            const previo = ["El envío demora 4 a 6 días hábiles."]
            const respuesta = `${previo[0]} Sale por correo.`
            for (const pregunta of ["Cuánto tarda?", "cuanto tarda", "repetíme cuánto demora"]) {
                const primera = quitarOracionesYaDichas(respuesta, previo, pregunta)
                assert.equal(quitarHechosYaDichos(primera, previo, pregunta), respuesta, pregunta)
            }
            assert.equal(quitarOracionesYaDichas(respuesta, previo, "dale gracias"), "Sale por correo.")
            // Un saludo con "cómo" no es una repregunta: el filtro sigue actuando.
            assert.equal(quitarOracionesYaDichas(respuesta, previo, "hola como andas"), "Sale por correo.")
            assert.equal(quitarHechosYaDichos(previo[0], previo, "cuánto tarda?", undefined, extraerHechos(previo[0])), "", "La misma ráfaga no repite lo recién entregado")
        }
    },
    {
        id: "hueco-5-negativa-por-pareja",
        titulo: "La negativa de un combo no abarca otro; nombre e ID del mismo sí coinciden",
        async ejecutar() {
            const previa = { moto: "Honda Wave 110", kit: "Combo Tapa CDI + Cilindro 120" }
            assert.equal(await mismaConsultaCompatibilidad(previa, { moto: previa.moto, kit: "Combo Escape pwr + Leva 6.40" }), false)
            assert.equal(await mismaConsultaCompatibilidad(previa, { moto: "Zanella ZB 110", kit: previa.kit }), false)
            assert.equal(await mismaConsultaCompatibilidad(previa, { moto: previa.moto, kit: "grupo:3" }), true)
            assert.equal(await mismaConsultaCompatibilidad(previa, previa), true)
        }
    }
]
