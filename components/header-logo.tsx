"use client"

import Link from "next/link"

export default function HeaderLogo({ config }: { config: any }) {
    return (
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity shrink-0">
            {config?.logoUrl ? (
                <img 
                    src={config.logoUrl} 
                    alt={config.companyName || "Logo"} 
                    style={{ height: config.logoHeight || "80px" }}
                    className="w-auto object-contain"
                />
            ) : (
                <span className="font-extrabold text-xl md:text-3xl tracking-tighter text-blue-600 uppercase italic">
                    {config?.companyName || "Revolucion Motos"}
                </span>
            )}
        </Link>
    )
}
