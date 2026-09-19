# Verificador de grounding con Jev (modelo de decisiones)

> Estado: **análisis y plan medido, sin implementar**. Conversación del 19/09/2026.
> Este documento es autocontenido a propósito: la memoria de Claude vive en la
> máquina de Martín (`~/.claude/projects/...`) y **no viaja** a otra compu. Lo
> único que viaja es esto, versionado en el repo. Todo lo que hace falta para
> implementarlo desde cero en otra sesión está acá abajo, incluida la medición
> ya hecha: no hay que volver a probar el modelo para arrancar.

---

## 1. El problema, en una línea

El bot afirma datos duros que ninguna herramienta devolvió, y nos enteramos días
después leyendo la conversación.

La familia es siempre la misma y ya costó plata varias veces:

| Conv | Qué dijo el bot | Qué decía el dato |
|---|---|---|
| 3707 | "el pistón no viene incluido" | el `detalle` del cilindro lo trae, en supermedida 54mm |
| 3707 | "por $175.000 te llevás los dos cilindros" | el cliente se lleva UNA variante |
| 3894 | precio del Kit 120 con el número de la Tapa CDI | la clave mal escrita dejó la tool sin kit |
| 4525 | "a tu Biz le va perfecto" | la compat se había derivado, no había fila |
| 4394 | "las levas no las vendemos sueltas" | hay tres levas sueltas activas con precio |
| 3820 | cotizó "leva larga con freno" a precio de leva pelada | "con freno" no tuvo match, se escaló |

Cada una de esas se arregló con un eslabón determinista nuevo. Funciona, pero
siempre después del hecho, y siempre para **esa forma** de **ese** error.

## 2. Por qué esto no se arregla con más determinismo

La cadena de sanitizado ya tiene cinco eslabones y dos backstops. Cada uno sabe
cómo se **escribe** un problema: `quitarDerivacionAnunciada` sabe cómo se escribe
"te aviso", `oracionesQueNieganVentaSuelta` sabe cómo se escribe una negativa.
El modelo lo dice distinto y pasan de largo.

El grounding **no se puede hardcodear**, y no por falta de ganas: el conjunto de
referencia cambia en cada turno. No hay regex que sepa que `$175.000` está bien
en este turno y mal en el siguiente — eso depende de qué devolvió el catálogo
hace 300 ms. Es el único hueco de la cadena que es estructural.

Esto **no contradice la REGLA MADRE** (§8 de `FILOSOFIA-Y-ROADMAP.md`): no
agregamos un párrafo al prompt ni una regla de negocio nueva. Es higiene de
texto, la misma categoría que `sanitizador.ts`, que explícitamente no es regla
de negocio. Y no decide nada comercial: mira lo que el bot **ya escribió**.

## 3. Qué es Jev

Modelo de "System One" de TypeSafe: entra estado desordenado, sale una decisión
tipada con **probabilidad calibrada**. No genera texto — literalmente no puede.

```
typesafe/jev-1.13   ·   contexto 32.000 tokens   ·   modality text->decisions
prompt US$0,042/MTok   ·   completion US$0 (gratis)
latencia publicada p50 246ms / p90 341ms   ·   sin imágenes   ·   choice tope 255 opciones
```

## 4. La API — los tres gotchas que cuestan media hora

**a) El catálogo de OpenRouter NO lo lista.** `GET /api/v1/models` filtra a
modelos `text->text`. Hay que pedir `?output_modalities=decisions`. Sin eso
parece que el modelo no existe (nos pasó el 19/09).

**b) NO usa `chat/completions`.** Devuelve un 400 explícito:
`"is a decisions model and cannot be used with the chat/completions endpoint"`.
Esto importa: el prefijo `openrouter:` que ya existe en `motor.ts:277` apunta a
`chat/completions`, **así que ese camino no sirve para Jev**. Necesita cliente propio.

**c) El endpoint es `POST https://openrouter.ai/api/alpha/decisions`:**

```json
{
  "model": "typesafe/jev-1.13",
  "state": "...el contexto sin estructura, string | record | array...",
  "questions": {
    "afirma_sin_respaldo": {
      "type": "noul",
      "instructions": "...la pregunta..."
    }
  }
}
```

`type` puede ser `noul`, `choice` o `score`. Los tres piden `instructions`.
**`noul` devuelve una probabilidad (0-1), no un booleano** — es justo lo que
necesita la fase veto. Respuesta:

```json
{
  "model": "typesafe/jev-1.13-20260917",
  "answers": { "afirma_sin_respaldo": { "type": "noul", "noul": 0.97 } },
  "usage": { "input_tokens": 465, "output_tokens": 26, "cost": 0.00001953 },
  "id": "gen-dec-...", "provider": "TypeSafe"
}
```

Auth: header `Authorization: Bearer $OPENROUTER_API_KEY` (ya está en `.env`).

## 5. Dónde va: un solo lugar

`bot-agente/motor.ts`, dentro del `for` sobre `partes` (~línea 2057), como
**sexto eslabón** de la cadena, después de `quitarNegativaSobreLoDerivado` y
antes del `push` a `mensajesFinalesSanitizados`.

Una sola pregunta, tipo `noul`:

> El borrador afirma algún dato duro (precio, compatibilidad, qué trae el kit,
> envío, política de la casa) que NO esté respaldado por los hechos del turno, o
> que los CONTRADIGA?

### El input — OJO, no es `hechosDeEsteTurno`

`hechosDeEsteTurno` es un `Set` de tokens pelados que sale de
`extraerHechos(JSON.stringify(...))`: cosas como `"175000"`, `"gratis"`. Sirve
para el guardrail de repetición, **no** para esto.

Lo que hay que mandar en `state` es el **resultado crudo de cada tool del turno**:
`herramientasEjecutadas[].resultado` (con su `nombre`), que está a mano en ese
mismo punto del motor. Más el borrador ya pasado por los cinco eslabones.

Lo que aportan los otros datos del contexto, si hacen falta:

* `escaladoParcial` → si algo se derivó, afirmarlo es el error de la conv 4525.
* `terminosSinMatchEnTurno` → lo que el catálogo no encontró (conv 3820).

## 6. Lo que ya medimos (19/09/2026)

11 casos reales reconstruidos de las conversaciones de arriba, más sus
contrapartes buenas. **11/11 correcto.**

| Caso | Esperado | `noul` |
|---|---|---|
| 3707 niega el pistón que el `detalle` trae | malo | **0.97** |
| 3707 ofrece los dos cilindros por un precio | malo | **0.98** |
| 3894 precio de otro producto | malo | **0.98** |
| 4525 compat derivada y la afirma igual | malo | **0.98** |
| 4394 inventa política ("levas solo en kits") | malo | **0.95** |
| 3820 cotiza el término que no matcheó | malo | **0.97** |
| precio y envío tal cual los hechos | bueno | 0.15 |
| pregunta la variante sin afirmar nada | bueno | 0.08 |
| niega pieza **entera** no vinculada | bueno | 0.10 |
| confirma compat con fila cargada | bueno | 0.17 |
| contesta solo lo cubierto, calla lo derivado | bueno | 0.08 |
| *(extra)* plazo de entrega inventado, sin dato cargado | malo | **0.94** |

Separación limpia: malos 0.94-0.98, buenos 0.08-0.17.

**Distinguió solo los dos niveles de negación del §11** sin que se lo explicaran:
negar una pieza ENTERA no vinculada = 0.10 (está bien, es dato duro); negar una
sub-pieza que el `detalle` sí trae = 0.97. Esa es la distinción que costó la 3707.

**Estabilidad — acá el `--repetir 3` no hace falta:**

```
MALO  (3707)  x5 : 0.97  0.97  0.97  0.97  0.98
BUENO         x5 : 0.13  0.14  0.14  0.14  0.14
LÍMITE plazo  x5 : 0.94  0.94  0.94  0.94  0.94
```

**Latencia real medida desde Argentina: 520-640 ms** (no los 246 ms publicados;
se paga el salto por OpenRouter). Por eso el timeout va en **1500 ms**, no 800.

**Costo: US$0,0000175 por chequeo**, unos 25 centavos por mes al volumen actual.

## 7. Lo que NO probamos (leer antes de confiar)

1. **El banco de 11 lo escribió Claude sabiendo la respuesta.** Prueba que el
   modelo *puede* hacer la distinción, no que ande sobre tráfico real.
2. **Falta el número que decide todo: la tasa de falsos positivos sobre
   borradores buenos.** Los mensajes buenos son ~95% del volumen; si Jev marca
   el 10%, como veto es inusable. Los 0.08-0.17 son alentadores y nada más.
3. **El input del test era prosa formateada a mano.** Los `resultado` reales
   serializados son bastante más sucios. Ahí se puede caer todo, y por eso existe
   la Fase 0.

## 8. El plan, por fases

### Fase 0 — Repetir el banco con los `resultado` REALES (media hora, sin tocar producción)

Script en `scratch/` (nunca `npx tsx -e` inline, se traba esperando stdin; cerrar
con `await prisma.$disconnect()` y `process.exit(0)`).

Tomar turnos de `bot_agente_turnos_reales`, serializar `herramientasEjecutadas`
tal cual quedan, y pasar los mismos 12 casos. **Si la separación se mantiene, se
sigue. Si se derrumba, el problema es el formato del `state` y se itera acá,
gratis, antes de escribir una línea de producción.**

### Fase 1 — El cliente

`bot-agente/nucleo/verificador-grounding.ts`, chico y aislado:

* Una función `verificarGrounding({ borrador, herramientasEjecutadas, escaladoParcial, terminosSinMatch })` → `{ noul, ms, costo } | null`.
* `null` en cualquier falla. **Falla abierto, siempre.**
* Timeout 1500 ms, sin reintentos (es un guardrail, no el turno).
* Lee la key de `chat_config.openrouter_api_key` con fallback a
  `process.env.OPENROUTER_API_KEY`, igual que `configuracion.ts:117`.

### Fase 2 — Sombra (2 semanas, riesgo cero)

Corre en el motor y **no frena nada**. Solo registra.

* Tabla nueva, una fila por globo: ver el SQL en §9.
* Vista en `/admin/chatwoot/chats-vivo` con los marcados, para que Martín lea
  SOLO esos y diga "estaba mal / estaba bien" con un clic.
* Chip de salud al lado del de DeepSeek si Jev se cae.

### Fase 3 — Veto (solo si la sombra da bien)

Marcado sobre el umbral → **no se manda y no se calla**:

1. Se pide un paso más al modelo avisándole qué afirmó sin respaldo.
2. Si el segundo borrador también supera el umbral → `escalar_a_humano` en silencio.

Nunca "mandalo igual" y nunca silencio mudo: las dos cosas ya sabemos que cuestan
ventas (convs 4351 y 4388).

## 9. Archivos y migraciones

**Nuevos:**

* `bot-agente/nucleo/verificador-grounding.ts` — el cliente (Fase 1).
* `n8n-workflows/bot-verificador-grounding.sql` — tabla + filas de `chat_config`.
* `bot-agente/pruebas/probar-verificador-grounding.ts` — el banco de 12 casos.

**Tocados:**

* `bot-agente/motor.ts` (~2057) — el eslabón, dentro del `for` sobre `partes`.
* `bot-agente/pruebas/casos-reales.ts` — un caso por cada conv de la tabla §1.
* `AGENTS.md` — un §12 corto cuando esté andando, no antes.

**SQL:**

```sql
CREATE TABLE IF NOT EXISTS bot_agente_verificador_grounding (
    id               SERIAL PRIMARY KEY,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    conversation_id  INTEGER,
    turno_id         INTEGER,
    borrador         TEXT NOT NULL,
    estado_tools     JSONB,          -- el `state` que se mandó, para poder re-probar
    noul             NUMERIC(4,3),   -- la probabilidad devuelta
    umbral           NUMERIC(4,3),
    marcado          BOOLEAN NOT NULL,
    accion           TEXT NOT NULL,  -- 'sombra' | 'vetado_reintento' | 'vetado_escalado'
    ms               INTEGER,
    costo_usd        NUMERIC(12,9),
    veredicto_humano TEXT            -- 'acertado' | 'falso_positivo' | NULL, lo carga Martín
);
CREATE INDEX IF NOT EXISTS idx_verif_grounding_marcado
    ON bot_agente_verificador_grounding (marcado, creado_en DESC);

INSERT INTO chat_config (clave, valor) VALUES
    ('verificador_grounding_modo',       'off'),   -- off | sombra | veto
    ('verificador_grounding_umbral',     '0.85'),
    ('verificador_grounding_modelo',     'typesafe/jev-1.13'),
    ('verificador_grounding_timeout_ms', '1500')
ON CONFLICT (clave) DO NOTHING;
```

Todo se prende y apaga desde `chat_config`, **sin deploy**, igual que
`proveedor_activo` (§10 de `AGENTS.md`). `off` es el default: se mergea sin
efecto y se prende cuando Martín quiera.

## 10. Criterios — de éxito y de matar

**Se pasa a veto solo si, a las 2 semanas de sombra:**

* cazó **≥1 borrador** que los cinco eslabones deterministas dejaron pasar, y
* la precisión sobre lo marcado es **≥80%** (`veredicto_humano`), y
* el p90 de latencia se mantiene **<1200 ms**.

**Se mata sin culpa si:**

* En 2 semanas no cazó nada → el hueco no existe en el tráfico real, y nos
  ahorramos una dependencia.
* Marca >5% de los borradores → como veto frena ventas. Se baja el umbral una
  vez y si sigue, afuera.
* La latencia p90 pasa los 2 s → no vale 2 segundos por turno.

Costo de equivocarse: 25 centavos y un `chat_config` en `off`.

## 11. Las reglas que NO se rompen

1. **Falla abierto.** Si Jev no contesta, tarda o tira error, el borrador sale
   tal cual y queda el log. Un proveedor nuevo sin SLA no puede mutear al bot.
2. **No decide nada comercial.** Compatibilidad, variante, composición y precio
   siguen siendo dato duro contra la base. Un `noul` de 0.94 **no** es un "no le
   va": es "este texto no está respaldado". Mira lo escrito, no decide la venta.
3. **No toca el prefijo estable del prompt.** El verificador es una llamada
   aparte a otro proveedor: no entra en el contexto del turno y por lo tanto no
   puede romper el cacheo del 90% (regla 1 del §10 de `AGENTS.md`).
4. **La métrica no es el costo.** Es la misma regla 3 del §10: lo que decide es
   si atajamos errores sin frenar mensajes buenos. 25 centavos no justifican nada
   por sí solos.
5. **El banco se corre igual.** `pruebas/correr-banco.ts` antes de cerrar el
   cambio, y `npx tsc --noEmit` en 0 errores.

## 12. Lo que se descartó, y por qué

Se evaluaron otros tres lugares para Jev. Se dejaron afuera **a propósito**:

* **Reemplazar los detectores de `nucleo/`** (`numeros-del-mensaje.ts`,
  `motos.ts`, `acuse-de-recibo.ts`…). Son deterministas a propósito y los sweeps
  con corpus congelado son la red que los sostiene. Un probabilístico ahí nos saca
  la reproducibilidad de los barridos.
* **Sugeridor de disparadores faltantes** para `chat_situaciones` (los falsos
  negativos tipo "Haceme precio"). Buena idea, pero mide a Jev sin arreglar nada
  solo: depende de que Martín acepte sugerencias, feedback lento. **Es el
  candidato natural para la fase 2 del proyecto**, si el verificador funciona.
* **Juez del banco de regresión** (para que `--repetir 10` sea barato). Útil y de
  riesgo bajo, pero no es producción y no ataja ninguna venta.

Un solo lugar por vez. Si el verificador no sirve, lo sacamos sin haber tocado
nada más.
