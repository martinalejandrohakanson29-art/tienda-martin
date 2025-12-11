import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, Box, BarChart3, Truck } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function ToolsPage() {
    // 👇 AQUÍ AGREGAS TUS HERRAMIENTAS NUEVAS FÁCILMENTE
    const tools = [
        {
            title: "Preparación Envíos Full",
            description: "Sistema para etiquetado y gestión de paquetes de MercadoLibre.",
            icon: <Truck className="h-8 w-8 text-blue-500" />,
            href: "https://tu-otro-proyecto-en-railway.app", // 🔗 Pon aquí el link real de tu otro proyecto
            external: true, // Marca si abre en otra pestaña
            color: "border-l-4 border-l-blue-500"
        },
        {
            title: "Métricas de Ventas ML",
            description: "Analíticas y reportes de rendimiento.",
            icon: <BarChart3 className="h-8 w-8 text-green-500" />,
            href: "/admin/tools/analytics", // Ejemplo de herramienta futura interna
            external: false,
            color: "border-l-4 border-l-green-500"
        },
        {
            title: "Control de Stock",
            description: "Gestión avanzada de inventario.",
            icon: <Box className="h-8 w-8 text-orange-500" />,
            href: "#",
            external: false,
            color: "border-l-4 border-l-orange-500 opacity-60 cursor-not-allowed" // Ejemplo deshabilitado
        }
    ]

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Centro de Herramientas</h1>
            <p className="text-gray-500">Acceso rápido a tus sistemas de gestión y utilidades.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
                {tools.map((tool, index) => (
                    <Link 
                        key={index} 
                        href={tool.href}
                        target={tool.external ? "_blank" : "_self"} // Abre en pestaña nueva si es externo
                        rel={tool.external ? "noopener noreferrer" : ""}
                    >
                        <Card className={`h-full hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer ${tool.color}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xl font-semibold">
                                    {tool.title}
                                </CardTitle>
                                {tool.external && <ExternalLink className="h-4 w-4 text-gray-400" />}
                            </CardHeader>
                            <CardContent>
                                <div className="mb-4 mt-2">
                                    {tool.icon}
                                </div>
                                <CardDescription className="text-base">
                                    {tool.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
