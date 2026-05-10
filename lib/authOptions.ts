import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null;

                // 1. Buscamos el usuario en la base de datos por su username
                const user = await prisma.user.findUnique({
                    where: { username: credentials.username }
                });

                // 2. Verificamos si existe y si la contraseña coincide (bcrypt)
                if (user && await bcrypt.compare(credentials.password, user.password)) {
                    return {
                        id: user.id,
                        name: user.username,
                        role: user.role, // Traemos el ROL (ADMIN o USER)
                    }
                }
                
                return null
            },
        }),
    ],
    pages: {
        signIn: "/admin/login",
    },
    session: {
        strategy: "jwt",
        // Aquí está el cambio: 24 horas * 60 minutos * 60 segundos
        maxAge: 24 * 60 * 60, // Sesión de 24 horas (1 día completo)
    },
    callbacks: {
        // Guardamos el ID y el ROL en el TOKEN de seguridad
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
            }
            return token;
        },
        // Pasamos el ID y el ROL del TOKEN a la SESIÓN de la web
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).role = token.role;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
}
