import path from "path"
import ExcelJS from "exceljs"
import {
  buscarProveedorPorNombre,
  COMPRADOR_OFICIAL,
  formatearEncabezadoSeller,
  formatearTarjetaBuyer,
  formatearTarjetaSeller,
  formatearCondicionesGenerales,
  formatearDatosBancarios,
} from "@/lib/proveedores-importacion"

const PLANTILLA_PATH = path.join(process.cwd(), "lib", "templates", "plantilla-preforma.xlsx")

export interface ItemParaExcel {
  supplierItemNo: string | null
  articuloCodigoProveedor?: string | null
  descripcionOriginal: string | null
  articuloNombre?: string | null
  logo: string | null
  size: string | null
  cantidad: number
  precioUnitarioUsd: number | null
  precioTotalUsd: number | null
  fotoBuffer?: Buffer | null
}

export interface PreformaParaExcel {
  numero: number
  numeroFactura: string | null
  fechaEmision: string | null
  proveedor: string | null
  observaciones: string | null
  items: ItemParaExcel[]
}

/**
 * Genera el buffer .xlsx de una preforma replicando exactamente el formato
 * del Excel que se envía a los proveedores chinos (n8n-workflows/Pedido Matt 08-2026.xlsx):
 * mismos estilos, merges, anchos/altos y fotos de artículo embebidas por fila.
 */
export async function generarBufferPreformaExcel(preforma: PreformaParaExcel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(PLANTILLA_PATH)
  const ws = wb.getWorksheet("ORDER")
  if (!ws) throw new Error("La plantilla de preforma no tiene la hoja ORDER")

  const prov = buscarProveedorPorNombre(preforma.proveedor)

  // Cabecera
  ws.getCell("A1").value = formatearEncabezadoSeller(prov, preforma.proveedor || undefined)

  const invoiceNo = preforma.numeroFactura || `PI-${preforma.numero}`
  ws.getCell("E2").value = `Invoice No.:    ${invoiceNo}`

  const fechaStr = preforma.fechaEmision
    ? preforma.fechaEmision.slice(0, 10).replace(/-/g, "/")
    : new Date().toISOString().split("T")[0].replace(/-/g, "/")
  ws.getCell("E3").value = `Date:    ${fechaStr}`

  ws.getCell("A4").value = formatearTarjetaBuyer(COMPRADOR_OFICIAL)
  ws.getCell("D4").value = formatearTarjetaSeller(prov, preforma.proveedor || undefined)

  // Ítems (la plantilla ya trae 1 fila de ítem en la fila 6 con el estilo correcto)
  const items = preforma.items.length > 0 ? preforma.items : []
  const cantidadItems = Math.max(items.length, 1)

  if (cantidadItems > 1) {
    ws.duplicateRow(6, cantidadItems - 1, true)
  }

  const PRIMERA_FILA_ITEM = 6
  const ultimaFilaItem = PRIMERA_FILA_ITEM + cantidadItems - 1
  const filaTotales = ultimaFilaItem + 1
  const filaCondiciones = filaTotales + 1
  const filaBanco = filaTotales + 2

  let sumQty = 0
  let sumTotalFob = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const fila = PRIMERA_FILA_ITEM + i

    const qty = Number(item.cantidad || 0)
    const unitPrice = item.precioUnitarioUsd !== null && item.precioUnitarioUsd !== undefined ? Number(item.precioUnitarioUsd) : 0
    const totalAmount =
      item.precioTotalUsd !== null && item.precioTotalUsd !== undefined ? Number(item.precioTotalUsd) : qty * unitPrice

    sumQty += qty
    sumTotalFob += totalAmount

    const row = ws.getRow(fila)
    row.getCell(1).value = item.supplierItemNo || item.articuloCodigoProveedor || ""
    row.getCell(3).value = item.descripcionOriginal || item.articuloNombre || ""
    row.getCell(4).value = item.logo || "ITALY"
    row.getCell(5).value = item.size || ""
    row.getCell(6).value = qty
    row.getCell(7).value = unitPrice > 0 ? unitPrice : null
    row.getCell(8).value = totalAmount > 0 ? Number(totalAmount.toFixed(2)) : null
    row.commit()

    if (item.fotoBuffer) {
      try {
        const imageId = wb.addImage({ buffer: item.fotoBuffer as any, extension: "png" })
        ws.addImage(imageId, {
          tl: { col: 1.1, row: fila - 1 + 0.08 },
          ext: { width: 200, height: 110 },
          editAs: "oneCell",
        } as any)
      } catch (err) {
        console.warn(`No se pudo insertar la foto del ítem en la fila ${fila}:`, err)
      }
    }
  }

  // Totales
  const rowTotales = ws.getRow(filaTotales)
  rowTotales.getCell(5).value = "TOTAL UNIT"
  rowTotales.getCell(6).value = sumQty
  rowTotales.getCell(7).value = "TOTAL FOB"
  rowTotales.getCell(8).value = Number(sumTotalFob.toFixed(2))
  rowTotales.commit()

  // Condiciones y datos bancarios
  ws.getCell(`A${filaCondiciones}`).value = formatearCondicionesGenerales(prov, null, preforma.observaciones)
  const textoBanco = formatearDatosBancarios(prov)
  ws.getCell(`A${filaBanco}`).value = textoBanco

  // Redeclarar merges de forma explícita (duplicateRow no reubica los merges existentes)
  for (const rango of [...ws.model.merges]) {
    ws.unMergeCells(rango)
  }
  ws.mergeCells("A1:H1")
  ws.mergeCells("A4:C4")
  ws.mergeCells("D4:H4")
  ws.mergeCells(`A${filaCondiciones}:H${filaCondiciones}`)
  if (textoBanco) {
    ws.mergeCells(`A${filaBanco}:H${filaBanco}`)
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

export function nombreArchivoPreforma(preforma: PreformaParaExcel, proveedorNombre?: string | null): string {
  const cleanProv = (proveedorNombre || preforma.proveedor || "Fuding_Guansheng").replace(/[^a-zA-Z0-9_-]/g, "_")
  const invoicePart = (preforma.numeroFactura || `PI-${preforma.numero}`).replace(/[^a-zA-Z0-9_-]/g, "_")
  return `Pedido_${invoicePart}_${cleanProv}.xlsx`
}
