import { getConfig, getLandingFaqs } from "@/app/actions/config"
import ConfigClient from "./config-client"

export const dynamic = "force-dynamic"

export default async function AdminConfigPage() {
    const [config, faqs] = await Promise.all([
        getConfig(),
        getLandingFaqs(),
    ])
    
    // Serializamos para evitar problemas de fechas o tipos complejos
    const initialConfig = JSON.parse(JSON.stringify(config))
    const initialFaqs = JSON.parse(JSON.stringify(faqs || []))

    return <ConfigClient initialConfig={initialConfig} initialFaqs={initialFaqs} />
}

