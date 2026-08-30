"use client";

import React, { useState, useEffect } from "react";
import { ItemVenta } from "../../types";
import { numeroALetras } from "./numero-a-letras";

interface Props {
  ventaId: string;
  numeroVenta?: number;
  items: ItemVenta[];
  total: number;
  cliente: string;
  metodoPago: string;
}

export function TicketImpresion({
  ventaId,
  numeroVenta,
  items,
  total,
  cliente,
  metodoPago,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [fechaActual, setFechaActual] = useState("");

  useEffect(() => {
    setMounted(true);
    setTicketId(String(Date.now()).slice(-8));
    setFechaActual(
      new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    );
  }, []);

  if (!mounted || !ventaId) return null;

  const formatPrecio = (num: number | string) => {
    return Number(num || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const clienteFinalStr =
    cliente && cliente !== "Consumidor Final"
      ? cliente.toUpperCase()
      : "CONSUMIDOR FINAL";

  return (
    <div
      className="hidden print:flex flex-col w-[48mm] mx-auto font-mono text-black bg-white text-[9px] uppercase leading-tight"
      style={{ margin: 0, padding: 0 }}
    >
      <style type="text/css" media="print">
        {`
          @page { margin: 0; size: 58mm auto; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; color-adjust: exact; background-color: white;}
          .border-print-black { border-color: black !important; }
        `}
      </style>

      <div className="text-center w-full mb-1">
        <p>NO VALIDO COMO FACTURA</p>
        <p>{fechaActual}</p>
        <p>ID VENTA: {numeroVenta || ventaId.slice(0, 8)}</p>
        <p>NRO: 00099-{ticketId}</p>
      </div>

      <div className="flex justify-center my-2">
        <div className="border-[1.5px] border-print-black border-black w-8 h-8 flex items-center justify-center font-bold text-xl">
          X
        </div>
      </div>

      <div className="text-left w-full mb-1">
        <p>CUIT: 30-00000000-0</p>
      </div>

      <div className="text-center w-full mb-2">
        <p>//</p>
      </div>

      <div className="text-left w-full mb-2">
        <p className="font-bold text-[10px]">{clienteFinalStr}</p>
        <p>CORDOBA</p>
        <p>{metodoPago.toUpperCase()}</p>
      </div>

      <div className="w-full border-t border-print-black border-black my-1"></div>

      <table className="w-full text-[9px] leading-tight text-left border-collapse table-fixed">
        <thead>
          <tr>
            <th className="font-normal w-[12%] pb-1 pt-1 align-bottom">CANT</th>
            <th className="font-normal w-[63%] pb-1 pt-1 align-bottom">DESC.</th>
            <th className="font-normal w-[25%] pb-1 pt-1 text-right align-bottom">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: ItemVenta, idx: number) =>
            item.esNota ? (
              <tr key={idx} className="align-top">
                <td className="pt-0.5" colSpan={3}>
                  <span className="italic">* {item.nombre}</span>
                </td>
              </tr>
            ) : (
              <tr key={idx} className="align-top">
                <td className="pt-0.5">{item.cantidad}</td>
                <td className="pt-0.5 pr-1 break-words whitespace-normal">
                  {item.nombre}
                </td>
                <td className="pt-0.5 text-right">
                  {formatPrecio(item.subtotal)}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <div className="w-full border-t border-print-black border-black my-1 mt-2"></div>

      <div className="flex justify-between items-center w-full mt-1 mb-1">
        <span>SUBTOTAL:</span>
        <span>{formatPrecio(total)}</span>
      </div>

      <div className="flex justify-between items-center w-full font-bold text-[10px] mb-2">
        <span>TOTAL:</span>
        <span>{formatPrecio(total)}</span>
      </div>

      <div className="text-left w-full mb-2">
        <p>SON PESOS:</p>
        <p className="break-words">{numeroALetras(Number(total))}</p>
      </div>

      <div className="text-left w-full mt-2 mb-2">
        <p>SALDO ANTERIOR: 0.00</p>
      </div>

      <div className="text-center w-full mt-2 pb-6">
        <p>//</p>
      </div>
    </div>
  );
}
