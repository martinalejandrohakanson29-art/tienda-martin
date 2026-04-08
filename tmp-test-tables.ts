import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'`
    console.log("Tables in DB:", tables)
  } catch (e) {
    console.error("Error fetching data:", e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
