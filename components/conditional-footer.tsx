"use client"

import { usePathname } from "next/navigation"
import Footer from "./footer"

export default function ConditionalFooter({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname()
  
  // Aquí definimos dónde NO queremos que aparezca el footer
  // Si la ruta empieza con /admin, no se muestra.
  const isAdminPage = pathname?.startsWith("/admin")

  if (isAdminPage) {
    return null
  }

  return <Footer />
}
