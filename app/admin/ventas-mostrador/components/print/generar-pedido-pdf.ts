import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function generarPedidoVentaPdf(venta: any): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const nroPedido = (venta.numeroVenta || venta.id.slice(0, 8))
    .toString()
    .padStart(8, "0");
  const fechaFactura = new Date(venta.createdAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const total = Number(venta.totalFinal || venta.total || 0);

  const startX = 14;
  const pageWidth = 182; // 210 - 28

  // --- 1. HEADER CONTENEDOR ---
  const headerY = 14;
  const headerHeight = 38;

  // Rectángulo general del header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(startX, headerY, pageWidth, headerHeight);

  // Línea divisoria central
  doc.line(startX + pageWidth / 2, headerY, startX + pageWidth / 2, headerY + headerHeight);

  // LADO IZQUIERDO (Emisor)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("REVOLUCIÓN MOTOS", startX + 45, headerY + 7, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("de Oliva Peirone Jose Luis", startX + 45, headerY + 11.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Revolución de Mayo 1605 - D° 5 - (5000) Córdoba", startX + 6, headerY + 19);
  doc.text("Tel: 3512404003 | Email: revolucionmotos@gmail.com", startX + 6, headerY + 24);
  doc.setFont("helvetica", "bold");
  doc.text("I.V.A. RESPONSABLE INSCRIPTO", startX + 6, headerY + 30);

  // CUADRO CENTRAL (X - PEDIDO)
  const badgeX = startX + pageWidth / 2 - 7;
  const badgeY = headerY + 6;
  doc.setFillColor(255, 255, 255);
  doc.rect(badgeX, badgeY, 14, 16, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("X", badgeX + 7, badgeY + 8.5, { align: "center" });
  doc.setFontSize(5.5);
  doc.text("PEDIDO", badgeX + 7, badgeY + 13, { align: "center" });

  // LADO DERECHO (Comprobante)
  const rightX = startX + pageWidth - 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(29, 78, 216); // Azul
  doc.text("RESUMEN DE VENTA", rightX, headerY + 7, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(`N°: 0001-${nroPedido}`, rightX, headerY + 13, { align: "right" });
  doc.text(`Fecha: ${fechaFactura}`, rightX, headerY + 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("CUIT: 20-26995736-1", rightX, headerY + 25, { align: "right" });
  doc.text("Ing. Brutos: 280244775", rightX, headerY + 29.5, { align: "right" });
  doc.text("Inicio de Actividad: 01/04/2010", rightX, headerY + 34, { align: "right" });

  // --- 2. DATOS DEL CLIENTE ---
  const clientY = headerY + headerHeight;
  const clientHeight = 22;
  doc.rect(startX, clientY, pageWidth, clientHeight);

  doc.setFontSize(8);
  // Fila 1
  doc.setFont("helvetica", "bold");
  doc.text("Razón Social:", startX + 4, clientY + 6);
  doc.setFont("helvetica", "normal");
  const clienteNom = venta.cliente && venta.cliente !== "0" ? venta.cliente : "Consumidor Final";
  doc.text(clienteNom, startX + 26, clientY + 6);

  doc.setFont("helvetica", "bold");
  doc.text("I.V.A.:", startX + 110, clientY + 6);
  doc.setFont("helvetica", "normal");
  doc.text("Consumidor Final", startX + 122, clientY + 6);

  // Fila 2
  doc.setFont("helvetica", "bold");
  doc.text("CUIT/DNI:", startX + 4, clientY + 11.5);
  doc.setFont("helvetica", "normal");
  const docNum = (venta.dni || venta.docNro) && venta.dni !== "0" && venta.docNro !== "0"
    ? (venta.dni || venta.docNro)
    : "-";
  doc.text(docNum, startX + 22, clientY + 11.5);

  doc.setFont("helvetica", "bold");
  doc.text("Vendedor:", startX + 110, clientY + 11.5);
  doc.setFont("helvetica", "normal");
  doc.text(venta.vendedor || "-", startX + 128, clientY + 11.5);

  // Fila 3
  doc.setFont("helvetica", "bold");
  doc.text("Obs:", startX + 4, clientY + 17);
  doc.setFont("helvetica", "normal");
  const obsText = (venta.info || "-").replace(/\n/g, " ");
  doc.text(doc.splitTextToSize(obsText, pageWidth - 16), startX + 13, clientY + 17);

  // --- 3. TABLA DE ARTÍCULOS ---
  const tableY = clientY + clientHeight;
  const tableData = (venta.items || []).map((item: any) => {
    if (item.esNota) {
      return [
        {
          content: `* ${item.nombre} (NOTA)`,
          colSpan: 4,
          styles: { fontStyle: "italic", textColor: [120, 53, 15] },
        },
      ];
    }
    return [
      `${item.cantidad} Un`,
      item.nombre,
      `$ ${Number(item.precio_unit).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      `$ ${Number(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
    ];
  });

  autoTable(doc, {
    startY: tableY,
    margin: { left: startX, right: startX },
    head: [["Cantidad", "Descripción", "P. Unit.", "Total"]],
    body: tableData,
    theme: "plain",
    tableWidth: pageWidth,
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 32, halign: "right" },
      3: { cellWidth: 35, halign: "right", fontStyle: "bold" },
    },
  });

  // --- 4. TOTALES Y PIE DE PÁGINA ---
  const finalY = (doc as any).lastAutoTable?.finalY || (tableY + 30);
  const footerY = Math.max(finalY + 4, 250);

  // Cuadro informativo
  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(startX, footerY, 90, 16);
  doc.setLineDashPattern([], 0); // reset dash

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Documento no válido como factura.", startX + 4, footerY + 6);
  doc.text("Reserva de mercadería sujeta a confirmación.", startX + 4, footerY + 11);

  // Cuadro Total
  const totalBoxWidth = 75;
  const totalBoxX = startX + pageWidth - totalBoxWidth;
  doc.setDrawColor(191, 219, 254); // Blue border
  doc.setFillColor(239, 246, 255); // Blue bg
  doc.rect(totalBoxX, footerY, totalBoxWidth, 16, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text("TOTAL:", totalBoxX + 6, footerY + 10.5);
  doc.setFontSize(11);
  doc.text(
    `$ ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
    totalBoxX + totalBoxWidth - 6,
    footerY + 10.5,
    { align: "right" }
  );

  return doc;
}
