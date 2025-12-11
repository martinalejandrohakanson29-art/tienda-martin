"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// 👇 Importamos nuevos iconos: Monitor y Smartphone
import { Save, Store, Phone, MapPin, Instagram, Link as LinkIcon, MessageSquare, CreditCard, Monitor, Smartphone } from "lucide-react"
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
        locationUrl: initialConfig.locationUrl || "",
        paymentMethods: initialConfig.paymentMethods || "Efectivo,Transferencia",
        // 👇 Inicializamos los nuevos campos
        carouselHeightDesktop: initialConfig.carouselHeightDesktop || "600px",
        carouselHeightMobile: initialConfig.carouselHeightMobile || "250px"
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
                        <CardDescription>Estos datos se mostrarán en la tienda.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        
                        {/* ... (Aquí van tus inputs anteriores: Nombre, WhatsApp, etc. NO LOS BORRES) ... */}
                        {/* Te pongo un ejemplo resumido de lo anterior para contexto */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Store size={16} /> Nombre</Label>
                                <Input value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Phone size={16} /> WhatsApp</Label>
                                <Input value={formData.whatsappNumber} onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})} />
                            </div>
                        </div>

                        {/* 👇 NUEVA SECCIÓN: DIMENSIONES DEL CARRUSEL */}
                        <div className="space-y-2 pt-4 border-t">
                            <h3 className="font-semibold flex items-center gap-2 mb-4">
                                📏 Tamaño del Carrusel
                            </h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-blue-600">
                                        <Monitor size={16} /> Altura en PC
                                    </Label>
                                    <Input 
                                        value={formData.carouselHeightDesktop}
                                        onChange={(e) => setFormData({...formData, carouselHeightDesktop: e.target.value})}
                                        placeholder="Ej: 600px, 80vh, etc." 
                                    />
                                    <p className="text-xs text-gray-400">Recomendado: 500px - 700px</p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-green-600">
                                        <Smartphone size={16} /> Altura en Móvil
                                    </Label>
                                    <Input 
                                        value={formData.carouselHeightMobile}
                                        onChange={(e) => setFormData({...formData, carouselHeightMobile: e.target.value})}
                                        placeholder="Ej: 250px, 300px" 
                                    />
                                    <p className="text-xs text-gray-400">Recomendado: 250px - 350px</p>
                                </div>
                            </div>
                        </div>

                        {/* ... (Resto de tus inputs: Pagos, Bienvenida, Redes, etc.) ... */}
                        <div className="space-y-2 pt-4 border-t">
                             {/* ... Inputs existentes ... */}
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
