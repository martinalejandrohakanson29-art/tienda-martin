/** @type {import('next').NextConfig} */
const nextConfig = {
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
                // Recomendado: Agregar el dominio de imágenes de Mercado Libre 
                // por si usas el componente <Image /> de Next.js para los productos
                protocol: 'https',
                hostname: 'http2.mlstatic.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    // Si necesitas habilitar acciones de servidor o transpilación de paquetes específicos, puedes sumarlos aquí
};

export default nextConfig;
