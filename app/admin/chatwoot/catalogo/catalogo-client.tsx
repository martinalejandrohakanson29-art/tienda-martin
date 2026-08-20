"use client"

import { Boxes } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { ChatArticulo, ChatPack, ChatArticuloCompatibilidad } from "@/app/actions/chat-catalogo"
import type { Kit } from "@/app/actions/kits-publicidad"
import type { Compatibilidad } from "@/app/actions/compatibilidades"

import { ArticulosTab } from "./articulos-tab"
import { PacksTab } from "./packs-tab"

type Props = {
    articulosIniciales: ChatArticulo[]
    articulosError: string | null
    packsIniciales: ChatPack[]
    packsError: string | null
    compatibilidadesArticulosIniciales: ChatArticuloCompatibilidad[]
    kitsParaCopiar: Kit[]
    compatibilidadesKits: Compatibilidad[]
}

export function CatalogoClient({
    articulosIniciales,
    articulosError,
    packsIniciales,
    packsError,
    compatibilidadesArticulosIniciales,
    kitsParaCopiar,
    compatibilidadesKits,
}: Props) {
    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Boxes className="h-8 w-8 text-emerald-600" />
                    Catálogo del Bot (nuevo)
                </h1>
                <p className="text-gray-500">
                    Base aislada, separada de &quot;Base de Conocimiento&quot; — el bot en producción todavía no lee esto.
                    Cargá primero los artículos sueltos (con su precio si se venden aparte) y después armá los packs
                    enganchando esos artículos, para que a futuro el agente pueda contestar preguntas sobre una pieza
                    puntual de un combo sin escalar.
                </p>
            </div>

            <Tabs defaultValue="articulos" className="space-y-4">
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="articulos">Artículos</TabsTrigger>
                    <TabsTrigger value="packs">Packs</TabsTrigger>
                </TabsList>

                <TabsContent value="articulos">
                    <ArticulosTab
                        articulosIniciales={articulosIniciales}
                        errorInicial={articulosError}
                        compatibilidadesIniciales={compatibilidadesArticulosIniciales}
                        kitsParaCopiar={kitsParaCopiar}
                        compatibilidadesKits={compatibilidadesKits}
                    />
                </TabsContent>
                <TabsContent value="packs">
                    <PacksTab packsIniciales={packsIniciales} errorInicial={packsError} articulosDisponibles={articulosIniciales} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
