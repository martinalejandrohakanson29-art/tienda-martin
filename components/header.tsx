import Link from "next/link"
import CartSheet from "./cart-sheet"
import { getConfig } from "@/app/actions/config"

export default async function Header() {
    const config = await getConfig()

    return (
        <header className="border-b sticky top-0 bg-white z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="text-2xl font-bold">
                    {config?.companyName || "Mi Tienda"}
                </Link>

                <nav className="hidden md:flex space-x-6">
                    <Link href="/" className="hover:text-gray-600">Inicio</Link>
                    <Link href="/shop" className="hover:text-gray-600">Tienda</Link>
                </nav>

                <div className="flex items-center space-x-4">
                    <CartSheet />
                </div>
            </div>
        </header>
    )
}
