"use client"

/**
 * Kits de la Base de Conocimiento — SOLO LECTURA.
 *
 * Esta pestaña escribía en `kits_publicidad` y `compatibilidades`, las tablas de
 * la epoca de n8n. El bot que responde WhatsApp hoy (bot-agente) lee
 * `chat_packs` / `chat_pack_grupos` / `chat_combo_compatibilidad`: un kit
 * cargado acá NO lo ve. Mientras tuvo formulario, era la pantalla más fácil de
 * confundir con la buena, y cargar en ella significaba creer que el bot sabía
 * algo que no sabía.
 *
 * Se conserva la lista porque las filas viejas de compatibilidad todavía pesan
 * en el pozo de decisión hasta que corra `npm run compat:legacy`, y porque
 * sirve para consultar qué decían las fichas anteriores.
 */

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle } from "lucide-react"

import type { Kit } from "@/app/actions/kits-publicidad"
import type { Compatibilidad } from "@/app/actions/compatibilidades"

export function KitsTab({
    kitsIniciales,
    errorInicial,
    compatibilidadesIniciales,
}: {
    kitsIniciales: Kit[]
    errorInicial: string | null
    compatibilidadesIniciales: Compatibilidad[]
}) {
    const kits = kitsIniciales
    const compatPorKit = (kitId: number) => compatibilidadesIniciales.filter((c) => c.kit_id === kitId).length

    return (
        <div className="space-y-6">
            <Card className="border-l-4 border-l-rose-500 bg-rose-50">
                <CardContent className="pt-6 flex gap-3 items-start">
                    <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm text-rose-900">
                        <p className="font-medium">Panel viejo &mdash; el bot ya no lee estos kits.</p>
                        <p>
                            Los kits que responde el bot en WhatsApp se cargan en{" "}
                            <Link href="/admin/chatwoot/catalogo" className="underline font-medium">
                                Catálogo del Bot
                            </Link>
                            . Esto quedó de la época de n8n y está en solo lectura: sirve para consultar qué decían las
                            fichas viejas, no para cargar nada nuevo.
                        </p>
                        <p className="text-xs">
                            Las compatibilidades cargadas acá <strong>sí</strong> siguen pesando en lo que el bot decide,
                            hasta que se corra <code className="rounded bg-white px-1">npm run compat:legacy</code>.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {errorInicial && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50">
                    <CardContent className="pt-6 flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{errorInicial}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t-4 border-t-slate-400 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl">Kits viejos</CardTitle>
                    <CardDescription>{kits.length} kit(s) en la tabla de n8n, en solo lectura.</CardDescription>
                </CardHeader>
                <CardContent>
                    {kits.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">No hay kits en la tabla vieja.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Palabras clave</TableHead>
                                        <TableHead>Precio</TableHead>
                                        <TableHead>Envío</TableHead>
                                        <TableHead>Filas de compatibilidad</TableHead>
                                        <TableHead>Publicidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {kits.map((kit) => (
                                        <TableRow key={kit.id}>
                                            <TableCell className="font-medium">{kit.nombre}</TableCell>
                                            <TableCell className="text-sm text-gray-500 max-w-[240px] truncate">
                                                {kit.keywords || "—"}
                                            </TableCell>
                                            <TableCell>{kit.precio || "—"}</TableCell>
                                            <TableCell>{kit.envio || "—"}</TableCell>
                                            <TableCell className="text-sm text-gray-500">{compatPorKit(kit.id)}</TableCell>
                                            <TableCell>
                                                <Badge className={`select-none ${kit.activo ? "bg-emerald-600" : "bg-slate-400"}`}>
                                                    {kit.activo ? "Activo" : "Pausado"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
