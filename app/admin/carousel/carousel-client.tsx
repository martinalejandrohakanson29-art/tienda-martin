"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash, Plus, Image as ImageIcon } from "lucide-react"
import { createCarouselItem, deleteCarouselItem } from "@/app/actions/carousel"

export default function CarouselClient({ initialItems }: { initialItems: any[] }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [imageUrl, setImageUrl] = useState("")

    // 👇 FUNCIÓN CORREGIDA: Ahora usa la sintaxis correcta ${...} y el servidor lh3
    const transformImageLink = (url: string) => {
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}`
            }
        }
        return url
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const finalUrl = transformImageLink(imageUrl)
            await createCarouselItem({ imageUrl: finalUrl })
            setImageUrl("")
            router.refresh()
        } catch (error) {
            alert("Error al agregar la imagen")
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
            <h2 className="text-3xl font-bold">Gestionar Carrusel</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Agregar Nuevo Banner</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="flex gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <Label>URL de la Imagen (Drive, etc)</Label>
                            <Input 
                                required 
                                value={imageUrl} 
                                onChange={(e) => setImageUrl(e.target.value)} 
                                placeholder="Pega aquí el enlace de la imagen" 
                            />
                        </div>
                        <Button type="submit" disabled={loading}>
                            <Plus className="mr-2 h-4 w-4" /> Agregar
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6">
                {initialItems.map((item, index) => (
                    <Card key={item.id} className="overflow-hidden">
                        <div className="relative h-[200px] w-full bg-gray-100">
                            <img 
                                src={item.imageUrl} 
                                alt={`Banner ${index + 1}`}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <CardFooter className="flex justify-between items-center p-4">
                            <span className="font-bold text-lg">Banner #{index + 1}</span>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                                <Trash className="h-4 w-4" /> Eliminar
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
                {initialItems.length === 0 && (
                    <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                        <ImageIcon className="mx-auto h-10 w-10 mb-2 opacity-50" />
                        <p>No hay imágenes en el carrusel.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
