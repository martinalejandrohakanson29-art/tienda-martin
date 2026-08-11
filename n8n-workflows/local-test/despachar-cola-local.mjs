// Dispara despacharCola() directo (sin pasar por /admin/chatwoot/cola ni login),
// para poder probar la seccion D de la auditoria contra el stack local.
// Requiere las mismas env vars que usa el server de Next.js local (DATABASE_URL,
// CHATWOOT_API_URL, etc.) -- pasarlas por delante al invocar este script.
import { despacharCola } from '../../lib/chatwoot-cola.ts'

const opciones = process.argv.includes('--forzar') ? { forzar: true } : {}
const resultado = await despacharCola(opciones)
console.log(JSON.stringify(resultado, null, 2))
process.exit(0)
