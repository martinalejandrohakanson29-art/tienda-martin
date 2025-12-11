import { getConfig } from "@/app/actions/config"
import { MapPin, Lock } from "lucide-react"
import Link from "next/link"

export default async function Footer() {
    const config = await getConfig()

    return (
        <footer className="bg-gray-900 text-white py-12 mt-12 overflow-hidden relative">
            {/* El overflow-hidden ayuda a cortar cualquier "fuga" visual que cause líneas raras */}
            
            <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8 relative z-10">
                {/* Columna 1: Info */}
                <div>
                    <h3 className="text-xl font-bold mb-4">{config?.companyName}</h3>
                    <p className="text-gray-400 mb-4">{config?.welcomeText}</p>
                </div>

                {/* Columna 2: Contacto (WhatsApp + Instagram) */}
                <div className="flex flex-col items-start">
                    <h3 className="text-xl font-bold mb-4">Contacto</h3>
                    
                    {/* Botón WhatsApp */}
                    {config?.whatsappNumber ? (
                        <a 
                            href={`https://wa.me/${config.whatsappNumber}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 text-gray-400 hover:text-white transition-all group mb-4 w-full"
                            title="Enviar mensaje por WhatsApp"
                        >
                            {/* Círculo blanco para el logo */}
                            <div className="bg-white p-1.5 rounded-full group-hover:scale-110 transition-transform shadow-md shrink-0">
                                <img 
                                    src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
                                    alt="WhatsApp" 
                                    className="w-6 h-6" 
                                />
                            </div>
                            <span className="text-lg group-hover:font-medium transition-colors">{config.whatsappNumber}</span>
                        </a>
                    ) : null}

                    {/* Botón Instagram (NUEVO DISEÑO) */}
                    {config?.instagramUrl && (
                        <a 
                            href={config.instagramUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 text-gray-400 hover:text-white transition-all group w-full"
                            title="Ver Instagram"
                        >
                            {/* Círculo blanco para el logo (Mismo tamaño que WP) */}
                            <div className="bg-white p-1.5 rounded-full group-hover:scale-110 transition-transform shadow-md shrink-0">
                                <img 
                                    src="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg" 
                                    alt="Instagram" 
                                    className="w-6 h-6" 
                                />
                            </div>
                            <span className="text-lg group-hover:font-medium transition-colors">revolucionmotoscba</span>
                        </a>
                    )}
                </div>

                {/* Columna 3: Ubicación (GPS) */}
                <div>
                    <h3 className="text-xl font-bold mb-4">Ubicación</h3>
                    {config?.locationUrl ? (
                        <div className="flex flex-col items-start">
                            <a 
                                href={config.locationUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="group relative bg-white p-2 rounded-xl border-2 border-transparent hover:border-blue-500 transition-all duration-300 shadow-lg hover:shadow-blue-900/20 hover:scale-105 mb-2"
                                title="Abrir en Google Maps"
                            >
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
                                className="flex items-center text-sm text-gray-500 hover:text-blue-400 transition-colors"
                            >
                                <MapPin size={14} className="mr-1" />
                                Ver cómo llegar
                            </a>
                        </div>
                    ) : (
                        <p className="text-gray-500 italic">Ubicación no configurada</p>
                    )}
                </div>
            </div>
            
            {/* Barra Inferior (Staff) - Zócalo Limpio */}
            <div className="border-t border-gray-800 mt-12 pt-8">
                <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-gray-600 text-sm gap-4">
                    <p>&copy; {new Date().getFullYear()} {config?.companyName}. Todos los derechos reservados.</p>
                    
                    <Link href="/admin" className="flex items-center hover:text-gray-400 transition-colors opacity-50 hover:opacity-100">
                        <Lock size={14} className="mr-1" /> Acceso Staff
                    </Link>
                </div>
            </div>
        </footer>
    )
}
