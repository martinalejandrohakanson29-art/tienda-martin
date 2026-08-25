import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { redirect } from "next/navigation"
import { listarCredenciales } from "@/app/actions/credenciales"
import ContrasenasClient from "./contrasenas-client"

export const dynamic = "force-dynamic"

export default async function ContrasenasPage() {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role

    if (!session) {
        redirect("/admin/login")
    }
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
        redirect("/admin")
    }

    const credenciales = await listarCredenciales()

    return <ContrasenasClient initialCredenciales={JSON.parse(JSON.stringify(credenciales))} />
}
