"use client"

import { Boxes } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { ChatArticulo, ChatPack, ChatArticuloCompatibilidad, ChatPackGrupo, ChatComboCompatibilidad } from "@/app/actions/chat-catalogo"
import type { ChatConfig } from "@/app/actions/chat-config"
import type { InfoNegocio } from "@/app/actions/info-negocio"
import type { Kit } from "@/app/actions/kits-publicidad"
import type { Compatibilidad } from "@/app/actions/compatibilidades"

import { ArticulosTab } from "./articulos-tab"
import { PacksTab } from "./packs-tab"
import { GruposTab } from "./grupos-tab"
import { MensajesTab } from "./mensajes-tab"
import { SaludTab } from "./salud-tab"
import type { MotoCanonica } from "@/app/actions/motos-aprendizaje"

type Props = {
    articulosIniciales: ChatArticulo[]
    articulosError: string | null
    packsIniciales: ChatPack[]
    packsError: string | null
    compatibilidadesArticulosIniciales: ChatArticuloCompatibilidad[]
    kitsParaCopiar: Kit[]
    compatibilidadesKits: Compatibilidad[]
    gruposIniciales: ChatPackGrupo[]
    gruposError: string | null
    compatibilidadesComboIniciales: ChatComboCompatibilidad[]
    configInicial: ChatConfig
    configError: string | null
    infoNegocioInicial: InfoNegocio[]
    infoNegocioError: string | null
    motos: MotoCanonica[]
}

export function CatalogoClient({
    articulosIniciales,
    articulosError,
    packsIniciales,
    packsError,
    compatibilidadesArticulosIniciales,
    kitsParaCopiar,
    compatibilidadesKits,
    gruposIniciales,
    gruposError,
    compatibilidadesComboIniciales,
    configInicial,
    configError,
    infoNegocioInicial,
    infoNegocioError,
    motos,
}: Props) {
    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Boxes className="h-8 w-8 text-emerald-600" />
                    Catálogo del Bot
                </h1>
                <p className="text-gray-500">
                    <strong>Esto es lo que el bot responde en WhatsApp hoy.</strong> Cargá primero los artículos sueltos
                    (con su precio si se venden aparte) y después armá los packs enganchando esos artículos, para que el
                    agente pueda contestar por una pieza puntual del combo sin derivar. Un pack nuevo queda en{" "}
                    <strong>borrador</strong> hasta que lo publiques desde la lista, con la revisión previa.
                </p>
            </div>

            <Tabs defaultValue="articulos" className="space-y-4">
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="articulos">Artículos</TabsTrigger>
                    <TabsTrigger value="packs">Packs</TabsTrigger>
                    <TabsTrigger value="grupos">Grupos</TabsTrigger>
                    <TabsTrigger value="mensajes">Mensajes del bot</TabsTrigger>
                    <TabsTrigger value="salud">Salud</TabsTrigger>
                </TabsList>

                <TabsContent value="articulos">
                    <ArticulosTab
                        articulosIniciales={articulosIniciales}
                        errorInicial={articulosError}
                        compatibilidadesIniciales={compatibilidadesArticulosIniciales}
                        kitsParaCopiar={kitsParaCopiar}
                        compatibilidadesKits={compatibilidadesKits}
                        costoEnvioInicial={configInicial.costoEnvioSueltas}
                        motos={motos}
                    />
                </TabsContent>
                <TabsContent value="packs">
                    <PacksTab
                        packsIniciales={packsIniciales}
                        errorInicial={packsError}
                        articulosDisponibles={articulosIniciales}
                        gruposIniciales={gruposIniciales}
                        compatibilidadesComboIniciales={compatibilidadesComboIniciales}
                        motos={motos}
                    />
                </TabsContent>
                <TabsContent value="grupos">
                    <GruposTab
                        gruposIniciales={gruposIniciales}
                        errorInicial={gruposError}
                        packsIniciales={packsIniciales}
                        compatibilidadesComboIniciales={compatibilidadesComboIniciales}
                        motos={motos}
                    />
                </TabsContent>
                <TabsContent value="mensajes">
                    <MensajesTab
                        configInicial={configInicial}
                        errorInicial={configError}
                        infoNegocioInicial={infoNegocioInicial}
                        infoNegocioError={infoNegocioError}
                    />
                </TabsContent>
                <TabsContent value="salud">
                    <SaludTab />
                </TabsContent>
            </Tabs>
        </div>
    )
}
