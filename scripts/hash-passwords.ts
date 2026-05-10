/**
 * Script de migración única: hashea todas las contraseñas en texto plano.
 *
 * IMPORTANTE: ejecutar UNA sola vez antes del primer login post-despliegue.
 * Requiere DATABASE_URL en el entorno.
 *
 * Uso:
 *   npx tsx scripts/hash-passwords.ts
 */

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()

  if (users.length === 0) {
    console.log("No hay usuarios en la base de datos.")
    return
  }

  console.log(`Procesando ${users.length} usuario(s)...`)

  for (const user of users) {
    // Si ya está hasheada (bcrypt empieza con $2b$), la saltear
    if (user.password.startsWith("$2b$") || user.password.startsWith("$2a$")) {
      console.log(`  [SKIP] ${user.username} — contraseña ya hasheada`)
      continue
    }

    const hashed = await bcrypt.hash(user.password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    })
    console.log(`  [OK]   ${user.username} — contraseña hasheada`)
  }

  console.log("\nMigración completada.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
