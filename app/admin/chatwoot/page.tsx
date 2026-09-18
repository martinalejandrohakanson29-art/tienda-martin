import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MessageCircle, ArrowRight, BarChart3, Boxes, MessagesSquare, ListChecks, MessageSquareQuote } from "lucide-react"
import Link from "next/link"
import { obtenerPanelBot, type PanelBot } from "@/app/actions/bot-onoff"
import { BotOnOffPanel } from "./bot-onoff-panel"
import { obtenerHistoricoColas, obtenerEstadoColaEnVivo } from "@/lib/chatwoot-cola-historico"
import { ColaHistoricoPanel } from "./cola-historico-panel"

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

    const [historicoColas, colaEnVivo] = await Promise.all([
        obtenerHistoricoColas(14).catch(() => []),
        obtenerEstadoColaEnVivo().catch(() => null),
    ])

    const chatwootUrl = (process.env.CHATWOOT_API_URL || "https://chat.revolucionmotos.tech/api/v1").replace(
        /\/api\/v1\/?$/,
        ""
    )

    // Orden de uso, no de antigüedad: primero lo que se abre todos los días
    // (los chats, lo que espera respuesta), después lo que se toca cuando hay
    // que cargar o afinar algo, y al final lo que se mira de vez en cuando.
    //
    // Lo que NO figura acá y por qué. Las pantallas de la época de n8n (Prueba
    // de Mensajes, Cargar Kit asistido, Base de Conocimiento) y el Simulador
    // quedaron afuera porque el bot no lee esas tablas o el flujo ya está
    // cubierto por Catálogo del Bot. Consultas pendientes y Respuestas en cola
    // salieron por desuso, no por estar rotas: el trabajo del día pasa por
    // Chats en vivo, y la cola igual se ve en el panel del final de esta misma
    // pantalla. Todas las rutas siguen existiendo y se abren por URL.
    const secciones = [
        {
            title: "Chats en vivo",
            description: "Vista tipo WhatsApp de las conversaciones reales, con el kit y las notas de cada una. Desde acá se toma una charla a mano o se pausa el bot en esa conversación.",
            icon: <MessagesSquare className="h-8 w-8 text-teal-600" />,
            href: "/admin/chatwoot/chats-vivo",
            color: "border-l-4 border-l-teal-600"
        },
        {
            title: "Métricas",
            description: "Mensajes entrantes, pico de horario y cuántos clientes siguen escribiendo después de nuestra primera respuesta — leído en vivo desde Chatwoot.",
            icon: <BarChart3 className="h-8 w-8 text-indigo-600" />,
            href: "/admin/chatwoot/metricas",
            color: "border-l-4 border-l-indigo-500"
        },
        {
            title: "Catálogo del Bot",
            description: "Lo que el bot responde en WhatsApp: artículos sueltos, packs armados con ellos, compatibilidad por moto y precios. Un kit nuevo nace en borrador y se publica con revisión previa.",
            icon: <Boxes className="h-8 w-8 text-emerald-600" />,
            href: "/admin/chatwoot/catalogo",
            color: "border-l-4 border-l-emerald-500"
        },
        {
            title: "Situaciones del Bot",
            description: "Reglas situacionales editables (descuento, mayorista, 'sos un bot?', comprobante...). Cada caso nuevo es una fila acá, no un párrafo más en el prompt. El bot inyecta solo la que aplica a cada mensaje.",
            icon: <ListChecks className="h-8 w-8 text-orange-600" />,
            href: "/admin/chatwoot/situaciones",
            color: "border-l-4 border-l-orange-500"
        },
        {
            title: "Letra de la Casa",
            description: "Cómo querés que el bot diga cada momento de la venta (que el kit le va, el precio, el cierre). Cargás la frase y él la usa como registro. Un momento sin frases lo redacta con su voz.",
            icon: <MessageSquareQuote className="h-8 w-8 text-teal-600" />,
            href: "/admin/chatwoot/frases",
            color: "border-l-4 border-l-teal-500"
        },
        {
            title: "Mensajes Mayoristas",
            description: "Administra el directorio de mayoristas y envía promociones masivas por WhatsApp.",
            icon: <MessageCircle className="h-8 w-8 text-teal-600" />,
            href: "/admin/chatwoot/mayoristas",
            color: "border-l-4 border-l-teal-500"
        }
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Chatwoot</h1>
                <p className="text-gray-500">Todo lo que responde el bot de WhatsApp: las conversaciones, lo que espera respuesta y el catálogo del que saca los datos.</p>
            </div>

            {/*
              * El ON/OFF queda arriba porque es una acción (abrimos / cerramos),
              * no un dato: se busca para tocarlo, y hay que verlo sin scrollear.
              * El histórico de entrantes, en cambio, se mira de vez en cuando y
              * es alto — abajo de todo, para que lo primero de la pantalla sean
              * las tarjetas de cada sub-sección.
              */}
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

            <ColaHistoricoPanel
                inicialHistorico={historicoColas}
                inicialEnVivo={colaEnVivo}
                chatwootUrl={chatwootUrl}
            />
        </div>
    )
}
