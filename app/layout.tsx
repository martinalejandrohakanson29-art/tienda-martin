import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AnnouncementBar from "@/components/announcement-bar"; // 👈 Asegúrate de tener esto

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {/* 👇 CAMBIO CLAVE: Agrupamos ambos en un contenedor Sticky */}
        {/* z-50 asegura que esté por encima de todo el contenido */}
        <div className="sticky top-0 z-50 w-full flex flex-col">
            <AnnouncementBar />
            <Header />
        </div>
        
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
