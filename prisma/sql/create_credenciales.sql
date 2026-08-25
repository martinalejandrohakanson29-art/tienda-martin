CREATE TABLE "credenciales" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "usuario" TEXT,
    "passwordCifrada" TEXT NOT NULL,
    "url" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "editadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credenciales_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
