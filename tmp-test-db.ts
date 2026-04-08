import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const data = await prisma.numerosMayoristas.findMany()
    console.log("Data from DB:", data)
  } catch (e: any) {
    console.error("Error meta:", e.meta)
    console.error("Error message:", e.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
