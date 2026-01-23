"use client"

import { usePathname } from "next/navigation"

/**
 * Este componente actúa como un filtro:
 * Si la ruta comienza con "/admin", el footer no se renderiza.
 * Para cualquier otra ruta de la tienda, muestra su contenido (el Footer).
 */
export default function ConditionalFooter({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const pathname = usePathname()
  
  // Verificamos si la ruta actual es parte del panel de administración
  const isAdminPage = pathname?.startsWith("/admin")

  // Si es una página de admin, retornamos null para que no se vea nada
  if (isAdminPage) {
    return null
  }

  // Si no es admin, mostramos el Footer que viene como "children" desde el layout
  return <>{children}</>
}
