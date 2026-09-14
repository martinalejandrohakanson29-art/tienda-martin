/**
 * El catálogo no se busca por la MOTO del cliente.
 *
 *   npx tsx bot-agente/pruebas/probar-catalogo-por-moto.ts
 *
 * Conv 4194 (14/09): "venden repuestos para la moto rouser ns200". El modelo
 * buscó el catálogo con "Rouser NS200", el scorer le vio el 200 y devolvió el
 * "kit dakar 200 economico": el bot contestó que sí vendíamos repuestos para esa
 * moto (no vendemos nada para la NS 200), mandó la foto de ese kit y no escaló.
 *
 * Pega contra la base (necesita `motos_modelos` y el catálogo cargados).
 */
import { terminoEsSoloMoto } from "../nucleo/motos"
import { herramientaCatalogoPrecios } from "../herramientas/catalogo-precios"

interface Caso {
    termino: string
    esMoto: boolean
    nota: string
}

const casos: Caso[] = [
    // Motos: van a compatibilidad, no al catálogo
    { termino: "Rouser NS200", esMoto: true, nota: "el caso de la conv 4194" },
    { termino: "rouser ns 200", esMoto: true, nota: "el mismo alias separado" },
    { termino: "para la moto zanella zb 110", esMoto: true, nota: "moto dentro de una frase" },
    { termino: "una gilera", esMoto: true, nota: "marca sola, sin modelo" },
    // Productos: el catálogo se sigue buscando como siempre
    { termino: "120", esMoto: false, nota: "cilindrada pelada = kit, no moto" },
    { termino: "kit 120", esMoto: false, nota: "producto con número" },
    { termino: "170 varillero", esMoto: false, nota: "producto de dos tokens" },
    { termino: "tapa cdi", esMoto: false, nota: "producto sin número" },
    { termino: "escape rouser", esMoto: false, nota: "pieza para una moto: hay producto" },
    { termino: "leva 6.40", esMoto: false, nota: "producto con medida" },
]

async function main() {
    let fallos = 0
    for (const c of casos) {
        const r = await terminoEsSoloMoto(c.termino)
        const ok = r.esMoto === c.esMoto
        if (!ok) fallos++
        console.log(`${ok ? "✓" : "✗"} "${c.termino}" -> esMoto=${r.esMoto}${r.moto ? ` (${r.moto})` : ""}   [${c.nota}]`)
    }

    // El caso completo: la herramienta ya no devuelve un kit por la cilindrada
    // de la moto, y manda a consultar compatibilidad.
    const res: any = await herramientaCatalogoPrecios.ejecutar({ termino_busqueda: "Rouser NS200" } as any)
    const okTool = res.encontrado === false && /consultar_compatibilidad/.test(res.mensaje_para_agente)
    if (!okTool) fallos++
    console.log(`${okTool ? "✓" : "✗"} consultar_catalogo_y_precios("Rouser NS200") -> encontrado=${res.encontrado}, packs=${(res.packs || []).length}`)

    console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S)`)
    process.exit(fallos === 0 ? 0 : 1)
}

main()
