"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Store, Phone, MapPin, Instagram, Link as LinkIcon, MessageSquare } from "lucide-react"
import { updateConfig } from "@/app/actions/config"
import { Config } from "@prisma/client"

export default function ConfigClient({ initialConfig }: { initialConfig: Config }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        companyName: initialConfig.companyName || "",
        whatsappNumber: initialConfig.whatsappNumber || "",
        instagramUrl: initialConfig.instagramUrl || "",
        tiktokUrl: initialConfig.tiktokUrl || "",
        welcomeText: initialConfig.welcomeText || "",
        locationUrl: initialConfig.locationUrl || ""
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await updateConfig(formData)
            alert("¡Configuración guardada con éxito!")
            router.refresh()
        } catch (error) {
            alert("Error al guardar la configuración")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold">Configuración de la Tienda</h2>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Información General</CardTitle>
                        <CardDescription>Estos datos se mostrarán en el encabezado y pie de página.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Store size={16} /> Nombre de la Tienda
                                </Label>
                                <Input 
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                                    placeholder="Ej: Tienda Revolución" 
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Phone size={16} /> WhatsApp (con código de país)
                                </Label>
                                <Input 
                                    value={formData.whatsappNumber}
                                    onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
                                    placeholder="Ej: 5493511234567" 
                                />
                                <p className="text-xs text-gray-500">Importante: Solo números, sin espacios ni símbolos (+).</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MessageSquare size={16} /> Texto de Bienvenida / Slogan
                            </Label>
                            <Input 
                                value={formData.welcomeText}
                                onChange={(e) => setFormData({...formData, welcomeText: e.target.value})}
                                placeholder="Ej: La mejor ropa deportiva de Córdoba" 
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MapPin size={16} /> Enlace de Google Maps
                            </Label>
                            <Input 
                                value={formData.locationUrl}
                                onChange={(e) => setFormData({...formData, locationUrl: e.target.value})}
                                placeholder="https://maps.app.goo.gl/..." 
                            />
                        </div>

                        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Instagram size={16} /> Instagram URL
                                </Label>
                                <Input 
                                    value={formData.instagramUrl}
                                    onChange={(e) => setFormData({...formData, instagramUrl: e.target.value})}
                                    placeholder="https://instagram.com/tu_usuario" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <LinkIcon size={16} /> TikTok URL
                                </Label>
                                <Input 
                                    value={formData.tiktokUrl}
                                    onChange={(e) => setFormData({...formData, tiktokUrl: e.target.value})}
                                    placeholder="https://tiktok.com/@tu_usuario" 
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full mt-6" disabled={loading}>
                            <Save className="mr-2 h-4 w-4" />
                            {loading ? "Guardando..." : "Guardar Cambios"}
                        </Button>

                    </CardContent>
                </Card>
            </form>
        </div>
    )
}
