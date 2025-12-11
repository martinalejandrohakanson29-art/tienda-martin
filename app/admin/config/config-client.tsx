"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Store, Phone, MapPin, Instagram, Link as LinkIcon, MessageSquare, CreditCard, Image as ImageIcon, Ruler } from "lucide-react"
import { updateConfig } from "@/app/actions/config"
import { Config } from "@prisma/client"

export default function ConfigClient({ initialConfig }: { initialConfig: Config }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        companyName: initialConfig.companyName || "",
        logoUrl: initialConfig.logoUrl || "",
        logoHeight: initialConfig.logoHeight || "80px", // 👈 Nuevo estado
        whatsappNumber: initialConfig.whatsappNumber || "",
        instagramUrl: initialConfig.instagramUrl || "",
        tiktokUrl: initialConfig.tiktokUrl || "",
        welcomeText: initialConfig.welcomeText || "",
        locationUrl: initialConfig.locationUrl || "",
        paymentMethods: initialConfig.paymentMethods || "Efectivo,Transferencia"
    })

    const transformDriveLink = (url: string) => {
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}` // Usamos formato robusto
            }
        }
        return url
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
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
                        <CardDescription>Define la marca, logo y sus dimensiones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                            <div className="space-y-4">
                                <Label className="flex items-center gap-2 font-semibold">
                                    <Store size={18} className="text-blue-600" /> Nombre (Texto)
                                </Label>
                                <Input 
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                                    placeholder="Ej: Revolucion Motos"
                                />
                            </div>

                            {/* SECCIÓN LOGO + TAMAÑO */}
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className="flex items-center gap-2 font-semibold">
                                        <ImageIcon size={18} className="text-purple-600" /> Logo
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Ruler size={14} className="text-gray-500"/>
                                        <Label className="text-xs text-gray-500">Altura</Label>
                                        <Input 
                                            className="h-7 w-20 text-xs bg-gray-50" 
                                            value={formData.logoHeight} 
                                            onChange={(e) => setFormData({...formData, logoHeight: e.target.value})}
                                            placeholder="80px"
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex gap-4 items-start">
                                    <div className="w-20 h-20 border rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                                        {formData.logoUrl ? (
                                            <img 
                                                src={transformDriveLink(formData.logoUrl)} 
                                                alt="Preview" 
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
                                            placeholder="Pega el link de Drive..."
                                        />
                                        <p className="text-xs text-gray-500">
                                            Ajusta la altura en píxeles (ej: 60px, 100px) hasta que se vea perfecto.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-200 my-4"/>

                        {/* ... (Resto de inputs: WhatsApp, Redes, etc. Sigue igual) ... */}
                        <div className="grid md:grid-cols-2 gap-6">
                             <div className="space-y-2">
                                 <Label className="flex items-center gap-2"><Phone size={16} /> WhatsApp</Label>
                                 <Input value={formData.whatsappNumber} onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}/>
                             </div>
                             <div className="space-y-2">
                                <Label className="flex items-center gap-2"><CreditCard size={16} /> Métodos de Pago</Label>
                                <Input value={formData.paymentMethods} onChange={(e) => setFormData({...formData, paymentMethods: e.target.value})}/>
                            </div>
                        </div>
                        {/* ... etc ... */}

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
