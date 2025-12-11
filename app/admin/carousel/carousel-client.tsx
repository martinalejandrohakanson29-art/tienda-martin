"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash, Plus, Image as ImageIcon, Video, MonitorPlay, Monitor, Smartphone, Save } from "lucide-react"
import { createCarouselItem, deleteCarouselItem } from "@/app/actions/carousel"
import { updateConfig } from "@/app/actions/config"

export default function CarouselClient({ initialItems, initialConfig }: { initialItems: any[], initialConfig: any }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    
    // Estados para el nuevo item
    const [mediaUrl, setMediaUrl] = useState("")
    const [mediaUrlMobile, setMediaUrlMobile] = useState("") // 👈 Nuevo estado
    const [mediaType, setMediaType] = useState("image")

    // Estados de configuración de medidas
    const [configData, setConfigData] = useState({
        carouselHeightDesktop: initialConfig?.carouselHeightDesktop || "600px",
        carouselHeightMobile: initialConfig?.carouselHeightMobile || "250px",
    })
    const [configLoading, setConfigLoading] = useState(false)

    // 👇 Transformador de enlaces (Versión arreglada)
    const transformDriveLink = (url: string, type: string) => {
        if (!url) return ""
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                const id = idMatch[1]
                if (type === "video") return `https://drive.google.com/file/d/${id}/preview`
                // Usamos lh3.googleusercontent.com que es más rápido y estable para imágenes
                return `https://lh3.googleusercontent.com/d/${id}`
            }
        }
        return url
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const finalUrl = transformDriveLink(mediaUrl, mediaType)
            // Transformamos también la de móvil si existe
            const finalUrlMobile = mediaUrlMobile ? transformDriveLink(mediaUrlMobile, mediaType) : ""

            await createCarouselItem({ 
                mediaUrl: finalUrl, 
                mediaUrlMobile: finalUrlMobile, // 👈 Enviamos la móvil
                mediaType 
            })
            
            setMediaUrl("")
            setMediaUrlMobile("")
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

    const handleSaveConfig = async () => {
        setConfigLoading(true)
        try {
            await updateConfig(configData)
            alert("¡Medidas actualizadas!")
            router.refresh()
        } catch (error) {
            alert("Error al guardar medidas")
        } finally {
            setConfigLoading(false)
        }
    }

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold">Gestionar Carrusel</h2>

            {/* CONFIGURACIÓN DE MEDIDAS (Igual que antes) */}
            <Card className="border-blue-100 bg-blue-50/50">
                <CardHeader><CardTitle className="text-lg">📏 Configuración de Medidas</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-6 items-end">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-blue-700"><Monitor size={16}/> Altura PC</Label>
                            <Input value={configData.carouselHeightDesktop} onChange={(e) => setConfigData({...configData, carouselHeightDesktop: e.target.value})} className="bg-white"/>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-green-700"><Smartphone size={16}/> Altura Móvil</Label>
                            <Input value={configData.carouselHeightMobile} onChange={(e) => setConfigData({...configData, carouselHeightMobile: e.target.value})} className="bg-white"/>
                        </div>
                        <Button onClick={handleSaveConfig} disabled={configLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white"><Save className="mr-2 h-4 w-4"/> Guardar Medidas</Button>
                    </div>
                </CardContent>
            </Card>

            {/* FORMULARIO DE CARGA */}
            <Card>
                <CardHeader><CardTitle>Agregar Nuevo Banner</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="space-y-4">
                        {/* Selector de Tipo */}
                        <div className="flex gap-4 mb-4">
                            <Button type="button" variant={mediaType === "image" ? "default" : "outline"} onClick={() => setMediaType("image")} className="flex-1">
                                <ImageIcon className="mr-2 h-4 w-4" /> Imagen
                            </Button>
                            <Button type="button" variant={mediaType === "video" ? "default" : "outline"} onClick={() => setMediaType("video")} className="flex-1">
                                <Video className="mr-2 h-4 w-4" /> Video
                            </Button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Input PC */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-blue-600"><Monitor size={14}/> Link para PC (Horizontal)</Label>
                                <Input required value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="Drive link foto ancha..." />
                            </div>

                            {/* Input Móvil (Solo si es imagen) */}
                            {mediaType === "image" && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-green-600"><Smartphone size={14}/> Link para Celular (Vertical)</Label>
                                    <Input value={mediaUrlMobile} onChange={(e) => setMediaUrlMobile(e.target.value)} placeholder="Drive link foto vertical (Opcional)..." />
                                </div>
                            )}
                        </div>

                        <Button type="submit" disabled={loading} className="w-full"><Plus className="mr-2 h-4 w-4" /> Agregar Banner</Button>
                    </form>
                </CardContent>
            </Card>

            {/* LISTA DE ITEMS */}
            <div className="grid gap-6">
                {initialItems.map((item, index) => (
                    <Card key={item.id} className="overflow-hidden">
                        <div className="flex flex-col md:flex-row h-[200px]">
                            {/* Vista PC */}
                            <div className="flex-1 relative bg-gray-100 border-r border-white/20">
                                <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded z-10">Vista PC</div>
                                {item.mediaType === "video" ? (
                                    <iframe src={item.mediaUrl} className="w-full h-full object-cover pointer-events-none" />
                                ) : (
                                    <img src={item.mediaUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                )}
                            </div>
                            
                            {/* Vista Móvil (si existe) */}
                            {item.mediaUrlMobile && item.mediaType === "image" && (
                                <div className="w-1/3 relative bg-gray-200 border-l border-white/20">
                                    <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded z-10">Vista Móvil</div>
                                    <img src={item.mediaUrlMobile} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                            )}
                        </div>
                        <CardFooter className="flex justify-between p-4 bg-gray-50">
                            <span className="font-bold">Banner #{index + 1}</span>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}><Trash className="h-4 w-4" /> Eliminar</Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
