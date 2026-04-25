#!/bin/bash

# 1. Sincronizar la base de datos
npx prisma db push --accept-data-loss

# 2. Construir la aplicación
npm run build

# 3. Preparar los archivos estáticos para el modo standalone
# Crear carpetas de destino si no existen
mkdir -p .next/standalone/.next/static
mkdir -p .next/standalone/public

# Copiar el contenido de static
cp -r .next/static/. .next/standalone/.next/static/

# Copiar public solo si existe la carpeta
if [ -d "public" ]; then
  cp -r public/. .next/standalone/public/
fi

echo "¡Construcción y preparación de estáticos completada!"
