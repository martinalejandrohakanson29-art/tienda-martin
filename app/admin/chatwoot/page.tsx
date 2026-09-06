import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MessageCircle, Bot, ArrowRight, BrainCircuit, Clock, Inbox, Sparkles, BarChart3, Boxes, MessagesSquare, ListChecks } from "lucide-react"
import Link from "next/link"
import { obtenerPanelBot, type PanelBot } from "@/app/actions/bot-onoff"
import { BotOnOffPanel } from "./bot-onoff-panel"

export const dynamic = "force-dynamic"

export default async function ChatwootPage() {
    // El panel ON/OFF necesita las tablas de n8n-workflows/bot-onoff.sql. Si
    // todavía no se corrieron, el resto de la pantalla tiene que seguir andando.
    let panelBot: PanelBot | null = null
    let errorBot: string | null = null
    try {
        panelBot = await obtenerPanelBot()
    } catch (e) {
        errorBot = e instanceof Error ? e.message : "No se pudo leer el estado del bot"
    }

    const secciones = [
        {
            title: "Métricas",
            description: "Mensajes entrantes, pico de horario y cuántos clientes siguen escribiendo después de nuestra primera respuesta — leído en vivo desde Chatwoot.",
            icon: <BarChart3 className="h-8 w-8 text-indigo-600" />,
            href: "/admin/chatwoot/metricas",
            color: "border-l-4 border-l-indigo-500"
        },
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
            title: "Respuestas en cola",
            description: "Lo que el bot dejó listo mientras estuvo en pausa. Revisá, editá o descartá antes de que salga.",
            icon: <Clock className="h-8 w-8 text-sky-600" />,
            href: "/admin/chatwoot/cola",
            color: "border-l-4 border-l-sky-500"
        },
        {
            title: "Consultas pendientes",
            description: "Preguntas que el bot escaló al equipo por falta de un dato. Respondé acá mismo y el bot le contesta al cliente solo.",
            icon: <Inbox className="h-8 w-8 text-rose-600" />,
            href: "/admin/chatwoot/pendientes",
            color: "border-l-4 border-l-rose-500"
        },
        {
            title: "Simulador del Agente (Nuevo)",
            description: "Probá el nuevo cerebro de IA con herramientas en tiempo real: mirá qué tablas consulta, qué responde, controlá el estilo y ajustá palabras prohibidas.",
            icon: <Bot className="h-8 w-8 text-cyan-600" />,
            href: "/admin/chatwoot/simulador",
            color: "border-l-4 border-l-cyan-500"
        },
        {
            title: "Situaciones del Bot (nuevo)",
            description: "Reglas situacionales editables (descuento, mayorista, 'sos un bot?', comprobante...). Cada caso nuevo es una fila acá, no un párrafo más en el prompt. El bot inyecta solo la que aplica a cada mensaje.",
            icon: <ListChecks className="h-8 w-8 text-orange-600" />,
            href: "/admin/chatwoot/situaciones",
            color: "border-l-4 border-l-orange-500"
        },
        {
            title: "Prueba de Mensajes (n8n viejo)",
            description: "Simulá un mensaje entrante de WhatsApp y probá el workflow de n8n sin depender de un mensaje real.",
            icon: <Bot className="h-8 w-8 text-violet-600" />,
            href: "/admin/chatwoot/prueba",
            color: "border-l-4 border-l-violet-500"
        },
        {
            title: "Cargar Kit (asistido)",
            description: "Charlá con un asistente y él arma el kit con el formato correcto (palabras clave, qué incluye, compatibilidad) — vos revisás y confirmás antes de publicar.",
            icon: <Sparkles className="h-8 w-8 text-fuchsia-600" />,
            href: "/admin/chatwoot/cargar-kit",
            color: "border-l-4 border-l-fuchsia-500"
        },
        {
            title: "Chats en vivo (maqueta)",
            description: "Vista tipo WhatsApp de las conversaciones, filtrada por categoría (técnica/negocio/precio). Todavía con datos de ejemplo, sin conectar a Chatwoot.",
            icon: <MessagesSquare className="h-8 w-8 text-teal-600" />,
            href: "/admin/chatwoot/chats-vivo",
            color: "border-l-4 border-l-teal-600"
        },
        {
            title: "Catálogo del Bot (nuevo)",
            description: "Base aislada en construcción: artículos sueltos con su precio + packs armados a partir de ellos, para que el bot conteste preguntas sobre una pieza puntual de un combo. Todavía no está conectada al bot en producción.",
            icon: <Boxes className="h-8 w-8 text-emerald-600" />,
            href: "/admin/chatwoot/catalogo",
            color: "border-l-4 border-l-emerald-500"
        }
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Chatwoot</h1>
                <p className="text-gray-500">Gestión de mensajería por WhatsApp y herramientas de prueba del workflow de n8n.</p>
            </div>

            <BotOnOffPanel inicial={panelBot} error={errorBot} />

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
