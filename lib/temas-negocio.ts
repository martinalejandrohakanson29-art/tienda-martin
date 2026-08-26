// Vocabulario exacto que usa el clasificador "Extraer Tema Negocio" en
// workflow_mateo.json — mantenerlo sincronizado con esas 6 opciones.
export const TEMAS_NEGOCIO = [
    { value: "ubicacion", label: "Ubicación / dirección" },
    { value: "horarios", label: "Horarios de atención" },
    { value: "medios_pago", label: "Medios de pago" },
    { value: "envios", label: "Formas de envío" },
    { value: "garantia", label: "Garantía" },
    { value: "mayorista", label: "Venta por mayor / reventa" },
    { value: "otro", label: "Otro" },
] as const
