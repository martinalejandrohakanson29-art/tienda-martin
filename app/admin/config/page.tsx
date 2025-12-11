import { getConfig } from "@/app/actions/config"
import ConfigClient from "./config-client"

export const dynamic = "force-dynamic"

export default async function AdminConfigPage() {
    const config = await getConfig()
    
    // Serializamos para evitar problemas de fechas o tipos complejos
    const initialConfig = JSON.parse(JSON.stringify(config))

    return <ConfigClient initialConfig={initialConfig} />
}
