import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
        throw new Error("No autorizado");
    }
    return session;
}
