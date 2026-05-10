import { NextResponse } from "next/server";

export function validateN8nToken(req: Request): NextResponse | null {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.N8N_SECRET_TOKEN}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}
