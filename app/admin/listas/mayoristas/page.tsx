import fs from "fs"
import path from "path"
import { getArticulosMayoristasAdmin } from "@/app/actions/articulos-mayoristas"
import MayoristasAdminClient from "./mayoristas-admin-client"

export const metadata = {
    title: "Lista Mayorista - Sistema Revolución Motos",
    description: "Gestión del catálogo mayorista",
}

export default async function MayoristasAdminPage() {
    const articulos = await getArticulosMayoristasAdmin()

    const fotosDir = path.join(process.cwd(), "public", "mayoristas-fotos")
    let galeria: string[] = []
    try {
        galeria = fs.readdirSync(fotosDir)
            .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
            .sort()
            .map(f => `/mayoristas-fotos/${f}`)
    } catch {
        galeria = []
    }

    return (
        <div className="h-screen w-full overflow-hidden bg-slate-50/30">
            <MayoristasAdminClient articulosIniciales={articulos} galeria={galeria} />
        </div>
    )
}
