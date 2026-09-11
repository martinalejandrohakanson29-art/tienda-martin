"use server"

import { prisma } from "@/lib/prisma"
import { s3Client } from "@/lib/s3"
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
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
 * Genera una URL firmada de S3 válida por 24 horas (igual que en /admin/mercadolibre/preparacion)
 */
async function generarUrlFirmadaFoto(urlOrKey: string | null | undefined): Promise<string | null> {
  if (!urlOrKey) return null
  try {
    let key = urlOrKey
    if (key.includes(`/${BUCKET_NAME}/`)) {
      key = key.split(`/${BUCKET_NAME}/`)[1]
    } else if (key.startsWith("http")) {
      const idx = key.indexOf("importaciones/")
      if (idx !== -1) {
        key = key.substring(idx)
      }
    }
    if (key.startsWith("/")) key = key.substring(1)
    if (!key) return null

    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
    return await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 })
  } catch (err) {
    console.error("Error generando signed URL de foto:", err)
    return null
  }
}

/**
 * Sube una foto de ítem individual a S3 y devuelve su clave en el bucket
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

    return key
  } catch (err) {
    console.error("Error al subir foto de ítem a S3:", err)
    return null
  }
}

interface ImagenExtraida {
  row: number
  buffer: Buffer
  name: string
}

/**
 * Resuelve la ruta del drawing XML correspondiente a una hoja específica del workbook
 * (workbook.xml -> rId de la hoja -> worksheets/sheetN.xml -> rels de esa hoja -> drawingN.xml).
 * Si no puede resolverlo, cae a drawing1.xml.
 */
async function resolverDrawingDeHoja(zip: JSZip, sheetName?: string): Promise<string> {
  try {
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string")
    const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string")
    if (workbookXml && workbookRelsXml) {
      const sheetMatches = Array.from(workbookXml.matchAll(/<sheet[^>]+name="([^"]+)"[^>]+r:id="([^"]+)"/g))
      const relMap = new Map<string, string>()
      for (const m of workbookRelsXml.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
        relMap.set(m[1], m[2])
      }
      const sheetEntry = sheetName ? sheetMatches.find((m) => m[1] === sheetName) : sheetMatches[0]
      const target = sheetEntry ? relMap.get(sheetEntry[2]) : undefined
      if (target) {
        const sheetFileName = target.split("/").pop()
        const sheetRelsXml = await zip.file(`xl/worksheets/_rels/${sheetFileName}.rels`)?.async("string")
        const drawingMatch = sheetRelsXml?.match(/Target="(?:\.\.\/)?drawings\/(drawing\d+\.xml)"/)
        if (drawingMatch) return `xl/drawings/${drawingMatch[1]}`
      }
    }
  } catch (err) {
    console.warn("No se pudo resolver el drawing de la hoja, se usa drawing1.xml por defecto:", err)
  }
  return "xl/drawings/drawing1.xml"
}

/**
 * Extrae las imágenes incrustadas de un archivo Excel .xlsx de la hoja indicada,
 * ordenadas de arriba hacia abajo según su fila de anclaje.
 */
async function extraerImagenesExcel(buffer: Buffer, sheetName?: string): Promise<ImagenExtraida[]> {
  const imagenes: ImagenExtraida[] = []
  try {
    const zip = await JSZip.loadAsync(buffer)
    const drawingPath = await resolverDrawingDeHoja(zip, sheetName)
    const drawingFileName = drawingPath.split("/").pop()

    // 1. Leer rels del drawing
    const relsXml = await zip.file(`xl/drawings/_rels/${drawingFileName}.rels`)?.async("string")
    const relsMap = new Map<string, string>()
    if (relsXml) {
      for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]+Target="(?:\.\.\/media\/)?([^"]+)"/g)) {
        relsMap.set(m[1], m[2].split("/").pop() || m[2])
      }
    }

    // 2. Leer drawing.xml para mapear cada imagen a su fila de anclaje
    const drawingXml = await zip.file(drawingPath)?.async("string")
    if (drawingXml && relsMap.size > 0) {
      const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g
      const anchors = drawingXml.match(anchorRegex) || []
      const filasUsadas = new Set<number>()

      for (const anchor of anchors) {
        const rowMatch = anchor.match(/<xdr:row>(\d+)<\/xdr:row>/)
        const blipMatch = anchor.match(/<a:blip[^>]+r:embed="([^"]+)"/)
        if (!rowMatch || !blipMatch) continue

        const row = parseInt(rowMatch[1], 10)
        const imageName = relsMap.get(blipMatch[1])
        if (!imageName || filasUsadas.has(row)) continue

        const imgFile = zip.file(`xl/media/${imageName}`)
        if (imgFile) {
          imagenes.push({ row, buffer: await imgFile.async("nodebuffer"), name: imageName })
          filasUsadas.add(row)
        }
      }
    }
  } catch (err) {
    console.warn("No se pudieron extraer imágenes embebidas del Excel:", err)
  }

  imagenes.sort((a, b) => a.row - b.row)
  return imagenes
}

/**
 * Asigna las imágenes extraídas a los ítems detectados.
 * Si la cantidad de fotos coincide con la cantidad de ítems, se asignan por orden
 * (de arriba hacia abajo) en vez de exigir que la fila de anclaje coincida exactamente,
 * ya que fotos pegadas/movidas a mano en Excel suelen desalinearse de a poco y ese
 * desfasaje se acumula sobre todo en las últimas filas. Si no coinciden, se hace
 * matching por fila exacta y, si falla, por la fila no usada más cercana.
 */
function asignarFotosAItems(items: DetectedItem[], itemRows: number[], imagenes: ImagenExtraida[]) {
  if (imagenes.length === 0) return

  if (imagenes.length === items.length) {
    items.forEach((item, idx) => {
      const img = imagenes[idx]
      item.fotoBuffer = img.buffer
      item.fotoName = `${item.supplierItemNo}_${img.name}`
    })
    return
  }

  const usadas = new Set<number>()
  items.forEach((item, idx) => {
    const filaItem = itemRows[idx]
    let elegidaIdx = imagenes.findIndex((img, i) => img.row === filaItem && !usadas.has(i))

    if (elegidaIdx === -1) {
      let mejorDist = Infinity
      imagenes.forEach((img, i) => {
        if (usadas.has(i)) return
        const dist = Math.abs(img.row - filaItem)
        if (dist <= 3 && dist < mejorDist) {
          mejorDist = dist
          elegidaIdx = i
        }
      })
    }

    if (elegidaIdx !== -1) {
      usadas.add(elegidaIdx)
      const elegida = imagenes[elegidaIdx]
      item.fotoBuffer = elegida.buffer
      item.fotoName = `${item.supplierItemNo}_${elegida.name}`
    }
  })
}

/**
 * Parsea un archivo Excel buscando columnas de Supplier Item No, Cantidad, Detalle, etc.
 */
async function parsearExcel(buffer: Buffer): Promise<{ items: DetectedItem[]; metadata: PreformaMetadata }> {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  // Buscar primero la hoja ORDER o la primera hoja activa
  const sheetName =
    workbook.SheetNames.find((n) => /order|pedido|preforma|proforma|invoice/i.test(n)) ||
    workbook.SheetNames[0]
  if (!sheetName) return { items: [], metadata: {} }

  const imagenesHoja = await extraerImagenesExcel(buffer, sheetName)

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
  const itemRows: number[] = []
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

    items.push({
      supplierItemNo: rawCode,
      descripcionOriginal: desc || undefined,
      logo: logo || undefined,
      size: size || undefined,
      cantidad: qty,
      precioUnitarioUsd: priceUsd,
      precioTotalUsd: totalPriceUsd,
    })
    itemRows.push(r)
  }

  asignarFotosAItems(items, itemRows, imagenesHoja)

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

    const data = await Promise.all(
      preformas.map(async (p) => {
        const vinculados = p.items.filter((i) => i.articuloId !== null).length
        const items = await Promise.all(
          p.items.map(async (i) => ({
            id: i.id,
            supplierItemNo: i.supplierItemNo,
            descripcionOriginal: i.descripcionOriginal,
            logo: i.logo,
            size: i.size,
            fotoUrl: await generarUrlFirmadaFoto(i.fotoUrl),
            cantidad: i.cantidad,
            precioUnitarioUsd: i.precioUnitarioUsd ? Number(i.precioUnitarioUsd) : null,
            precioTotalUsd: i.precioTotalUsd ? Number(i.precioTotalUsd) : null,
            articuloId: i.articuloId,
            articuloNombre: i.articulo?.nombre || null,
            articuloStock: i.articulo?.stock ?? null,
            articuloCodigoProveedor: i.articulo?.codigoProveedor || null,
          }))
        )

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
          observaciones: p.observaciones || null,
          totalArticulos: p.totalArticulos,
          totalUnidades: p.totalUnidades,
          vinculados,
          noVinculados: p.totalArticulos - vinculados,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          items,
        }
      })
    )

    return {
      success: true,
      data,
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

/**
 * Desvincula un ítem de preforma (remueve articuloId)
 */
export async function desvincularItemAction(itemId: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const updated = await prisma.preformaItem.update({
      where: { id: itemId },
      data: { articuloId: null },
    })

    revalidatePath("/admin/erp/importaciones")
    return { success: true, data: updated }
  } catch (error: any) {
    console.error("Error al desvincular ítem:", error)
    return { success: false, error: error.message || "Error al desvincular el artículo" }
  }
}

/**
 * Obtiene el catálogo de artículos optimizado para el buscador instantáneo
 */
export async function obtenerArticulosParaBuscadorAction() {
  try {
    const articulos = await prisma.articuloMostrador.findMany({
      select: {
        id: true,
        nombre: true,
        stock: true,
        precio: true,
        costo: true,
        codigoProveedor: true,
        proveedorId: true,
        proveedor: {
          select: {
            id: true,
            razonSocial: true,
            nombreFantasia: true,
          },
        },
        preformaItems: {
          select: {
            supplierItemNo: true,
            precioUnitarioUsd: true,
          },
          orderBy: { id: "desc" },
          take: 1,
        },
        oculto: true,
        esPack: true,
        updatedAt: true,
      },
      orderBy: { nombre: "asc" },
    })

    return {
      success: true,
      data: articulos.map((art) => ({
        id: art.id,
        nombre: art.nombre,
        stock: art.stock,
        precio: Number(art.precio),
        costo: art.costo ? Number(art.costo) : 0,
        codigoProveedor: art.codigoProveedor || null,
        proveedorId: art.proveedorId || null,
        proveedorNombre: art.proveedor ? (art.proveedor.razonSocial || art.proveedor.nombreFantasia) : null,
        fobUsdSugerido: art.preformaItems?.[0]?.precioUnitarioUsd
          ? Number(art.preformaItems[0].precioUnitarioUsd)
          : null,
        supplierItemNoSugerido:
          art.preformaItems?.[0]?.supplierItemNo || art.codigoProveedor || null,
        oculto: art.oculto || false,
        esPack: art.esPack || false,
        ultimaModificacion: art.updatedAt.toISOString(),
      })),
    }
  } catch (error: any) {
    console.error("Error al obtener artículos para buscador:", error)
    return { success: false, error: error.message || "Error al cargar artículos", data: [] }
  }
}

export interface ActualizarPreformaInput {
  numeroFactura?: string | null
  fechaEmision?: string | Date | null
  proveedor?: string | null
  totalFob?: number | null
  observaciones?: string | null
  estado?: string
}

/**
 * Actualiza los datos de cabecera de una preforma
 */
export async function actualizarPreformaAction(id: string, data: ActualizarPreformaInput) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    let fecha: Date | null | undefined = undefined
    if (data.fechaEmision !== undefined) {
      if (data.fechaEmision === null || data.fechaEmision === "") {
        fecha = null
      } else {
        const d = new Date(data.fechaEmision)
        fecha = isNaN(d.getTime()) ? null : d
      }
    }

    const preformaActualizada = await prisma.preformaImportacion.update({
      where: { id },
      data: {
        ...(data.numeroFactura !== undefined && { numeroFactura: data.numeroFactura || null }),
        ...(fecha !== undefined && { fechaEmision: fecha }),
        ...(data.proveedor !== undefined && { proveedor: data.proveedor || null }),
        ...(data.totalFob !== undefined && {
          totalFob: data.totalFob !== null && data.totalFob > 0 ? data.totalFob : null,
        }),
        ...(data.observaciones !== undefined && { observaciones: data.observaciones || null }),
        ...(data.estado !== undefined && { estado: data.estado }),
      },
    })

    revalidatePath("/admin/erp/importaciones")
    return {
      success: true,
      data: {
        ...preformaActualizada,
        totalFob: preformaActualizada.totalFob ? Number(preformaActualizada.totalFob) : null,
        fechaEmision: preformaActualizada.fechaEmision ? preformaActualizada.fechaEmision.toISOString() : null,
      },
    }
  } catch (error: any) {
    console.error("Error al actualizar preforma:", error)
    return { success: false, error: error.message || "Error al actualizar preforma" }
  }
}

export interface ActualizarItemPreformaInput {
  supplierItemNo?: string
  descripcionOriginal?: string | null
  cantidad?: number
  precioUnitarioUsd?: number | null
  logo?: string | null
  size?: string | null
}

/**
 * Actualiza los datos de un ítem de preforma y recalcula los totales de la preforma
 */
export async function actualizarItemPreformaAction(itemId: string, data: ActualizarItemPreformaInput) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const itemActual = await prisma.preformaItem.findUnique({
      where: { id: itemId },
    })

    if (!itemActual) {
      return { success: false, error: "Ítem no encontrado" }
    }

    const nuevaCantidad = data.cantidad !== undefined ? data.cantidad : itemActual.cantidad
    const nuevoPrecioUnit =
      data.precioUnitarioUsd !== undefined
        ? data.precioUnitarioUsd
        : itemActual.precioUnitarioUsd
        ? Number(itemActual.precioUnitarioUsd)
        : null
    const nuevoTotal =
      nuevoPrecioUnit !== null && nuevoPrecioUnit > 0 && nuevaCantidad > 0
        ? nuevaCantidad * nuevoPrecioUnit
        : null

    const itemActualizado = await prisma.preformaItem.update({
      where: { id: itemId },
      data: {
        ...(data.supplierItemNo !== undefined && { supplierItemNo: data.supplierItemNo }),
        ...(data.descripcionOriginal !== undefined && { descripcionOriginal: data.descripcionOriginal || null }),
        ...(data.cantidad !== undefined && { cantidad: nuevaCantidad }),
        ...(data.precioUnitarioUsd !== undefined && { precioUnitarioUsd: nuevoPrecioUnit }),
        ...(data.logo !== undefined && { logo: data.logo || null }),
        ...(data.size !== undefined && { size: data.size || null }),
        precioTotalUsd: nuevoTotal,
      },
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
    })

    // Recalcular totales de la preforma
    const todosItems = await prisma.preformaItem.findMany({
      where: { preformaId: itemActual.preformaId },
    })

    const totalArticulos = todosItems.length
    const totalUnidades = todosItems.reduce((acc, it) => acc + it.cantidad, 0)
    const sumaFob = todosItems.reduce(
      (acc, it) => acc + (it.precioTotalUsd ? Number(it.precioTotalUsd) : 0),
      0
    )

    await prisma.preformaImportacion.update({
      where: { id: itemActual.preformaId },
      data: {
        totalArticulos,
        totalUnidades,
        ...(sumaFob > 0 ? { totalFob: sumaFob } : {}),
      },
    })

    revalidatePath("/admin/erp/importaciones")
    return {
      success: true,
      data: {
        id: itemActualizado.id,
        supplierItemNo: itemActualizado.supplierItemNo,
        descripcionOriginal: itemActualizado.descripcionOriginal,
        logo: itemActualizado.logo,
        size: itemActualizado.size,
        cantidad: itemActualizado.cantidad,
        precioUnitarioUsd: itemActualizado.precioUnitarioUsd ? Number(itemActualizado.precioUnitarioUsd) : null,
        precioTotalUsd: itemActualizado.precioTotalUsd ? Number(itemActualizado.precioTotalUsd) : null,
        articuloId: itemActualizado.articuloId,
        articuloNombre: itemActualizado.articulo?.nombre || null,
        articuloStock: itemActualizado.articulo?.stock ?? null,
        articuloCodigoProveedor: itemActualizado.articulo?.codigoProveedor || null,
        preformaTotales: {
          totalArticulos,
          totalUnidades,
          totalFob: sumaFob,
        },
      },
    }
  } catch (error: any) {
    console.error("Error al actualizar ítem de preforma:", error)
    return { success: false, error: error.message || "Error al actualizar ítem" }
  }
}

/**
 * Elimina un ítem de la preforma y actualiza los totales
 */
export async function eliminarItemPreformaAction(itemId: string) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  try {
    const item = await prisma.preformaItem.findUnique({
      where: { id: itemId },
    })

    if (!item) {
      return { success: false, error: "Ítem no encontrado" }
    }

    const preformaId = item.preformaId

    await prisma.preformaItem.delete({
      where: { id: itemId },
    })

    // Recalcular totales
    const todosItems = await prisma.preformaItem.findMany({
      where: { preformaId },
    })

    const totalArticulos = todosItems.length
    const totalUnidades = todosItems.reduce((acc, it) => acc + it.cantidad, 0)
    const sumaFob = todosItems.reduce(
      (acc, it) => acc + (it.precioTotalUsd ? Number(it.precioTotalUsd) : 0),
      0
    )

    await prisma.preformaImportacion.update({
      where: { id: preformaId },
      data: {
        totalArticulos,
        totalUnidades,
        totalFob: sumaFob > 0 ? sumaFob : null,
      },
    })

    revalidatePath("/admin/erp/importaciones")
    return {
      success: true,
      data: { preformaId, totalArticulos, totalUnidades, totalFob: sumaFob },
    }
  } catch (error: any) {
    console.error("Error al eliminar ítem de preforma:", error)
    return { success: false, error: error.message || "Error al eliminar ítem" }
  }
}

export interface CrearPreformaManualItemInput {
  articuloId: string
  supplierItemNo?: string
  descripcionOriginal?: string | null
  cantidad: number
  precioUnitarioUsd?: number | null
  logo?: string | null
  size?: string | null
  fotoUrl?: string | null
}

export interface CrearPreformaManualInput {
  numeroFactura?: string | null
  proveedor?: string | null
  fechaEmision?: string | Date | null
  observaciones?: string | null
  items: CrearPreformaManualItemInput[]
}

/**
 * Crea una nueva preforma de manera manual seleccionando artículos del sistema
 */
export async function crearPreformaManualAction(input: CrearPreformaManualInput) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { success: false, error: "No autorizado" }
  }

  if (!input.items || input.items.length === 0) {
    return { success: false, error: "Debes agregar al menos un artículo a la preforma" }
  }

  try {
    let fecha: Date | null = null
    if (input.fechaEmision) {
      const d = new Date(input.fechaEmision)
      if (!isNaN(d.getTime())) fecha = d
    }

    // Buscar fotos previas para artículos que no traigan fotoUrl explícita
    const articuloIdsSinFoto = input.items.filter((i) => !i.fotoUrl).map((i) => i.articuloId)
    const fotosMap = new Map<string, string>()

    if (articuloIdsSinFoto.length > 0) {
      const itemsPrevios = await prisma.preformaItem.findMany({
        where: {
          articuloId: { in: articuloIdsSinFoto },
          fotoUrl: { not: null },
        },
        select: {
          articuloId: true,
          fotoUrl: true,
        },
        orderBy: { id: "desc" },
      })

      for (const it of itemsPrevios) {
        if (it.articuloId && it.fotoUrl && !fotosMap.has(it.articuloId)) {
          fotosMap.set(it.articuloId, it.fotoUrl)
        }
      }
    }

    let totalUnidades = 0
    let totalFob = 0

    const itemsToCreate = input.items.map((item) => {
      const cant = Math.max(1, item.cantidad || 1)
      totalUnidades += cant

      const precioUnit = item.precioUnitarioUsd && item.precioUnitarioUsd > 0 ? item.precioUnitarioUsd : null
      const precioTot = precioUnit ? cant * precioUnit : null
      if (precioTot) totalFob += precioTot

      const fotoKey = item.fotoUrl || (item.articuloId ? fotosMap.get(item.articuloId) : null) || null

      return {
        supplierItemNo: item.supplierItemNo || item.articuloId,
        descripcionOriginal: item.descripcionOriginal || null,
        logo: item.logo || null,
        size: item.size || null,
        fotoUrl: fotoKey,
        cantidad: cant,
        precioUnitarioUsd: precioUnit,
        precioTotalUsd: precioTot,
        articuloId: item.articuloId,
      }
    })

    const cleanProv = (input.proveedor || "PROVEEDOR").replace(/[^a-zA-Z0-9_-]/g, "_")
    const nombreArchivoGenerado = `preforma_${cleanProv}_${Date.now()}.xlsx`

    const nuevaPreforma = await prisma.preformaImportacion.create({
      data: {
        nombreArchivo: nombreArchivoGenerado,
        tipoArchivo: "EXCEL",
        estado: "EN_CURSO",
        numeroFactura: input.numeroFactura || null,
        fechaEmision: fecha || new Date(),
        proveedor: input.proveedor || null,
        observaciones: input.observaciones || null,
        totalArticulos: itemsToCreate.length,
        totalUnidades: totalUnidades,
        totalFob: totalFob > 0 ? totalFob : null,
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

    revalidatePath("/admin/erp/importaciones")
    revalidatePath("/admin/erp")

    // Formatear para retornar con URLs firmadas
    const itemsFormateados = await Promise.all(
      nuevaPreforma.items.map(async (i) => ({
        id: i.id,
        supplierItemNo: i.supplierItemNo,
        descripcionOriginal: i.descripcionOriginal,
        logo: i.logo,
        size: i.size,
        fotoUrl: await generarUrlFirmadaFoto(i.fotoUrl),
        cantidad: i.cantidad,
        precioUnitarioUsd: i.precioUnitarioUsd ? Number(i.precioUnitarioUsd) : null,
        precioTotalUsd: i.precioTotalUsd ? Number(i.precioTotalUsd) : null,
        articuloId: i.articuloId,
        articuloNombre: i.articulo?.nombre || null,
        articuloStock: i.articulo?.stock ?? null,
        articuloCodigoProveedor: i.articulo?.codigoProveedor || null,
      }))
    )

    const vinculados = itemsFormateados.filter((i) => i.articuloId !== null).length

    const preformaView = {
      id: nuevaPreforma.id,
      numero: nuevaPreforma.numero,
      nombreArchivo: nuevaPreforma.nombreArchivo,
      archivoUrl: nuevaPreforma.archivoUrl,
      tipoArchivo: nuevaPreforma.tipoArchivo,
      estado: nuevaPreforma.estado,
      numeroFactura: nuevaPreforma.numeroFactura,
      fechaEmision: nuevaPreforma.fechaEmision ? nuevaPreforma.fechaEmision.toISOString() : null,
      proveedor: nuevaPreforma.proveedor,
      totalFob: nuevaPreforma.totalFob ? Number(nuevaPreforma.totalFob) : null,
      totalArticulos: nuevaPreforma.totalArticulos,
      totalUnidades: nuevaPreforma.totalUnidades,
      observaciones: nuevaPreforma.observaciones,
      vinculados,
      noVinculados: nuevaPreforma.totalArticulos - vinculados,
      createdAt: nuevaPreforma.createdAt.toISOString(),
      updatedAt: nuevaPreforma.updatedAt.toISOString(),
      items: itemsFormateados,
    }

    return {
      success: true,
      data: preformaView,
      message: `Preforma #${nuevaPreforma.numero} creada exitosamente con ${itemsFormateados.length} artículos vinculados.`,
    }
  } catch (error: any) {
    console.error("Error al crear preforma manual:", error)
    return { success: false, error: error.message || "Error al crear la preforma" }
  }
}


