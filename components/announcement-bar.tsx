
import { getConfig } from "@/app/actions/config"

export default async function AnnouncementBar() {
    const config = await getConfig()

    // Si no hay texto configurado, no mostramos nada (la barra desaparece)
    if (!config?.announcementText) return null

    return (
        // Contenedor con gradiente elegante y overflow-hidden para que el texto no rompa la pagina
        <div className="w-full bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 text-white h-10 flex items-center overflow-hidden shadow-inner relative z-40 border-b border-purple-500/30">
            
            {/* Contenedor del texto animado */}
            {/* 'whitespace-nowrap' evita que el texto baje de renglón */}
            <div className="w-full whitespace-nowrap">
                <p className="animate-marquee inline-block text-sm font-bold tracking-wider uppercase px-4">
                    {config.announcementText}
                </p>
            </div>

        </div>
    )
}
