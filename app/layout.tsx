import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AnnouncementBar from "@/components/announcement-bar";
import Script from "next/script";
// 👇 IMPORTAMOS EL NUEVO COMPONENTE HELPER
import ConditionalHeader from "@/components/conditional-header"; 

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
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '1404885534459570');
            fbq('track', 'PageView');
          `}
        </Script>
        
        <noscript>
          <img 
            height="1" 
            width="1" 
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=1404885534459570&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>

        {/* 👇 AQUÍ ESTÁ LA MAGIA: Envolvemos el Header y Announcement con el condicional */}
        <ConditionalHeader>
            <div className="sticky top-0 z-50 w-full flex flex-col">
                <AnnouncementBar />
                <Header />
            </div>
        </ConditionalHeader>
        
        <main className="flex-1">
          {children}
        </main>
        
        {/* El Footer podrías querer ocultarlo también, si es así, mételo dentro de ConditionalHeader también */}
        <Footer />
      </body>
    </html>
  );
}
