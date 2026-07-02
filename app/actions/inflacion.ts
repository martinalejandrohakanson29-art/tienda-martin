"use server"

import { requireAdmin } from "@/lib/auth-guard"
import type { PuntoIPC } from "@/lib/metricas/comparativa-tipos"

// IPC Nacional nivel general, base dic-2016=100 (INDEC), servido por la API
// oficial de Series de Tiempo de datos.gob.ar. Se publica una vez al mes con
// ~2 semanas de demora, por eso el revalidate de 24 h alcanza de sobra.
const SERIE_IPC = "148.3_INIVELNAL_DICI_M_26"
const URL_IPC = `https://apis.datos.gob.ar/series/api/series/?ids=${SERIE_IPC}&start_date=2021-12-01&limit=1000&format=json`

// Último resultado bueno en memoria: si datos.gob.ar está caído se sigue
// sirviendo el IPC ya conocido (envejece bien: cambia una vez al mes).
// Igual que el store de PDFs, asume proceso único.
let ultimoBueno: PuntoIPC[] | null = null

export async function obtenerIPCMensual() {
  await requireAdmin()
  try {
    const res = await fetch(URL_IPC, { next: { revalidate: 60 * 60 * 24 } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // La API devuelve data: [["2022-01-01", 632.43], ...]
    const data: PuntoIPC[] = (Array.isArray(json?.data) ? json.data : [])
      .filter((fila: unknown[]) => Array.isArray(fila) && typeof fila[0] === "string" && typeof fila[1] === "number")
      .map((fila: [string, number]) => ({ clave: fila[0].slice(0, 7), indice: fila[1] }))
    if (data.length === 0) throw new Error("serie IPC vacía")
    ultimoBueno = data
    return { success: true as const, data }
  } catch (e) {
    console.error("obtenerIPCMensual:", e)
    if (ultimoBueno) return { success: true as const, data: ultimoBueno }
    return { success: false as const, error: "No se pudo obtener el IPC oficial (datos.gob.ar)" }
  }
}
