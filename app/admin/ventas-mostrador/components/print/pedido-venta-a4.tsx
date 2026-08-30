"use client";

import React from "react";

interface Props {
  venta: any;
}

export function PedidoVentaA4({ venta }: Props) {
  if (!venta) return null;

  const items = venta.items || [];
  const total = Number(venta.totalFinal || venta.total || 0);

  const fechaFactura = new Date(venta.createdAt).toLocaleDateString("es-AR");
  const nroPedido = (venta.numeroVenta || venta.id.slice(0, 8))
    .toString()
    .padStart(8, "0");

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
              <h1 className="text-sm font-bold">REVOLUCIÓN MOTOS</h1>
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

          {/* CENTRO: TIPO COMPROBANTE (X para pedidos) */}
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-12 h-14 bg-white border-black flex flex-col items-center justify-center z-10">
            <span className="text-2xl font-black">X</span>
            <span className="text-[8px]">PEDIDO</span>
          </div>

          {/* LADO DERECHO: DATOS COMPROBANTE */}
          <div className="w-1/2 p-6 flex flex-col justify-center items-end">
            <div className="text-right">
              <h2 className="text-xl font-bold mb-1 uppercase text-blue-700">
                Resumen de Venta
              </h2>
              <p className="font-bold text-sm">N°: 0001-{nroPedido}</p>
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
            <span className="font-bold">I.V.A.:</span> Consumidor Final
          </p>
          <p>
            <span className="font-bold">CUIT/DNI:</span>{" "}
            {(venta.dni || venta.docNro) &&
            venta.dni !== "0" &&
            venta.docNro !== "0"
              ? venta.dni || venta.docNro
              : "-"}
          </p>
          <p>
            <span className="font-bold">Vendedor:</span> {venta.vendedor}
          </p>
          <p className="col-span-2">
            <span className="font-bold">Obs:</span> {venta.info || "-"}
          </p>
        </div>

        {/* TABLA DE ARTÍCULOS */}
        <table className="w-full border-black border-t-0 border-collapse mt-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-black p-2 text-left w-16">Cantidad</th>
              <th className="border-black p-2 text-left">Descripción</th>
              <th className="border-black p-2 text-right w-24">P. Unit.</th>
              <th className="border-black p-2 text-right w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) =>
              item.esNota ? (
                <tr key={i}>
                  <td
                    className="border-black p-2 italic text-gray-600"
                    colSpan={4}
                  >
                    * {item.nombre}
                  </td>
                </tr>
              ) : (
                <tr key={i}>
                  <td className="border-black p-2 text-center">
                    {item.cantidad} Un
                  </td>
                  <td className="border-black p-2">{item.nombre}</td>
                  <td className="border-black p-2 text-right">
                    {Number(item.precio_unit).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="border-black p-2 text-right">
                    {Number(item.subtotal).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER DE TOTALES EN EL PIE */}
      <div className="flex justify-between items-end border-t border-black pt-4 mt-auto">
        <div className="flex flex-col gap-2">
          <div className="p-4 border border-dashed border-gray-300 rounded-lg">
            <p className="text-[10px] text-gray-500 italic">
              Documento no válido como factura.
            </p>
            <p className="text-[10px] text-gray-500 italic">
              Reserva de mercadería sujeta a confirmación.
            </p>
          </div>
        </div>

        {/* TABLA DE TOTALES */}
        <div className="w-1/3 border-black p-0">
          <div className="flex justify-between bg-blue-50 p-2 px-2 text-sm border border-blue-200">
            <span className="font-bold uppercase text-blue-900">Total:</span>
            <span className="font-black text-blue-900">
              $ {total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
