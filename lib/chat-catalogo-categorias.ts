// Tipo de pieza, para el matching de artículos sueltos del catálogo del bot
// (ver n8n-workflows/chat-catalogo-categorias.sql para el porqué). Lista
// abierta a propósito: texto libre en la base, esta constante es solo la
// que ofrece el selector del admin — sumar una categoría nueva es agregar
// una línea acá, sin migración.
export const CATEGORIAS_ARTICULO = [
    "cilindro original",
    "cilindro potenciado",
    "carburador",
    "codo de admisión",
    "filtro de aire",
    "escape",
    "leva",
    "tapa de cilindros",
    "corona de distribución",
    "otro",
] as const
