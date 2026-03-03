"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Contacto } from "@prisma/client"
import { createContacto, updateContacto, deleteContacto, ContactoInput } from "@/app/actions/contactos"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Edit, Plus, Trash2, Search } from "lucide-react"

interface ContactosClientProps {
  initialContactos: Contacto[];
}

export default function ContactosClient({ initialContactos }: ContactosClientProps) {
  const router = useRouter()
  const [contactos, setContactos] = useState<Contacto[]>(initialContactos)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Estado para lo que el usuario escribe al instante
  const [searchTerm, setSearchTerm] = useState("")
  // Estado para la búsqueda que realmente se aplica a la tabla (con retraso)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")

  // Estado del formulario
  const [formData, setFormData] = useState<ContactoInput>({
    razonSocial: "",
    apellido: "",
    nombre: "",
    nombreFantasia: "",
    telefono: "",
    cuit: "",
    email: ""
  })

  // Efecto que crea el "Debounce" (retraso intencional para no saturar)
  useEffect(() => {
    // Configuramos un temporizador de 300 milisegundos
    const manejador = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    // Si el usuario presiona otra tecla antes de los 300ms, limpiamos el temporizador anterior
    return () => {
      clearTimeout(manejador)
    }
  }, [searchTerm])

  const resetForm = () => {
    setFormData({ razonSocial: "", apellido: "", nombre: "", nombreFantasia: "", telefono: "", cuit: "", email: "" })
    setEditingId(null)
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) resetForm()
  }

  const handleEdit = (contacto: Contacto) => {
    setFormData({
      razonSocial: contacto.razonSocial || "",
      apellido: contacto.apellido || "",
      nombre: contacto.nombre || "",
      nombreFantasia: contacto.nombreFantasia || "",
      telefono: contacto.telefono || "",
      cuit: contacto.cuit || "",
      email: contacto.email || ""
    })
    setEditingId(contacto.id)
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este contacto?")) return
    setIsLoading(true)
    const result = await deleteContacto(id)
    if (result.success) {
      setContactos(contactos.filter(c => c.id !== id))
      router.refresh()
    } else {
      alert("Error al eliminar")
    }
    setIsLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    if (editingId) {
      const result = await updateContacto(editingId, formData)
      if (result.success && result.data) {
        setContactos(contactos.map(c => c.id === editingId ? result.data as Contacto : c))
        setIsOpen(false)
        router.refresh()
      }
    } else {
      const result = await createContacto(formData)
      if (result.success && result.data) {
        setContactos([result.data as Contacto, ...contactos])
        setIsOpen(false)
        router.refresh()
      }
    }
    setIsLoading(false)
  }

  // Lógica de filtrado dinámico (ahora usa debouncedSearchTerm)
  const filteredContactos = useMemo(() => {
    // Si la búsqueda con retraso está vacía, mostramos todo
    if (!debouncedSearchTerm) return contactos;
    
    const lowerCaseSearch = debouncedSearchTerm.toLowerCase();
    
    return contactos.filter((contacto) => {
      return (
        (contacto.razonSocial?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.nombreFantasia?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.nombre?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.apellido?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.cuit?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.email?.toLowerCase().includes(lowerCaseSearch)) ||
        (contacto.telefono?.toLowerCase().includes(lowerCaseSearch))
      );
    });
  }, [contactos, debouncedSearchTerm]); // Atento aquí: ahora depende de debouncedSearchTerm

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Gestión de Contactos</h2>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* El Buscador */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contacto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button className="shrink-0"><Plus className="mr-2 h-4 w-4" /> Nuevo Contacto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Contacto" : "Nuevo Contacto"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="razonSocial">Razón Social</Label>
                  <Input id="razonSocial" value={formData.razonSocial} onChange={(e) => setFormData({...formData, razonSocial: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nombreFantasia">Nombre de Fantasía</Label>
                  <Input id="nombreFantasia" value={formData.nombreFantasia} onChange={(e) => setFormData({...formData, nombreFantasia: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input id="nombre" value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input id="apellido" value={formData.apellido} onChange={(e) => setFormData({...formData, apellido: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuit">CUIT</Label>
                  <Input id="cuit" value={formData.cuit} onChange={(e) => setFormData({...formData, cuit: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input id="telefono" value={formData.telefono} onChange={(e) => setFormData({...formData, telefono: e.target.value})} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
                
                <div className="col-span-2 flex justify-end mt-4">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identificación</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>CUIT</TableHead>
              <TableHead>Teléfono / Email</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContactos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  {debouncedSearchTerm ? "No se encontraron resultados para tu búsqueda." : "No hay contactos registrados."}
                </TableCell>
              </TableRow>
            ) : (
              filteredContactos.map((contacto) => (
                <TableRow key={contacto.id}>
                  <TableCell>
                    <div className="font-medium">{contacto.razonSocial || "---"}</div>
                    <div className="text-sm text-muted-foreground">{contacto.nombreFantasia}</div>
                  </TableCell>
                  <TableCell>
                    {contacto.nombre || contacto.apellido ? `${contacto.nombre || ""} ${contacto.apellido || ""}` : "---"}
                  </TableCell>
                  <TableCell>{contacto.cuit || "---"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{contacto.telefono || "---"}</div>
                    <div className="text-sm text-muted-foreground">{contacto.email || "---"}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(contacto)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(contacto.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
