import { getContactos } from "@/app/actions/contactos"
import ContactosClient from "./contactos-client"

export const dynamic = "force-dynamic"

export default async function ContactosPage() {
  const contactos = await getContactos()

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Contactos</h1>
        <p className="text-muted-foreground">Administración de clientes y proveedores.</p>
      </div>
      
      <ContactosClient initialContactos={contactos} />
    </div>
  )
}
