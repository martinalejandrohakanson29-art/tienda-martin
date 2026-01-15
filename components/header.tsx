"use client"

import HeaderLogo from "./header-logo"
import CategoryMenu from "./category-menu"
import CartSheet from "./cart-sheet"
import HomeSearch from "./home-search"

// Aquí también avisamos que recibiremos config y categories
export default function Header({ config, categories }: { config: any, categories: string[] }) {
    return (
        <header className="w-full bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all duration-300">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16 md:h-24 gap-2 md:gap-4">
                    
                    {/* Le pasamos la config al Logo */}
                    <HeaderLogo config={config} />

                    <div className="hidden md:flex flex-1 max-w-xl mx-8">
                        <HomeSearch />
                    </div>

                    <div className="flex items-center gap-1 md:gap-4">
                        {/* Le pasamos las categorías al menú */}
                        <CategoryMenu categories={categories} />
                        <CartSheet />
                    </div>
                </div>
                
                <div className="md:hidden pb-3 px-1">
                    <HomeSearch />
                </div>
            </div>
        </header>
    )
}
