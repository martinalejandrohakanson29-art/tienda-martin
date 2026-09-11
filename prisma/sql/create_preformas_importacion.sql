CREATE TABLE IF NOT EXISTS "preformas_importacion" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "archivo_url" TEXT,
    "tipo_archivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "observaciones" TEXT,
    "total_articulos" INTEGER NOT NULL DEFAULT 0,
    "total_unidades" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preformas_importacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "preformas_importacion_estado_idx" ON "preformas_importacion"("estado");
CREATE INDEX IF NOT EXISTS "preformas_importacion_created_at_idx" ON "preformas_importacion"("created_at");

CREATE TABLE IF NOT EXISTS "preforma_items" (
    "id" TEXT NOT NULL,
    "preforma_id" TEXT NOT NULL,
    "supplier_item_no" TEXT NOT NULL,
    "descripcion_original" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "precio_unitario_usd" DECIMAL(20,2),
    "articulo_id" TEXT,

    CONSTRAINT "preforma_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preforma_items_preforma_id_fkey" FOREIGN KEY ("preforma_id") REFERENCES "preformas_importacion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preforma_items_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos_mostrador"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "preforma_items_preforma_id_idx" ON "preforma_items"("preforma_id");
CREATE INDEX IF NOT EXISTS "preforma_items_supplier_item_no_idx" ON "preforma_items"("supplier_item_no");
CREATE INDEX IF NOT EXISTS "preforma_items_articulo_id_idx" ON "preforma_items"("articulo_id");
