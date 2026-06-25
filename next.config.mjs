/** @type {import('next').NextConfig} */
const nextConfig = {
    // Optimización para despliegue en Docker/Coolify
    output: 'standalone', 
    images: {
        remotePatterns: [
            {
                // Mantener para compatibilidad con imágenes antiguas en Railway
                protocol: 'https',
                hostname: 'storage.railway.app',
                port: '',
                pathname: '/**',
            },
            {
                // Nuevo endpoint de Garage para Hostinger
                protocol: 'https',
                hostname: 's3-y48o0c4cg440occw80kcgkkk.187.77.224.120.sslip.io',
                port: '',
                pathname: '/**',
            },
            {
                // Dominio de imágenes de Mercado Libre
                protocol: 'https',
                hostname: 'http2.mlstatic.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
        // Desactiva la reutilización de la caché de cliente (Router Cache) para
        // páginas dinámicas: cada navegación vuelve a pedir datos frescos al
        // servidor (saldos, stock, etc. siempre actualizados al moverse entre
        // secciones). 'static' se deja en su valor por defecto.
        staleTimes: {
            dynamic: 0,
        },
    },
};

export default nextConfig;
