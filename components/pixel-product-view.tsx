"use client"
import { useEffect } from "react"

// Este componente recibe el producto y avisa a Facebook que se vio
export default function PixelProductView({ product }: { product: any }) {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_name: product.title,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'ARS' // O la moneda que uses
      });
    }
  }, [product]);

  return null; // No renderiza nada visualmente
}
