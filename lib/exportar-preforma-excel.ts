import * as XLSX from "xlsx"
import { PreformaView } from "@/app/admin/erp/importaciones/importaciones-client"
import {
  buscarProveedorPorNombre,
  COMPRADOR_OFICIAL,
  formatearEncabezadoSeller,
  formatearTarjetaBuyer,
  formatearTarjetaSeller,
  formatearCondicionesGenerales,
  formatearDatosBancarios,
} from "@/lib/proveedores-importacion"

export function exportarPreformaAExcel(preforma: PreformaView) {
  const wb = XLSX.utils.book_new()

  const prov = buscarProveedorPorNombre(preforma.proveedor)

  const rows: any[][] = []

  // R1 (Fila 0): Encabezado General del Proveedor / Seller
  rows.push([formatearEncabezadoSeller(prov, preforma.proveedor || undefined)])

  // R2 (Fila 1): "Proforma Invoice" en C, "Invoice No.: ..." en E
  const invoiceNo = preforma.numeroFactura || `PI-${preforma.numero}`
  rows.push([null, null, "Proforma Invoice", null, `Invoice No.:    ${invoiceNo}`])

  // R3 (Fila 2): "Date: ..." en E
  const fechaStr = preforma.fechaEmision
    ? new Date(preforma.fechaEmision).toISOString().split("T")[0].replace(/-/g, "/")
    : new Date().toISOString().split("T")[0].replace(/-/g, "/")
  rows.push([null, null, null, null, `Date:    ${fechaStr}`])

  // R4 (Fila 3): Buyer Card en A, Seller Card en D
  rows.push([
    formatearTarjetaBuyer(COMPRADOR_OFICIAL),
    null,
    null,
    formatearTarjetaSeller(prov, preforma.proveedor || undefined),
  ])

  // R5 (Fila 4): Encabezados exactos de las columnas de ítems
  rows.push([
    "Supplier Item No.",
    "PHOTO",
    "Detail ",
    "LOGO",
    "SIZE",
    "Qty",
    "Price",
    "Total price",
  ])

  // R6+ (Fila 5 en adelante): Ítems
  let sumQty = 0
  let sumTotalFob = 0

  preforma.items.forEach((item) => {
    const qty = Number(item.cantidad || 0)
    const unitPrice =
      item.precioUnitarioUsd !== null && item.precioUnitarioUsd !== undefined
        ? Number(item.precioUnitarioUsd)
        : 0
    const totalAmount =
      item.precioTotalUsd !== null && item.precioTotalUsd !== undefined
        ? Number(item.precioTotalUsd)
        : qty * unitPrice

    sumQty += qty
    sumTotalFob += totalAmount

    rows.push([
      item.supplierItemNo || item.articuloCodigoProveedor || "",
      null, // PHOTO
      item.descripcionOriginal || item.articuloNombre || "",
      item.logo || "ITALY",
      item.size || "",
      qty,
      unitPrice > 0 ? unitPrice : "",
      totalAmount > 0 ? Number(totalAmount.toFixed(2)) : "",
    ])
  })

  // Fila de Totales
  rows.push([
    null,
    null,
    null,
    null,
    "TOTAL UNIT",
    sumQty,
    "TOTAL FOB",
    Number(sumTotalFob.toFixed(2)),
  ])

  // Fila de Términos / Condiciones
  const filaCondicionesIdx = rows.length
  rows.push([formatearCondicionesGenerales(prov, null, preforma.observaciones)])

  // Fila de Datos Bancarios
  const filaBancoIdx = rows.length
  const textoBanco = formatearDatosBancarios(prov)
  if (textoBanco) {
    rows.push([textoBanco])
  }

  // Crear la hoja a partir de la matriz de filas
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Definir merges para replicar la plantilla china exactamente
  const merges: XLSX.Range[] = [
    // Banner Seller (R1: cols A a H)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    // Buyer Card (R4: cols A a C)
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
    // Seller Card (R4: cols D a H)
    { s: { r: 3, c: 3 }, e: { r: 3, c: 7 } },
    // Condiciones (cols A a H)
    { s: { r: filaCondicionesIdx, c: 0 }, e: { r: filaCondicionesIdx, c: 7 } },
  ]

  if (textoBanco) {
    // Datos Bancarios (cols A a H)
    merges.push({ s: { r: filaBancoIdx, c: 0 }, e: { r: filaBancoIdx, c: 7 } })
  }

  ws["!merges"] = merges

  // Anchos de columna óptimos
  ws["!cols"] = [
    { wch: 22 }, // A: Supplier Item No. / Buyer
    { wch: 12 }, // B: PHOTO
    { wch: 45 }, // C: Detail
    { wch: 15 }, // D: LOGO / Seller
    { wch: 16 }, // E: SIZE
    { wch: 14 }, // F: Qty
    { wch: 14 }, // G: Price
    { wch: 16 }, // H: Total price
  ]

  // Nombrar la hoja ORDER igual que el Excel de base
  XLSX.utils.book_append_sheet(wb, ws, "ORDER")

  // Nombre de archivo descriptivo
  const cleanProv = (preforma.proveedor || "Fuding_Guansheng").replace(/[^a-zA-Z0-9_-]/g, "_")
  const invoicePart = (preforma.numeroFactura || `PI-${preforma.numero}`).replace(/[^a-zA-Z0-9_-]/g, "_")
  const fileName = `Pedido_${invoicePart}_${cleanProv}.xlsx`

  XLSX.writeFile(wb, fileName)
}
