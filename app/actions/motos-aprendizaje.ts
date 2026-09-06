"use server"

import { requireAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export interface MotoCanonica {
    id: number
    marca: string
    modelo: string
    nombre_completo: string
    cilindrada: number | null
    aliases: string[]
}

/**
 * Normaliza texto para comparaciones sin tildes, minúsculas y caracteres limpios
 */
function normalizarTexto(txt: string): string {
    return (txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Lista todas las motos canónicas registradas para su uso en selectores y autocompletado
 */
export async function listarMotosCanonicas(): Promise<MotoCanonica[]> {
    await requireAdmin()
    try {
        const rows = await prisma.$queryRaw<MotoCanonica[]>`
            SELECT id, marca, modelo, nombre_completo, cilindrada, aliases
            FROM motos_modelos
            ORDER BY marca ASC, modelo ASC;
        `
        return rows || []
    } catch (error) {
        console.error("Error listando motos canónicas:", error)
        return []
    }
}

/**
 * Asocia un alias o typo a una moto canónica existente.
 * Esto le enseña al sistema que cuando un cliente escriba ese typo, corresponde a este modelo.
 */
export async function asociarAliasAMoto(params: {
    motoId: number
    nuevoAlias: string
    pendienteId?: number
}): Promise<{ success: boolean; mensaje: string }> {
    await requireAdmin()
    const { motoId, nuevoAlias, pendienteId } = params
    const aliasLimpio = normalizarTexto(nuevoAlias)

    if (!aliasLimpio || aliasLimpio.length < 2) {
        throw new Error("El alias a asociar debe tener al menos 2 letras.")
    }

    try {
        const moto = await prisma.$queryRaw<MotoCanonica[]>`
            SELECT id, nombre_completo, aliases 
            FROM motos_modelos 
            WHERE id = ${motoId} 
            LIMIT 1;
        `
        if (!moto || moto.length === 0) {
            throw new Error("La moto canónica seleccionada no existe.")
        }

        const aliasesActuales: string[] = moto[0].aliases || []
        const aliasYaExiste = aliasesActuales.some((a) => normalizarTexto(a) === aliasLimpio)

        if (!aliasYaExiste) {
            const nuevosAliases = [...aliasesActuales, aliasLimpio]
            await prisma.$executeRawUnsafe(
                `UPDATE motos_modelos SET aliases = $1, actualizado_en = NOW() WHERE id = $2`,
                nuevosAliases,
                motoId
            )
        }

        // Si venía de una pregunta técnica pendiente, marcarla como respondida
        if (pendienteId) {
            await prisma.$executeRaw`
                UPDATE preguntas_tecnicas_pendientes 
                SET estado = 'respondida' 
                WHERE id = ${pendienteId};
            `
        }

        revalidatePath("/admin/chatwoot/pendientes")
        revalidatePath("/admin/chatwoot/conocimiento")

        return {
            success: true,
            mensaje: `Alias "${aliasLimpio}" asociado exitosamente a ${moto[0].nombre_completo}.`
        }
    } catch (error: any) {
        console.error("Error asociando alias a moto:", error)
        throw new Error(error.message || "Error al asociar el alias a la moto.")
    }
}

/**
 * Crea un nuevo modelo de moto canónico en el catálogo oficial
 */
export async function crearMotoCanonica(params: {
    marca: string
    modelo: string
    cilindrada?: number
    aliasInicial?: string
    pendienteId?: number
}): Promise<{ success: boolean; moto: MotoCanonica }> {
    await requireAdmin()
    const marcaLimpia = params.marca.trim()
    const modeloLimpio = params.modelo.trim()
    const nombreCompleto = `${marcaLimpia} ${modeloLimpio}`
    const cilindrada = params.cilindrada ? Number(params.cilindrada) : null

    if (!marcaLimpia || !modeloLimpio) {
        throw new Error("Marca y modelo son obligatorios.")
    }

    const aliases: string[] = [normalizarTexto(modeloLimpio), normalizarTexto(nombreCompleto)]
    if (params.aliasInicial) {
        const aLimpio = normalizarTexto(params.aliasInicial)
        if (aLimpio && !aliases.includes(aLimpio)) {
            aliases.push(aLimpio)
        }
    }

    try {
        const insertadas = await prisma.$queryRaw<MotoCanonica[]>`
            INSERT INTO motos_modelos (marca, modelo, nombre_completo, cilindrada, aliases, creado_en, actualizado_en)
            VALUES (${marcaLimpia}, ${modeloLimpio}, ${nombreCompleto}, ${cilindrada}, ${aliases}, NOW(), NOW())
            RETURNING id, marca, modelo, nombre_completo, cilindrada, aliases;
        `

        if (params.pendienteId) {
            await prisma.$executeRaw`
                UPDATE preguntas_tecnicas_pendientes 
                SET estado = 'respondida' 
                WHERE id = ${params.pendienteId};
            `
        }

        revalidatePath("/admin/chatwoot/pendientes")
        revalidatePath("/admin/chatwoot/conocimiento")

        return {
            success: true,
            moto: insertadas[0]
        }
    } catch (error: any) {
        console.error("Error creando moto canónica:", error)
        throw new Error(error.message || "Error al crear la moto canónica.")
    }
}
