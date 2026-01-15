// components/announcement-bar.tsx

// Ya no necesitamos importar getConfig aquí porque el dato viene del padre (layout.tsx)

export default function AnnouncementBar({ config }: { config: any }) {
    // ELIMINADO: const config = await getConfig() -> Ya lo recibimos por props

    // Si no hay texto configurado, no mostramos nada
    if (!config?.announcementText) return null

    return (
        <div className="w-full bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 text-white h-10 flex items-center overflow-hidden shadow-inner relative z-40 border-b border-purple-500/30">
            <div className="w-full whitespace-nowrap">
                <p className="animate-marquee inline-block text-sm font-bold tracking-wider uppercase px-4">
                    {config.announcementText}
                </p>
            </div>
        </div>
    )
}
