/**
 * Pruebas del detector "un kit de 70 a 110".
 *
 *   npx tsx bot-agente/pruebas/probar-conversion-pedida.ts
 *
 * La primera mitad es la LECTURA (no pega contra nada salvo la tabla de motos,
 * igual que el resto de `numeros-del-mensaje`). La segunda es la REGLA de
 * negocio y sí lee `cilindradas_base` del catálogo.
 *
 * Contexto (conv 4475, 17/09, +5493624253916): entró por el anuncio "POTENCIA
 * TU 110" con una Motomel Eco 70 y pidió un kit "de 70 a 110". El bot le ofreció
 * los dos combos que llevan una 110 a 120 — contestó la pregunta del aviso.
 *
 * Lo que cuida la mitad de abajo: "de 110 a 120" es exactamente lo que
 * vendemos y NO puede terminar en la bandeja del equipo.
 */
import { leerNumeros } from "../nucleo/numeros-del-mensaje"
import { cilindradasBaseDelCatalogo, conversionDesdeMotorAjeno, motorQueNoPotenciamos } from "../nucleo/conversion-pedida"

const LECTURA: { mensaje: string; esperado: string | null; nota: string }[] = [
    { mensaje: "Hola buenas tardes quiero saber si vienen un kit de 70 a 110", esperado: "70->110", nota: "conv 4475, tal cual entró" },
    { mensaje: "tenes kit de 70 a 100?", esperado: "70->100", nota: "el mismo pedido, otro destino" },
    { mensaje: "un cilindro de 110 a 125", esperado: "110->125", nota: "la palabra de producto ancla el primer número" },
    { mensaje: "el kit este para potenciar mi 110 a 120?", esperado: "110->120", nota: "conv 3338: con verbo, el objetivo sigue siendo el 2do" },
    { mensaje: "hacen envio de 100 a 500 km?", esperado: null, nota: "sin ancla de producto ni moto: es un envío" },
    { mensaje: "sale entre 100 a 200 mil", esperado: null, nota: "es plata" },
    { mensaje: "tenes kit de 110 a 70?", esperado: null, nota: "para abajo no es potenciar" },
    { mensaje: "tenes kit 190?", esperado: null, nota: "un solo número: no hay conversión" },
]

const REGLA: { mensaje: string; esperado: string | null; nota: string }[] = [
    { mensaje: "Hola buenas tardes quiero saber si vienen un kit de 70 a 110", esperado: "70->110", nota: "conv 4475: no tenemos nada para un motor de 70" },
    { mensaje: "tenes el kit de 110 a 120?", esperado: null, nota: "es el combo que vendemos: sigue la charla" },
    { mensaje: "un cilindro de 125 a 170", esperado: null, nota: "el 125 es una de nuestras bases" },
    { mensaje: "hola, cuanto sale?", esperado: null, nota: "sin números" },
]

/**
 * El guard que le pasa el dato a la tool del catálogo. Es el que cubre las
 * formas que el par "X a Y" no agarra, y el que NO tiene que cortarle el paso a
 * una moto nuestra. Pega contra `motos_modelos`, `cilindradas_base` y el pozo
 * de compatibilidades.
 */
const GUARD: { mensaje: string; moto?: string; corta: boolean; nota: string }[] = [
    { mensaje: "tengo una motomel eco 70, que kit le puedo poner?", moto: "motomel eco 70", corta: true, nota: "17/09: le volcaba los SIETE kits del catálogo" },
    { mensaje: "hola tenes kit para una eco 70", moto: "eco 70", corta: true, nota: "la Eco 70 no tiene kit ni fila de compat" },
    { mensaje: "tengo una 70", corta: true, nota: "cilindrada sola, sin marca ni modelo" },
    { mensaje: "quiero saber si vienen un kit de 70 a 110", corta: true, nota: "conv 4475: la conversión manda" },
    { mensaje: "hola, tengo un econo 80, le va el kit 120?", moto: "econo 80", corta: false, nota: "el equipo YA cargó su compat: la negativa la contesta el bot solo" },
    { mensaje: "que kit le va a una zb 110?", moto: "Zanella ZB 110", corta: false, nota: "moto nuestra: el camino de siempre" },
    { mensaje: "tenes kit para la rouser 200?", moto: "Bajaj Rouser NS 200", corta: false, nota: "moto nuestra de otra base" },
    { mensaje: "Una eco 110", moto: "eco 110", corta: false, nota: "dijo 110 y el resolvedor lo lleva a la familia Eco 70/80: manda lo que dijo él" },
    { mensaje: "hola que kits tenes?", corta: false, nota: "sin cilindrada no se opina" },
    { mensaje: "me lo hacen por 140 mil?", corta: false, nota: "es plata" },
    { mensaje: "el recorrido de la cadena es de 84 eslabones", corta: false, nota: "corpus real: un número que no es un motor" }
]

async function main() {
    let fallaron = 0

    for (const c of LECTURA) {
        const { conversion } = await leerNumeros(c.mensaje)
        const r = conversion ? `${conversion.base}->${conversion.objetivo}` : null
        const ok = r === c.esperado
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${JSON.stringify(c.mensaje)} -> ${r}  · ${c.nota}`)
    }

    console.log("")
    console.log("cilindradas_base del catálogo:", [...(await cilindradasBaseDelCatalogo())].sort((a, b) => a - b).join(", ") || "(ninguna)")
    console.log("")

    for (const c of REGLA) {
        const conversion = await conversionDesdeMotorAjeno(c.mensaje)
        const r = conversion ? `${conversion.base}->${conversion.objetivo}` : null
        const ok = r === c.esperado
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${JSON.stringify(c.mensaje)} -> ${r}  · ${c.nota}`)
    }

    console.log("")
    for (const c of GUARD) {
        const r = await motorQueNoPotenciamos({ mensaje: c.mensaje, moto: c.moto })
        const ok = Boolean(r) === c.corta
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${c.corta ? "corta" : "pasa "}  ${JSON.stringify(c.mensaje)} -> ${r ? `${r.cilindrada}cc` : "-"}  · ${c.nota}`)
    }

    const total = LECTURA.length + REGLA.length + GUARD.length
    console.log(`\n${total - fallaron}/${total} OK`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
