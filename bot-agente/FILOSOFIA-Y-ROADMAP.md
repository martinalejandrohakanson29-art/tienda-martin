# Bot Agente de WhatsApp — Filosofía, Arquitectura y Roadmap

Este documento es la **constitución técnica y operativa** del nuevo Agente de WhatsApp para **Revolución Motos**.
Define las reglas intocables, el modelo mental de diseño, la separación de responsabilidades y la guía paso a paso para su desarrollo y evolución.

---

## 1. Por qué existe este Agente (El problema de raíz)

El bot de WhatsApp original (`workflow_mateo`, 257 nodos en n8n) y su sucesor ("Respuestas chatwoot 2.0", 450+ nodos en n8n) demostraron un problema estructural:
* Intentar resolver el **lenguaje natural humano** mediante grafos de nodos deterministas (`If`, `Switch`, `Code`, variables de Redis) genera una **explosión combinatoria**.
* Cada cliente formula sus preguntas de manera diferente (*"cuanto sale?"*, *"junto plata y te aviso"*, *"es para carrera corta y soy de Salta, tenés stock?"*).
* Tapar cada nuevo caso con más nodos o parsers termina rompiendo ramas anteriores (*"carrera contra los errores"*).

Por el otro lado, dejar a una IA "libre" con un prompt gigante de 5.000 palabras o un RAG descontrolado genera **alucinaciones**:
* Inventa compatibilidades mecánicas erróneas (peligroso en repuestos).
* Inventa precios viejos o stock inexistente.
* Se toma atribuciones que no le corresponden.

### La solución: Agente con Herramientas (Tool Calling) en Código
Un punto medio moderno, robusto y limpio:
1. **La IA es el cerebro de entendimiento y redacción.**
2. **El código y la Base de Datos son los dueños exclusivos de la verdad y los números.**
3. **Las Herramientas (Tools) son el puente entre ambos.**

---

## 2. Las 5 Reglas de Oro (Intocables)

1. **La IA es el Mozo, la Base de Datos es la Cocina:**
   * El mozo atiende al cliente con amabilidad, entiende lo que pide y le lleva la comanda a la cocina.
   * El mozo **NO cocina**. La IA nunca calcula precios, nunca asume stock y nunca inventa compatibilidades mecánicas por su cuenta.
   * Si una herramienta no devuelve el dato, la IA no tiene permitido afirmarlo.

2. **Silencio absoluto ante la duda (Cero alucinación):**
   * Si la consulta es técnica y no está en la base de datos, o si es un reclamo, problema de envío o situación compleja, la IA **no inventa excusas ni dice "esperame que pregunto"**.
   * Ejecuta inmediatamente la herramienta `escalar_a_humano()`, genera la nota privada en Chatwoot para el equipo y **se queda en silencio cara al cliente**.

3. **Voz de Revolución Motos:**
   * Habla en primera persona singular o plural como vendedor/dueño del negocio en mostrador ("tenemos", "somos de Córdoba", "te comento").
   * Tono amigable, de confianza, claro y conciso (estilo cordobés respetuoso).
   * **Sin signos de apertura `¿` en las preguntas:** Solo signo de cierre `?` (ej: *"Decime qué modelo de moto tenés?"*).
   * **Nunca revelar que es una IA** ni hablar en tercera persona impersonal.

4. **Cero riesgo para Producción:**
   * El workflow actual en n8n continúa en producción sin interrupciones.
   * Este agente se desarrolla y prueba en un entorno aislado dentro de la aplicación con un simulador dedicado (`/admin/chatwoot/simulador`).
   * No se conecta a números reales hasta superar con éxito todo el banco de pruebas.

5. **Simplicidad y Modularidad:**
   * Código TypeScript limpio, tipado y autocontenido.
   * Cada herramienta tiene un solo propósito y no supera las ~50 líneas.
   * Nada de archivos monolíticos inmanejables.

---

## 3. Arquitectura del Agente

```
                                  ┌────────────────────────┐
                                  │   WhatsApp / Cliente   │
                                  └───────────┬────────────┘
                                              │ Mensaje
                                              ▼
                                  ┌────────────────────────┐
                                  │   Chatwoot / Webhook   │
                                  └───────────┬────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Tu App Web: /api/bot (Motor del Agente)                                                │
│                                                                                        │
│   1. Contexto & Historial ──► LLM (OpenAI / Anthropic / DeepSeek)                      │
│                                 │                                                      │
│                                 │ [Pide ejecutar herramienta en JSON]                  │
│                                 ▼                                                      │
│   2. Ejecución de Herramienta:                                                         │
│      ├── consultar_compatibilidad(moto, kit)     ──► SQL / Prisma                      │
│      ├── consultar_precio_y_pack(kit_o_id)       ──► SQL / chat_packs                  │
│      ├── consultar_info_negocio(envio, etc.)     ──► SQL / info_negocio                │
│      └── escalar_a_humano(motivo, resumen)       ──► Nota Chatwoot (Silencio)          │
│                                 │                                                      │
│                                 │ [Datos duros retornados]                             │
│                                 ▼                                                      │
│   3. Síntesis y Redacción ──► LLM (Genera mensaje amigable final con la voz del local) │
└─────────────────────────────────────────────┬──────────────────────────────────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Mensaje a Chatwoot     │
                                  └────────────────────────┘
```

---

## 4. Estructura de Archivos en `bot-agente/`

* `FILOSOFIA-Y-ROADMAP.md`: Este documento.
* `tipos.ts`: Tipos TypeScript compartidos (mensajes, herramientas, respuestas).
* `motor.ts`: Bucle de ejecución Tool Calling (llamada a la IA -> ejecución de tools -> síntesis).
* `herramientas/`:
  * `index.ts`: Registro central de herramientas.
  * `compatibilidad.ts`: Consulta de tabla `compatibilidades` / `kit_compatibilidad`.
  * `catalogo-precios.ts`: Consulta de `chat_packs` y `chat_pack_grupos`.
  * `info-negocio.ts`: Consulta de `info_negocio` (envíos, pagos, ubicación, etc.).
  * `escalar-humano.ts`: Guardrail que escala al panel de pendientes en silencio.
* `prompts/`:
  * `sistema.ts`: Prompt maestro con la personalidad de Revolución Motos y directivas de tools.
* `pruebas/`:
  * `casos-reales.ts`: Banco de pruebas con casos históricos difíciles para verificar regresiones.

---

## 5. Roadmap de Implementación

- [x] **Fase 1: Constitución y Estructura Base**
  - Documentación rectora (`FILOSOFIA-Y-ROADMAP.md`).
  - Definición de tipos e interfaces TypeScript.
  - Implementación de las 4 herramientas base contra PostgreSQL/Prisma.
  - Redacción del Prompt del Sistema con la voz de Revolución Motos.
- [ ] **Fase 2: Motor de Ejecución (Tool Calling Runner)**
  - Implementación de `motor.ts` con manejo de fallback, prompt caching y timeouts.
  - Manejo inteligente del escalado silencioso (cuando la herramienta es de escalado, el bot no manda texto público).
- [ ] **Fase 3: Simulador Web en `/admin/chatwoot/simulador`**
  - Interfaz visual para que Martín pueda probar cualquier mensaje.
  - Muestra en pantalla: mensaje de entrada, herramientas ejecutadas, datos devueltos de la DB, tiempo de respuesta (ms) y respuesta final.
- [ ] **Fase 4: Validación del Banco de Pruebas**
  - Ejecución de los 10 casos históricos documentados.
  - Calibración del tono y de los casos borde.
- [ ] **Fase 5: Prueba Piloto Controlada**
  - Conexión con un número o conversación de prueba en Chatwoot.
  - Monitoreo de latencias y consumo de tokens.
