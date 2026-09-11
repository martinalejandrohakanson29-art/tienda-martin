/**
 * Script de una sola vez: construye lib/templates/plantilla-preforma.xlsx
 * replicando EXACTAMENTE el formato de n8n-workflows/Pedido Matt 08-2026.xlsx
 * (estilos, anchos de columna, alturas de fila, merges) pero sin los datos
 * ni las fotos del pedido real, y con un único renglón de ítem "plantilla"
 * que se clona/borra dinámicamente al generar cada preforma.
 *
 * Uso: node scripts/generar-plantilla-preforma.js
 */
const path = require("path")
const ExcelJS = require("exceljs")

const ORIGEN = path.join(__dirname, "..", "n8n-workflows", "Pedido Matt 08-2026.xlsx")
const DESTINO = path.join(__dirname, "..", "lib", "templates", "plantilla-preforma.xlsx")

async function main() {
  const wbOrigen = new ExcelJS.Workbook()
  await wbOrigen.xlsx.readFile(ORIGEN)
  const wsOrigen = wbOrigen.getWorksheet("ORDER")
  if (!wsOrigen) throw new Error("No se encontró la hoja ORDER en el archivo original")

  const wbNuevo = new ExcelJS.Workbook()
  const wsNuevo = wbNuevo.addWorksheet("ORDER", { views: wsOrigen.views })

  // Replicar anchos de columna
  wsNuevo.columns = wsOrigen.columns.map((c) => ({ width: c.width }))

  // Mapeo de filas ORIGEN (1-indexado) -> filas NUEVAS (1-indexado):
  // 1 banner, 2 invoice, 3 date, 4 buyer/seller, 5 headers,
  // 6 ítem plantilla (se toma la fila 6 del original, se limpia el valor),
  // 7 totals (fila 16 del original), 8 condiciones (fila 17), 9 banco (fila 18)
  const MAPEO_FILAS = [
    { origen: 1, destino: 1 },
    { origen: 2, destino: 2 },
    { origen: 3, destino: 3 },
    { origen: 4, destino: 4 },
    { origen: 5, destino: 5 },
    { origen: 6, destino: 6, limpiarValor: true },
    { origen: 16, destino: 7 },
    { origen: 17, destino: 8 },
    { origen: 18, destino: 9 },
  ]

  for (const { origen, destino, limpiarValor } of MAPEO_FILAS) {
    const filaOrigen = wsOrigen.getRow(origen)
    const filaNueva = wsNuevo.getRow(destino)
    filaNueva.height = filaOrigen.height

    for (let c = 1; c <= 8; c++) {
      const celdaOrigen = filaOrigen.getCell(c)
      const celdaNueva = filaNueva.getCell(c)
      celdaNueva.style = JSON.parse(JSON.stringify(celdaOrigen.style))
      if (limpiarValor) {
        celdaNueva.value = null
      } else {
        let valor = celdaOrigen.value
        // Descartar fórmulas (compartidas o no): solo nos interesa el resultado/texto plano
        if (valor && typeof valor === "object" && !(valor instanceof Date)) {
          valor = valor.result !== undefined ? valor.result : celdaOrigen.text
        }
        celdaNueva.value = valor
      }
    }
    filaNueva.commit()
  }

  // Limpiar textos variables de cabecera (se completan en tiempo de generación)
  wsNuevo.getCell("A1").value = "" // banner seller
  wsNuevo.getCell("E2").value = "" // invoice no
  wsNuevo.getCell("E3").value = "" // date
  wsNuevo.getCell("A4").value = "" // buyer card
  wsNuevo.getCell("D4").value = "" // seller card
  wsNuevo.getCell("A8").value = "" // condiciones
  wsNuevo.getCell("A9").value = "" // banco

  // Merges exactos (en base a las posiciones de fila fijas de esta plantilla)
  wsNuevo.mergeCells("A1:H1")
  wsNuevo.mergeCells("A4:C4")
  wsNuevo.mergeCells("D4:H4")
  wsNuevo.mergeCells("A8:H8")
  wsNuevo.mergeCells("A9:H9")

  await wbNuevo.xlsx.writeFile(DESTINO)
  console.log("Plantilla generada en", DESTINO)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
