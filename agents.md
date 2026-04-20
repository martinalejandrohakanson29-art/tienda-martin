# agents.md: Análisis Arquitectónico y Roles del Sistema

Este documento describe la arquitectura, los componentes clave y los roles lógicos (Agentes) del sistema de tienda en línea, basado en el análisis de la estructura de archivos, modelos de base de datos (Prisma) y lógica de negocio (Actions).

## 🚀 Resumen General del Proyecto
El proyecto es una plataforma de comercio electrónico (e-commerce) robusta, construida con Next.js 14, que gestiona inventario, ventas en múltiples canales (Web y Mostrador), y un complejo sistema de cálculo de rentabilidad. La arquitectura está fuertemente orientada a la gestión de datos transaccionales y la automatización de procesos financieros.

## 🧩 Componentes Clave y Tecnologías
*   **Framework:** Next.js 14 (Server Components, Force Dynamic).
*   **Base de Datos:** PostgreSQL (a través de Prisma).
*   **Gestión de Estado/Configuración:** Uso de `app/actions/config.ts` para centralizar parámetros críticos como tipo de cambio (`dolarCotizacion`) y factores de costo (`factorFob`).
*   **Flujos Críticos:** La actualización de costos es un proceso de **actualización masiva en la base de datos** (`$executeRaw`) al modificar la configuración, lo que implica que cualquier cambio en `Config` afecta inmediatamente a todos los precios.
*   **Integraciones:** Se observa integración con MercadoPago y servicios de logística/auditoría.

## 👥 Roles Lógicos del Sistema (Agentes)

Se definen los siguientes roles basados en las responsabilidades de los modelos de datos y las funciones de acción:

### 1. Administrador de Inventario (Inventory Manager)
**Responsabilidad Principal:** Mantener la disponibilidad y la visibilidad de los productos.
**Funcionalidades Clave:**
*   **CRUD de Productos:** Creación, actualización y eliminación de productos (`app/actions/products.ts`).
*   **Control de Visibilidad:** Gestión de productos Destacados (`isFeatured`) y de Vidriera/Últimos Ingresos (`showOnHome`), respetando límites estrictos (8 destacados, 10 en vidriera).
*   **Gestión de Stock:** Registro de entradas de stock mediante la función `crearCompra` (`app/actions/compras.ts`), la cual garantiza la atomicidad de la actualización de stock en la base de datos.

### 2. Gestor de Precios y Costos (Pricing & Cost Manager)
**Responsabilidad Principal:** Definir la estructura de costos y precios de venta.
**Funcionalidades Clave:**
*   **Configuración Global:** Mantenimiento de parámetros macroeconómicos y de negocio (Dólar, FOB, Recargo Financiamiento) en `Config`.
*   **Actualización de Costos:** Ejecución de la actualización masiva de costos en la base de datos al modificar la configuración, asegurando que todos los precios reflejen los cambios de manera inmediata.

### 3. Analista de Rentabilidad (Profitability Analyst)
**Responsabilidad Principal:** Monitorear la salud financiera de cada producto.
**Funcionalidades Clave:**
*   **Cálculo Dinámico:** Ejecuta la lógica compleja de márgenes (`getRentabilidadData`), considerando tarifas de ML (`mLFees`) y descuentos (`mLDescuentos`).
*   **Sincronización:** Es responsable de disparar *webhooks* y sincronizar los resultados calculados en la tabla `RentabilidadCalculada`, actuando como un orquestador de datos financieros.

### 4. Gestor de Ventas (Sales Manager)
**Responsabilidad Principal:** Registrar y procesar transacciones de ingresos.
**Flujos de Venta:**
*   **Venta Web:** Maneja el ciclo de vida de las ventas en línea (`WebSale`), incluyendo la actualización de estados de pago y datos de cliente.
*   **Venta Mostrador:** Registra transacciones físicas (`Venta`), que se integran con el sistema de inventario al momento de la compra.

### 5. Gestor de Logística y Auditoría (Logistics & Audit Manager)
**Responsabilidad Principal:** Trazabilidad de movimientos y cumplimiento de procesos.
**Funcionalidades Clave:**
*   **Auditoría:** Registra acciones en el inventario y ventas (`ArticuloAuditoria`, `VentaAuditoria`).
*   **Logística:** Gestiona el proceso de envío y preparación de etiquetas (`Shipment`, `EtiquetaML`).

## 🗺️ Flujos de Trabajo Críticos (Workflows)

1.  **Ciclo de Vida del Producto:**
    *   `[Inventario Manager]` $\rightarrow$ Crea/Actualiza Producto $\rightarrow$ `[Pricing Manager]` (si se cambia la configuración) $\rightarrow$ `[Profitability Analyst]` (si se dispara la actualización) $\rightarrow$ Producto visible en `[Sales Manager]` (Web/Mostrador).
2.  **Ciclo de Ingreso de Stock:**
    *   `[Inventory Manager]` $\rightarrow$ Registra Compra $\rightarrow$ **Transacción DB** $\rightarrow$ Stock en `ArticuloMostrador` se incrementa.
3.  **Ciclo de Rentabilidad:**
    *   `[Pricing Manager]` (Cambio de Config) $\rightarrow$ `[Profitability Analyst]` (Dispara `triggerRentabilidadUpdate`) $\rightarrow$ Datos actualizados en `RentabilidadCalculada`.

## 📝 Cambios Recientes en la Implementación

### Modificación: Pestaña "Listado de Ventas" - Acordeón Desplegable
**Fecha:** 2026-04-06
**Archivo Modificado:** `app/admin/ventas-mostrador/ventas-client.tsx`

**Descripción del Cambio:**
Se implementó un sistema de acordeón desplegable en la pestaña "Listado de Ventas" para mostrar los detalles de cada venta de manera más eficiente.

**Cambios Técnicos:**

1.  **Nuevo Estado Agregado:**
    ```typescript
    const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());
    ```
    Este estado controla qué ventas tienen desplegados sus artículos.

2.  **Nuevo Icono Importado:**
    ```typescript
    import { ..., ChevronDown } from "lucide-react";
    ```

3.  **Tabla Modificada:**
    - Se eliminó la columna "Artículos" de la vista principal
    - Se agregó un botón con icono `ChevronDown` que muestra la cantidad de artículos
    - Al hacer clic en la fila o en el botón, se despliega/oculta la sección de artículos
    - El icono rota 180° cuando la venta está desplegada

4.  **Comportamiento del Acordeón:**
    - **Vista Compacta:** Cada fila muestra solo información básica (Hora, Cliente, botón de artículos, Método, Cupón/De, Trans/Para, Info, Total)
    - **Vista Desplegada:** Al hacer clic, se muestra una fila adicional con todos los artículos de la venta, incluyendo:
      - Nombre del artículo (clicable para copiar)
      - ID del artículo (clicable para copiar)
      - Cantidad (xN)
      - Subtotal
    - **Scroll Interno:** La sección de artículos tiene un `max-h-64 overflow-y-auto` para permitir scroll si hay muchos artículos

**Beneficios:**
- Mejor uso del espacio vertical en la tabla
- Posibilidad de ver múltiples ventas sin ocupar todo el espacio
- Interacción intuitiva con clic simple
- Información de artículos disponible solo cuando se necesita

### Modificación: Funcionalidad de Creación y Venta de Packs en Mostrador
**Fecha:** 2026-04-14
**Archivos Modificados:** `prisma/schema.prisma`, `app/actions/ventas-mostrador.ts`, `app/admin/ventas-mostrador/ventas-client.tsx`

**Descripción del Cambio:**
Se implementó un sistema para "Packs" en las ventas de mostrador que permiten agrupar múltiples artículos bajo uno solo (ej. Kit Limpieza = Cepillo + Lubricante). Esto difiere y es totalmente independiente del sistema de Kits de Mercado Libre en `kits.ts`.

**Cambios Técnicos:**

1.  **Prisma / Base de Datos:**
    - Se añadió `esPack Boolean? @default(false)` al modelo `ArticuloMostrador`.
    - Se creó un nuevo modelo de cruce `PackMostradorItem` con relaciones Many-to-Many hacia `ArticuloMostrador` delimitando explícitamente `packId` y `componenteId`.
    
2.  **Lógica del Servidor (Actions):**
    - `crearPackMostrador`: Nueva Server Action para persistir el pack como artículo e insertar sus componentes.
    - Se alteró la transacción en `crearVentaMostrador` y `actualizarVentaMostrador` para detectar si el ítem manipulado es un Pack (`esPack`). En ese caso, itera por `packItems` para descontar el stock de sus componentes directos escalados por la cantidad dada.
    - El stock visible de un producto tipo Pack es un stock virtual computado al momento de consulta aplicando la cantidad mínima posible calculada en base a sus componentes.

3.  **Frontend / UI:**
    - Botón "Crear Pack" visible en "Venta Mostrador" pestaña "Registrar Venta".
    - Nuevo Modal (`Diseñar Nuevo Pack`) que permite seleccionar, listar y combinar artículos estándares.
    - Modificación visual del estado en el buscador instantáneo demarcando con un tag visual `[PACK]`.

**Beneficios:**
- Mejor gestión de inventario para promociones locales sin mezclar stocks.
- Automatización del descuento múltiple del inventario en venta por mostrador.

### Modificación: Estados y Observaciones en Pedidos de Venta
**Fecha:** 2026-04-20
**Archivos Modificados:** `prisma/schema.prisma`, `app/actions/ventas-mostrador.ts`, `app/admin/ventas-mostrador/ventas-client.tsx`, `app/admin/erp/pedidos-venta/pedidos-venta-client.tsx`

**Descripción del Cambio:**
Se implementó un flujo de estados para los Pedidos de Venta en el ERP y se mejoró la captura y visualización de las observaciones asociadas al pedido.

**Cambios Técnicos:**

1.  **Prisma / Base de Datos:**
    - Se añadió `estadoPedido String? @default("PENDIENTE")` al modelo `Venta` para registrar el estado de preparación.

2.  **Lógica del Servidor (Actions):**
    - `actualizarEstadoPedido`: Nueva Server Action para modificar únicamente el campo `estadoPedido` en la base de datos sin alterar el `tipoVenta`.

3.  **Frontend / UI:**
    - **Ventas Mostrador:** Se reemplazó el `Input` por un `Textarea` en el modal de cobro y se mejoró la etiqueta a "Observaciones / Datos de Envío" para incentivar la carga de datos del comprador.
    - **Pedidos ERP:** Se añadió un selector visual (`<select>`) con colores dinámicos según el estado (`PENDIENTE`, `LISTO_PARA_PREPARAR`, `PREPARADO`, `DESPACHADO`).
    - Las observaciones se muestran destacadas al desplegar el acordeón de artículos de cada pedido.
    - El botón de confirmación cambió su finalidad declarada a "Registrar Venta", pasando el pedido al listado general de ventas y descontando stock de manera definitiva.

**Beneficios:**
- Mayor control sobre el flujo logístico interno.
- Claridad en las instrucciones de entrega y empaquetado para el equipo.

### Modificación: Separación de Pedidos de Ventas
**Fecha:** 2026-04-20
**Archivos Modificados:** `app/actions/ventas-mostrador.ts`

**Descripción del Cambio:**
Se implementó la separación lógica entre pedidos de venta y ventas confirmadas. Anteriormente, cuando se seleccionaba "Guardar como pedido", la venta también aparecía en la pestaña "Listado de ventas". Ahora, los pedidos se listan exclusivamente en `/admin/erp/pedidos-venta`.

**Cambios Técnicos:**

1.  **Lógica del Servidor (Actions):**
    - **[`obtenerVentasPorRango()`](app/actions/ventas-mostrador.ts:90):** Se agregó filtro `tipoVenta: { not: "PEDIDO" }` para excluir pedidos del listado de ventas.
    - **[`obtenerVentasPorFecha()`](app/actions/ventas-mostrador.ts:44):** Se agregó filtro `tipoVenta: { not: "PEDIDO" }` para excluir pedidos del listado de ventas por fecha.

2.  **Flujo de Trabajo:**
    - **Guardar como pedido:** `tipoVenta = "PEDIDO"` → Aparece SOLO en `/admin/erp/pedidos-venta`
    - **Confirmar y guardar:** `tipoVenta = "CONFIRMADA"` → Aparece en `/admin/ventas-mostrador` (Listado de Ventas)
    - **Confirmar pedido en ERP:** `tipoVenta = "CONFIRMADA"` → Se mueve de pedidos a ventas confirmadas

**Beneficios:**
- Separación clara entre pedidos pendientes y ventas confirmadas.
- Evita duplicación de datos en listados.
- Mejor organización del flujo de trabajo del equipo.

### Modificación: Generación de PDF para Pedidos de Venta
**Fecha:** 2026-04-20
**Archivos Modificados:** `app/actions/envios.ts`, `app/admin/erp/pedidos-venta/pdf-preview.tsx`, `app/admin/erp/pedidos-venta/pedidos-venta-client.tsx`

**Descripción del Cambio:**
Se implementó la opción para cada pedido de venta listado, de abrir en una pestaña nueva un PDF con los datos del pedido de venta (nombre del cliente, artículos que lo componen y observaciones cargadas).

**Cambios Técnicos:**

1.  **Lógica del Servidor (Actions):**
    - **[`generarPedidoPDF()`](app/actions/envios.ts:11):** Nueva Server Action que llama al webhook de n8n para generar el PDF del pedido usando una plantilla.

2.  **Componente de Vista Previa:**
    - **[`PDFPreview.tsx`](app/admin/erp/pedidos-venta/pdf-preview.tsx):** Nuevo componente que muestra los datos del pedido en un formato optimizado para impresión/PDF, con:
      - Datos del cliente (nombre, vendedor, método de pago)
      - Tabla de artículos con cantidades y precios
      - Observaciones / Datos de envío
      - Botón de impresión que genera y abre el PDF en una nueva pestaña

3.  **Frontend / UI:**
    - **[`pedidos-venta-client.tsx`](app/admin/erp/pedidos-venta/pedidos-venta-client.tsx:346):** Se añadió un nuevo botón con icono `Eye` en la columna de acciones de cada pedido que abre el modal de vista previa del PDF.

**Beneficios:**
- Generación rápida de documentos imprimibles para cada pedido.
- Visualización clara de los datos del pedido antes de imprimir.
- Integración con el workflow de n8n para generación de PDFs profesionales.

### Modificación: Edición de Pedidos de Venta
**Fecha:** 2026-04-20
**Archivos Modificados:** `app/actions/ventas-mostrador.ts`, `app/admin/erp/pedidos-venta/pedidos-venta-client.tsx`

**Descripción del Cambio:**
Se implementó la opción para modificar los datos de cada pedido de venta listado. Se agregó un botón de edición que abre un modal con todos los campos del pedido.

**Cambios Técnicos:**

1.  **Lógica del Servidor (Actions):**
    - **[`obtenerPedidoPorId()`](app/actions/ventas-mostrador.ts:659):** Nueva Server Action para obtener un pedido específico por su ID para editar.
    - **[`actualizarPedidoVenta()`](app/actions/ventas-mostrador.ts:690):** Nueva Server Action para actualizar los datos de un pedido de venta, incluyendo la gestión de stock de los artículos.

2.  **Frontend / UI:**
    - **[`pedidos-venta-client.tsx`](app/admin/erp/pedidos-venta/pedidos-venta-client.tsx:429):** Se añadió un nuevo botón con icono `Edit` en la columna de acciones de cada pedido que abre el modal de edición.
    - **Modal de Edición:** Nuevo modal que permite modificar:
      - Cliente, Vendedor, Total, Interés, Total Final
      - Método de Pago, DNI, Teléfono, Email
      - Observaciones / Datos de Envío
    - El modal carga los datos del pedido al abrirse y actualiza el stock automáticamente al guardar.

**Beneficios:**
- Permite corregir errores en los datos del pedido antes de confirmarlo.
- Gestión automática del stock al modificar los artículos del pedido.
- Auditoría de cambios mediante `VentaAuditoria`.

**IMPORTANTE:**
- en local siempre se ejecutara en windows 11 o en linux mint.
- El usuario no tiene amplios conocimientos ni de codigo, ni de desarrollo, ni de base de datos. tenlo en cuenta a la hora de explicarle cosas o de pedirle que haga algo.
- siempre que realices una modificacion agrega los cambios correspondientes en este archivo agents.md
