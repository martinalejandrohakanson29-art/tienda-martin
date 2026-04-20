"use client";

import React from "react";
import { generarPedidoPDF } from "@/app/actions/envios";

interface PDFPreviewProps {
  venta: {
    id: string;
    cliente: string;
    vendedor: string;
    total: number;
    totalFinal: number;
    metodo_pago: string;
    createdAt: string;
    info?: string | null;
    items: {
      nombre: string;
      cantidad: number;
      precio_unit: number;
      subtotal: number;
      productoId?: string | null;
    }[];
  };
}

export default function PDFPreview({ venta }: PDFPreviewProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handlePrint = async () => {
    setIsGenerating(true);
    try {
      const result = await generarPedidoPDF(venta.id);
      
      if (result.success && result.pdfBase64) {
        // Convertir Base64 a Blob
        const byteCharacters = atob(result.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        // Crear URL del objeto
        const url = URL.createObjectURL(blob);
        
        // Abrir en nueva pestaña
        window.open(url, '_blank');
        
        // Limpieza
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      } else {
        alert(result.error || "No se pudo generar el PDF");
      }
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Error al generar el PDF. Intente nuevamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="hidden print:block">
        <button
          onClick={handlePrint}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={isGenerating}
        >
          {isGenerating ? 'Generando PDF...' : 'Imprimir PDF'}
        </button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8 print:shadow-none print:p-0">
        {/* Header del Pedido */}
        <div className="border-b-2 border-amber-600 pb-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 uppercase">
                Pedido de Venta
              </h1>
              <p className="text-slate-500 mt-1">
                N° Pedido: {venta.id.slice(0, 8)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">
                {new Date(venta.createdAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
              <p className="text-sm text-slate-500">
                {new Date(venta.createdAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Datos del Cliente */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 uppercase mb-3 border-b border-slate-200 pb-2">
            A nombre de:
          </h2>
          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Cliente
                </p>
                <p className="text-slate-900 font-medium text-lg">
                  {venta.cliente || "Consumidor Final"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Vendedor
                </p>
                <p className="text-slate-900 font-medium text-lg">
                  {venta.vendedor}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Método de Pago
                </p>
                <p className="text-slate-900 font-medium">
                  {venta.metodo_pago}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Total Final
                </p>
                <p className="text-slate-900 font-bold text-xl">
                  ${venta.totalFinal.toLocaleString("es-AR")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Artículos */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 uppercase mb-3 border-b border-slate-200 pb-2">
            Artículos:
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b-2 border-slate-200">
                    Artículo
                  </th>
                  <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b-2 border-slate-200 text-center">
                    Cantidad
                  </th>
                  <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b-2 border-slate-200 text-right">
                    Precio Unit.
                  </th>
                  <th className="p-3 text-xs font-bold text-slate-700 uppercase border-b-2 border-slate-200 text-right">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {venta.items.length > 0 ? (
                  venta.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 border-b border-slate-100">
                        <p className="text-slate-900 font-medium">
                          {item.nombre}
                        </p>
                        {item.productoId && (
                          <p className="text-xs text-slate-400 font-mono mt-1">
                            ID: {item.productoId}
                          </p>
                        )}
                      </td>
                      <td className="p-3 border-b border-slate-100 text-center">
                        <span className="bg-slate-200 px-2 py-1 rounded text-xs font-bold text-slate-700">
                          x{item.cantidad}
                        </span>
                      </td>
                      <td className="p-3 border-b border-slate-100 text-right">
                        ${item.precio_unit.toLocaleString("es-AR")}
                      </td>
                      <td className="p-3 border-b border-slate-100 text-right font-bold text-slate-900">
                        ${item.subtotal.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                      Sin artículos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observaciones */}
        {venta.info && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-900 uppercase mb-3 border-b border-slate-200 pb-2">
              Observaciones / Datos de Envío:
            </h2>
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <p className="text-slate-700 whitespace-pre-wrap">{venta.info}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 mt-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500">
              <p>Generado automáticamente por el sistema</p>
              <p>Tienda Martín - {new Date().getFullYear()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase">Total Final</p>
              <p className="text-2xl font-bold text-slate-900">
                ${venta.totalFinal.toLocaleString("es-AR")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos para impresión */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 20mm;
          }
          body {
            background-color: white;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}