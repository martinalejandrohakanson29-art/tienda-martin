"use client"

import { BrainCircuit } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { Kit } from "@/app/actions/kits-publicidad"
import type { InfoNegocio } from "@/app/actions/info-negocio"
import type { ProductoPrecio } from "@/app/actions/precios-stock"
import type { Compatibilidad } from "@/app/actions/compatibilidades"

import { KitsTab } from "./kits-tab"
import { InfoNegocioTab } from "./info-negocio-tab"
import { PreciosTab } from "./precios-tab"
import { CompatibilidadTab } from "./compatibilidad-tab"

type Props = {
    kitsIniciales: Kit[]
    kitsError: string | null
    infoNegocioIniciales: InfoNegocio[]
    infoNegocioError: string | null
    preciosIniciales: ProductoPrecio[]
    preciosError: string | null
    compatibilidadesIniciales: Compatibilidad[]
    compatibilidadesError: string | null
}

export function ConocimientoClient({
    kitsIniciales,
    kitsError,
    infoNegocioIniciales,
    infoNegocioError,
    preciosIniciales,
    preciosError,
    compatibilidadesIniciales,
    compatibilidadesError,
}: Props) {
    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <BrainCircuit className="h-8 w-8 text-violet-600" />
                    Base de Conocimiento
                </h1>
                <p className="text-gray-500">
                    Todo lo que cargues acá lo puede consultar el agente de WhatsApp sin escalar a un humano:
                    kits/combos, info del negocio (horarios, medios de pago, envíos, etc.), precios/stock de
                    productos sueltos y compatibilidad técnica por modelo de moto.
                </p>
            </div>

            <Tabs defaultValue="kits" className="space-y-4">
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="kits">Kits y Combos</TabsTrigger>
                    <TabsTrigger value="negocio">Info del Negocio</TabsTrigger>
                    <TabsTrigger value="precios">Precios y Stock</TabsTrigger>
                    <TabsTrigger value="tecnica">Compatibilidad Técnica</TabsTrigger>
                </TabsList>

                <TabsContent value="kits">
                    <KitsTab kitsIniciales={kitsIniciales} errorInicial={kitsError} />
                </TabsContent>
                <TabsContent value="negocio">
                    <InfoNegocioTab itemsIniciales={infoNegocioIniciales} errorInicial={infoNegocioError} />
                </TabsContent>
                <TabsContent value="precios">
                    <PreciosTab itemsIniciales={preciosIniciales} errorInicial={preciosError} />
                </TabsContent>
                <TabsContent value="tecnica">
                    <CompatibilidadTab itemsIniciales={compatibilidadesIniciales} errorInicial={compatibilidadesError} kits={kitsIniciales} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
