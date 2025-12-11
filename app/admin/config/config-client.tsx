"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Store, Phone, MapPin, Instagram, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon } from "lucide-react"
import { updateConfig } from "@/app/actions/config"
import { Config } from "@prisma/client"

export default function ConfigClient({ initialConfig }: { initialConfig: Config }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        companyName: initialConfig.companyName || "",
        logoUrl: initialConfig.logoUrl || "", // 👈 Nuevo estado
        whatsappNumber: initialConfig.whatsappNumber || "",
        instagramUrl: initialConfig.instagramUrl || "",
        tiktokUrl: initialConfig.tiktokUrl || "",
        welcomeText: initialConfig.welcomeText || "",
        locationUrl: initialConfig.locationUrl || "",
        paymentMethods: initialConfig.paymentMethods || "Efectivo,Transferencia"
    })

    // 👇 Función mágica para enlaces de Drive (la misma que usamos en productos)
    const transformDriveLink = (url: string) => {
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                // Usamos el servidor lh3 que es rápido y fiable para imágenes
                return `http://lh3.googleusercontent.com/d/${idMatch[1]}`
            }
        }
        return url
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            // Aplicamos la transformación al logo antes de guardar
            const dataToSave = {
                ...formData,
                logoUrl: transformDriveLink(formData.logoUrl)
            }
            await updateConfig(dataToSave)
            alert("¡Configuración guardada con éxito!")
            router.refresh()
        } catch (error) {
            alert("Error al guardar la configuración")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto mb-12">
            <h2 className="text-3xl font-bold">Configuración General</h2>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Identidad de la Tienda</CardTitle>
                        <CardDescription>Define el nombre y el logo que aparecerán en el encabezado.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        
                        {/* SECCIÓN DE IDENTIDAD VISUAL */}
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                            {/* Input Nombre Texto */}
                            <div className="space-y-4">
                                <Label className="flex items-center gap-2 font-semibold">
                                    <Store size={18} className="text-blue-600" /> Nombre (Texto)
                                </Label>
                                <Input 
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                                    placeholder="Ej: Revolucion Motos"
                                />
                                <p className="text-xs text-gray-500">Se mostrará si no hay un logo cargado.</p>
                            </div>

                            {/* Input Logo Imagen */}
                            <div className="space-y-4">
                                <Label className="flex items-center gap-2 font-semibold">
                                    <ImageIcon size={18} className="text-purple-600" /> Logo (Imagen URL)
                                </Label>
                                <div className="flex gap-4 items-start">
                                    {/* Previsualización del logo */}
                                    <div className="w-16 h-16 border rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 relative group">
                                        {formData.logoUrl ? (
                                            <img 
                                                src={transformDriveLink(formData.logoUrl)} // Previsualización en tiempo real
                                                alt="Logo Preview" 
                                                className="w-full h-full object-contain p-1" 
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <ImageIcon className="text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <Input 
                                            value={formData.logoUrl}
                                            onChange={(e) => setFormData({...formData, logoUrl: e.target.value})}
                                            placeholder="Pega el link de Drive de tu logo..."
                                        />
                                        <p className="text-xs text-gray-500">Ideal: Imagen PNG con fondo transparente.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-200 my-4"/>

                        {/* INFO DE CONTACTO (Resto del formulario igual que antes) */}
                         <div className="space-y-2">
                             <Label className="flex items-center gap-2 font-semibold"><Phone size={18} /> WhatsApp</Label>
                             <Input value={formData.whatsappNumber} onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}/>
                         </div>
                         
                         {/* ... (El resto de tus campos de redes y pagos siguen aquí) ... */}
                         {/* Solo pego un par de ejemplo para no hacer el código gigante, pero tú mantén los tuyos */}
                         <div className="grid md:grid-cols-2 gap-6 pt-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Instagram size={16} /> Instagram URL</Label>
                                <Input value={formData.instagramUrl} onChange={(e) => setFormData({...formData, instagramUrl: e.target.value})}/>
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><LinkIcon size={16} /> TikTok URL</Label>
                                <Input value={formData.tiktokUrl} onChange={(e) => setFormData({...formData, tiktokUrl: e.target.value})}/>
                            </div>
                        </div>


                        <Button type="submit" className="w-full mt-8 bg-blue-600 hover:bg-blue-700" disabled={loading}>
                            <Save className="mr-2 h-4 w-4" />
                            {loading ? "Guardando..." : "Guardar Configuración"}
                        </Button>

                    </CardContent>
                </Card>
            </form>
        </div>
    )
}
