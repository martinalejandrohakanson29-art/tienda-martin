import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MessageCircle, Bot, ArrowRight, BrainCircuit } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function ChatwootPage() {
    const secciones = [
        {
            title: "Mensajes Mayoristas",
            description: "Administra el directorio de mayoristas y envía promociones masivas por WhatsApp.",
            icon: <MessageCircle className="h-8 w-8 text-teal-600" />,
            href: "/admin/chatwoot/mayoristas",
            color: "border-l-4 border-l-teal-500"
        },
        {
            title: "Base de Conocimiento",
            description: "Kits/combos, horarios, medios de pago, envíos, precios y compatibilidad técnica para que el agente responda sin escalar a un humano.",
            icon: <BrainCircuit className="h-8 w-8 text-amber-600" />,
            href: "/admin/chatwoot/conocimiento",
            color: "border-l-4 border-l-amber-500"
        },
        {
            title: "Prueba de Mensajes",
            description: "Simulá un mensaje entrante de WhatsApp y probá el workflow de n8n sin depender de un mensaje real.",
            icon: <Bot className="h-8 w-8 text-violet-600" />,
            href: "/admin/chatwoot/prueba",
            color: "border-l-4 border-l-violet-500"
        }
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Chatwoot</h1>
                <p className="text-gray-500">Gestión de mensajería por WhatsApp y herramientas de prueba del workflow de n8n.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {secciones.map((seccion, index) => (
                    <Link key={index} href={seccion.href}>
                        <Card className={`h-full hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer ${seccion.color}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xl font-semibold">
                                    {seccion.title}
                                </CardTitle>
                                <ArrowRight className="h-4 w-4 text-gray-400" />
                            </CardHeader>
                            <CardContent>
                                <div className="mb-4 mt-2">
                                    {seccion.icon}
                                </div>
                                <CardDescription className="text-base">
                                    {seccion.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
