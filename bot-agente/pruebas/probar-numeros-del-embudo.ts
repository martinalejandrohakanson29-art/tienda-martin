/**
 * Pruebas del paso "el motor lee los numeros UNA vez y los pasa por el embudo".
 *
 *   npx tsx bot-agente/pruebas/probar-numeros-del-embudo.ts
 *
 * Lo que se cuida son dos cosas opuestas:
 *
 *  1. Que reusar la lectura del turno de el MISMO resultado que leerla de nuevo
 *     (si no, el ahorro cambia respuestas y no sirve).
 *  2. Que la lectura de OTRO mensaje NUNCA se sirva. El motor lee el mensaje
 *     del turno, pero `resolver_variante` recibe el `mensaje_cliente` que arma
 *     el modelo, y no siempre es el mismo texto: en la rama de la plantilla del
 *     anuncio, por ejemplo, se lee el "resto" sin la plantilla. Clasificar los
 *     numeros de un mensaje con los roles de otro seria peor que leer dos veces.
 */
import { empaquetarLectura, leerNumeros, lecturaYaHecha } from "../nucleo/numeros-del-mensaje"
import { pideOtraCilindradaQueElProducto } from "../nucleo/cilindrada-objetivo"
import { resolverVariante } from "../herramientas/resolver-variante"

const COMBO = "Combo Tapa CDI + Cilindro 120"
const OBJETIVO = "Quiero hacerla 140. Un econor con motor de 110"
const SIN_OBJETIVO = "tengo una gilera smash 110, cuanto sale?"

let fallaron = 0
function chequear(ok: boolean, nota: string, detalle?: unknown) {
    if (!ok) fallaron++
    console.log(`${ok ? "OK  " : "FALLA"}  ${nota}${ok || detalle === undefined ? "" : `  -> ${JSON.stringify(detalle)}`}`)
}

async function main() {
    const paquete = empaquetarLectura(OBJETIVO, await leerNumeros(OBJETIVO))

    // ── El paquete que viaja en el embudo ────────────────────────────────────
    chequear(
        JSON.parse(JSON.stringify(paquete)).deLaMoto !== undefined,
        "el paquete sobrevive al JSON del registro de herramientas (no lleva Sets)"
    )
    chequear(
        lecturaYaHecha(paquete, "  QUIERO HACERLA 140. Un econor con motor de 110  ")?.objetivo?.valor === 140,
        "el mismo texto con otra grafia/espacios reusa la lectura"
    )
    chequear(lecturaYaHecha(paquete, SIN_OBJETIVO) === null, "otro texto NO reusa: devuelve null y se lee de nuevo")
    chequear(lecturaYaHecha(null, OBJETIVO) === null, "sin paquete en el embudo, null")

    // ── Reusar da lo mismo que leer de nuevo ─────────────────────────────────
    const conLectura = await pideOtraCilindradaQueElProducto(OBJETIVO, COMBO, lecturaYaHecha(paquete, OBJETIVO))
    const sinLectura = await pideOtraCilindradaQueElProducto(OBJETIVO, COMBO)
    chequear(
        JSON.stringify(conLectura) === JSON.stringify(sinLectura) && conLectura?.cilindrada === 140,
        "reusando la lectura del turno sale lo mismo que leyendo de nuevo",
        { conLectura, sinLectura }
    )

    // ── El caso peligroso: la lectura de otro mensaje no contamina ───────────
    const base = {
        combo: COMBO,
        __embudo: {
            charlaEnCurso: true,
            grupoPineadoId: 3,
            repreguntasMoto: 0,
            numerosDelMensaje: paquete
        }
    } as any

    const conElSuyo = await resolverVariante({ ...base, mensaje_cliente: OBJETIVO, modelo_moto: "Econor 110" })
    chequear(
        conElSuyo.escalar === true && conElSuyo.motivo === "consulta_tecnica",
        "con SU lectura en el embudo, 'hacerla 140' deriva igual",
        conElSuyo
    )

    const conLaAjena = await resolverVariante({
        ...base,
        // El embudo trae la lectura del mensaje del objetivo, pero la tool
        // recibe OTRO texto: no puede heredar ese 140.
        mensaje_cliente: SIN_OBJETIVO,
        modelo_moto: "gilera smash 110"
    })
    chequear(
        !conLaAjena.escalar,
        "con la lectura de OTRO mensaje en el embudo, este turno no hereda el objetivo",
        conLaAjena
    )

    console.log(`\n${fallaron === 0 ? "TODO OK" : `${fallaron} FALLARON`}`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
