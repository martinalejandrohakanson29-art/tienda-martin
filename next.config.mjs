/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'storage.railway.app',
                port: '',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;
