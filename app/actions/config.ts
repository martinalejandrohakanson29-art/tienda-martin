// app/actions/config.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { requireAdmin } from "@/lib/auth-guard"
import { z } from "zod"

export const getConfig = unstable_cache(
    async () => prisma.config.findFirst(),
    ["config"],
    { revalidate: 300, tags: ["config"] }
)

const ConfigSchema = z.object({
    companyName:           z.string().min(1).max(100).optional(),
    whatsappNumber:        z.string().max(20).optional(),
    instagramUrl:          z.string().url().or(z.literal("")).optional(),
    tiktokUrl:             z.string().url().or(z.literal("")).optional(),
    welcomeText:           z.string().max(500).optional(),
    locationUrl:           z.string().url().or(z.literal("")).optional(),
    paymentMethods:        z.string().max(200).optional(),
    carouselHeightDesktop: z.string().max(20).optional(),
    carouselHeightMobile:  z.string().max(20).optional(),
    logoUrl:               z.string().max(500).optional(),
    logoHeight:            z.string().max(20).optional(),
    announcementText:      z.string().max(300).optional(),
    dolarCotizacion:       z.number().positive().optional(),
    factorFob:             z.number().positive().optional(),
    recargoFinanciacion:   z.number().min(0).optional(),
})

export async function updateConfig(raw: unknown) {
    await requireAdmin();

    const parsed = ConfigSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: "Datos de configuración inválidos", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const existingConfig = await prisma.config.findFirst()
    let config;

    if (existingConfig) {
        config = await prisma.config.update({ where: { id: existingConfig.id }, data })
    } else {
        config = await prisma.config.create({ data: data as any })
    }

    revalidateTag("config")
    revalidatePath("/admin/listas/articulos-importados")
    revalidatePath("/admin/mercadolibre/costos")
    revalidatePath("/", "layout")

    return config
}
