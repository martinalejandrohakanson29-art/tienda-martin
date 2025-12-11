import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const username = process.env.ADMIN_USERNAME
                const password = process.env.ADMIN_PASSWORD

                if (
                    credentials?.username === username &&
                    credentials?.password === password
                ) {
                    return { id: "1", name: "Admin", email: "admin@example.com" }
                }
                return null
            },
        }),
    ],
    pages: {
        signIn: "/admin/login",
    },
    // 👇 NUEVA CONFIGURACIÓN DE SEGURIDAD
    session: {
        strategy: "jwt",
        maxAge: 4 * 60 * 60, // 4 horas (en segundos)
    },
    callbacks: {
        async session({ session, token }) {
            return session
        },
        async jwt({ token, user }) {
            return token
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
}
