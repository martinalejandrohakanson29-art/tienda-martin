"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash, Pencil } from "lucide-react"
// 👇 Importamos updateProduct también
import { createProduct, deleteProduct, updateProduct } from "@/app/actions/products"

type ProductForm = {
    title: string
    description: string
    price: string
    stock: string
    category: string
    imageUrl: string
}

const initialState: ProductForm = {
    title: "",
    description: "",
    price: "",
    stock: "",
    category: "",
    imageUrl: ""
}

export default function ProductsClient({ initialProducts }: { initialProducts: any[] }) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState<ProductForm>(initialState)
    // 👇 Nuevo estado para saber qué producto estamos editando (null = creando uno nuevo)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Función unificada para Crear o Editar
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const productData = {
                ...formData,
                price: parseFloat(formData.price) as any,
                stock: parseInt(formData.stock)
            }

            if (editingId) {
                // Estamos EDITANDO
                await updateProduct(editingId, productData)
            } else {
                // Estamos CREANDO
                await createProduct(productData)
            }

            // Limpieza al terminar
            setIsOpen(false)
            setFormData(initialState)
            setEditingId(null) // Reseteamos el modo edición
            router.refresh()
        } catch (error) {
            alert("Error al guardar el producto")
        } finally {
            setLoading(false)
        }
    }

    // 👇 Nueva función para preparar la edición
    const handleEdit = (product: any) => {
        setEditingId(product.id) // Marcamos este ID
        setFormData({
            title: product.title,
            description: product.description,
            price: product.price.toString(),
            stock: product.stock.toString(),
            category: product.category,
            imageUrl: product.imageUrl
        })
        setIsOpen(true) // Abrimos el modal
    }

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar este producto?")) return
        await deleteProduct(id)
        router.refresh()
    }

    // Resetear el formulario si abren el modal para crear uno nuevo manualmente
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
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            {/* Título dinámico según lo que estemos haciendo */}
                            <DialogTitle>{editingId ? "Editar Producto" : "Crear Producto"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label>Título</Label>
                                <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Camiseta Negra" />
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Input required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Breve descripción..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Precio ($)</Label>
                                    <Input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="0.00" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Stock</Label>
                                    <Input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} placeholder="10" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Categoría</Label>
                                <Input required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Ej: Ropa" />
                            </div>
                            <div className="space-y-2">
                                <Label>URL de Imagen</Label>
                                <Input required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="https://..." />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Guardando..." : (editingId ? "Actualizar Producto" : "Guardar Producto")}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialProducts.map((product) => (
                    <Card key={product.id}>
                        <div className="aspect-square relative overflow-hidden rounded-t-xl bg-gray-100">
                            <img 
                                src={product.imageUrl} 
                                alt={product.title} 
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start text-lg">
                                <span className="truncate">{product.title}</span>
                                <span className="font-bold">${Number(product.price).toFixed(2)}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-500 truncate">{product.description}</p>
                            <p className="text-xs text-gray-400 mt-2">Stock: {product.stock} | Cat: {product.category}</p>
                        </CardContent>
                        <CardFooter className="flex justify-end space-x-2">
                            {/* 👇 Botón de Editar */}
                            <Button variant="outline" size="sm" onClick={() => handleEdit(product)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            {/* 👇 Botón de Eliminar */}
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(product.id)}>
                                <Trash className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
                {initialProducts.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-500">
                        No tienes productos. ¡Crea el primero!
                    </div>
                )}
            </div>
        </div>
    )
}
