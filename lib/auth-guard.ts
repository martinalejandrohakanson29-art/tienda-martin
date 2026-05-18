import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function requireAdmin() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== "ADMIN" && role !== "SUPER_ADMIN")) {
        throw new Error("No autorizado");
    }
    return session;
}

export async function requireSuperAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "SUPER_ADMIN") {
        throw new Error("No autorizado - Se requiere acceso de Super Administrador");
    }
    return session;
}
