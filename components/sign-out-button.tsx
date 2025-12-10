"use client"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export default function SignOutButton() {
    return (
        <Button
            variant="ghost"
            className="w-full justify-start text-white hover:text-white hover:bg-gray-800"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
        >
            <LogOut size={20} className="mr-2" />
            Cerrar Sesión
        </Button>
    )
}
