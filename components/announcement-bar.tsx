import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
// 👇 Importamos el componente de la barra de anuncios
import AnnouncementBar from "@/components/announcement-bar"; 

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
  title: "Revolucion motos", 
  description: "Tu tienda de confianza para repuestos y accesorios",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>"
  }
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      {/* 👇 En el className del body:
          1. Agregamos el gradiente radial (from-slate-50...) para el fondo suave.
          2. Mantenemos 'flex flex-col' y 'min-h-screen' para que el footer quede abajo.
      */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-gray-100 to-gray-200 text-foreground`}
      >
        <Header /> 
        
        {/* 👇 AQUÍ INSERTAMOS LA BARRA ANIMADA */}
        <AnnouncementBar />

        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
