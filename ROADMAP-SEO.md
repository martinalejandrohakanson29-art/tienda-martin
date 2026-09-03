# Hoja de Ruta SEO y Próximos Pasos (Revolución Motos)

Este documento registra el estado de las optimizaciones de posicionamiento web (SEO), indexación en Google, herramientas de análisis y los pasos exactos para continuar desde cualquier otra sesión o computadora.

---

## 📊 Herramientas Conectadas & Monitoreo
1. **Google Search Console:**
   * **Propiedad:** `https://www.revolucionmotos.com.ar`
   * **Token en código:** `Gn_aY20nKi-dwdSKqZtRTTSTpDLM7QDs_deowOl_IbA` (en `app/layout.tsx`)
   * **Sitemap enviado:** `https://www.revolucionmotos.com.ar/sitemap.xml`
2. **Google Analytics 4 (GA4):**
   * **ID de Medición:** `G-7K1WWFS8JD` (en `app/layout.tsx`)
3. **Google Business Profile (Google Maps):**
   * **Ficha oficial:** `https://maps.app.goo.gl/Xk1TKtYBPEAao9LQ6`
   * **Categoría oficial:** *Tienda de repuestos de motocicletas* (IMPORTANTE: NO taller mecánico)
   * **Teléfono:** `0351 240-4003` / WhatsApp `5493512404003`

---

## ✅ Puntos Completados

### Punto 1: Optimización de la Landing Page & Panel Admin
* **Barra de Beneficios y Servicios (`LandingTrustBar`):**
  * Franja industrial oscura con 4 bloques clave: Envíos a todo el país, Medios de pago, Asesoramiento técnico y Local en Córdoba.
* **Bloque Semántico de Autoridad SEO (`LandingSeoSection`):**
  * Encabezado H2 y párrafos con alta densidad de palabras clave orgánicas (Honda Wave, Titán 150, Tornado 250, XR, Yamaha YBR, kits de potenciación, cilindros, levas de cruce).
  * Chips de marcas con enlaces directos a la búsqueda.
* **Acordeón de Preguntas Frecuentes (`LandingFaq`):**
  * Acordeón con estilo técnico/racing + inyección de Schema JSON-LD `FAQPage` para conseguir fragmentos enriquecidos con desplegable en Google.
* **Panel de Control en `/admin/config`:**
  * Pestaña dedicada **Landing & SEO** para editar textos de beneficios, bloque semántico y gestión completa (crear, editar, ocultar y borrar) de FAQs.
* **Base de datos:**
  * Tabla `landing_faqs` y columnas añadidas en `Config` en PostgreSQL.

### Punto 2: Arquitectura Web, Categorías y Slugs de Productos
* **Landing Pages Dedicadas por Categoría (`/categoria/[slug]`):**
  * URLs indexables para cada rubro: `/categoria/cilindros`, `/categoria/levas`, `/categoria/carburadores`, `/categoria/escapes`, `/categoria/combos`, `/categoria/tableros-digitales`.
  * Metadatos específicos (`title`, `description`, `keywords`), H1 dedicado, contador de stock y Schema `BreadcrumbList`.
* **URLs de Producto Semánticas (SEO Slugs):**
  * Ruta `/products/[id]/[slug]` (ej: `/products/cmjahzydm0000nsj3j02ayp4f/cilindro-potenciado-yamaha-fz-16-200cc-competicion`).
  * 100% de retrocompatibilidad: las URLs anteriores `/products/[id]` siguen funcionando sin romper ningún enlace.
  * Etiquetas `canonical` y Schema `Product` actualizados.
* **Sitemap XML (`app/sitemap.ts`):**
  * Incluye todas las categorías con prioridad 0.9 y frecuencia diaria, y productos con su slug semántico.
* **Resolución de Warnings & Errores:**
  * Se eliminaron los warnings de `Decimal objects are not supported` serializando los productos antes de pasar a componentes cliente.
  * Se eliminó el error `GET /icon.png 500` removiendo archivos conflictivos en `app/` para que Next.js sirva limpiamente los iconos estáticos desde `public/icon.png`.

### Punto 3: SEO Local, Enlaces Nativos & Arquitectura Web (Completado)
* **Enlaces HTML Nativos (`<a>` / `<Link>`):**
  * `ProductCard`: Se reemplazó la navegación JavaScript por enlaces `<Link>` reales envolviendo imagen y título para que Googlebot rastree el 100% de productos y traspase PageRank con anchor texts descriptivos.
  * `CategoryMenu`: Los botones interactivos se convirtieron a `<Link>` nativos con tema visual rojo competición.
  * `Header`: Enlace directo permanente a `/mayoristas` tanto en desktop como en móvil.
* **Footer de Alto Impacto SEO (`components/footer.tsx`):**
  * Columna de categorías dinámicas obtenidas directamente de la base de datos (`getUniqueCategories()`), asegurando link juice continuo hacia todas las categorías.
  * Columna de navegación y servicios (Tienda completa, Venta mayorista B2B, medios de pago).
  * Columna de ubicación local en Córdoba y enlace directo verificado a Google Maps.
  * Iconos SVG locales optimizados (WhatsApp, Instagram, TikTok) eliminando llamadas externas a Wikimedia.
* **Canonical Root & Reglas de Rastreo (`robots.ts` & `layout.tsx`):**
  * `app/layout.tsx`: Canonical estricto configurado en `alternates.canonical` hacia `https://www.revolucionmotos.com.ar`.
  * `app/robots.ts`: Regla `allow` ampliada para incluir `/categoria/` y `/guias/`.
* **Datos Estructurados Enriquecidos (Google Search Console & Maps):**
  * `app/layout.tsx`: Schema `AutoPartsStore` enriquecido con geocoordenadas (`GeoCoordinates`), rango de precios (`$$`), horarios de atención comercial (`openingHoursSpecification`) y `areaServed: "AR"`.
  * `app/products/[id]/page.tsx`: Inyección de Schema `BreadcrumbList` (Inicio > Tienda > Categoría > Producto) para que Google muestre rutas navegables en los resultados de búsqueda.
  * `HomeCarousel`: Textos `alt` optimizados con palabras clave locales y de potenciación + carga prioritaria (`loading="eager"`) en el primer slide.

---

## 📌 Punto 4 (PENDIENTE PARA LA PRÓXIMA SESIÓN): Guías Técnicas y Blog de Potenciación

### Objetivo del Punto 4:
Capturar tráfico de búsqueda técnica de usuarios que buscan soluciones antes de comprar:
* *"Cómo preparar una Honda Wave 110 para que ande más"*
* *"Qué árbol de levas poner para calle vs competición"*
* *"Qué carburador le va mejor a un Titán 150 llevado a 190cc"*
* *"Relación de piñón y corona: velocidad final vs salida"*

### Tareas para Implementar el Punto 4:
1. **Modelo en Base de Datos (`prisma/schema.prisma`):**
   ```prisma
   model Guia {
     id           String   @id @default(cuid())
     slug         String   @unique
     titulo       String
     descripcion  String   @db.Text
     contenido    String   @db.Text
     categoria    String?
     imagenUrl    String?
     productosIds String[] // IDs de productos recomendados para mostrar al pie
     publicado    Boolean  @default(true)
     vistas       Int      @default(0)
     createdAt    DateTime @default(now())
     updatedAt    DateTime @updatedAt

     @@index([slug])
     @@index([publicado])
     @@map("guias_tecnicas")
   }
   ```
2. **Página Pública de Guías:**
   * Listado en `/guias` con tarjetas de cada artículo.
   * Vista de artículo en `/guias/[slug]` con texto, imágenes, Schema `Article` de Google y una sección al final:  
     👉 *"Productos recomendados para este armado"* (mostrando las tarjetas `ProductCard` de los kits correspondientes con botón de compra directo).
3. **Panel de Gestión en `/admin/guias`:**
   * CRUD para redactar, editar, activar/desactivar artículos y seleccionar qué repuestos del catálogo recomendar en cada guía.
4. **Sitemap:**
   * Sumar `/guias` y todas las URLs `/guias/[slug]` a `app/sitemap.ts`.

---

## 💬 Instrucción para continuar en otra sesión:
Cuando inicies sesión desde otra computadora y quieras continuar, dile al asistente:
> *"Continuemos con el Punto 4 del archivo ROADMAP-SEO.md (sección de Guías Técnicas y Blog de Potenciación con productos relacionados)."*
