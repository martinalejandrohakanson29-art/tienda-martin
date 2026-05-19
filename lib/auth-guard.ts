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
