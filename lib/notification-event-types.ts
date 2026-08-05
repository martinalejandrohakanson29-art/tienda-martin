export const EVENT_TYPES = [
    { value: "ESTADO_PEDIDO_CHANGED", label: "Cambio de estado de pedido" },
    { value: "VENTA_MOSTRADOR_CREADA", label: "Nueva venta en mostrador" },
    { value: "PEDIDO_COMPRA_CREADO", label: "Nuevo pedido de compra" },
    { value: "PEDIDO_PREPARADO_FOTO", label: "Pedido preparado (fotos cargadas) en ML" },
    { value: "ENVIO_LISTO_AUDITORIA", label: "Envío listo para auditar (Herramientas)" },
    { value: "PEDIDO_PREPARADO_FULL", label: "Pedido preparado Full (foto cargada)" },
    { value: "PEDIDO_VENTA_PREPARADO_FOTO", label: "Pedido de venta preparado (foto cargada)" },
    { value: "PEDIDO_VENTA_PDF_SUBIDO", label: "PDF subido en Pedidos de Venta" },
    { value: "PEDIDO_MAYORISTA_WEB", label: "Nuevo pedido mayorista (web)" },
    // A diferencia del resto, este no lo dispara la app: lo manda n8n a
    // /api/n8n/error cuando falla el workflow del bot de WhatsApp.
    { value: "N8N_WORKFLOW_ERROR", label: "Falló el bot de WhatsApp (n8n)" },
]
