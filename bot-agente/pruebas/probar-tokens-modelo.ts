/**
 * Pruebas de `tokensDeModeloCoinciden`: cuándo dos tokens nombran el MISMO
 * modelo de moto.
 *
 * No pega contra la BD ni contra ninguna API: son puras, corren en un segundo.
 *
 *   npx tsx bot-agente/pruebas/probar-tokens-modelo.ts
 *
 * Por qué existe: esta función vale 30 puntos en el scorer de compatibilidad,
 * más que suficiente para que una fila gane sola y el bot cante un "le entra
 * directo". Sus dos versiones anteriores emulaban la tolerancia a typos con
 * contención de substrings y las dos confirmaron compatibilidades inventadas:
 *  - sin piso de largo, "nt" dentro de "hu-NT-er" (barrido del 07/09);
 *  - con piso de 4, "perno" dentro de "su-PERNO-va" (conv 4028, 12/09).
 *
 * El riesgo de esta función es el FALSO POSITIVO —afirmar compatibilidad que no
 * existe—, así que la mayoría de los casos verifican que diga que NO.
 */
import { tokensDeModeloCoinciden } from "../herramientas/compatibilidad"

interface Caso {
    a: string
    b: string
    esperado: boolean
    porque: string
}

const CASOS: Caso[] = [
    // ── Sí: el mismo modelo escrito distinto ──────────────────────────────
    { a: "blitz", b: "blitz", esperado: true, porque: "idénticos" },
    { a: "zb", b: "zb110", esperado: true, porque: "modelo pegado a su cilindrada" },
    { a: "nt110", b: "nt", esperado: true, porque: "idem, al revés" },
    { a: "smash", b: "smash110", esperado: true, porque: "idem con modelo largo" },
    { a: "blizt", b: "blitz", esperado: true, porque: "typo por swap de letras pegadas" },
    { a: "wawe", b: "wave", esperado: true, porque: "typo de 4 letras, misma inicial" },
    { a: "smach", b: "smash", esperado: true, porque: "typo de una letra" },

    // ── No: casualidad ortográfica ────────────────────────────────────────
    {
        a: "perno",
        b: "supernova",
        esperado: false,
        porque: "conv 4028: 'perno' (spec de la fila S2) dentro de 'supernova'",
    },
    {
        a: "nt",
        b: "hunter",
        esperado: false,
        porque: "barrido 07/09: Zanella NT 110 contestando por una Corven Hunter",
    },
    { a: "rx", b: "crypton", esperado: false, porque: "substring suelto en el medio" },
    { a: "biz", b: "blitz", esperado: false, porque: "Honda Biz no es Motomel Blitz" },
    { a: "skua", b: "skuater", esperado: false, porque: "lo que sobra no son dígitos" },
    { a: "trip", b: "triax", esperado: false, porque: "dos modelos Corven distintos" },

    // ── No: tokens que no son modelos ─────────────────────────────────────
    { a: "", b: "blitz", esperado: false, porque: "vacío" },
    { a: "110", b: "110cc", esperado: false, porque: "un número no es un modelo" },
]

function main() {
    let pasados = 0
    for (const c of CASOS) {
        // La función tiene que dar lo mismo en los dos órdenes.
        const ida = tokensDeModeloCoinciden(c.a, c.b)
        const vuelta = tokensDeModeloCoinciden(c.b, c.a)
        const ok = ida === c.esperado && vuelta === c.esperado
        if (ok) pasados++

        console.log(`${ok ? "OK  " : "FALLA"} ${JSON.stringify(c.a)} / ${JSON.stringify(c.b)} -> ${ida} (${c.porque})`)
        if (ida !== vuelta) console.log("        !! no es simétrica")
    }

    console.log(`\n${pasados}/${CASOS.length} pasados`)
    process.exit(pasados === CASOS.length ? 0 : 1)
}

main()
