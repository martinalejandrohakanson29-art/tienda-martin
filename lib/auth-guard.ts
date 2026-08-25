import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session) {
        throw new Error("No autorizado");
    }
    return session;
}

export async function requireSuperAdmin() {
    const session = await getServerSession(authOptions);
    if (!session) {
        throw new Error("No autorizado");
    }
    return session;
}

// A diferencia de requireAdmin/requireSuperAdmin (que solo exigen sesión activa),
// esta valida el rol real contra la sesión. Se usa para la bóveda de contraseñas,
// donde el acceso debe estar restringido de verdad y no solo oculto en el menú.
export async function requireVaultAccess() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== "SUPER_ADMIN" && role !== "ADMIN")) {
        throw new Error("No autorizado");
    }
    return session;
}
