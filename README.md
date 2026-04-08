# Tienda Martino - E-commerce Next.js

Proyecto de tienda en línea desarrollado con Next.js 14, que gestiona inventario, ventas en múltiples canales (Web y Mostrador), y un sistema de cálculo de rentabilidad.

## 🚀 Características Principales

- **Gestión de Inventario**: CRUD completo de productos con control de visibilidad (Destacados, Vidriera)
- **Ventas Multi-canal**: 
  - Venta Web (e-commerce)
  - Venta Mostrador (ventas físicas)
- **Cálculo de Rentabilidad**: Sistema complejo de márgenes considerando tarifas de MercadoLibre y descuentos
- **Integraciones**: MercadoPago, servicios de logística y auditoría
- **Dashboard Administrativo**: Panel completo para gestión de todos los aspectos del negocio

## 🛠️ Tecnologías

- **Framework**: Next.js 14 (Server Components, Force Dynamic)
- **Base de Datos**: PostgreSQL (a través de Prisma)
- **Autenticación**: NextAuth.js
- **Estilos**: Tailwind CSS
- **UI Components**: Radix UI
- **Tablas de Datos**: TanStack Table
- **Integraciones**: MercadoPago, Google APIs, AWS S3

## 📁 Estructura del Proyecto

```
├── app/                    # Aplicación Next.js 14 App Router
│   ├── admin/             # Panel administrativo
│   ├── api/               # API routes
│   ├── products/          # Página de producto individual
│   ├── shop/              # Página de tienda
│   └── ...
├── components/            # Componentes reutilizables
├── hooks/                 # Custom hooks
├── lib/                   # Utilidades y configuraciones
├── prisma/               # Configuración de base de datos
└── actions/              # Actions para operaciones asíncronas
```

## 🚦 Roles del Sistema

El sistema está organizado en 5 roles lógicos (Agentes):

1. **Administrador de Inventario**: CRUD de productos, control de visibilidad, gestión de stock
2. **Gestor de Precios y Costos**: Configuración global (Dólar, FOB, Recargo), actualización de costos
3. **Analista de Rentabilidad**: Cálculo dinámico de márgenes, sincronización con MercadoLibre
4. **Gestor de Ventas**: Registro y procesamiento de transacciones (Web y Mostrador)
5. **Gestor de Logística y Auditoría**: Trazabilidad de movimientos y cumplimiento de procesos

## 📦 Instalación

```bash
# Clonar el repositorio
git clone <url-del-repositorio>

# Instalar dependencias
npm install

# Generar Prisma Client
npm run dev

# Abrir en el navegador
http://localhost:3000
```

## ⚙️ Configuración

1. Copiar el archivo `.env.example` a `.env`
2. Configurar las siguientes variables de entorno:
   - `DATABASE_URL`: Conexión a PostgreSQL
   - `NEXTAUTH_SECRET`: Secret para NextAuth
   - `NEXTAUTH_URL`: URL del sitio
   - `DOLAR_COTIZACION`: Tipo de cambio
   - `FACTOR_FOB`: Factor FOB
   - Variables de MercadoPago, AWS S3, etc.

## 📊 Base de Datos

El proyecto utiliza Prisma ORM con PostgreSQL. Las tablas principales incluyen:

- `ArticuloMostrador`: Productos del inventario
- `Config`: Configuración global (Dólar, FOB, etc.)
- `RentabilidadCalculada`: Cálculos de rentabilidad
- `WebSale`: Ventas en línea
- `Venta`: Ventas en mostrador
- `ArticuloAuditoria`: Auditoría de inventario
- `VentaAuditoria`: Auditoría de ventas

## 🔐 Seguridad

- Autenticación con NextAuth.js
- Variables de entorno para credenciales sensibles
- `.gitignore` configurado para no subir credenciales

## 📝 Licencia

Este proyecto es parte de un curso de Coderhouse.
