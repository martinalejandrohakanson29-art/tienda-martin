// app/actions/config.ts
"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

/**
 * Obtiene la configuración global de la tienda (Dólar, FOB, etc.)
 */
export async function getConfig() {
    const config = await prisma.config.findFirst()
    return config
}

/**
 * Actualiza la configuración y RECALCULA todos los costos de los artículos
 */
export async function updateConfig(data: any) {
    // 1. Buscamos si ya existe una configuración
    const existingConfig = await prisma.config.findFirst()
    let config;

    // 2. Guardamos los nuevos valores (Dólar, FOB, Financiación, etc.)
    if (existingConfig) {
        config = await prisma.config.update({
            where: { id: existingConfig.id },
            data: { ...data },
        })
    } else {
        config = await prisma.config.create({
            data: { ...data }
        })
    }

    // 3. ⚡ ACTUALIZACIÓN MASIVA DE PRECIOS ⚡
    // Si los datos que estamos guardando incluyen valores de costo, 
    // ejecutamos un comando directo a la base de datos para actualizar TODO.
    if (data.dolarCotizacion !== undefined || data.factorFob !== undefined || data.recargoFinanciacion !== undefined) {
        
        // Tomamos los nuevos valores o los que ya estaban guardados
        const dolar = Number(data.dolarCotizacion ?? existingConfig?.dolarCotizacion ?? 1);
        const fob = Number(data.factorFob ?? existingConfig?.factorFob ?? 1);
        const financ = Number(data.recargoFinanciacion ?? existingConfig?.recargoFinanciacion ?? 0);

        // SQL Puro: Esto es ultra rápido y actualiza todos los artículos en un milisegundo.
        // Solo afecta el cálculo si "es_dolar" es TRUE.
        await prisma.$executeRaw`
            UPDATE costos_articulos
            SET costo_final_ars = CASE 
                WHEN es_dolar = true THEN 
                    (costo_usd * ${dolar} * ${fob}) * (1 + (${financ} / 100.0))
                ELSE 
                    costo_usd
            END,
            fecha_actualizacion = NOW()
        `;
    }
    
    // 4. Refrescamos todas las pantallas para que los cambios se vean ya mismo
    revalidatePath("/admin/mercadolibre/articulos")
    revalidatePath("/admin/mercadolibre/costos") // Para que los Kits de ML se actualicen
    revalidatePath("/", "layout") 
    
    return config
}
