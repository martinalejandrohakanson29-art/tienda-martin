"use client"

import { usePathname } from "next/navigation"

export default function ConditionalFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  // Si la ruta empieza con /admin, no se muestra nada
  const isAdminPage = pathname?.startsWith("/admin")

  if (isAdminPage) {
    return null
  }

  // Renderizamos lo que nos pasen desde el Layout (en este caso, el Footer)
  return <>{children}</>
}
