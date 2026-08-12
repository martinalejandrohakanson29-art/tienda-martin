import { Client } from 'pg';
import fs from 'fs';
import 'dotenv/config';

const sql = fs.readFileSync('n8n-workflows/bot-horario.sql', 'utf8');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log('OK: migración aplicada');
  const estado = await client.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', ['bot_estado', 'horario_automatico']);
  console.log('bot_estado.horario_automatico existe:', estado.rows.length === 1);
  const filas = await client.query('SELECT * FROM bot_horario ORDER BY dia_semana');
  console.log('bot_horario filas:', filas.rows.length);
  console.table(filas.rows);
} finally {
  await client.end();
}
