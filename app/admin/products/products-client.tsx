"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash, Pencil, Star, ShoppingBag, Video, Image as ImageIcon, Store, ArrowUpDown, Truck } from "lucide-react" 
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
    freeShipping: true, // 👈 AHORA ES TRUE POR DEFECTO
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
                return `https://lh3.googleusercontent.com/u/0/d/${idMatch[1]}=w1000`
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
            ...product,
            price: product.price.toString(),
            stock: product.stock.toString(),
            discount: (product.discount || 0).toString(),
            order: (product.order || 0).toString()
        })
        setIsOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar producto?")) return
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
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            {/* ... (campos de título, precio, etc igual que antes) ... */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2"><Label>Título</Label><Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                                <div className="space-y-2"><Label>Categoría</Label><Input required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} /></div>
                            </div>
                            <div className="space-y-2"><Label>Descripción</Label><Textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2"><Label>Precio</Label><Input required type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
                                <div className="space-y-2"><Label>Desc %</Label><Input type="number" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} /></div>
                                <div className="space-y-2"><Label>Stock</Label><Input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} /></div>
                            </div>

                            <div className="bg-slate-100 p-3 rounded-lg border flex items-center space-x-3">
                                <input type="checkbox" className="h-5 w-5 accent-red-600" checked={formData.freeShipping} onChange={(e) => setFormData({...formData, freeShipping: e.target.checked})} />
                                <Label className="font-bold text-red-600 flex items-center gap-1 cursor-pointer" onClick={() => setFormData({...formData, freeShipping: !formData.freeShipping})}>
                                    <Truck size={16} /> ENVÍO GRATIS ACTIVADO
                                </Label>
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialProducts.map((product) => (
                    <Card key={product.id} className="relative overflow-hidden">
                        <div className="aspect-square bg-gray-100 relative">
                             {product.freeShipping && (
                                <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-20">
                                    <Truck size={10} /> Envío Gratis
                                </span>
                            )}
                            {product.discount > 0 && (
                                <span className="absolute top-2 right-2 bg-green-600 text-white text-xl font-black px-4 py-2 rounded-full z-20 shadow-lg">
                                    {product.discount}% OFF
                                </span>
                            )}
                            <img src={product.imageUrl} className="w-full h-full object-cover" />
                        </div>
                        <CardFooter className="p-4 flex justify-between">
                            <span className="font-bold truncate mr-2">{product.title}</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleEdit(product)}><Pencil size={14}/></Button>
                                <Button size="sm" variant="destructive" onClick={() => handleDelete(product.id)}><Trash size={14}/></Button>
                            </div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
