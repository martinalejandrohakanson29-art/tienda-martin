/**
 * Pruebas del detector "a cuanto quiere llevar el motor".
 *
 * No pega contra la base ni contra la API del modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-cilindrada-objetivo.ts
 *
 * Contexto (conv 4352, 17/09, +5492477332855): entro por el anuncio del "Combo
 * Tapa CDI + Cilindro 120" y escribio "Quiero hacerla 140. Un econor con motor
 * de 110". El bot leyo la moto, confirmo la compatibilidad y pregunto el
 * recorrido: el 140 —lo unico que el cliente pregunto— no lo miro nadie.
 *
 * La mitad de abajo es la que cuida el negocio: un numero en el mensaje no
 * puede mandar al equipo consultas que el bot contesta bien solo.
 */
import { detectarCilindradaObjetivo, pideOtraCilindradaQueElProducto } from "../nucleo/cilindrada-objetivo"

const COMBO_120 = "Combo Tapa CDI + Cilindro 120"
const ANUNCIO_170 = "Kit 170 varillero + leva POTENCIA TU VARILLERO A 170CC! PEDI EL TUYO!!"

const DETECCION: { mensaje: string; esperado: number | null; nota: string }[] = [
    // ── Dice a cuanto quiere llevarla ────────────────────────────────────────
    { mensaje: "Quiero hacerla 140", esperado: 140, nota: "conv 4352, tal cual entro" },
    { mensaje: "quiero llevarla a 140cc", esperado: 140, nota: "con la unidad pegada" },
    { mensaje: "la quiero pasar a 150", esperado: 150, nota: "infinitivo con puente" },
    { mensaje: "dale hacela de 140", esperado: 140, nota: "imperativo de voseo" },
    { mensaje: "cuanto sale? la quiero dejar en unos 150", esperado: 150, nota: "dos palabras puente" },
    { mensaje: "quiero potenciar mi moto a 150", esperado: 150, nota: "'moto' es puente, no corta" },

    // ── Numeros que NO son un objetivo ───────────────────────────────────────
    { mensaje: "Un econor con motor de 110", esperado: null, nota: "la cilindrada de SU moto" },
    { mensaje: "me lo hacen por 140 mil", esperado: null, nota: "es plata, no cilindrada" },
    { mensaje: "hacen envio a 140 km de aca", esperado: null, nota: "'envio' corta la cadena" },
    { mensaje: "tenes kit 190?", esperado: null, nota: "pide otro producto: tiene su propio detector" },
    { mensaje: "hola, cuanto sale?", esperado: null, nota: "sin numeros" },
]

const CONTRA_PRODUCTO: { mensaje: string; producto: string; esperado: number | null; nota: string }[] = [
    { mensaje: "Quiero hacerla 140. Un econor con motor de 110", producto: COMBO_120, esperado: 140, nota: "conv 4352: el combo la deja en 120, no en 140" },
    { mensaje: "el kit me sirve para hacerla 190?", producto: ANUNCIO_170, esperado: 190, nota: "el 170 no la hace 190: no tenemos ese dato" },
    { mensaje: "quiero hacerla 120", producto: COMBO_120, esperado: null, nota: "es la medida de ESTE combo: sigue la charla" },
    { mensaje: "la quiero hacer 170", producto: ANUNCIO_170, esperado: null, nota: "es lo que anuncia el aviso" },
    { mensaje: "Quiero hacerla 140", producto: "Kit de levas", esperado: null, nota: "sin numero en el producto no hay con que comparar" },
]

function main() {
    let fallaron = 0

    for (const c of DETECCION) {
        const r = detectarCilindradaObjetivo(c.mensaje)
        const ok = (r?.cilindrada ?? null) === c.esperado
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${JSON.stringify(c.mensaje)} -> ${r?.cilindrada ?? null}  · ${c.nota}`)
    }

    console.log("")
    for (const c of CONTRA_PRODUCTO) {
        const r = pideOtraCilindradaQueElProducto(c.mensaje, c.producto)
        const ok = (r?.cilindrada ?? null) === c.esperado
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${JSON.stringify(c.mensaje)} vs "${c.producto}" -> ${r?.cilindrada ?? null}  · ${c.nota}`)
    }

    const total = DETECCION.length + CONTRA_PRODUCTO.length
    console.log(`\n${total - fallaron}/${total} OK`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main()
