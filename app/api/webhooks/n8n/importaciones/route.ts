import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")
        if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const { items } = body 

        if (!Array.isArray(items)) {
            return NextResponse.json({ error: "Formato inválido. Se espera un array 'items'." }, { status: 400 })
        }

        // --- DEBUGGING PARA PRODUCCIÓN ---
        if (items.length > 0) {
            console.log("🔍 Muestra del primer ítem recibido de n8n:", JSON.stringify(items[0], null, 2))
            // Esto te mostrará en los logs de Railway las claves exactas (ej: "SKU", "sku", "codigo", etc)
        }
        // ---------------------------------

        console.log(`📡 Recibiendo ${items.length} items de n8n...`)

        // Filtramos items sin SKU válido para evitar el error de "undefined"
        const validItems = items.filter((item: any) => {
             const sku = item.CODIGO_SISTEMA || item.sku || item.SKU; // Agregué variantes comunes
             return sku && String(sku).trim() !== "" && String(sku) !== "undefined";
        });

        if (validItems.length === 0) {
             console.warn("⚠️ Se recibieron items pero ninguno tenía un SKU/Código válido según el mapeo actual.");
             return NextResponse.json({ success: false, message: "No se encontraron SKUs válidos en los datos enviados." });
        }

        const operations = validItems.map((item: any) => {
            // Mapeo más robusto (intenta mayúsculas/minúsculas)
            const skuVal = String(item.CODIGO_SISTEMA || item.sku || item.SKU);
            const nameVal = String(item.ARTICULO || item.name || item.Nombre || "Sin Nombre");
            const supplierVal = String(item.PROVEEDOR || item.supplier || item.Proveedor || "Desconocido");
            
            // Parseo seguro de números
            const stockVal = Number(item.STOCK_ACTUAL || item.stock || 0);
            const ventasVal = Number(item.VENTAS_ML || item.sales || 0);
            const velocityVal = Number(item.PROMEDIO_CONSUMO || item.velocity || 0);
            const coverageVal = Number(item.MESES_STOCK || item.coverage || 0);

            return prisma.supplierProduct.upsert({
                where: { sku: skuVal },
                create: {
                    sku: skuVal,
                    name: nameVal,
                    supplier: supplierVal,
                    stockExternal: stockVal,
                    salesLast30: ventasVal,
                    salesVelocity: velocityVal,
                    monthsCoverage: coverageVal
                },
                update: {
                    stockExternal: stockVal,
                    salesLast30: ventasVal,
                    salesVelocity: velocityVal,
                    monthsCoverage: coverageVal,
                    updatedAt: new Date()
                }
            })
        })

        await prisma.$transaction(operations)

        return NextResponse.json({ 
            success: true, 
            message: `Procesados ${operations.length} productos correctamente (de ${items.length} recibidos).` 
        })

    } catch (error: any) {
        console.error("❌ Error en webhook n8n:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
