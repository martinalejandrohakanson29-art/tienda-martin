/**
 * Pruebas del detector "entro por el anuncio pero no viene por ese kit".
 *
 * Pega contra la base (las motos salen del catalogo real), no contra la API del
 * modelo:
 *
 *   npx tsx bot-agente/pruebas/probar-otro-producto-anuncio.ts
 *
 * Contexto (conv 4386, 16/09): entro por el anuncio del "Kit 170 varillero +
 * leva" y escribio "Quiero saber si tienen kid de cg 190". Salio la ficha del
 * 170 con su precio y encima una negativa de compatibilidad contra una moto que
 * el cliente nunca nombro. Decision de Martin: en ese caso no sale la ficha, la
 * consulta la contesta el equipo.
 *
 * La mitad de abajo es la que cuida el negocio: el que SI viene por el kit del
 * aviso no puede perder su ficha instantanea (y $0) por este detector.
 */
import { pideOtroProductoQueElAnuncio } from "../nucleo/otro-producto-anuncio"

const ANUNCIO_170 = "Kit 170 varillero + leva POTENCIA TU VARILLERO A 170CC! PEDI EL TUYO!!"
// El del caso 78: ojo que la letra del aviso nombra la cilindrada de la MOTO
// ("para varilleros 150") ademas de la del kit.
const ANUNCIO_200 = "Kit 200 varillero POTENCIA TU 150 A 200CC!! Kit de potenciacion 200 para varilleros 150 con motor sin balanceador"

const CASOS: { mensaje: string; anuncio: string; esperado: boolean; nota: string }[] = [
    // ── Pide otra medida: la ficha no sale ────────────────────────────────────
    { mensaje: "Quiero saber si tienen kid de cg 190", anuncio: ANUNCIO_170, esperado: true, nota: "conv 4386, tal cual entro" },
    { mensaje: "Hola queria saber que vale un kit 190 para xr 150", anuncio: ANUNCIO_200, esperado: true, nota: "conv 4351: el 150 del aviso es la moto, no el kit" },
    { mensaje: "tenes cilindro 220?", anuncio: ANUNCIO_170, esperado: true, nota: "otro producto sin moto de por medio" },

    // ── Viene por el kit del aviso: la ficha sale igual ───────────────────────
    { mensaje: "el kit le va a mi rouser 200?", anuncio: ANUNCIO_170, esperado: false, nota: "el 200 es su moto" },
    { mensaje: "tengo una wave 110, le entra?", anuncio: ANUNCIO_170, esperado: false, nota: "solo nombra su moto" },
    { mensaje: "el kit me sirve para hacerla 190?", anuncio: ANUNCIO_170, esperado: false, nota: "pregunta por ESTE kit, no pide otro" },
    { mensaje: "quiero el kit 170 para mi cg 150", anuncio: ANUNCIO_170, esperado: false, nota: "el numero es el del propio aviso" },
    { mensaje: "hola, cuanto sale?", anuncio: ANUNCIO_170, esperado: false, nota: "sin numeros" },
    { mensaje: "y el 170 con leva cuanto sale? tenes kit 190?", anuncio: ANUNCIO_170, esperado: false, nota: "tambien pregunta por el del aviso: la ficha sirve" }
]

async function main() {
    let fallaron = 0
    for (const c of CASOS) {
        const r = await pideOtroProductoQueElAnuncio(c.mensaje, c.anuncio)
        const ok = r.esOtroProducto === c.esperado
        if (!ok) fallaron++
        console.log(`${ok ? "OK  " : "FALLA"}  ${JSON.stringify(c.mensaje)} -> ${r.esOtroProducto}${r.cilindrada ? ` (${r.cilindrada})` : ""}  · ${c.nota}`)
    }
    console.log(`\n${CASOS.length - fallaron}/${CASOS.length} OK`)
    process.exit(fallaron === 0 ? 0 : 1)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
