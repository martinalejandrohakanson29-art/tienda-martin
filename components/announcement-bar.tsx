"use client"

// Agregamos ({ config }: { config: any }) para que TypeScript no de error
export default function AnnouncementBar({ config }: { config: any }) {
    // Si no hay texto en la base de datos, no se muestra nada
    if (!config?.announcementText) return null

    return (
        <div className="bg-blue-600 text-white py-2.5 px-4 text-center text-xs md:text-sm font-bold tracking-wide shadow-inner overflow-hidden">
            <div className="animate-pulse">
                {config.announcementText}
            </div>
        </div>
    )
}
