"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash, Pencil, Star, ShoppingBag, Video, Image as ImageIcon, Store, ArrowUpDown, Truck, X } from "lucide-react" 
import { createProduct, deleteProduct, updateProduct } from "@/app/actions/products"

type ProductForm = {
    title: string
    description: string
    price: string
    stock: string
    category: string
    imageUrl: string
    imageUrl2: string
    imageUrl3: string
    videoUrl: string
    discount: string
    isFeatured: boolean
    showOnHome: boolean
    freeShipping: boolean
    mercadolibreUrl: string
    order: string 
}

const initialState: ProductForm = {
    title: "",
    description: "",
    price: "",
    stock: "",
    category: "",
    imageUrl: "",
    imageUrl2: "",
    imageUrl3: "",
    videoUrl: "",
    discount: "0",
    isFeatured: false,
    showOnHome: false,
    freeShipping: true, // Por defecto marcado
    mercadolibreUrl: "",
    order: "0" 
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

    const transformImageLink = (url: string) => {
        if (!url) return ""
        if (url.includes("drive.google.com") && url.includes("/d/")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`
            }
        }
        return url
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const productData = {
                ...formData,
                imageUrl: transformImageLink(formData.imageUrl),
                imageUrl2: transformImageLink(formData.imageUrl2),
                imageUrl3: transformImageLink(formData.imageUrl3),
                price: parseFloat(formData.price) as any,
                stock: parseInt(formData.stock),
                discount: parseInt(formData.discount || "0"),
                order: parseInt(formData.order || "0")
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
            alert(error.message || "Error al guardar")
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
            imageUrl2: product.imageUrl2 || "",
            imageUrl3: product.imageUrl3 || "",
            videoUrl: product.videoUrl || "",
            discount: (product.discount || 0).toString(),
            isFeatured: product.isFeatured || false,
            showOnHome: product.showOnHome || false,
            freeShipping: product.freeShipping ?? true,
            mercadolibreUrl: product.mercadolibreUrl || "",
            order: (product.order || 0).toString()
        })
        setIsOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este producto permanentemente?")) return
        await deleteProduct(id)
        router.refresh()
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold">Mis Productos</h2>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { setEditingId(null); setFormData(initialState); }}>
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Producto
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Editar Producto" : "Crear Producto"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-6 mt-4 pb-10">
                            
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título</Label>
                                    <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Categoría</Label>
                                    <Input required list="categories-list" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                                    <datalist id="categories-list">
                                        {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="min-h-[100px]" />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2"><Label>Precio ($)</Label><Input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
                                <div className="space-y-2"><Label>Desc %</Label><Input type="number" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} /></div>
                                <div className="space-y-2"><Label>Stock</Label><Input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} /></div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                                <Label className="flex items-center gap-2"><ImageIcon size={18}/> Fotos y Video</Label>
                                
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500">Foto Principal (Obligatoria)</Label>
                                    <Input required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL de Drive..." />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs text-gray-500">Foto 2 (Opcional)</Label>
                                        <div className="flex gap-2">
                                            <Input value={formData.imageUrl2} onChange={e => setFormData({...formData, imageUrl2: e.target.value})} />
                                            {formData.imageUrl2 && <Button type="button" variant="ghost" size="icon" onClick={() => setFormData({...formData, imageUrl2: ""})}><X className="h-4 w-4 text-red-500" /></Button>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs text-gray-500">Foto 3 (Opcional)</Label>
                                        <div className="flex gap-2">
                                            <Input value={formData.imageUrl3} onChange={e => setFormData({...formData, imageUrl3: e.target.value})} />
                                            {formData.imageUrl3 && <Button type="button" variant="ghost" size="icon" onClick={() => setFormData({...formData, imageUrl3: ""})}><X className="h-4 w-4 text-red-500" /></Button>}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-500 flex items-center gap-2"><Video size={14}/> Video (Youtube o Drive)</Label>
                                    <div className="flex gap-2">
                                        <Input value={formData.videoUrl} onChange={e => setFormData({...formData, videoUrl: e.target.value})} placeholder="URL del video..." />
                                        {formData.videoUrl && <Button type="button" variant="ghost" size="icon" onClick={() => setFormData({...formData, videoUrl: ""})}><X className="h-4 w-4 text-red-500" /></Button>}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex items-center space-x-3 col-span-full">
                                    <input type="checkbox" className="h-5 w-5 accent-red-600 cursor-pointer" checked={formData.freeShipping} onChange={(e) => setFormData({...formData, freeShipping: e.target.checked})} />
                                    <Label className="font-bold text-red-700 flex items-center gap-2 cursor-pointer" onClick={() => setFormData({...formData, freeShipping: !formData.freeShipping})}>
                                        <Truck size={20} /> PRODUCTO CON ENVÍO GRATIS
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-3 border p-3 rounded-lg"><input type="checkbox" checked={formData.isFeatured} onChange={e => setFormData({...formData, isFeatured: e.target.checked})} /><Label>Destacado Principal</Label></div>
                                <div className="flex items-center space-x-3 border p-3 rounded-lg"><input type="checkbox" checked={formData.showOnHome} onChange={e => setFormData({...formData, showOnHome: e.target.checked})} /><Label>Vidriera / Novedades</Label></div>
                            </div>

                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6" disabled={loading}>{loading ? "Guardando..." : "Guardar Cambios"}</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialProducts.map((product) => (
                    <Card key={product.id} className={`${product.freeShipping ? "border-red-200" : ""}`}>
                        <div className="aspect-square relative overflow-hidden bg-gray-100 rounded-t-lg">
                            <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                                {product.freeShipping && <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm"><Truck size={10} /> Envío Gratis</span>}
                                {product.isFeatured && <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm"><Star size={10} fill="white" /> Destacado</span>}
                            </div>
                            <img src={product.imageUrl} className="w-full h-full object-cover" />
                        </div>
                        <CardFooter className="p-4 flex justify-between items-center">
                            <span className="font-bold truncate text-sm">{product.title}</span>
                            <div className="flex gap-1">
                                <Button variant="outline" size="icon" onClick={() => handleEdit(product)}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="destructive" size="icon" onClick={() => handleDelete(product.id)}><Trash className="h-4 w-4" /></Button>
                            </div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
