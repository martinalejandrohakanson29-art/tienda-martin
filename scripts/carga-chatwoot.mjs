// Escenario de carga para el workflow de n8n (workflow_mateo) contra el mock de
// /admin/chatwoot/prueba. Sirve para verificar el agrupado de mensajes: varios
// clientes mandando ráfagas al mismo tiempo tienen que producir UNA respuesta
// por ráfaga, no una por mensaje.
//
// Cómo lee el resultado:
//   - Un teléfono de control manda UN solo mensaje. Su cantidad de mensajes
//     públicos es la "línea base" de lo que vale una respuesta lógica (el
//     workflow puede partir la respuesta en varios mensajes con Wait2 de 2s).
//   - Los teléfonos de ráfaga mandan varios mensajes seguidos. Si el agrupado
//     funciona, tienen que dar ~la misma cantidad que el control. El doble o
//     más = se procesó la ráfaga más de una vez.
//
// Por qué las preguntas son de NEGOCIO (ubicación) y no de producto: una
// consulta que el bot no puede contestar termina en el escalado a humano, que
// está detrás de `Marcar Cooldown Escalado` (TTL 300s por conversación). Con
// ese cooldown, 4 ejecuciones duplicadas dejan la misma huella que 1 (una sola
// etiqueta + nota) y el test no puede distinguir nada. La respuesta pública, en
// cambio, no tiene cooldown: si se procesa dos veces, se ve dos veces.
//
// OJO: dispara ejecuciones REALES en n8n. Eso significa llamadas pagas a
// DeepSeek/OpenAI y escrituras en el Postgres de producción
// (conversaciones_historial y las tablas preguntas_*_pendientes). Los teléfonos
// de prueba llevan el prefijo TELEFONO_BASE para poder identificar esas filas
// después.
//
// Uso:
//   node scripts/carga-chatwoot.mjs                 -> muestra el plan, no dispara nada
//   node scripts/carga-chatwoot.mjs --correr        -> ejecuta de verdad
//   node scripts/carga-chatwoot.mjs --correr --clientes 5 --rafaga 3

const args = process.argv.slice(2);
function flag(nombre, porDefecto) {
    const i = args.indexOf(`--${nombre}`);
    if (i === -1) return porDefecto;
    const v = args[i + 1];
    return v && !v.startsWith("--") ? v : true;
}

const BASE = String(flag("base", "https://revolucionmotos.tech")).replace(/\/$/, "");
const CLIENTES = Number(flag("clientes", 3));
const RAFAGA = Number(flag("rafaga", 4));
const GAP_MS = Number(flag("gap", 800));
const ESPERA_S = Number(flag("espera", 90));
const CORRER = args.includes("--correr");
const ACCOUNT_ID = 1;

// Cada corrida usa teléfonos y conversaciones nuevos: si se repiten, la corrida
// anterior ya dejó historial en conversaciones_historial y preguntas pendientes
// registradas, y el bot no se comporta igual.
const TANDA = Number(flag("tanda", Math.floor(Date.now() / 1000) % 10000));
const TELEFONO_BASE = `54935100${String(TANDA).padStart(4, "0")}`;
const CONV_BASE = 9000000 + TANDA * 10;

const MENSAJE_CONTROL = "hola, donde estan ubicados?";
const MENSAJES_RAFAGA = [
    "hola buenas",
    "una consulta",
    "me podrias decir donde estan ubicados?",
    "gracias",
    "ahi va otra mas",
    "sigo escribiendo",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviarMensaje(conversationId, telefono, nombre, mensaje) {
    const t0 = Date.now();
    try {
        const res = await fetch(`${BASE}/api/chatwoot/prueba-mensaje`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, telefono, nombre, mensaje }),
        });
        return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
    } catch (error) {
        return { ok: false, status: 0, ms: Date.now() - t0, error: error.message };
    }
}

async function leerEventos(conversationId) {
    try {
        const res = await fetch(
            `${BASE}/api/chatwoot/mock/accounts/${ACCOUNT_ID}/conversations/${conversationId}/events?after=0`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.events ?? [];
    } catch {
        return [];
    }
}

async function limpiarConversacion(conversationId) {
    try {
        await fetch(
            `${BASE}/api/chatwoot/mock/accounts/${ACCOUNT_ID}/conversations/${conversationId}/events`,
            { method: "DELETE" }
        );
    } catch {
        /* si falla, el conteo arranca sucio y se ve en el reporte */
    }
}

// ---------------------------------------------------------------- escenario
const participantes = [
    {
        etiqueta: "control (1 msg)",
        conversationId: CONV_BASE,
        telefono: `${TELEFONO_BASE}0`,
        nombre: "Carga Control",
        mensajes: [MENSAJE_CONTROL],
        esControl: true,
    },
    ...Array.from({ length: CLIENTES }, (_, i) => ({
        etiqueta: `rafaga ${i + 1} (${RAFAGA} msgs)`,
        conversationId: CONV_BASE + 1 + i,
        telefono: `${TELEFONO_BASE}${i + 1}`,
        nombre: `Carga Rafaga ${i + 1}`,
        mensajes: MENSAJES_RAFAGA.slice(0, RAFAGA),
        esControl: false,
    })),
];

function mostrarPlan() {
    console.log(`\nDestino:  ${BASE}`);
    console.log(`Tanda:    ${TANDA} (teléfonos y conversaciones nuevos en cada corrida)`);
    console.log(`Espera:   ${ESPERA_S}s tras el último envío (debounce 15s + LLM + partes)\n`);
    for (const p of participantes) {
        console.log(`  conv #${p.conversationId}  +${p.telefono}  ${p.etiqueta}`);
        for (const m of p.mensajes) console.log(`      · "${m}"`);
    }
    const total = participantes.reduce((a, p) => a + p.mensajes.length, 0);
    console.log(`\n  ${participantes.length} conversaciones, ${total} mensajes, gap de ${GAP_MS}ms dentro de cada ráfaga`);
    console.log(`  Todas las conversaciones arrancan a la vez.\n`);
}

async function correrParticipante(p) {
    const enviados = [];
    for (const mensaje of p.mensajes) {
        const r = await enviarMensaje(p.conversationId, p.telefono, p.nombre, mensaje);
        enviados.push({ mensaje, ...r });
        if (!r.ok) console.log(`  ! fallo envio conv #${p.conversationId}: HTTP ${r.status} ${r.error ?? ""}`);
        await sleep(GAP_MS);
    }
    return enviados;
}

async function main() {
    console.log("=".repeat(72));
    console.log("  ESCENARIO DE CARGA - agrupado de mensajes (workflow_mateo)");
    console.log("=".repeat(72));
    mostrarPlan();

    if (!CORRER) {
        console.log("Modo plan. Dispara ejecuciones reales en n8n (LLM pago + escrituras");
        console.log("en Postgres de produccion). Para ejecutar de verdad:\n");
        console.log("    node scripts/carga-chatwoot.mjs --correr\n");
        return;
    }

    console.log("Limpiando historial del mock para estas conversaciones...");
    await Promise.all(participantes.map((p) => limpiarConversacion(p.conversationId)));

    console.log("Disparando todas las conversaciones en paralelo...\n");
    const tInicio = Date.now();
    const envios = await Promise.all(participantes.map(correrParticipante));
    const okTotal = envios.flat().filter((e) => e.ok).length;
    const totalMsgs = envios.flat().length;
    console.log(`Envio terminado: ${okTotal}/${totalMsgs} aceptados en ${((Date.now() - tInicio) / 1000).toFixed(1)}s`);

    console.log(`\nEsperando respuestas (${ESPERA_S}s)`);
    const finEspera = Date.now() + ESPERA_S * 1000;
    let ultimoConteo = -1;
    while (Date.now() < finEspera) {
        await sleep(5000);
        const listas = await Promise.all(participantes.map((p) => leerEventos(p.conversationId)));
        const conteo = listas.reduce((a, l) => a + l.length, 0);
        if (conteo !== ultimoConteo) {
            const seg = Math.round((Date.now() - tInicio) / 1000);
            console.log(`   [${String(seg).padStart(3)}s] ${conteo} eventos acumulados`);
            ultimoConteo = conteo;
        }
    }

    // ------------------------------------------------------------- reporte
    console.log(`\n${"=".repeat(72)}`);
    console.log("  RESULTADO");
    console.log("=".repeat(72));

    const resultados = [];
    for (const p of participantes) {
        const eventos = await leerEventos(p.conversationId);
        const publicos = eventos.filter((e) => e.kind === "message" && !e.private);
        const notas = eventos.filter((e) => e.kind === "message" && e.private);
        const labels = eventos.filter((e) => e.kind === "label");
        resultados.push({ p, publicos, notas, labels });

        console.log(`\nconv #${p.conversationId}  +${p.telefono}  ${p.etiqueta}`);
        console.log(`   enviados: ${p.mensajes.length}   respuestas: ${publicos.length}   notas: ${notas.length}   labels: ${labels.length}`);
        const t0 = publicos.length ? publicos[0].createdAt : 0;
        for (const e of publicos) {
            const dt = ((e.createdAt - t0) / 1000).toFixed(1);
            console.log(`      +${dt.padStart(5)}s  ${JSON.stringify(e.content.slice(0, 90))}`);
        }
        for (const e of labels) console.log(`      [label] ${e.labels.join(", ")}`);
    }

    const control = resultados.find((r) => r.p.esControl);
    const base = control ? control.publicos.length : 0;

    console.log(`\n${"-".repeat(72)}`);
    const escalaron = resultados.filter((r) => r.labels.length || r.notas.length).length;
    if (escalaron) {
        console.log("AVISO: hubo escalados a humano (notas/labels). Esa via esta detras de");
        console.log("un cooldown de 300s por conversacion, asi que NO sirve para contar");
        console.log("duplicados: 4 ejecuciones dejan la misma huella que 1. Solo cuentan");
        console.log("los mensajes publicos. Si el control escalo, cambia la pregunta por");
        console.log("una que el bot sepa contestar.\n");
    }

    if (!base) {
        console.log("INDETERMINADO: el control no respondio con un mensaje publico. Sin");
        console.log("linea base no se puede juzgar a las rafagas.");
    } else {
        console.log(`Linea base (1 respuesta logica) = ${base} mensaje(s) publico(s)\n`);
        let sospechosas = 0;
        for (const r of resultados.filter((x) => !x.p.esControl)) {
            const n = r.publicos.length;
            let veredicto;
            if (n === 0) veredicto = "SIN RESPUESTA - la rafaga no llego a procesarse";
            else if (n <= base) veredicto = "OK - una sola respuesta";
            else if (n < base * 2) veredicto = `dudoso (${n} vs ${base}) - mirar si son partes`;
            else { veredicto = `DUPLICADO - ${(n / base).toFixed(1)}x la linea base`; sospechosas++; }
            if (n === 0) sospechosas++;
            console.log(`   conv #${r.p.conversationId}: ${n} publico(s) -> ${veredicto}`);
        }
        console.log(`\n${sospechosas === 0 ? "Agrupado OK en todas las rafagas." : `${sospechosas} rafaga(s) con problema.`}`);
    }

    console.log(`\n${"-".repeat(72)}`);
    console.log("Falta verificar a mano en n8n (Executions), esto no lo ve el script:");
    console.log("  1. Que NO queden ejecuciones en estado 'running'. Con el diseno viejo");
    console.log("     cada rafaga de N mensajes dejaba N-1 girando para siempre.");
    console.log(`  2. Que el total de ejecuciones sea ${participantes.reduce((a, p) => a + p.mensajes.length, 0)} (una por mensaje) y que las que`);
    console.log("     no respondieron hayan terminado en 'Fin - Mensaje agrupado'.");
    console.log("  3. Duracion: ninguna deberia pasar de ~15s + tiempo de LLM.");
    console.log(`\nFilas de prueba en Postgres: telefonos con prefijo ${TELEFONO_BASE}`);
    console.log("  (conversaciones_historial, preguntas_tecnicas/negocio/precio_pendientes)");
}

main().catch((e) => {
    console.error("Error:", e);
    process.exit(1);
});
