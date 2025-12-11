"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash, Plus, Image as ImageIcon, Video, MonitorPlay } from "lucide-react"
import { createCarouselItem, deleteCarouselItem } from "@/app/actions/carousel"

export default function CarouselClient({ initialItems }: { initialItems: any[] }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [mediaUrl, setMediaUrl] = useState("")
    const [mediaType, setMediaType] = useState("image") // 'image' | 'video'

    // 👇 FUNCIÓN INTELIGENTE PARA DRIVE
    const transformDriveLink = (url: string, type: string) => {
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                const id = idMatch[1]
                if (type === "video") {
                    // Para video, usamos el modo 'preview' que permite embed
                    return `https://drive.google.com/file/d/${id}/preview`
                } else {
                    // Para imagen, usamos el servidor lh3 optimizado
                    return `https://lh3.googleusercontent.com/d/${id}`
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
            alert("Error al agregar el banner")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Borrar este banner?")) return
        await deleteCarouselItem(id)
        router.refresh()
    }

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-bold">Gestionar Carrusel Multimedia</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Agregar Nuevo Contenido</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Selector de Tipo */}
                            <div 
                                onClick={() => setMediaType("image")}
                                className={`cursor-pointer p-4 border rounded-lg flex flex-col items-center gap-2 transition-all ${mediaType === "image" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:bg-gray-50"}`}
                            >
                                <ImageIcon size={24} />
                                <span className="font-medium">Imagen</span>
                            </div>
                            <div 
                                onClick={() => setMediaType("video")}
                                className={`cursor-pointer p-4 border rounded-lg flex flex-col items-center gap-2 transition-all ${mediaType === "video" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:bg-gray-50"}`}
                            >
                                <Video size={24} />
                                <span className="font-medium">Video</span>
                            </div>
                        </div>

                        <div className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <Label>Enlace de Drive ({mediaType === 'image' ? 'Foto' : 'Video'})</Label>
                                <Input 
                                    required 
                                    value={mediaUrl} 
                                    onChange={(e) => setMediaUrl(e.target.value)} 
                                    placeholder={mediaType === 'image' ? "Enlace de la foto..." : "Enlace del video..."} 
                                />
                            </div>
                            <Button type="submit" disabled={loading}>
                                <Plus className="mr-2 h-4 w-4" /> Agregar
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6">
                {initialItems.map((item, index) => (
                    <Card key={item.id} className="overflow-hidden">
                        <div className="relative h-[200px] w-full bg-gray-100 flex items-center justify-center">
                            {item.mediaType === "video" ? (
                                <div className="w-full h-full relative group">
                                    <iframe 
                                        src={item.mediaUrl} 
                                        className="w-full h-full object-cover pointer-events-none" 
                                        title="Video preview"
                                    />
                                    {/* Capa transparente para que el click no se lo lleve el iframe al editar */}
                                    <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                        <MonitorPlay className="w-12 h-12 text-white drop-shadow-md opacity-80" />
                                    </div>
                                </div>
                            ) : (
                                <img 
                                    src={item.mediaUrl} 
                                    alt={`Banner ${index + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            )}
                        </div>
                        <CardFooter className="flex justify-between items-center p-4">
                            <span className="font-bold text-lg flex items-center gap-2">
                                {item.mediaType === "video" ? <Video size={18}/> : <ImageIcon size={18}/>}
                                Banner #{index + 1}
                            </span>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                                <Trash className="h-4 w-4" /> Eliminar
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
