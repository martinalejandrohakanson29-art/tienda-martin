export function slugify(text: string): string {
  if (!text) return ""
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9]+/g, "-") // Reemplazar caracteres no alfanuméricos por guiones
    .replace(/^-+|-+$/g, "") // Eliminar guiones al inicio y al final
    .slice(0, 90)
}

interface CategoryInfo {
  title: string
  description: string
  keywords: string[]
}

const CATEGORY_SEO_MAP: Record<string, CategoryInfo> = {
  cilindros: {
    title: "Cilindros y Kits de Cilindrada para Motos",
    description: "Kits de cilindro armados, pistones forjados y camisas potenciadas para Honda Wave, Titán 150, Tornado 250, Yamaha y marcas líderes con envíos a todo el país.",
    keywords: ["cilindro para moto", "kit potenciacion cilindro", "cilindro titan 150", "cilindro wave 110", "cilindro tornado 250", "pistones motos cordoba"],
  },
  levas: {
    title: "Árboles de Levas de Competición y Calle",
    description: "Árboles de levas trabajados con cruce y alzada para calle y circuito. Mejorá la aceleración y velocidad final de tu moto con envíos a toda Argentina.",
    keywords: ["arbol de levas moto", "leva competicion", "leva para titan 150", "leva wave 110", "levas con cruce"],
  },
  carburadores: {
    title: "Carburadores Cortina Plana y de Competición",
    description: "Carburadores cortina plana, guillotina y estándar de alto flujo (28mm, 30mm, 32mm, 34mm) para motos de competición y preparación con stock inmediato.",
    keywords: ["carburador cortina plana", "carburador para moto", "carburador 28mm", "carburador 30mm", "carburador pwk"],
  },
  escapes: {
    title: "Escapes Deportivos y de Competición para Motos",
    description: "Sistemas de escape deportivos y silenciadores para optimizar la salida de gases y el sonido de tu motor. Envíos directos a toda Argentina.",
    keywords: ["escapes para motos", "escape deportivo moto", "escape competicion", "escape titan 150", "escape tornado"],
  },
  combos: {
    title: "Kits de Potenciación y Combos en Oferta",
    description: "Combos armados listos para colocar: cilindro, leva, carburador y resortes con precios promocionales y asesoramiento mecánico personalizado.",
    keywords: ["kits de potenciacion motos", "combos potenciacion", "kit 190cc titan", "kit 125cc wave", "combo cilindro y leva"],
  },
  "tableros-digitales": {
    title: "Tableros Digitales e Instrumentales para Motos",
    description: "Tableros digitales universales y específicos con velocímetro, tacómetro RPM, odómetro e indicador de marchas. Envíos a todo el país.",
    keywords: ["tablero digital moto", "velocimetro digital", "instrumental moto", "tablero universal moto"],
  },
}

export function getCategorySeoData(categoryName: string): CategoryInfo {
  const slug = slugify(categoryName)
  const defaultInfo: CategoryInfo = {
    title: `${categoryName} para Motos`,
    description: `Catálogo completo de ${categoryName.toLowerCase()} para motos. Encontrá repuestos y kits de alta calidad con envíos a toda Argentina.`,
    keywords: [categoryName.toLowerCase(), "repuestos motos", "revolucion motos"],
  }

  return CATEGORY_SEO_MAP[slug] || defaultInfo
}

export function matchCategoryFromSlug(slug: string, availableCategories: string[]): string | null {
  const normalizedSlug = slugify(slug)
  return (
    availableCategories.find((cat) => slugify(cat) === normalizedSlug) || null
  )
}
