"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Trash, Plus, Image as ImageIcon, Video, MonitorPlay, Save, Smartphone, Monitor } from "lucide-react"
import { createCarouselItem, deleteCarouselItem } from "@/app/actions/carousel"
import { updateConfig } from "@/app/actions/config"

// 👇 Recibimos initialConfig
export default function CarouselClient({ initialItems, initialConfig }: { initialItems: any[], initialConfig: any }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    
    // Estados para nuevo item
    const [mediaUrl, setMediaUrl] = useState("")
    const [mediaType, setMediaType] = useState("image")

    // 👇 Estado para la configuración de tamaños
    const [configData, setConfigData] = useState({
        carouselHeightDesktop: initialConfig?.carouselHeightDesktop || "600px",
        carouselHeightMobile: initialConfig?.carouselHeightMobile || "250px"
    })
    const [configLoading, setConfigLoading] = useState(false)

    // Función inteligente para Drive
  const transformDriveLink = (url: string, type: string) => {
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                const id = idMatch[1]
                if (type === "video") {
                    // Para video, usamos el modo 'preview' que permite embed
                    return `https://drive.google.com/file/d/${id}/preview`
                } else {
                    // Para imagen, corrección: agregamos el '$' antes de {id}
                    return `http://googleusercontent.com/profile/picture/${id}`
                }
            }
        }
        return url
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const finalUrl = transformDriveLink(mediaUrl, mediaType)
            await createCarouselItem({ mediaUrl: finalUrl, mediaType })
            setMediaUrl("")
            router.refresh()
        } catch (error) {
            alert("Error al agregar")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Borrar este banner?")) return
        await deleteCarouselItem(id)
        router.refresh()
    }

    // 👇 Función para guardar solo los tamaños
    const handleSaveConfig = async () => {
        setConfigLoading(true)
        try {
            await updateConfig(configData)
            alert("¡Tamaños actualizados!")
            router.refresh()
        } catch (error) {
            alert("Error al guardar tamaños")
        } finally {
            setConfigLoading(false)
        }
    }

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold">Gestionar Carrusel Multimedia</h2>

            {/* 👇 PANEL DE CONFIGURACIÓN DE TAMAÑOS */}
            <Card className="border-blue-100 bg-blue-50/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        📏 Configuración de Dimensiones
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-6 items-end">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-blue-700">
                                <Monitor size={16} /> Altura en PC
                            </Label>
                            <Input 
                                value={configData.carouselHeightDesktop}
                                onChange={(e) => setConfigData({...configData, carouselHeightDesktop: e.target.value})}
                                placeholder="Ej: 600px" 
                                className="bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-green-700">
                                <Smartphone size={16} /> Altura en Móvil
                            </Label>
                            <Input 
                                value={configData.carouselHeightMobile}
                                onChange={(e) => setConfigData({...configData, carouselHeightMobile: e.target.value})}
                                placeholder="Ej: 250px" 
                                className="bg-white"
                            />
                        </div>
                        <Button onClick={handleSaveConfig} disabled={configLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="mr-2 h-4 w-4" /> Guardar Tamaños
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* PANEL DE CARGA (El resto sigue igual) */}
            <Card>
                <CardHeader>
                    <CardTitle>Agregar Nuevo Banner</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div onClick={() => setMediaType("image")} className={`cursor-pointer p-4 border rounded-lg flex flex-col items-center gap-2 ${mediaType === "image" ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}>
                                <ImageIcon size={24} /> <span className="font-medium">Imagen</span>
                            </div>
                            <div onClick={() => setMediaType("video")} className={`cursor-pointer p-4 border rounded-lg flex flex-col items-center gap-2 ${mediaType === "video" ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}>
                                <Video size={24} /> <span className="font-medium">Video</span>
                            </div>
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <Label>Enlace de Drive ({mediaType === 'image' ? 'Foto' : 'Video'})</Label>
                                <Input required value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="Pega el link aquí..." />
                            </div>
                            <Button type="submit" disabled={loading}><Plus className="mr-2 h-4 w-4" /> Agregar</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6">
                {initialItems.map((item, index) => (
                    <Card key={item.id} className="overflow-hidden">
                        <div className="relative h-[200px] w-full bg-gray-100 flex items-center justify-center">
                            {item.mediaType === "video" ? (
                                <iframe src={item.mediaUrl} className="w-full h-full object-cover pointer-events-none" />
                            ) : (
                                <img src={item.mediaUrl} alt="Banner" className="w-full h-full object-cover" />
                            )}
                        </div>
                        <CardFooter className="flex justify-between p-4">
                            <span className="font-bold">Banner #{index + 1}</span>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}><Trash className="h-4 w-4" /> Eliminar</Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
