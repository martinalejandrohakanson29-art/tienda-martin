"use client";

import React from "react";
import { transformDriveLink } from "../../constants";

interface Props {
  venta: any;
  config?: any;
}

export function FacturaA4({ venta, config }: Props) {
  if (!venta) return null;

  const logoUrl = transformDriveLink(config?.logoUrl) || "/logo-revolucion.png";

  const isNC = [3, 8, 13].includes(venta.tipoComprobante);
  const isTypeC = [11, 13].includes(venta.tipoComprobante);
  const tipoCbte =
    venta.tipoComprobante === 1 || venta.tipoComprobante === 3
      ? "A"
      : venta.tipoComprobante === 6 || venta.tipoComprobante === 8
      ? "B"
      : "C";
  const codCbte = (venta.tipoComprobante || 6).toString().padStart(2, "0");
  const tituloComprobante = isNC ? "Nota de Crédito" : "Factura";

  const items = (venta.items || []).filter((i: any) => !i.esNota);
  const total = Number(venta.totalFinal || venta.total);
  const neto = isTypeC ? total : parseFloat((total / 1.21).toFixed(2));
  const iva = isTypeC ? 0 : parseFloat((total - neto).toFixed(2));
  const mlFactor =
    venta.mlIdVenta && Number(venta.total) > 0
      ? Number(venta.totalFinal) / Number(venta.total)
      : 1;

  const fechaFactura = new Date(venta.createdAt).toLocaleDateString("es-AR");
  const nroFactura = (venta.facturaNumero || 0).toString().padStart(8, "0");
  const ptoVenta = (venta.facturaPuntoVenta || 9).toString().padStart(4, "0");

  const generateQR = () => {
    try {
      const docTipo = Number(venta.docTipo || 99);
      const docNroRaw = (venta.docNro || "0").replace(/\D/g, "");
      const docNro = docTipo === 99 ? 0 : Number(docNroRaw) || 0;

      const nroCmp = Number(venta.facturaNumero) || 0;
      const codAut = Number(venta.cae) || 0;

      const qrData = {
        ver: 1,
        fecha: new Date(venta.createdAt).toISOString().split("T")[0],
        cuit: 20269957361,
        ptoVta: Number(venta.facturaPuntoVenta || 9),
        tipoCmp: Number(venta.tipoComprobante || 6),
        nroCmp: nroCmp,
        importe: parseFloat(total.toFixed(2)),
        moneda: "PES",
        ctz: 1,
        tipoDocRec: docTipo,
        nroDocRec: docNro,
        tipoCodAut: "E",
        codAut: codAut,
      };

      const jsonStr = JSON.stringify(qrData);
      const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
      return `https://quickchart.io/qr?text=${encodeURIComponent(
        `https://www.afip.gob.ar/fe/qr/?p=${base64}`
      )}&size=200`;
    } catch (e) {
      console.error("Error generando QR:", e);
      return "";
    }
  };

  const qrUrl = generateQR();

  return (
    <div className="w-[210mm] h-[297mm] bg-white text-black p-10 font-sans text-[11px] leading-normal flex flex-col">
      <style type="text/css" media="print">
        {`
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .border-black { border: 1px solid black !important; }
        `}
      </style>

      <div className="flex-grow">
        {/* HEADER CONTENEDOR */}
        <div className="border-black mb-0 flex relative min-h-[140px]">
          {/* LADO IZQUIERDO: EMISOR */}
          <div className="w-1/2 p-4 border-r border-black relative">
            <div className="flex flex-col items-center mb-2">
              {logoUrl && !logoUrl.includes("googleusercontent") ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-12 mb-1"
                  crossOrigin="anonymous"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              ) : (
                <h1 className="text-sm font-bold">REVOLUCIÓN MOTOS</h1>
              )}
              <p className="text-[9px] text-center font-bold">
                de Oliva Peirone Jose Luis
              </p>
            </div>
            <div className="text-[9px]">
              <p>Revolución de Mayo 1605 - D° 5 - (5000) Córdoba</p>
              <p>Tel: 3512404003 | Email: revolucionmotos@gmail.com</p>
              <p className="font-bold">I.V.A. RESPONSABLE INSCRIPTO</p>
            </div>
          </div>

          {/* CENTRO: TIPO COMPROBANTE */}
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-12 h-14 bg-white border-black flex flex-col items-center justify-center z-10">
            <span className="text-2xl font-black">{tipoCbte}</span>
            <span className="text-[8px]">COD. {codCbte}</span>
          </div>

          {/* LADO DERECHO: DATOS FACTURA */}
          <div className="w-1/2 p-6 flex flex-col justify-center items-end">
            <div className="text-right">
              <h2 className="text-xl font-bold mb-1">{tituloComprobante}</h2>
              <p className="font-bold text-sm">
                N°: {ptoVenta}-{nroFactura}
              </p>
              <p className="font-bold text-sm">Fecha: {fechaFactura}</p>
            </div>
            <div className="mt-4 text-[10px] text-right space-y-0.5">
              <p>
                <span className="font-bold">CUIT:</span> 20-26995736-1
              </p>
              <p>
                <span className="font-bold">Ing. Brutos:</span> 280244775
              </p>
              <p>
                <span className="font-bold">Inicio de Actividad:</span> 01/04/2010
              </p>
            </div>
          </div>
        </div>

        {/* DATOS DEL CLIENTE */}
        <div className="border-black border-t-0 p-3 grid grid-cols-2 gap-y-1">
          <p>
            <span className="font-bold">Razón Social:</span>{" "}
            {venta.cliente && venta.cliente !== "0"
              ? venta.cliente
              : "Consumidor Final"}
          </p>
          <p>
            <span className="font-bold">I.V.A.:</span>{" "}
            {venta.condicionIva === 1
              ? "Responsable Inscripto"
              : venta.condicionIva === 6
              ? "Monotributo"
              : "Consumidor Final"}
          </p>
          <p>
            <span className="font-bold">Domicilio:</span>{" "}
            {venta.domicilio || "-"}
          </p>
          <p>
            <span className="font-bold">CUIT/DNI:</span>{" "}
            {venta.docNro && venta.docNro !== "0" ? venta.docNro : "-"}
          </p>
          <p>
            <span className="font-bold">Localidad:</span>{" "}
            {venta.localidad || "Córdoba - CORDOBA CAPITAL"}
          </p>
          <p>
            <span className="font-bold">Vendedor:</span> {venta.vendedor}
          </p>
        </div>

        {/* TABLA DE ARTÍCULOS */}
        <table className="w-full border-black border-t-0 border-collapse mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-black p-2 text-left w-16">Cantidad</th>
              <th className="border-black p-2 text-left">Descripción</th>
              <th className="border-black p-2 text-center w-16">% IVA</th>
              <th className="border-black p-2 text-right w-24">P. Unit.</th>
              <th className="border-black p-2 text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i}>
                <td className="border-black p-2 text-center">
                  {item.cantidad} Un
                </td>
                <td className="border-black p-2">{item.nombre}</td>
                <td className="border-black p-2 text-center">
                  {isTypeC ? "-" : "21,00"}
                </td>
                <td className="border-black p-2 text-right">
                  {(Number(item.precio_unit) * mlFactor).toLocaleString(
                    "es-AR",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </td>
                <td className="border-black p-2 text-right">
                  {(Number(item.subtotal) * mlFactor).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER DE TOTALES EN EL PIE */}
      <div className="flex justify-between items-end border-t border-black pt-4 mt-auto">
        {/* QR Y CAE */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <img
              src={qrUrl}
              alt="QR AFIP"
              className="w-24 h-24 border border-gray-200"
              crossOrigin="anonymous"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <div>
              <img
                src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgNDAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiIHJ4PSI0IiBmaWxsPSIjMDA1QzlCIi8+PHRleHQgeD0iMTAiIHk9IjI4IiBmaWxsPSIjRkZGIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjIwIj5BRklQPC90ZXh0Pjwvc3ZnPg=="
                alt="AFIP"
                className="h-7 mb-1"
              />
              <p className="font-bold text-[10px] leading-tight">
                Comprobante Autorizado
              </p>
              <p>
                <span className="font-bold">C.A.E. N°:</span> {venta.cae}
              </p>
              <p>
                <span className="font-bold">Vto. C.A.E.:</span>{" "}
                {venta.vencimientoCae
                  ? new Date(venta.vencimientoCae).toLocaleDateString("es-AR")
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        {/* TABLA DE TOTALES */}
        <div className="w-1/3 border-black p-0">
          {!isTypeC && (
            <>
              <div className="flex justify-between border-b border-black p-1 px-2">
                <span className="font-bold uppercase">Subtotal:</span>
                <span>
                  $ {neto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-b border-black p-1 px-2">
                <span className="font-bold uppercase">IVA 21%:</span>
                <span>
                  $ {iva.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between bg-gray-100 p-2 px-2 text-sm">
            <span className="font-bold uppercase">Total:</span>
            <span className="font-black">
              $ {total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
