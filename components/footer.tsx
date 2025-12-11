import { getConfig } from "@/app/actions/config"
import { Instagram, MapPin, Lock } from "lucide-react"
import Link from "next/link"

export default async function Footer() {
    const config = await getConfig()

    return (
        <footer className="bg-gray-900 text-white py-12 mt-12">
            <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
                {/* Columna 1: Info */}
                <div>
                    <h3 className="text-xl font-bold mb-4">{config?.companyName}</h3>
                    <p className="text-gray-400 mb-4">{config?.welcomeText}</p>
                </div>

                {/* Columna 2: Contacto */}
                <div>
                    <h3 className="text-xl font-bold mb-4">Contacto</h3>
                    <p className="text-gray-400">WhatsApp: {config?.whatsappNumber}</p>
                    <div className="flex space-x-4 mt-4">
                        {config?.instagramUrl && (
                            <a href={config.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">
                                <Instagram className="h-6 w-6" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Columna 3: Ubicación (RENOVADA CON GPS) */}
                <div>
                    <h3 className="text-xl font-bold mb-4">Ubicación</h3>
                    {config?.locationUrl ? (
                        <div className="flex flex-col items-start">
                            <p className="text-gray-400 mb-3 text-sm">Haz clic para ver cómo llegar:</p>
                            <a 
                                href={config.locationUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="group relative bg-white p-2 rounded-xl border-2 border-transparent hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-900/20 hover:scale-105"
                                title="Abrir en Google Maps"
                            >
                                {/* Imagen de Google Maps */}
                                <img 
                                    src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" 
                                    alt="Google Maps" 
                                    className="w-16 h-16 object-contain" 
                                />
                            </a>
                            <a 
                                href={config.locationUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex items-center text-sm text-gray-500 mt-2 hover:text-green-400 transition-colors"
                            >
                                <MapPin size={14} className="mr-1" />
                                Abrir mapa
                            </a>
                        </div>
                    ) : (
                        <p className="text-gray-500 italic">Ubicación no configurada</p>
                    )}
                </div>
            </div>
            
            {/* Barra Inferior (Staff) */}
            <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-600 text-sm">
                <div className="container mx-auto px-4 flex justify-between items-center">
                    <p>&copy; {new Date().getFullYear()} {config?.companyName}. Todos los derechos reservados.</p>
                    <Link href="/admin" className="flex items-center hover:text-gray-400 transition-colors">
                        <Lock size={14} className="mr-1" /> Acceso Staff
                    </Link>
                </div>
            </div>
        </footer>
    )
}
