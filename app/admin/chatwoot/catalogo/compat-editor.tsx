"use client"

/**
 * Editor de compatibilidad con control de motos.
 *
 * Los dos textareas ("compatible con" / "no compatible con") son texto libre, y
 * eso no va a cambiar: escribir una lista corrida es más rápido que cargar
 * fila por fila. Lo que sí cambia es que ahora cada ítem se pasa por el MISMO
 * resolvedor que usa el bot, y el que carga ve en el momento cuáles de las
 * motos que escribió el motor no va a reconocer.
 *
 * Por qué importa: una fila con "Chilera 110" (typo de Gilera) o "110 wave" se
 * guarda igual, se ve igual en el panel y nunca se aplica — o se aplica por
 * parecido a otra moto. Es un veredicto que nadie sabe que está muerto hasta
 * que un cliente pregunta por esa moto y el bot deriva (o peor, contesta por
 * la moto equivocada).
 *
 * El chip ámbar no bloquea: se puede guardar igual. Ofrece las dos salidas
 * reales — asociar la grafía como alias de una moto que ya existe, o crear el
 * modelo — sin salir de la pantalla.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, CircleAlert, Loader2, Plus, Link2 } from "lucide-react"

import { parsearListaCompat } from "@/lib/compatibilidad-texto"
import { analizarMotosCompat, type MotoAnalizada } from "@/app/actions/chat-catalogo"
import { asociarAliasAMoto, crearMotoCanonica, type MotoCanonica } from "@/app/actions/motos-aprendizaje"

type Props = {
    titulo: string
    /** Controles propios de la pantalla (ej. "copiar de un kit"), al lado del título. */
    acciones?: React.ReactNode
    ayuda?: React.ReactNode
    compatibleTexto: string
    incompatibleTexto: string
    onCompatibleChange: (v: string) => void
    onIncompatibleChange: (v: string) => void
    motos: MotoCanonica[]
    disabled?: boolean
    idPrefijo: string
}

export function CompatEditor({
    titulo,
    acciones,
    ayuda,
    compatibleTexto,
    incompatibleTexto,
    onCompatibleChange,
    onIncompatibleChange,
    motos: motosIniciales,
    disabled,
    idPrefijo,
}: Props) {
    const [motos, setMotos] = useState<MotoCanonica[]>(motosIniciales)
    const [analisis, setAnalisis] = useState<MotoAnalizada[]>([])
    const [analizando, setAnalizando] = useState(false)
    const [enfocada, setEnfocada] = useState<MotoAnalizada | null>(null)
    const [motoElegida, setMotoElegida] = useState<string>("")
    const [marcaNueva, setMarcaNueva] = useState("")
    const [modeloNuevo, setModeloNuevo] = useState("")
    const [cilindradaNueva, setCilindradaNueva] = useState("")
    const [trabajando, setTrabajando] = useState(false)
    const [aviso, setAviso] = useState<string | null>(null)

    const escritas = useMemo(() => {
        const items = [...parsearListaCompat(compatibleTexto), ...parsearListaCompat(incompatibleTexto)]
        return [...new Set(items.map((i) => i.modelo.trim()).filter(Boolean))]
    }, [compatibleTexto, incompatibleTexto])

    const claveEscritas = escritas.join("||")

    const analizar = useCallback(async (textos: string[]) => {
        if (textos.length === 0) {
            setAnalisis([])
            return
        }
        setAnalizando(true)
        try {
            setAnalisis(await analizarMotosCompat(textos))
        } catch {
            // Sin análisis el editor sigue siendo un textarea común: no se
            // rompe la carga por no poder validar.
            setAnalisis([])
        } finally {
            setAnalizando(false)
        }
    }, [])

    // Debounce: el resolvedor pega contra la base y el que carga escribe de
    // corrido; no tiene sentido analizar letra por letra.
    useEffect(() => {
        const t = setTimeout(() => analizar(claveEscritas ? claveEscritas.split("||") : []), 600)
        return () => clearTimeout(t)
    }, [claveEscritas, analizar])

    const noResuelven = analisis.filter((a) => !a.resuelve)

    const abrirArreglo = (a: MotoAnalizada) => {
        setEnfocada(a)
        setAviso(null)
        setMotoElegida(a.candidatos[0] ? String(a.candidatos[0].id) : "")
        const partes = a.texto.trim().split(/\s+/)
        setMarcaNueva(partes[0] || "")
        setModeloNuevo(partes.slice(1).join(" ") || "")
        const cc = a.texto.match(/\d{2,4}/)
        setCilindradaNueva(cc ? cc[0] : "")
    }

    const asociar = async () => {
        if (!enfocada || !motoElegida) return
        setTrabajando(true)
        setAviso(null)
        try {
            const r = await asociarAliasAMoto({ motoId: Number(motoElegida), nuevoAlias: enfocada.texto })
            setAviso(r.mensaje)
            setMotos((prev) =>
                prev.map((m) =>
                    m.id === Number(motoElegida) ? { ...m, aliases: [...(m.aliases || []), enfocada.texto] } : m
                )
            )
            setEnfocada(null)
            await analizar(escritas)
        } catch (e) {
            setAviso(e instanceof Error ? e.message : "No se pudo asociar el alias")
        } finally {
            setTrabajando(false)
        }
    }

    const crear = async () => {
        if (!enfocada || !marcaNueva.trim() || !modeloNuevo.trim()) return
        setTrabajando(true)
        setAviso(null)
        try {
            const r = await crearMotoCanonica({
                marca: marcaNueva,
                modelo: modeloNuevo,
                cilindrada: cilindradaNueva ? Number(cilindradaNueva) : undefined,
                aliasInicial: enfocada.texto,
            })
            setMotos((prev) => [...prev, r.moto])
            setAviso(`Moto "${r.moto.nombre_completo}" creada y asociada a "${enfocada.texto}".`)
            setEnfocada(null)
            await analizar(escritas)
        } catch (e) {
            setAviso(e instanceof Error ? e.message : "No se pudo crear la moto")
        } finally {
            setTrabajando(false)
        }
    }

    return (
        <div className="space-y-3 pt-6 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Label>{titulo}</Label>
                    {analizando && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                {acciones}
            </div>
            {ayuda && <p className="text-xs text-gray-400">{ayuda}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label htmlFor={`${idPrefijo}-compatible`}>Compatible con (separado por comas)</Label>
                    <Textarea
                        id={`${idPrefijo}-compatible`}
                        placeholder="Ej: Zanella ZB 110, Motomel Blitz 110"
                        value={compatibleTexto}
                        onChange={(e) => onCompatibleChange(e.target.value)}
                        disabled={disabled}
                        rows={4}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`${idPrefijo}-incompatible`}>No compatible con (separado por comas)</Label>
                    <Textarea
                        id={`${idPrefijo}-incompatible`}
                        placeholder="Ej: Wave S (hay que alesar los cárteres)"
                        value={incompatibleTexto}
                        onChange={(e) => onIncompatibleChange(e.target.value)}
                        disabled={disabled}
                        rows={4}
                    />
                </div>
            </div>

            {analisis.length > 0 && (
                <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <p className="text-xs text-slate-600">
                        {noResuelven.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                                <Check className="h-3.5 w-3.5" /> Las {analisis.length} motos escritas las reconoce el bot.
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                                <CircleAlert className="h-3.5 w-3.5" />
                                {noResuelven.length} de {analisis.length} no las reconoce: esas filas no se van a aplicar
                                nunca (o se aplican por parecido a otra moto).
                            </span>
                        )}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {analisis.map((a) => (
                            <Badge
                                key={a.texto}
                                variant="outline"
                                onClick={() => (!a.resuelve && !disabled ? abrirArreglo(a) : undefined)}
                                title={
                                    a.resuelve
                                        ? `Resuelve a ${a.modelo} (${a.confianza})`
                                        : a.confianza === "ambigua"
                                          ? "Ambigua: el bot no sabe a cuál de varias motos te referís"
                                          : "El bot no reconoce esta moto"
                                }
                                className={`font-normal ${
                                    a.resuelve
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                        : "cursor-pointer border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                }`}
                            >
                                {a.texto}
                                {!a.resuelve && <CircleAlert className="ml-1 h-3 w-3" />}
                            </Badge>
                        ))}
                    </div>

                    {enfocada && (
                        <div className="rounded-md border border-amber-200 bg-white p-3 space-y-3">
                            <p className="text-sm font-medium text-slate-800">
                                &quot;{enfocada.texto}&quot; no resuelve a ninguna moto del catálogo
                            </p>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Es otra forma de nombrar a una moto que ya existe</Label>
                                    <div className="flex gap-2">
                                        <Select value={motoElegida} onValueChange={setMotoElegida}>
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder="Elegí la moto…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[...enfocada.candidatos.map((c) => ({ id: c.id, nombre_completo: c.nombre })), ...motos]
                                                    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
                                                    .map((m) => (
                                                        <SelectItem key={m.id} value={String(m.id)}>
                                                            {m.nombre_completo}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" size="sm" onClick={asociar} disabled={trabajando || !motoElegida} className="gap-1">
                                            {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                            Asociar
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">O es una moto que todavía no está cargada</Label>
                                    <div className="flex gap-2">
                                        <Input value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} placeholder="Marca" className="w-28" />
                                        <Input value={modeloNuevo} onChange={(e) => setModeloNuevo(e.target.value)} placeholder="Modelo" className="flex-1" />
                                        <Input
                                            value={cilindradaNueva}
                                            onChange={(e) => setCilindradaNueva(e.target.value)}
                                            placeholder="cc"
                                            className="w-16"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={crear}
                                            disabled={trabajando || !marcaNueva.trim() || !modeloNuevo.trim()}
                                            className="gap-1"
                                        >
                                            {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                            Crear
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEnfocada(null)}>
                                Dejarlo así
                            </Button>
                        </div>
                    )}

                    {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
                </div>
            )}
        </div>
    )
}
