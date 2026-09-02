"use client";

import React from "react";
import { generarPedidoPDF } from "@/app/actions/envios";

interface ArticulosVenta {
  id: string;
  items: {
    nombre: string;
    cantidad: number;
    precio_unit: number;
    subtotal: number;
    productoId?: string | null;
    esNota?: boolean;
  }[];
  info?: string | null;
}

interface PDFPreviewProps {
  venta: ArticulosVenta;
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
    <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:m-0 print:min-h-0 print:h-auto print:bg-white">
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
        {/* Título */}
        <div className="border-b-2 border-amber-600 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-slate-900 uppercase">
            Lista de Artículos
          </h1>
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
                    item.esNota ? (
                      <tr key={idx} className="hover:bg-amber-50/50 bg-amber-50/30">
                        <td className="p-3 border-b border-slate-100" colSpan={4}>
                          <p className="text-amber-800 italic font-medium">
                            {item.nombre}
                            <span className="ml-2 text-[10px] font-black bg-amber-100 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase not-italic">Nota</span>
                          </p>
                        </td>
                      </tr>
                    ) : (
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
                    )
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

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 mt-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500">
              {venta.info ? (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Observaciones / Datos de Envío:</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{venta.info}</p>
                </div>
              ) : (
                <div>
                  <p>Generado automáticamente por el sistema</p>
                  <p>Tienda Martín - {new Date().getFullYear()}</p>
                </div>
              )}
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
