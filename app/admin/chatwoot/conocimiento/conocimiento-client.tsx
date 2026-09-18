"use client"

import Link from "next/link"
import { BrainCircuit } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { Kit } from "@/app/actions/kits-publicidad"
import type { InfoNegocio } from "@/app/actions/info-negocio"
import type { ProductoPrecio } from "@/app/actions/precios-stock"
import type { Compatibilidad } from "@/app/actions/compatibilidades"

import { KitsTab } from "./kits-tab"
import { InfoNegocioTab } from "./info-negocio-tab"
import { PreciosTab } from "./precios-tab"

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
                    De acá el bot solo lee <strong>Info del Negocio</strong> (horarios, medios de pago, dónde estamos).
                    Los kits, su compatibilidad y los precios sueltos se cargan en{" "}
                    <Link href="/admin/chatwoot/catalogo" className="underline font-medium text-violet-700">
                        Catálogo del Bot
                    </Link>
                    : lo que se ve acá son las tablas de la época de n8n, en solo lectura.
                </p>
            </div>

            {compatibilidadesError && (
                <p className="text-sm text-amber-700">
                    No se pudo leer compatibilidad técnica: {compatibilidadesError}
                </p>
            )}

            <Tabs defaultValue="negocio" className="space-y-4">
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="kits">Kits y Combos (viejo)</TabsTrigger>
                    <TabsTrigger value="negocio">Info del Negocio</TabsTrigger>
                    <TabsTrigger value="precios">Precios y Stock (viejo)</TabsTrigger>
                </TabsList>

                <TabsContent value="kits">
                    <KitsTab
                        kitsIniciales={kitsIniciales}
                        errorInicial={kitsError}
                        compatibilidadesIniciales={compatibilidadesIniciales}
                    />
                </TabsContent>
                <TabsContent value="negocio">
                    <InfoNegocioTab itemsIniciales={infoNegocioIniciales} errorInicial={infoNegocioError} />
                </TabsContent>
                <TabsContent value="precios">
                    <PreciosTab itemsIniciales={preciosIniciales} errorInicial={preciosError} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
