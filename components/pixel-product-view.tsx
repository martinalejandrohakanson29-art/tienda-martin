"use client"
import { useEffect } from "react"

export default function PixelProductView({ product }: { product: any }) {
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).fbq) return

    const finalPrice = Number(product.price) * (1 - (product.discount || 0) / 100)

    ;(window as any).fbq("track", "ViewContent", {
      content_name: product.title,
      content_ids: [product.id],
      content_type: "product",
      contents: [{ id: product.id, quantity: 1, item_price: finalPrice }],
      value: finalPrice,
      currency: "ARS",
    })
  }, [product.id])

  return null
}
