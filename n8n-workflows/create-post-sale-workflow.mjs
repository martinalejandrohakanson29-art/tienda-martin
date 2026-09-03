import { writeFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.N8N_URL || "https://n8n.revolucionmotos.tech/api/v1";
const API_KEY = process.env.APIKEY_N8N || process.env.API_KEY_N8N || process.env.N8N_KEY || process.env.N8N_API_KEY;
const WORKFLOW_ID = "9Rdq6Tk7icFrkdl9";

if (!API_KEY) {
  console.error("Falta APIKEY_N8N en el entorno");
  process.exit(1);
}

const workflowDefinition = {
  name: "ML - Mensajes Post-Venta Automáticos",
  nodes: [
    // 1. Webhook receptor principal para Orders y Shipments
    {
      parameters: {
        httpMethod: "POST",
        path: "ml-ventas-postventa",
        options: {},
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      id: "node-webhook-ml-postventa",
      name: "Webhook Notificaciones ML",
      webhookId: "ml-ventas-postventa-hook",
    },

    // 2. Parser y clasificador del recurso entrante
    {
      parameters: {
        jsCode: `// Extraer y clasificar notificación entrante de Mercado Libre
const body = $json.body || $json;
let resource = String(body.resource || '').trim();
let topic = String(body.topic || '').trim().toLowerCase();
let orderId = '';
let shipmentId = '';
let eventType = 'ignore';

// 1. Identificar VENTAS / ÓRDENES:
if (topic === 'orders_v2' || topic === 'orders' || resource.startsWith('/orders/')) {
  eventType = 'order';
  if (resource.startsWith('/orders/')) {
    orderId = resource.replace('/orders/', '').replace(/[^0-9]/g, '');
  } else if (body.order_id || body.id) {
    orderId = String(body.order_id || body.id).replace(/[^0-9]/g, '');
  }
} 
// 2. Identificar ENVÍOS / SHIPMENTS (para entregas Full):
else if (topic === 'shipments' || resource.startsWith('/shipments/')) {
  eventType = 'shipment';
  if (resource.startsWith('/shipments/')) {
    shipmentId = resource.replace('/shipments/', '').replace(/[^0-9]/g, '');
  } else if (body.shipment_id) {
    shipmentId = String(body.shipment_id).replace(/[^0-9]/g, '');
  }
}

// Validar que realmente tengamos un identificador numérico
if (eventType === 'order' && !orderId) {
  eventType = 'ignore';
}
if (eventType === 'shipment' && !shipmentId) {
  eventType = 'ignore';
}

return [{
  json: {
    type: eventType,
    order_id: orderId,
    shipment_id: shipmentId,
    topic,
    resource,
    user_id: body.user_id || null,
    received_at: new Date().toISOString()
  }
}];`,
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [240, 0],
      id: "node-clasificar-notificacion",
      name: "Clasificar Notificación ML",
    },

    // 3. Partidor: ¿Es Orden?
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-es-order",
              leftValue: "={{ $json.type }}",
              rightValue: "order",
              operator: {
                type: "string",
                operation: "equals",
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [480, 0],
      id: "node-if-es-orden",
      name: "¿Es Orden?",
    },

    // 3b. Partidor: ¿Es Envío? (Filtra claims, items, stock, questions, etc.)
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-es-shipment",
              leftValue: "={{ $json.type }}",
              rightValue: "shipment",
              operator: {
                type: "string",
                operation: "equals",
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [480, 200],
      id: "node-if-es-envio",
      name: "¿Es Envío?",
    },

    // -------------------------------------------------------------
    // RAMA A: NUEVA ORDEN (Venta inmediata o diferida Full)
    // -------------------------------------------------------------
    {
      parameters: {
        workflowId: {
          __rl: true,
          value: "MUsInFnHGy2zWvn0",
          mode: "list",
          cachedResultUrl: "/workflow/MUsInFnHGy2zWvn0",
          cachedResultName: "Read_token",
        },
        options: {},
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [720, -120],
      id: "node-read-token-ml-order",
      name: "Obtener Token ML (Orden)",
    },
    {
      parameters: {
        method: "GET",
        url: "=https://api.mercadolibre.com/orders/{{ $('Clasificar Notificación ML').first().json.order_id }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, -120],
      id: "node-http-get-order",
      name: "Consultar Orden en ML",
    },
    {
      parameters: {
        method: "POST",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/evaluar",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ order_id: $('Clasificar Notificación ML').first().json.order_id, order_data: $json }) }}",
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1200, -120],
      id: "node-evaluar-reglas-app",
      name: "Evaluar Reglas Post-Venta en App",
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-should-send",
              leftValue: "={{ $json.should_send }}",
              rightValue: true,
              operator: {
                type: "boolean",
                operation: "true",
                singleValue: true,
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1440, -120],
      id: "node-if-should-send-order",
      name: "¿Enviar Mensaje Directo?",
    },
    {
      parameters: {
        method: "POST",
        url: "=https://api.mercadolibre.com/messages/packs/{{ $json.pack_id }}/sellers/{{ $json.seller_id }}?tag=post_sale",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $('Obtener Token ML (Orden)').first().json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ from: { user_id: Number($json.seller_id) || $json.seller_id }, to: { user_id: Number($json.buyer_id) || $json.buyer_id }, text: $json.mensaje }) }}",
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1680, -220],
      id: "node-enviar-mensaje-ml-order",
      name: "Enviar Mensaje Post-Venta ML",
    },
    {
      parameters: {
        method: "POST",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/registrar",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  log_id: $('Evaluar Reglas Post-Venta en App').first().json.log_id,
  order_id: $('Evaluar Reglas Post-Venta en App').first().json.order_id,
  pack_id: $('Evaluar Reglas Post-Venta en App').first().json.pack_id,
  shipment_id: $('Evaluar Reglas Post-Venta en App').first().json.shipment_id,
  buyer_id: $('Evaluar Reglas Post-Venta en App').first().json.buyer_id,
  seller_id: $('Evaluar Reglas Post-Venta en App').first().json.seller_id,
  id_articulo: $('Evaluar Reglas Post-Venta en App').first().json.id_articulo,
  mla: $('Evaluar Reglas Post-Venta en App').first().json.mla,
  tipo_logistica: $('Evaluar Reglas Post-Venta en App').first().json.tipo_logistica,
  es_full: $('Evaluar Reglas Post-Venta en App').first().json.is_full,
  mensaje: $('Evaluar Reglas Post-Venta en App').first().json.mensaje,
  regla_id: $('Evaluar Reglas Post-Venta en App').first().json.regla_id,
  estado: ($json.status === 400 || $json.status === 403 || $json.error || $json.cause) ? 'error' : 'enviado',
  error_detalle: $json.message || $json.error || ($json.cause ? JSON.stringify($json.cause) : null)
}) }}`,
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1920, -220],
      id: "node-registrar-log-app-order",
      name: "Registrar Log en App (Orden)",
    },

    // -------------------------------------------------------------
    // RAMA B: NOTIFICACIÓN DE ENVÍO (Shipments -> Delivered)
    // -------------------------------------------------------------
    {
      parameters: {
        workflowId: {
          __rl: true,
          value: "MUsInFnHGy2zWvn0",
          mode: "list",
          cachedResultUrl: "/workflow/MUsInFnHGy2zWvn0",
          cachedResultName: "Read_token",
        },
        options: {},
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [720, 140],
      id: "node-read-token-ml-shipment",
      name: "Obtener Token ML (Shipment)",
    },
    {
      parameters: {
        method: "GET",
        url: "=https://api.mercadolibre.com/shipments/{{ $('Clasificar Notificación ML').first().json.shipment_id }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, 140],
      id: "node-http-get-shipment",
      name: "Consultar Shipment en ML",
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-shipment-delivered",
              leftValue: "={{ $json.status }}",
              rightValue: "delivered",
              operator: {
                type: "string",
                operation: "equals",
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1200, 140],
      id: "node-if-shipment-delivered",
      name: "¿Shipment Entregado?",
    },
    {
      parameters: {
        method: "POST",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/procesar-entrega",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ shipment_id: $('Clasificar Notificación ML').first().json.shipment_id, shipment_data: $json }) }}",
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1440, 140],
      id: "node-procesar-entrega-full-app",
      name: "Procesar Entrega Full en App",
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-tenia-pendiente-full",
              leftValue: "={{ $json.should_send }}",
              rightValue: true,
              operator: {
                type: "boolean",
                operation: "true",
                singleValue: true,
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1680, 140],
      id: "node-if-tenia-pendiente-full",
      name: "¿Tenía Mensaje Full Pendiente?",
    },
    {
      parameters: {
        method: "POST",
        url: "=https://api.mercadolibre.com/messages/packs/{{ $json.pack_id }}/sellers/{{ $json.seller_id }}?tag=post_sale",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $('Obtener Token ML (Shipment)').first().json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ from: { user_id: Number($json.seller_id) || $json.seller_id }, to: { user_id: Number($json.buyer_id) || $json.buyer_id }, text: $json.mensaje }) }}",
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1920, 60],
      id: "node-enviar-mensaje-ml-full",
      name: "Enviar Mensaje Entrega Full ML",
    },
    {
      parameters: {
        method: "POST",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/registrar",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  log_id: $('Procesar Entrega Full en App').first().json.log_id,
  order_id: $('Procesar Entrega Full en App').first().json.order_id,
  estado: ($json.status === 400 || $json.status === 403 || $json.error || $json.cause) ? 'error' : 'enviado',
  error_detalle: $json.message || $json.error || ($json.cause ? JSON.stringify($json.cause) : null)
}) }}`,
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [2160, 60],
      id: "node-actualizar-log-app-full",
      name: "Actualizar Log a Enviado (Full)",
    },

    // -------------------------------------------------------------
    // RAMA C: CRON DE RESPALDO (Polling periódico de entregas Full)
    // -------------------------------------------------------------
    {
      parameters: {
        rule: {
          interval: [
            {
              field: "hours",
              hoursInterval: 1,
            },
          ],
        },
      },
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 400],
      id: "node-cron-pendientes-full",
      name: "Cron Cada 1 Hora (Revisar Full)",
    },
    {
      parameters: {
        method: "GET",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/pendientes-full",
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [240, 400],
      id: "node-get-pendientes-full-app",
      name: "Consultar Pendientes Full en App",
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-hay-pendientes",
              leftValue: "={{ $json.total }}",
              rightValue: 0,
              operator: {
                type: "number",
                operation: "gt",
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [480, 400],
      id: "node-if-hay-pendientes-full",
      name: "¿Hay Pendientes Full?",
    },
    {
      parameters: {
        jsCode: `const items = $json.data || [];
return items.map(item => ({ json: item }));`,
      },
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 320],
      id: "node-explode-pendientes-full",
      name: "Desglosar Pendientes Full",
    },
    {
      parameters: {
        workflowId: {
          __rl: true,
          value: "MUsInFnHGy2zWvn0",
          mode: "list",
          cachedResultUrl: "/workflow/MUsInFnHGy2zWvn0",
          cachedResultName: "Read_token",
        },
        options: {},
      },
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [960, 320],
      id: "node-read-token-cron",
      name: "Obtener Token ML (Cron)",
    },
    {
      parameters: {
        method: "GET",
        url: "=https://api.mercadolibre.com/shipments/{{ $('Desglosar Pendientes Full').item.json.shipment_id }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1200, 320],
      id: "node-http-get-shipment-cron",
      name: "Consultar Estado Shipment (Cron)",
    },
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
            version: 2,
          },
          conditions: [
            {
              id: "cond-cron-delivered",
              leftValue: "={{ $json.status }}",
              rightValue: "delivered",
              operator: {
                type: "string",
                operation: "equals",
              },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1440, 320],
      id: "node-if-cron-delivered",
      name: "¿Entregado (Cron)?",
    },
    {
      parameters: {
        method: "POST",
        url: "=https://api.mercadolibre.com/messages/packs/{{ $('Desglosar Pendientes Full').item.json.pack_id || $('Desglosar Pendientes Full').item.json.order_id }}/sellers/{{ $('Desglosar Pendientes Full').item.json.seller_id }}?tag=post_sale",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "=Bearer {{ $('Obtener Token ML (Cron)').first().json[\"Access Token\"] }}",
            },
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ from: { user_id: Number($('Desglosar Pendientes Full').item.json.seller_id) || $('Desglosar Pendientes Full').item.json.seller_id }, to: { user_id: Number($('Desglosar Pendientes Full').item.json.buyer_id) || $('Desglosar Pendientes Full').item.json.buyer_id }, text: $('Desglosar Pendientes Full').item.json.mensaje }) }}",
        options: {
          ignoreHttpStatusErrors: true,
        },
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1680, 240],
      id: "node-enviar-mensaje-ml-cron",
      name: "Enviar Mensaje Post-Venta (Cron)",
    },
    {
      parameters: {
        method: "POST",
        url: "https://revolucionmotos.tech/api/mercadolibre/mensajes-post-venta/registrar",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Content-Type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  log_id: $('Desglosar Pendientes Full').item.json.log_id,
  order_id: $('Desglosar Pendientes Full').item.json.order_id,
  estado: ($json.status === 400 || $json.status === 403 || $json.error || $json.cause) ? 'error' : 'enviado',
  error_detalle: $json.message || $json.error || ($json.cause ? JSON.stringify($json.cause) : null)
}) }}`,
        options: {},
      },
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1920, 240],
      id: "node-actualizar-log-app-cron",
      name: "Actualizar Log a Enviado (Cron)",
    },
  ],

  // -------------------------------------------------------------
  // CONEXIONES
  // -------------------------------------------------------------
  connections: {
    // 0. Entrada Webhook a Clasificador
    "Webhook Notificaciones ML": {
      main: [[{ node: "Clasificar Notificación ML", type: "main", index: 0 }]],
    },
    // 1. Clasificador a IF Orden
    "Clasificar Notificación ML": {
      main: [[{ node: "¿Es Orden?", type: "main", index: 0 }]],
    },
    // 2. IF Es Orden -> Rama A (True) / False -> IF Es Envío
    "¿Es Orden?": {
      main: [
        [{ node: "Obtener Token ML (Orden)", type: "main", index: 0 }],
        [{ node: "¿Es Envío?", type: "main", index: 0 }],
      ],
    },
    // 3. IF Es Envío -> Rama B (True) / False -> Ignorado (claims, items, etc)
    "¿Es Envío?": {
      main: [
        [{ node: "Obtener Token ML (Shipment)", type: "main", index: 0 }],
        [],
      ],
    },

    // Rama A (Orden)
    "Obtener Token ML (Orden)": {
      main: [[{ node: "Consultar Orden en ML", type: "main", index: 0 }]],
    },
    "Consultar Orden en ML": {
      main: [[{ node: "Evaluar Reglas Post-Venta en App", type: "main", index: 0 }]],
    },
    "Evaluar Reglas Post-Venta en App": {
      main: [[{ node: "¿Enviar Mensaje Directo?", type: "main", index: 0 }]],
    },
    "¿Enviar Mensaje Directo?": {
      main: [
        [{ node: "Enviar Mensaje Post-Venta ML", type: "main", index: 0 }],
        [],
      ],
    },
    "Enviar Mensaje Post-Venta ML": {
      main: [[{ node: "Registrar Log en App (Orden)", type: "main", index: 0 }]],
    },

    // Rama B (Shipment)
    "Obtener Token ML (Shipment)": {
      main: [[{ node: "Consultar Shipment en ML", type: "main", index: 0 }]],
    },
    "Consultar Shipment en ML": {
      main: [[{ node: "¿Shipment Entregado?", type: "main", index: 0 }]],
    },
    "¿Shipment Entregado?": {
      main: [
        [{ node: "Procesar Entrega Full en App", type: "main", index: 0 }],
        [],
      ],
    },
    "Procesar Entrega Full en App": {
      main: [[{ node: "¿Tenía Mensaje Full Pendiente?", type: "main", index: 0 }]],
    },
    "¿Tenía Mensaje Full Pendiente?": {
      main: [
        [{ node: "Enviar Mensaje Entrega Full ML", type: "main", index: 0 }],
        [],
      ],
    },
    "Enviar Mensaje Entrega Full ML": {
      main: [[{ node: "Actualizar Log a Enviado (Full)", type: "main", index: 0 }]],
    },

    // Rama C (Cron de respaldo)
    "Cron Cada 1 Hora (Revisar Full)": {
      main: [[{ node: "Consultar Pendientes Full en App", type: "main", index: 0 }]],
    },
    "Consultar Pendientes Full en App": {
      main: [[{ node: "¿Hay Pendientes Full?", type: "main", index: 0 }]],
    },
    "¿Hay Pendientes Full?": {
      main: [
        [{ node: "Desglosar Pendientes Full", type: "main", index: 0 }],
        [],
      ],
    },
    "Desglosar Pendientes Full": {
      main: [[{ node: "Obtener Token ML (Cron)", type: "main", index: 0 }]],
    },
    "Obtener Token ML (Cron)": {
      main: [[{ node: "Consultar Estado Shipment (Cron)", type: "main", index: 0 }]],
    },
    "Consultar Estado Shipment (Cron)": {
      main: [[{ node: "¿Entregado (Cron)?", type: "main", index: 0 }]],
    },
    "¿Entregado (Cron)?": {
      main: [
        [{ node: "Enviar Mensaje Post-Venta (Cron)", type: "main", index: 0 }],
        [],
      ],
    },
    "Enviar Mensaje Post-Venta (Cron)": {
      main: [[{ node: "Actualizar Log a Enviado (Cron)", type: "main", index: 0 }]],
    },
  },
  settings: {
    callerPolicy: "workflowsFromSameOwner",
    executionOrder: "v1",
  },
};

async function main() {
  console.log(`Actualizando workflow ${WORKFLOW_ID} en n8n...`);
  const res = await fetch(`${API_URL}/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers: {
      "X-N8N-API-KEY": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflowDefinition),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Error al actualizar workflow en n8n:", res.status, data);
    process.exit(1);
  }

  console.log("Workflow actualizado con éxito!");

  // Reactivar el workflow
  console.log("Activando workflow...");
  const actRes = await fetch(`${API_URL}/workflows/${WORKFLOW_ID}/activate`, {
    method: "POST",
    headers: {
      "X-N8N-API-KEY": API_KEY,
      "Content-Type": "application/json",
    },
  });

  const actData = await actRes.json();
  console.log("Estado de activación:", actRes.ok ? "ACTIVO" : "Error al activar", actData);

  // Guardar copia local de respaldo
  writeFileSync(
    new URL(`./workflow_postventa_mercadolibre_${WORKFLOW_ID}.json`, import.meta.url),
    JSON.stringify(data, null, 2),
    "utf8"
  );
  console.log(`Backup actualizado en n8n-workflows/workflow_postventa_mercadolibre_${WORKFLOW_ID}.json`);
}

main().catch(console.error);
