import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/header";
import ConditionalFooter from "@/components/conditional-footer"; 
import Footer from "@/components/footer"; // 👈 1. IMPORTAMOS EL FOOTER AQUÍ
import AnnouncementBar from "@/components/announcement-bar";
import Script from "next/script";
import ConditionalHeader from "@/components/conditional-header"; 
import { getConfig } from "@/app/actions/config";
import { getUniqueCategories } from "@/app/actions/products";
import PixelPageView from "@/components/pixel-page-view";

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
  metadataBase: new URL("https://www.revolucionmotos.com.ar"),
  title: {
    default: "Revolución Motos | Repuestos, Accesorios y Kits de Potenciación",
    template: "%s | Revolución Motos",
  },
  description: "Tienda online de repuestos, kits de potenciación, cilindros, levas y accesorios para motos. Venta minorista con envíos a todo el país y atención mayorista.",
  keywords: [
    "revolucion motos",
    "revolucionmotos",
    "revolucion motos cordoba",
    "repuestos para motos",
    "repuestos motos argentina",
    "kits de potenciacion",
    "accesorios para motos",
    "repuestos de motos mayorista",
    "cilindros potenciados",
    "arbol de levas motos",
  ],
  authors: [{ name: "Revolución Motos" }],
  creator: "Revolución Motos",
  publisher: "Revolución Motos",
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "https://www.revolucionmotos.com.ar",
    siteName: "Revolución Motos",
    title: "Revolución Motos | Repuestos y Accesorios para Motos",
    description: "Venta minorista y mayorista de repuestos, kits de potenciación y accesorios para motos. Envíos a toda Argentina.",
    images: [
      {
        url: "/icon.png",
        width: 1024,
        height: 1024,
        alt: "Revolución Motos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revolución Motos",
    description: "Tienda de repuestos, accesorios y kits de potenciación para motos.",
    images: ["/icon.png"],
  },
  verification: {
    google: "Gn_aY20nKi-dwdSKqZtRTTSTpDLM7QDs_deowOl_IbA",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getConfig();
  const categories = await getUniqueCategories();

  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
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
            fbq('init', '${process.env.NEXT_PUBLIC_FB_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        
        <noscript>
          <img height="1" width="1" style={{ display: 'none' }} src={`https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_FB_PIXEL_ID}&ev=PageView&noscript=1`} alt="" />
        </noscript>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "AutoPartsStore",
              "name": "Revolución Motos",
              "alternateName": ["Revolucion Motos", "Revolucionmotos", "revolucionmotos.com.ar"],
              "url": "https://www.revolucionmotos.com.ar",
              "logo": "https://www.revolucionmotos.com.ar/icon.png",
              "image": "https://www.revolucionmotos.com.ar/icon.png",
              "description": "Venta minorista y mayorista de repuestos, kits de potenciación y accesorios para motos en Argentina.",
              "telephone": config?.whatsappNumber ? `+${config.whatsappNumber}` : undefined,
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "AR"
              },
              "sameAs": [
                config?.instagramUrl,
                config?.tiktokUrl
              ].filter(Boolean)
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Revolución Motos",
              "alternateName": ["Revolucion Motos", "revolucionmotos"],
              "url": "https://www.revolucionmotos.com.ar",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://www.revolucionmotos.com.ar/shop?search={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />

        <PixelPageView />
        <ConditionalHeader>
            <div className="sticky top-0 z-50 w-full flex flex-col">
                <AnnouncementBar config={config} />
                <Header config={config} categories={categories} />
            </div>
        </ConditionalHeader>
        
        <main className="flex-1">
          {children}
        </main>
        
        {/* 👇 2. CAMBIO AQUÍ: Pasamos el Footer como hijo */}
        <ConditionalFooter>
            <Footer />
        </ConditionalFooter>

      </body>
    </html>
  );
}
