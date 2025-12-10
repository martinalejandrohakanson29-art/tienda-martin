import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
// 👇 IMPORTANTE: Importamos los componentes reales
import Header from "@/components/header";
import Footer from "@/components/footer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Mi Tienda",
  description: "Tienda online creada con Next.js",
};

// 👇 Esto evita el error de conexión a la BD durante el build
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <Header /> 
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
