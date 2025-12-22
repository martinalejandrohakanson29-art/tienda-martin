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
    freeShipping: boolean // 👈 Nuevo campo
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
    freeShipping: false, // 👈 Valor inicial
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
                isFeatured: formData.isFeatured,
                showOnHome: formData.showOnHome,
                freeShipping: formData.freeShipping,
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
            imageUrl2: product.imageUrl2 || "",
            imageUrl3: product.imageUrl3 || "",
            videoUrl: product.videoUrl || "",
            discount: (product.discount || 0).toString(),
            isFeatured: product.isFeatured || false,
            showOnHome: product.showOnHome || false,
            freeShipping: product.freeShipping || false,
            mercadolibreUrl: product.mercadolibreUrl || "",
            order: (product.order || 0).toString()
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
                                    <Label>Título</Label>
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
                                <Textarea 
                                    required 
                                    value={formData.description} 
                                    onChange={e => setFormData({...formData, description: e.target.value})} 
                                    className="min-h-[100px]"
                                />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Precio ($)</Label>
                                    <Input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Desc. (%)</Label>
                                    <Input type="number" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Stock</Label>
                                    <Input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                                </div>
                            </div>

                            <div className="bg-slate-100 p-3 rounded-md flex items-center gap-4 border border-slate-200">
                                <ArrowUpDown className="text-slate-500" />
                                <div className="flex-1">
                                    <Label className="font-bold text-slate-700">Orden / Prioridad</Label>
                                    <p className="text-xs text-slate-500">Número más bajo sale primero.</p>
                                </div>
                                <Input 
                                    type="number" 
                                    value={formData.order} 
                                    onChange={e => setFormData({...formData, order: e.target.value})} 
                                    className="w-24 text-center font-bold"
                                />
                            </div>

                            <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                                <Label className="flex items-center gap-2"><ImageIcon size={16}/> Fotos</Label>
                                <Input required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL Foto Principal" />
                                <Input value={formData.imageUrl2} onChange={e => setFormData({...formData, imageUrl2: e.target.value})} placeholder="Foto 2" />
                                <Input value={formData.imageUrl3} onChange={e => setFormData({...formData, imageUrl3: e.target.value})} placeholder="Foto 3" />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Video size={16}/> Video</Label>
                                <Input value={formData.videoUrl} onChange={e => setFormData({...formData, videoUrl: e.target.value})} placeholder="URL Youtube/Drive" />
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-yellow-600 font-semibold">
                                    <ShoppingBag size={16} /> Link MercadoLibre
                                </Label>
                                <Input 
                                    value={formData.mercadolibreUrl} 
                                    onChange={e => setFormData({...formData, mercadolibreUrl: e.target.value})} 
                                    className="border-yellow-200"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded cursor-pointer"
                                        checked={formData.isFeatured}
                                        onChange={(e) => setFormData({...formData, isFeatured: e.target.checked})}
                                    />
                                    <Label className="cursor-pointer font-bold text-blue-600 flex items-center gap-1">
                                        <Star size={14} className="fill-blue-600"/> Destacado Principal
                                    </Label>
                                </div>

                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-gray-50 transition-colors bg-blue-50/30 border-blue-100">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded cursor-pointer"
                                        checked={formData.showOnHome}
                                        onChange={(e) => setFormData({...formData, showOnHome: e.target.checked})}
                                    />
                                    <Label className="cursor-pointer font-bold text-indigo-600 flex items-center gap-1">
                                        <Store size={14} /> Vidriera / Novedades
                                    </Label>
                                </div>

                                {/* 👇 NUEVO BOTÓN: ENVÍO GRATIS */}
                                <div className="flex items-center space-x-3 border p-3 rounded-lg hover:bg-gray-50 transition-colors bg-red-50/30 border-red-100 col-span-full">
                                    <input
                                        type="checkbox"
                                        id="freeShipping"
                                        className="h-5 w-5 rounded cursor-pointer accent-red-600"
                                        checked={formData.freeShipping}
                                        onChange={(e) => setFormData({...formData, freeShipping: e.target.checked})}
                                    />
                                    <div className="flex flex-col cursor-pointer" onClick={() => setFormData({...formData, freeShipping: !formData.freeShipping})}>
                                        <Label className="cursor-pointer font-bold text-red-600 flex items-center gap-1">
                                            <Truck size={14} /> TIENE ENVÍO GRATIS
                                        </Label>
                                        <span className="text-[10px] text-gray-500 uppercase">Activa el cartel rojo en la tienda</span>
                                    </div>
                                </div>
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Guardando..." : (editingId ? "Actualizar" : "Guardar")}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialProducts.map((product) => (
                    <Card key={product.id} className={`${product.isFeatured ? "border-2 border-blue-500 shadow-md" : ""}`}>
                        <div className="aspect-square relative overflow-hidden rounded-t-xl bg-gray-100">
                            <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                                {product.isFeatured && (
                                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                        <Star size={10} fill="white" /> Destacado
                                    </span>
                                )}
                                {product.freeShipping && (
                                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                        <Truck size={10} /> Envío Gratis
                                    </span>
                                )}
                            </div>
                            
                            {product.discount > 0 && (
                                <span className="absolute top-2 right-2 bg-green-600 text-white text-xl font-black px-4 py-2 rounded-full z-10 shadow-lg">
                                    {product.discount}% OFF
                                </span>
                            )}
                            
                            <img 
                                src={product.imageUrl} 
                                alt={product.title} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start text-lg">
                                <span className="truncate">{product.title}</span>
                                <span className="font-bold">
                                    ${(Number(product.price) * (1 - (product.discount || 0) / 100)).toFixed(2)}
                                </span>
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
