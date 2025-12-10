import { getConfig } from "@/app/actions/config"
import { Instagram, MapPin } from "lucide-react"

export default async function Footer() {
    const config = await getConfig()

    return (
        <footer className="bg-gray-900 text-white py-12 mt-12">
            <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
                <div>
                    <h3 className="text-xl font-bold mb-4">{config?.companyName}</h3>
                    <p className="text-gray-400">{config?.welcomeText}</p>
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-4">Contacto</h3>
                    <p className="text-gray-400">WhatsApp: {config?.whatsappNumber}</p>
                    <div className="flex space-x-4 mt-4">
                        {config?.instagramUrl && (
                            <a href={config.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">
                                <Instagram />
                            </a>
                        )}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-4">Ubicación</h3>
                    {config?.locationUrl && (
                        <a href={config.locationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center hover:text-gray-300">
                            <MapPin className="mr-2" />
                            Ver en Mapa
                        </a>
                    )}
                </div>
            </div>
        </footer>
    )
}
