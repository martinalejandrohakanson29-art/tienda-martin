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

    // Landing Trust Bar
    showTrustBar:          z.boolean().optional(),
    trust1Title:           z.string().max(100).optional(),
    trust1Desc:            z.string().max(250).optional(),
    trust2Title:           z.string().max(100).optional(),
    trust2Desc:            z.string().max(250).optional(),
    trust3Title:           z.string().max(100).optional(),
    trust3Desc:            z.string().max(250).optional(),
    trust4Title:           z.string().max(100).optional(),
    trust4Desc:            z.string().max(250).optional(),

    // Landing SEO Section
    showSeoSection:        z.boolean().optional(),
    seoTitle:              z.string().max(150).optional(),
    seoSubtitle:           z.string().max(300).optional(),
    seoText1:              z.string().max(2000).optional(),
    seoText2:              z.string().max(2000).optional(),
    seoTags:               z.string().max(500).optional(),

    // FAQ Section Toggle
    showFaqSection:        z.boolean().optional(),
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
    revalidatePath("/")

    return config
}

export const getLandingFaqs = unstable_cache(
    async () => {
        try {
            return await prisma.landingFaq.findMany({
                orderBy: { order: "asc" },
            })
        } catch (error) {
            console.error("Error fetching landing FAQs:", error)
            return []
        }
    },
    ["landing-faqs"],
    { revalidate: 300, tags: ["landing-faqs"] }
)

const FaqSchema = z.object({
    id: z.string().optional(),
    question: z.string().min(3, "La pregunta debe tener al menos 3 caracteres").max(300),
    answer: z.string().min(5, "La respuesta debe tener al menos 5 caracteres").max(3000),
    order: z.number().int().default(0),
    isActive: z.boolean().default(true),
})

export async function saveLandingFaq(raw: unknown) {
    await requireAdmin();

    const parsed = FaqSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: "Datos de pregunta inválidos", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    let faq;
    if (data.id) {
        faq = await prisma.landingFaq.update({
            where: { id: data.id },
            data: {
                question: data.question,
                answer: data.answer,
                order: data.order,
                isActive: data.isActive,
            },
        })
    } else {
        faq = await prisma.landingFaq.create({
            data: {
                question: data.question,
                answer: data.answer,
                order: data.order,
                isActive: data.isActive,
            },
        })
    }

    revalidateTag("landing-faqs")
    revalidatePath("/")
    revalidatePath("/admin/config")

    return { success: true, faq }
}

export async function deleteLandingFaq(id: string) {
    await requireAdmin();

    try {
        await prisma.landingFaq.delete({ where: { id } })
        revalidateTag("landing-faqs")
        revalidatePath("/")
        revalidatePath("/admin/config")
        return { success: true }
    } catch (error) {
        return { error: "Error al eliminar la pregunta frecuente" }
    }
}

export async function seedDefaultLandingFaqs() {
    await requireAdmin();

    const defaultFaqs = [
        {
            question: "¿Hacen envíos a todo el país y cuánto demora la entrega?",
            answer: "Sí, despachamos todos los días a toda la Argentina a través de Correo Argentino, Andreani y encomiendas a terminal de ómnibus. Una vez despachado tu pedido, te enviamos el código de seguimiento para que puedas rastrearlo en tiempo real. Los envíos suelen demorar entre 2 a 5 días hábiles según la localidad.",
            order: 1,
            isActive: true,
        },
        {
            question: "¿Qué medios de pago aceptan?",
            answer: "Aceptamos todas las tarjetas de crédito y débito a través de pasarelas seguras (con opciones de cuotas), dinero en cuenta de Mercado Pago y transferencias bancarias directas con descuentos especiales.",
            order: 2,
            isActive: true,
        },
        {
            question: "¿Cómo sé si un repuesto o kit de potenciación es compatible con mi moto?",
            answer: "En cada ficha de producto detallamos los modelos, años y medidas de compatibilidad. Si te queda alguna duda sobre preparación, cruce de levas, relaciones o medidas de cilindro, escribinos por WhatsApp y nuestro equipo técnico te asesora al instante.",
            order: 3,
            isActive: true,
        },
        {
            question: "¿Hacen ventas mayoristas para talleres mecánicos y casas de repuestos?",
            answer: "¡Sí! Contamos con precios mayoristas directos para talleres mecánicos, preparadores de competición y casas de repuestos de todo el país. Podés consultar nuestro catálogo mayorista en la sección Mayoristas de la web.",
            order: 4,
            isActive: true,
        },
        {
            question: "¿Tienen local comercial para retirar personalmente?",
            answer: "Sí, podés retirar tus compras por nuestro punto de atención en Córdoba Capital o comprar directamente en el mostrador. Consultanos por WhatsApp para coordinar tu retiro.",
            order: 5,
            isActive: true,
        },
    ]

    for (const f of defaultFaqs) {
        const existing = await prisma.landingFaq.findFirst({
            where: { question: f.question },
        })
        if (!existing) {
            await prisma.landingFaq.create({ data: f })
        }
    }

    revalidateTag("landing-faqs")
    revalidatePath("/")
    revalidatePath("/admin/config")

    return { success: true }
}

