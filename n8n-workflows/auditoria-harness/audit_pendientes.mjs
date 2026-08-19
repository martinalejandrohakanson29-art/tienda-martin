// Audita las filas 'pendiente' de preguntas_tecnicas_pendientes / preguntas_sin_match_pendientes
// contra el estado real de la conversación en Chatwoot, para decidir cuáles ya no deberían
// seguir activas (el cliente ya recibió respuesta por otra vía, o la conversación está muerta).
// Solo lee — no escribe nada. Uso: node audit_pendientes.mjs
import dotenv from 'dotenv'
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') })

const CHATWOOT_API = process.env.CHATWOOT_API_URL || 'https://chat.revolucionmotos.tech/api/v1'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN
const DB_URL = process.env.DATABASE_URL
const ACCOUNT_ID = 1

import pg from 'pg'
const { Client } = pg

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: false })
  await client.connect()

  const tecnicas = await client.query(
    `SELECT id, conversation_id, pregunta_original, creado_en FROM preguntas_tecnicas_pendientes WHERE estado='pendiente' ORDER BY creado_en ASC`
  )
  const sinMatch = await client.query(
    `SELECT id, conversation_id, pregunta_original, creado_en FROM preguntas_sin_match_pendientes WHERE estado='pendiente' ORDER BY creado_en ASC`
  )
  await client.end()

  const rows = [
    ...tecnicas.rows.map((r) => ({ ...r, tabla: 'preguntas_tecnicas_pendientes' })),
    ...sinMatch.rows.map((r) => ({ ...r, tabla: 'preguntas_sin_match_pendientes' })),
  ]

  const resultados = []
  for (const row of rows) {
    try {
      const [convRes, msgRes] = await Promise.all([
        fetch(`${CHATWOOT_API}/accounts/${ACCOUNT_ID}/conversations/${row.conversation_id}`, {
          headers: { api_access_token: CHATWOOT_TOKEN },
        }),
        fetch(`${CHATWOOT_API}/accounts/${ACCOUNT_ID}/conversations/${row.conversation_id}/messages`, {
          headers: { api_access_token: CHATWOOT_TOKEN },
        }),
      ])
      const conv = await convRes.json()
      const msgData = await msgRes.json()
      const msgs = (msgData.payload || []).slice().sort((a, b) => a.created_at - b.created_at)

      const pendienteTs = Math.floor(new Date(row.creado_en).getTime() / 1000)
      // outgoing no-privado después de la pendiente = algo le llegó al cliente después de escalar
      const respuestaPosterior = msgs.find(
        (m) => m.created_at > pendienteTs && m.message_type === 1 && !m.private
      )
      // último mensaje entrante del cliente, para ver si siguió escribiendo (y de qué habló)
      const ultimoEntrante = msgs.filter((m) => m.message_type === 0).slice(-1)[0]
      const ultimoSaliente = msgs.filter((m) => m.message_type === 1 && !m.private).slice(-1)[0]

      resultados.push({
        tabla: row.tabla,
        id: row.id,
        conversation_id: row.conversation_id,
        pregunta: row.pregunta_original,
        creado_en: row.creado_en,
        status_conversacion: conv.status,
        respuesta_posterior: respuestaPosterior
          ? { fecha: new Date(respuestaPosterior.created_at * 1000).toISOString(), texto: (respuestaPosterior.content || '').slice(0, 150) }
          : null,
        ultimo_entrante: ultimoEntrante
          ? { fecha: new Date(ultimoEntrante.created_at * 1000).toISOString(), texto: (ultimoEntrante.content || '').slice(0, 150) }
          : null,
        ultimo_saliente: ultimoSaliente
          ? { fecha: new Date(ultimoSaliente.created_at * 1000).toISOString(), texto: (ultimoSaliente.content || '').slice(0, 150) }
          : null,
      })
    } catch (e) {
      resultados.push({ tabla: row.tabla, id: row.id, conversation_id: row.conversation_id, error: e.message })
    }
  }

  console.log(JSON.stringify(resultados, null, 2))
}

main()
