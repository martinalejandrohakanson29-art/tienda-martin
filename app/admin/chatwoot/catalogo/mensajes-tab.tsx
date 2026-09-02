"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Save, Loader2, Check, AlertTriangle } from "lucide-react"

import { guardarMensajeIncompatibilidad } from "@/app/actions/chat-config"
import {
    MENSAJE_INCOMPATIBILIDAD_DEFAULT,
    type ChatConfig,
} from "@/lib/chat-config-constants"

export function MensajesTab({
    configInicial,
    errorInicial,
}: {
    configInicial: ChatConfig
    errorInicial: string | null
}) {
    const [texto, setTexto] = useState(configInicial.mensajeIncompatibilidad)
    const [guardado, setGuardado] = useState(configInicial.mensajeIncompatibilidad)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(errorInicial)
    const [ok, setOk] = useState(false)

    const sinCambios = texto.trim() === guardado.trim()

    async function guardar() {
        setGuardando(true)
        setError(null)
        setOk(false)
        try {
            const res = await guardarMensajeIncompatibilidad(texto)
            setGuardado(res.valor)
            setTexto(res.valor)
            setOk(true)
            setTimeout(() => setOk(false), 2500)
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo guardar")
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="space-y-4 max-w-2xl">
            {error && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{error}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-emerald-500 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Mensaje de incompatibilidad</CardTitle>
                    <CardDescription>
                        Lo que le responde el bot cuando el kit, pack o grupo no le sirve a la moto del cliente.
                        Es un texto fijo: no incluye la moto ni el motivo técnico. Aplica a todos los casos
                        (kit simple, grupo y cuando el bot no encuentra ningún kit para esa moto).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="msg-incompat">Texto</Label>
                        <Textarea
                            id="msg-incompat"
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder={MENSAJE_INCOMPATIBILIDAD_DEFAULT}
                        />
                        <p className="text-xs text-gray-400">{texto.trim().length}/500</p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Vista previa (lo que ve el cliente)</Label>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
                            {texto.trim() || <span className="text-gray-400">…</span>}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={guardar}
                            disabled={guardando || sinCambios || !texto.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar
                        </Button>
                        {ok && (
                            <span className="text-sm text-emerald-600 flex items-center gap-1">
                                <Check className="h-4 w-4" /> Guardado
                            </span>
                        )}
                        {!sinCambios && !ok && (
                            <button
                                type="button"
                                onClick={() => setTexto(guardado)}
                                className="text-sm text-gray-400 hover:text-gray-600 underline"
                            >
                                deshacer cambios
                            </button>
                        )}
                    </div>

                    {guardado.trim() !== MENSAJE_INCOMPATIBILIDAD_DEFAULT.trim() && (
                        <button
                            type="button"
                            onClick={() => setTexto(MENSAJE_INCOMPATIBILIDAD_DEFAULT)}
                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                            volver al texto original
                        </button>
                    )}
                </CardContent>
            </Card>

            <p className="text-xs text-gray-400">
                El cambio impacta en el bot en el próximo mensaje que procese. Si el equipo responde
                &quot;no compatible&quot; a mano en una nota privada, ese texto lo sigue redactando la IA a partir
                de lo que escribió la persona — no usa este mensaje.
            </p>
        </div>
    )
}
