"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import * as XLSX from "xlsx"
import JSZip from "jszip"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"

const BUCKET_NAME = (process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || "spacious-glovebox-axtxg0h").trim()

export interface DetectedItem {
  supplierItemNo: string
  descripcionOriginal?: string
  logo?: string
  size?: string
  cantidad: number
  precioUnitarioUsd?: number
  precioTotalUsd?: number
  fotoBuffer?: Buffer
  fotoName?: string
}

export interface PreformaMetadata {
  numeroFactura?: string
  fechaEmision?: Date
  proveedor?: string
  totalFob?: number
}

/**
 * Normaliza códigos para comparación (mayúsculas, sin espacios extras)
 */
function cleanCode(code: string | null | undefined): string {
  if (!code) return ""
  return String(code).trim().toUpperCase()
}

/**
 * Sube un archivo a S3 y devuelve su URL pública/acceso
 */
async function subirArchivoS3(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
  const key = `importaciones/preformas/${Date.now()}_${cleanFileName}`

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  )

  const baseUrl = process.env.GARAGE_S3_API_URL || process.env.S3_ENDPOINT || ""
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${cleanBaseUrl}/${BUCKET_NAME}/${key}`
}

/**
 * Sube una foto de ítem individual a S3 y devuelve su URL
 */
async function subirFotoItemS3(buffer: Buffer, fileName: string): Promise<string | null> {
  try {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
    const key = `importaciones/preformas/items/${Date.now()}_${cleanFileName}`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "image/png",
      })
    )

    const baseUrl = process.env.GARAGE_S3_API_URL || process.env.S3_ENDPOINT || ""
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
    return `${cleanBaseUrl}/${BUCKET_NAME}/${key}`
  } catch (err) {
    console.error("Error al subir foto de ítem a S3:", err)
    return null
  }
}

/**
 * Extrae las imágenes incrustadas de un archivo Excel .xlsx mapeadas por índice de fila
 */
async function extraerImagenesExcel(buffer: Buffer): Promise<Map<number, { buffer: Buffer; name: string }>> {
  const rowImageMap = new Map<number, { buffer: Buffer; name: string }>()
  try {
    const zip = await JSZip.loadAsync(buffer)

    // 1. Leer rels de drawing
    const relsXml = await zip.file("xl/drawings/_rels/drawing1.xml.rels")?.async("string")
    const relsMap = new Map<string, string>()
    if (relsXml) {
      const relMatches = relsXml.matchAll(/Id="([^"]+)"[^>]+Target="(?:\.\.\/media\/)?([^"]+)"/g)
      for (const m of relMatches) {
        const id = m[1]
        const target = m[2].split("/").pop() || m[2]
        relsMap.set(id, target)
      }
    }

    // 2. Leer drawing1.xml para mapear row -> rId
    const drawingXml = await zip.file("xl/drawings/drawing1.xml")?.async("string")
    if (drawingXml && relsMap.size > 0) {
      const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g
      const anchors = drawingXml.match(anchorRegex) || []

      for (const anchor of anchors) {
        const rowMatch = anchor.match(/<xdr:row>(\d+)<\/xdr:row>/)
        const blipMatch = anchor.match(/<a:blip[^>]+r:embed="([^"]+)"/)

        if (rowMatch && blipMatch) {
          const row = parseInt(rowMatch[1], 10)
          const rId = blipMatch[1]
          const imageName = relsMap.get(rId)
          if (imageName && !rowImageMap.has(row)) {
            const imgFile = zip.file(`xl/media/${imageName}`)
            if (imgFile) {
              const imgBuffer = await imgFile.async("nodebuffer")
              rowImageMap.set(row, { buffer: imgBuffer, name: imageName })
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("No se pudieron extraer imágenes embebidas del Excel:", err)
  }
  return rowImageMap
}

/**
 * Parsea un archivo Excel buscando columnas de Supplier Item No, Cantidad, Detalle, etc.
 */
async function parsearExcel(buffer: Buffer): Promise<{ items: DetectedItem[]; metadata: PreformaMetadata }> {
  const imageMap = await extraerImagenesExcel(buffer)

  const workbook = XLSX.read(buffer, { type: "buffer" })
  // Buscar primero la hoja ORDER o la primera hoja activa
  const sheetName =
    workbook.SheetNames.find((n) => /order|pedido|preforma|proforma|invoice/i.test(n)) ||
    workbook.SheetNames[0]
  if (!sheetName) return { items: [], metadata: {} }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" })
  if (!rows || rows.length === 0) return { items: [], metadata: {} }

  // 1. Extraer metadatos de cabecera (Factura, Fecha, Proveedor)
  let invoiceNo = ""
  let invoiceDate: Date | undefined = undefined
  let seller = ""
  let totalFob = 0

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowStr = (rows[r] || []).join(" ")

    const invMatch = rowStr.match(/Invoice\s*No\.?:?\s*([A-Z0-9_-]+)/i)
    if (invMatch && !invoiceNo) invoiceNo = invMatch[1]

    const dateMatch = rowStr.match(/Date:?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i)
    if (dateMatch && !invoiceDate) {
      const d = new Date(dateMatch[1].replace(/\//g, "-"))
      if (!isNaN(d.getTime())) invoiceDate = d
    }

    const sellerMatch = rowStr.match(/Seller:\s*([^\n\r]+?)(?:\s*(?:Cuit|Tel|City|$))/i)
    if (sellerMatch && !seller) seller = sellerMatch[1].trim()

    if (!seller && r === 0 && rows[r][0]) {
      const firstLine = String(rows[r][0]).split("\n")[0].trim()
      if (firstLine.length > 5 && !/proforma|invoice/i.test(firstLine)) {
        seller = firstLine
      }
    }
  }

  // 2. Buscar la fila de encabezados de la tabla
  let headerRowIndex = -1
  let colItemNo = -1
  let colQty = -1
  let colDesc = -1
  let colLogo = -1
  let colSize = -1
  let colPrice = -1
  let colTotalPrice = -1

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || "").trim()

      // Buscar Supplier Item No.
      if (
        /supplier\s*item\s*no/i.test(cellVal) ||
        /supplier\s*item\s*#/i.test(cellVal) ||
        /supplier\s*part\s*no/i.test(cellVal) ||
        /supplier\s*code/i.test(cellVal) ||
        /item\s*no\.?/i.test(cellVal) ||
        /item\s*number/i.test(cellVal)
      ) {
        if (colItemNo === -1 || /supplier/i.test(cellVal)) {
          colItemNo = c
          headerRowIndex = r
        }
      }

      // Buscar Cantidad
      if (
        /^(qty|quantity|cant|cantidad|pcs|amount of qty|units)$/i.test(cellVal) ||
        /qty\s*\(?pcs\)?/i.test(cellVal) ||
        /quantity\s*\(?pcs\)?/i.test(cellVal)
      ) {
        if (colQty === -1) colQty = c
      }

      // Buscar Detalle / Descripción
      if (
        /^detail\b/i.test(cellVal) ||
        /description/i.test(cellVal) ||
        /product\s*name/i.test(cellVal) ||
        /item\s*name/i.test(cellVal) ||
        /descripci[oó]n/i.test(cellVal) ||
        /detalle/i.test(cellVal)
      ) {
        if (colDesc === -1) colDesc = c
      }

      // Buscar Logo / Marca
      if (/^logo\b/i.test(cellVal) || /^brand\b/i.test(cellVal) || /^marca\b/i.test(cellVal)) {
        if (colLogo === -1) colLogo = c
      }

      // Buscar Size / Medida
      if (/^size\b/i.test(cellVal) || /^medida\b/i.test(cellVal) || /^spec/i.test(cellVal)) {
        if (colSize === -1) colSize = c
      }

      // Buscar Precio unitario USD
      if (
        /unit\s*price/i.test(cellVal) ||
        /fob\s*price/i.test(cellVal) ||
        /usd\s*price/i.test(cellVal) ||
        /price\s*\(?usd\)?/i.test(cellVal) ||
        /^price\b/i.test(cellVal) ||
        /precio\s*unit/i.test(cellVal)
      ) {
        if (colPrice === -1) colPrice = c
      }

      // Buscar Precio total USD
      if (/total\s*price/i.test(cellVal) || /total\s*amount/i.test(cellVal)) {
        if (colTotalPrice === -1) colTotalPrice = c
      }
    }

    if (colItemNo !== -1 && colQty !== -1) {
      break
    }
  }

  // Fallback para código si no se encontró columna exacta
  if (colItemNo === -1) {
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r]
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || "").trim()
        if (/code|codigo|c[oó]digo|art[ií]culo|sku/i.test(cell)) {
          colItemNo = c
          headerRowIndex = r
          break
        }
      }
      if (colItemNo !== -1) break
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 4

  const items: DetectedItem[] = []
  const startRow = headerRowIndex + 1

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row) || row.length === 0) continue

    const rowStr = row.join(" ")

    // Detectar fila de TOTALES y cortar el procesamiento de ítems
    if (/total\s*unit|total\s*fob|grand\s*total|subtotal/i.test(rowStr)) {
      // Buscar TOTAL FOB en las celdas
      for (let c = row.length - 1; c >= 0; c--) {
        const val = typeof row[c] === "number" ? row[c] : parseFloat(String(row[c]).replace(/[^0-9.]/g, ""))
        if (!isNaN(val) && val > 0) {
          totalFob = val
          break
        }
      }
      break
    }

    // Detectar fin de tabla por notas de empaque, banco o condiciones
    if (/1\.\s*PACKING:|Bank Detail:|SWIFT\/BIC:|Account Name:/i.test(rowStr)) {
      break
    }

    const rawCode = colItemNo !== -1 ? String(row[colItemNo] || "").trim() : ""
    if (!rawCode) continue

    // Extraer cantidad
    let qty = 0
    if (colQty !== -1) {
      const rawQty = row[colQty]
      qty = typeof rawQty === "number" ? Math.round(rawQty) : parseInt(String(rawQty).replace(/[^0-9]/g, ""), 10)
    }

    // Si la cantidad es 0 o no numérica, no es una fila de artículo
    if (isNaN(qty) || qty <= 0) continue

    const desc = colDesc !== -1 && row[colDesc] ? String(row[colDesc]).trim() : undefined
    const logo = colLogo !== -1 && row[colLogo] ? String(row[colLogo]).trim() : undefined
    const size = colSize !== -1 && row[colSize] ? String(row[colSize]).trim() : undefined

    let priceUsd: number | undefined = undefined
    if (colPrice !== -1 && row[colPrice] !== undefined && row[colPrice] !== "") {
      const p = typeof row[colPrice] === "number" ? row[colPrice] : parseFloat(String(row[colPrice]).replace(/[^0-9.,]/g, "").replace(",", "."))
      if (!isNaN(p) && p > 0) priceUsd = p
    }

    let totalPriceUsd: number | undefined = undefined
    if (colTotalPrice !== -1 && row[colTotalPrice] !== undefined && row[colTotalPrice] !== "") {
      const tp = typeof row[colTotalPrice] === "number" ? row[colTotalPrice] : parseFloat(String(row[colTotalPrice]).replace(/[^0-9.,]/g, "").replace(",", "."))
      if (!isNaN(tp) && tp > 0) totalPriceUsd = tp
    } else if (priceUsd && qty) {
      totalPriceUsd = priceUsd * qty
    }

    // Extraer foto mapeada a esta fila
    const imgInfo = imageMap.get(r)

    items.push({
      supplierItemNo: rawCode,
      descripcionOriginal: desc || undefined,
      logo: logo || undefined,
      size: size || undefined,
      cantidad: qty,
      precioUnitarioUsd: priceUsd,
      precioTotalUsd: totalPriceUsd,
      fotoBuffer: imgInfo?.buffer,
      fotoName: imgInfo?.name ? `${rawCode}_${imgInfo.name}` : undefined,
    })
  }

  return {
    items,
    metadata: {
      numeroFactura: invoiceNo || undefined,
      fechaEmision: invoiceDate,
      proveedor: seller || undefined,
      totalFob: totalFob > 0 ? totalFob : undefined,
    },
  }
}

/**
 * Parsea un documento PDF extrayendo texto y buscando patrones de Supplier Item No y cantidades
 */
async function parsearPDF(buffer: Buffer, catalogoCodigos: Map<string, string>): Promise<{ items: DetectedItem[]; metadata: PreformaMetadata }> {
  let text = ""
  try {
    const pdfLib = require("pdf-parse")
    if (typeof pdfLib === "function") {
      const res = await pdfLib(buffer)
      text = res?.text || ""
    } else if (pdfLib?.PDFParse) {
      const parser = new pdfLib.PDFParse({ data: buffer })
      const res = await parser.getText()
      text = res?.text || ""
    }
  } catch (err) {
    console.error("Error al extraer texto del PDF:", err)
    return { items: [], metadata: {} }
  }

  const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
  const items: DetectedItem[] = []

  let invoiceNo: string | undefined = undefined
  let invoiceDate: Date | undefined = undefined
  let seller: string | undefined = undefined

  // 1. Extraer metadatos
  for (const line of lines) {
    const invMatch = line.match(/Invoice\s*No\.?:?\s*([A-Z0-9_-]+)/i)
    if (invMatch && !invoiceNo) invoiceNo = invMatch[1]

    const dateMatch = line.match(/Date:?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i)
    if (dateMatch && !invoiceDate) {
      const d = new Date(dateMatch[1].replace(/\//g, "-"))
      if (!isNaN(d.getTime())) invoiceDate = d
    }

    const sellerMatch = line.match(/Seller:\s*([^\n\r]+?)(?:\s*(?:Cuit|Tel|City|$))/i)
    if (sellerMatch && !seller) seller = sellerMatch[1].trim()
  }

  // 2. Extracción de ítems con soporte para renglones divididos y validación matemática
  // Recorremos las líneas buscando códigos de catálogo o patrones de proveedor
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/invoice|proforma|buyer|seller|packing|bank detail|swift|page|total unit/i.test(line)) {
      continue
    }

    // Buscar código en la línea actual
    let matchedCode: string | null = null
    const tokens = line.split(/\s+/)

    for (const token of tokens) {
      const cleanT = token.replace(/[^a-zA-Z0-9-_]/g, "").toUpperCase()
      if (cleanT.length >= 3 && catalogoCodigos.has(cleanT)) {
        matchedCode = catalogoCodigos.get(cleanT)!
        break
      }
    }

    if (!matchedCode) {
      const match = line.match(/\b([A-Z0-9]{2,5}[-_][A-Z0-9-_]{2,10}|[A-Z]{1,3}\d{3,6}|\d{5,8})\b/i)
      if (match && !/TOTAL|INVOICE|ORDER/i.test(match[1])) {
        matchedCode = match[1].trim()
      }
    }

    if (matchedCode) {
      // Buscar la cantidad y precios en esta línea y en las 2 siguientes (por si la descripción hizo salto de línea)
      const windowLines = lines.slice(i, i + 3).join(" ")
      const windowTokens = windowLines.split(/\s+/)
      const nums = windowTokens.map((t) => parseFloat(t)).filter((n) => !isNaN(n) && n > 0)

      let qty = 0
      let priceUsd: number | undefined = undefined
      let totalPriceUsd: number | undefined = undefined

      // Intentar detección matemática: qty * price = total
      for (let a = 0; a < nums.length; a++) {
        for (let b = 0; b < nums.length; b++) {
          if (a === b) continue
          for (let c = 0; c < nums.length; c++) {
            if (c === a || c === b) continue
            const q = nums[a]
            const p = nums[b]
            const tot = nums[c]
            if (Number.isInteger(q) && q > 0 && q <= 100000 && Math.abs(q * p - tot) < 0.1) {
              qty = q
              priceUsd = p
              totalPriceUsd = tot
              break
            }
          }
          if (qty > 0) break
        }
        if (qty > 0) break
      }

      // Fallback si no hubo tripleta exacta
      if (qty === 0) {
        const intCandidates = nums.filter((n) => Number.isInteger(n) && n > 0 && n <= 100000 && n !== parseFloat(matchedCode!))
        if (intCandidates.length > 0) {
          qty = intCandidates[0]
        }
      }

      if (qty > 0) {
        // Evitar duplicados consecutivos
        if (!items.some((it) => it.supplierItemNo === matchedCode)) {
          items.push({
            supplierItemNo: matchedCode,
            descripcionOriginal: line.replace(matchedCode, "").trim().slice(0, 150) || undefined,
            cantidad: qty,
            precioUnitarioUsd: priceUsd,
            precioTotalUsd: totalPriceUsd,
          })
        }
      }
    }
  }

  return {
    items,
    metadata: {
      numeroFactura: invoiceNo,
      fechaEmision: invoiceDate,
      proveedor: seller,
    },
  }
}

/**
 * Sube y procesa múltiples archivos de preformas
 */
export async function cargarPreformasAction(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  const files = formData.getAll("files") as File[]
  if (!files || files.length === 0) {
    return { success: false, error: "No se seleccionó ningún archivo" }
  }

  try {
    // 1. Cargar el catálogo completo de ArticuloMostrador para hacer matching ultra rápido en memoria
    const articulos = await prisma.articuloMostrador.findMany({
      select: {
        id: true,
        nombre: true,
        codigoProveedor: true,
        stock: true,
      },
    })

    // Mapeo normalizado (código en mayúsculas sin espacios -> id de ArticuloMostrador)
    const codeToArticleMap = new Map<string, typeof articulos[0]>()
    for (const art of articulos) {
      if (art.codigoProveedor) {
        codeToArticleMap.set(cleanCode(art.codigoProveedor), art)
      }
      codeToArticleMap.set(cleanCode(art.id), art)
    }

    const catalogoCodigos = new Map<string, string>()
    for (const [code] of Array.from(codeToArticleMap.entries())) {
      catalogoCodigos.set(code, code)
    }

    const resultados = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileName = file.name
      const extension = fileName.split(".").pop()?.toLowerCase() || ""

      let tipoArchivo: "EXCEL" | "PDF" | "IMAGEN" = "EXCEL"
      if (extension === "pdf") {
        tipoArchivo = "PDF"
      } else if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
        tipoArchivo = "IMAGEN"
      }

      // Subir archivo original a S3
      let archivoUrl: string | null = null
      try {
        archivoUrl = await subirArchivoS3(buffer, fileName, file.type)
      } catch (s3Err) {
        console.error(`Error al subir archivo ${fileName} a S3:`, s3Err)
      }

      // Detectar artículos y metadatos
      let detectedItems: DetectedItem[] = []
      let metadata: PreformaMetadata = {}

      if (tipoArchivo === "EXCEL") {
        const parsed = await parsearExcel(buffer)
        detectedItems = parsed.items
        metadata = parsed.metadata
      } else if (tipoArchivo === "PDF") {
        const parsed = await parsearPDF(buffer, catalogoCodigos)
        detectedItems = parsed.items
        metadata = parsed.metadata
      }

      let totalUnidades = 0
      let matchedCount = 0

      // Procesar cada ítem y subir foto a S3 si existe
      const itemsToCreate = []
      for (const item of detectedItems) {
        totalUnidades += item.cantidad
        const matched = codeToArticleMap.get(cleanCode(item.supplierItemNo))
        if (matched) matchedCount++

        let itemFotoUrl: string | null = null
        if (item.fotoBuffer) {
          itemFotoUrl = await subirFotoItemS3(item.fotoBuffer, item.fotoName || `${item.supplierItemNo}.png`)
        }

        itemsToCreate.push({
          supplierItemNo: item.supplierItemNo,
          descripcionOriginal: item.descripcionOriginal || null,
          logo: item.logo || null,
          size: item.size || null,
          fotoUrl: itemFotoUrl,
          cantidad: item.cantidad,
          precioUnitarioUsd: item.precioUnitarioUsd ? item.precioUnitarioUsd : null,
          precioTotalUsd: item.precioTotalUsd ? item.precioTotalUsd : null,
          articuloId: matched ? matched.id : null,
        })
      }

      // Guardar preforma en PostgreSQL
      const preforma = await prisma.preformaImportacion.create({
        data: {
          nombreArchivo: fileName,
          archivoUrl: archivoUrl,
          tipoArchivo: tipoArchivo,
          estado: "EN_CURSO",
          numeroFactura: metadata.numeroFactura || null,
          fechaEmision: metadata.fechaEmision || null,
          proveedor: metadata.proveedor || null,
          totalFob: metadata.totalFob ? metadata.totalFob : null,
          totalArticulos: itemsToCreate.length,
          totalUnidades: totalUnidades,
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          items: {
            include: {
              articulo: {
                select: {
                  id: true,
                  nombre: true,
                  stock: true,
                  codigoProveedor: true,
                },
              },
            },
          },
        },
      })

      resultados.push(preforma.id)
    }

    revalidatePath("/admin/erp/importaciones")
    revalidatePath("/admin/erp")

    // Devolvemos la lista completa actualizada de preformas para actualización instantánea en el cliente
    const todas = await obtenerPreformasAction()

    return {
      success: true,
      data: todas.data,
      message: `Se procesaron ${resultados.length} preforma(s) exitosamente.`,
    }
  } catch (error: any) {
    console.error("Error al procesar preformas:", error)
    return { success: false, error: error.message || "Error al procesar archivos de preforma" }
  }
}

/**
 * Obtiene todas las preformas registradas
 */
export async function obtenerPreformasAction(filtroEstado?: string) {
  try {
    const where: any = {}
    if (filtroEstado && filtroEstado !== "TODAS") {
      where.estado = filtroEstado
    }

    const preformas = await prisma.preformaImportacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            articulo: {
              select: {
                id: true,
                nombre: true,
                stock: true,
                codigoProveedor: true,
              },
            },
          },
        },
      },
    })

    return {
      success: true,
      data: preformas.map((p) => {
        const vinculados = p.items.filter((i) => i.articuloId !== null).length
        return {
          id: p.id,
          numero: p.numero,
          nombreArchivo: p.nombreArchivo,
          archivoUrl: p.archivoUrl,
          tipoArchivo: p.tipoArchivo,
          estado: p.estado,
          numeroFactura: p.numeroFactura,
          fechaEmision: p.fechaEmision ? p.fechaEmision.toISOString() : null,
          proveedor: p.proveedor,
          totalFob: p.totalFob ? Number(p.totalFob) : null,
          totalArticulos: p.totalArticulos,
          totalUnidades: p.totalUnidades,
          vinculados,
          noVinculados: p.totalArticulos - vinculados,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          items: p.items.map((i) => ({
            id: i.id,
            supplierItemNo: i.supplierItemNo,
            descripcionOriginal: i.descripcionOriginal,
            logo: i.logo,
            size: i.size,
            fotoUrl: i.fotoUrl,
            cantidad: i.cantidad,
            precioUnitarioUsd: i.precioUnitarioUsd ? Number(i.precioUnitarioUsd) : null,
            precioTotalUsd: i.precioTotalUsd ? Number(i.precioTotalUsd) : null,
            articuloId: i.articuloId,
            articuloNombre: i.articulo?.nombre || null,
            articuloStock: i.articulo?.stock ?? null,
            articuloCodigoProveedor: i.articulo?.codigoProveedor || null,
          })),
        }
      }),
    }
  } catch (error: any) {
    console.error("Error al obtener preformas:", error)
    return { success: false, error: error.message || "Error al obtener preformas", data: [] }
  }
}

/**
 * Cambia el estado de una preforma entre EN_CURSO y FINALIZADO
 */
export async function cambiarEstadoPreformaAction(id: string, nuevoEstado: "EN_CURSO" | "FINALIZADO") {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const actualizada = await prisma.preformaImportacion.update({
      where: { id },
      data: { estado: nuevoEstado },
    })

    revalidatePath("/admin/erp/importaciones")
    return { success: true, data: actualizada }
  } catch (error: any) {
    console.error("Error al cambiar estado de preforma:", error)
    return { success: false, error: error.message || "Error al actualizar estado" }
  }
}

/**
 * Elimina una preforma y sus ítems
 */
export async function eliminarPreformaAction(id: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const preforma = await prisma.preformaImportacion.findUnique({
      where: { id },
      select: { archivoUrl: true },
    })

    if (preforma?.archivoUrl) {
      try {
        const parts = preforma.archivoUrl.split(`${BUCKET_NAME}/`)
        if (parts.length >= 2) {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: parts[1],
            })
          )
        }
      } catch (s3Err) {
        console.warn("No se pudo eliminar archivo de S3:", s3Err)
      }
    }

    await prisma.preformaImportacion.delete({
      where: { id },
    })

    revalidatePath("/admin/erp/importaciones")
    return { success: true }
  } catch (error: any) {
    console.error("Error al eliminar preforma:", error)
    return { success: false, error: error.message || "Error al eliminar la preforma" }
  }
}

/**
 * Vincula manualmente un ítem de preforma con un ArticuloMostrador
 */
export async function vincularItemManualAction(itemId: string, articuloId: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const articulo = await prisma.articuloMostrador.findUnique({
      where: { id: articuloId },
      select: { id: true, nombre: true, stock: true, codigoProveedor: true },
    })

    if (!articulo) {
      return { success: false, error: "Artículo no encontrado" }
    }

    const updated = await prisma.preformaItem.update({
      where: { id: itemId },
      data: { articuloId: articulo.id },
      include: {
        articulo: true,
      },
    })

    revalidatePath("/admin/erp/importaciones")
    return { success: true, data: updated }
  } catch (error: any) {
    console.error("Error al vincular ítem:", error)
    return { success: false, error: error.message || "Error al vincular el artículo" }
  }
}

/**
 * Busca artículos del catálogo para vinculación manual
 */
export async function buscarArticulosParaVinculacionAction(query: string) {
  try {
    const q = query.trim()
    if (!q) return { success: true, data: [] }

    const articulos = await prisma.articuloMostrador.findMany({
      where: {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { id: { contains: q, mode: "insensitive" } },
          { codigoProveedor: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 15,
      select: {
        id: true,
        nombre: true,
        stock: true,
        codigoProveedor: true,
        precio: true,
      },
    })

    return {
      success: true,
      data: articulos.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        stock: a.stock,
        codigoProveedor: a.codigoProveedor,
        precio: Number(a.precio),
      })),
    }
  } catch (error: any) {
    console.error("Error al buscar artículos:", error)
    return { success: false, data: [] }
  }
}
