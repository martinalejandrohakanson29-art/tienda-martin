"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash, Pencil, Star, Eye, ShoppingBag, Video, Image as ImageIcon } from "lucide-react" 
import { createProduct, deleteProduct, updateProduct } from "@/app/actions/products"

// Actualizamos el tipo de datos
type ProductForm = {
    title: string
    description: string
    price: string
    stock: string
    category: string
    imageUrl: string
    imageUrl2: string // Nuevo
    imageUrl3: string // Nuevo
    videoUrl: string  // Nuevo
    discount: string
    isFeatured: boolean
    mercadolibreUrl: string
}

const initialState: ProductForm = {
    title: "",
    description: "",
    price: "",
    stock: "",
    category: "",
    imageUrl: "",
    imageUrl2: "", // Nuevo
    imageUrl3: "", // Nuevo
    videoUrl: "",  // Nuevo
    discount: "0",
    isFeatured: false,
    mercadolibreUrl: ""
}

export default function ProductsClient({ initialProducts }: { initialProducts: any[] }) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState<ProductForm>(initialState)
    const [editingId, setEditingId] = useState<string | null>(null)

    const uniqueCategories = useMemo(() => {
        const categories = initialProducts.map(p => p.category)
        return Array.from(new Set(categories))
    }, [initialProducts])

    // Función auxiliar para links de Drive
    const transformImageLink = (url: string) => {
        if (!url) return ""
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}` // Ajuste para visualizar
            }
        }
        return url
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            // Transformamos todas las imágenes por si son de Drive
            const finalImageUrl = transformImageLink(formData.imageUrl)
            const finalImageUrl2 = transformImageLink(formData.imageUrl2)
            const finalImageUrl3 = transformImageLink(formData.imageUrl3)

            const productData = {
                ...formData,
                imageUrl: finalImageUrl,
                imageUrl2: finalImageUrl2,
                imageUrl3: finalImageUrl3,
                price: parseFloat(formData.price) as any,
                stock: parseInt(formData.stock),
                discount: parseInt(formData.discount || "0"),
                isFeatured: formData.isFeatured
            }

            if (editingId) {
                await updateProduct(editingId, productData)
            } else {
                await createProduct(productData)
            }

            setIsOpen(false)
            setFormData(initialState)
            setEditingId(null)
            router.refresh()
        } catch (error: any) {
            alert(error.message || "Error al guardar el producto")
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (product: any) => {
        setEditingId(product.id)
        setFormData({
            title: product.title,
            description: product.description,
            price: product.price.toString(),
            stock: product.stock.toString(),
            category: product.category,
            imageUrl: product.imageUrl,
            imageUrl2: product.imageUrl2 || "", // Cargar datos existentes
            imageUrl3: product.imageUrl3 || "",
            videoUrl: product.videoUrl || "",
            discount: (product.discount || 0).toString(),
            isFeatured: product.isFeatured || false,
            mercadolibreUrl: product.mercadolibreUrl || ""
        })
        setIsOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este producto?")) return
        await deleteProduct(id)
        router.refresh()
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (!open) {
            setFormData(initialState)
            setEditingId(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold">Mis Productos</h2>
                <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { setEditingId(null); setFormData(initialState); }}>
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Producto
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Editar Producto" : "Crear Producto"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título (Se pasará a MAYÚSCULAS)</Label>
                                    <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Camiseta" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Categoría</Label>
                                    <Input required list="categories-list" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Selecciona..." />
                                    <datalist id="categories-list">
                                        {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Input required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Detalles..." />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Precio ($)</Label>
                                    <Input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Desc. (%)</Label>
                                    <Input type="number" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Stock</Label>
                                    <Input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                                </div>
                            </div>

                            {/* SECCIÓN DE IMÁGENES */}
                            <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                                <Label className="flex items-center gap-2"><ImageIcon size={16}/> Fotos del Producto</Label>
                                <Input required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL Foto Principal (Obligatoria)" />
                                <Input value={formData.imageUrl2} onChange={e => setFormData({...formData, imageUrl2: e.target.value})} placeholder="URL Foto 2 (Opcional)" />
                                <Input value={formData.imageUrl3} onChange={e => setFormData({...formData, imageUrl3: e.target.value})} placeholder="URL Foto 3 (Opcional)" />
                            </div>

                            {/* SECCIÓN DE VIDEO */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Video size={16}/> Video (Youtube o Drive)</Label>
                                <Input value={formData.videoUrl} onChange={e => setFormData({...formData, videoUrl: e.target.value})} placeholder="https://youtube.com/watch?v=..." />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-yellow-600 font-semibold">
                                    <ShoppingBag size={16} /> Link MercadoLibre (Opcional)
                                </Label>
                                <Input 
                                    value={formData.mercadolibreUrl} 
                                    onChange={e => setFormData({...formData, mercadolibreUrl: e.target.value})} 
                                    placeholder="https://articulo.mercadolibre.com.ar/..." 
                                    className="border-yellow-200 focus-visible:ring-yellow-400 bg-yellow-50/30"
                                />
                            </div>

                            <div className="flex items-center space-x-2 py-2 border-t pt-4">
                                <input
                                    type="checkbox"
                                    id="featured"
                                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={formData.isFeatured}
                                    onChange={(e) => setFormData({...formData, isFeatured: e.target.checked})}
                                />
                                <Label htmlFor="featured" className="cursor-pointer font-bold text-blue-600">Destacar en Portada (Máx. 8)</Label>
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Guardando..." : (editingId ? "Actualizar" : "Guardar")}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* LISTA DE PRODUCTOS - SIN CAMBIOS VISUALES MAYORES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialProducts.map((product) => (
                    <Card key={product.id} className={product.isFeatured ? "border-2 border-blue-500 shadow-md" : ""}>
                        <div className="aspect-square relative overflow-hidden rounded-t-xl bg-gray-100">
                            {product.discount > 0 && (
                                <span className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                                    {product.discount}% OFF
                                </span>
                            )}
                            {product.isFeatured && (
                                <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10 flex items-center gap-1">
                                    <Star size={10} fill="white" /> Destacado
                                </span>
                            )}
                            <img 
                                src={product.imageUrl} 
                                alt={product.title} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x400?text=Error" }}
                            />
                        </div>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start text-lg">
                                <span className="truncate">{product.title}</span>
                                <div className="flex flex-col items-end">
                                    <span className={product.discount > 0 ? "text-green-600 font-bold" : "font-bold"}>
                                        ${(Number(product.price) * (1 - (product.discount || 0) / 100)).toFixed(2)}
                                    </span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardFooter className="flex justify-end space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(product)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(product.id)}>
                                <Trash className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
