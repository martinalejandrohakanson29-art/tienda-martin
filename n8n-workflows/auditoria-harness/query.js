// Corre una query cruda contra Postgres. Uso: DB_URL=... node query.js "SELECT ..."
// Requiere 'pg' instalado (npm install pg en esta carpeta, no está en el package.json principal a propósito).
const { Client } = require('pg');
const sql = process.argv[2];
(async () => {
  const client = new Client({ connectionString: process.env.DB_URL, ssl: false });
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
