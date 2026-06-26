-- Crea únicamente la tabla de la nueva sección "Descripción Publicaciones".
-- Additivo e idempotente: no modifica ni elimina ninguna tabla existente.
CREATE TABLE IF NOT EXISTS "descripcion_publicacion" (
  "mla" TEXT NOT NULL,
  "titulo" TEXT,
  "descripcion" TEXT NOT NULL DEFAULT '',
  "permalink" TEXT,
  "estado" TEXT DEFAULT 'active',
  "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "descripcion_publicacion_pkey" PRIMARY KEY ("mla")
);

CREATE INDEX IF NOT EXISTS "descripcion_publicacion_estado_idx"
  ON "descripcion_publicacion" ("estado");
