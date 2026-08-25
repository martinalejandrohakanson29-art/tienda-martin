"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
    KeyRound, Plus, Pencil, Trash2, Eye, EyeOff, Copy, ExternalLink,
    ArrowLeft, Search, Lock,
} from "lucide-react"
import {
    crearCredencial, actualizarCredencial, eliminarCredencial, revelarPassword,
} from "@/app/actions/credenciales"

type CredencialRow = {
    id: string
    categoria: string
    titulo: string
    usuario: string | null
    url: string | null
    notas: string | null
    createdAt: string
    updatedAt: string
    creadoPor: { username: string } | null
    editadoPor: { username: string } | null
}

const CATEGORIAS_SUGERIDAS = [
    "Instagram", "Facebook", "MercadoLibre", "WhatsApp Business",
    "Cámaras", "Email", "Hosting / Dominio", "Otro",
]

const REVEAL_TIMEOUT_MS = 20000

const emptyForm = { categoria: "", titulo: "", usuario: "", password: "", url: "", notas: "" }

export default function ContrasenasClient({ initialCredenciales }: { initialCredenciales: CredencialRow[] }) {
    const [isPending, startTransition] = useTransition()
    const [items, setItems] = useState<CredencialRow[]>(initialCredenciales)
    const [busqueda, setBusqueda] = useState("")

    const [dlgCrear, setDlgCrear] = useState(false)
    const [dlgEditar, setDlgEditar] = useState(false)
    const [dlgEliminar, setDlgEliminar] = useState(false)
    const [seleccionada, setSeleccionada] = useState<CredencialRow | null>(null)

    const [form, setForm] = useState(emptyForm)

    const [revelados, setRevelados] = useState<Record<string, string>>({})
    const [revelando, setRevelando] = useState<string | null>(null)

    const categorias = useMemo(() => {
        const set = new Set(items.map(i => i.categoria))
        return Array.from(set).sort()
    }, [items])

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase()
        if (!q) return items
        return items.filter(i =>
            i.titulo.toLowerCase().includes(q) ||
            i.categoria.toLowerCase().includes(q) ||
            (i.usuario ?? "").toLowerCase().includes(q)
        )
    }, [items, busqueda])

    const agrupados = useMemo(() => {
        const map = new Map<string, CredencialRow[]>()
        for (const item of filtrados) {
            const arr = map.get(item.categoria) ?? []
            arr.push(item)
            map.set(item.categoria, arr)
        }
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    }, [filtrados])

    function openCrear() {
        setForm(emptyForm)
        setDlgCrear(true)
    }

    function openEditar(item: CredencialRow) {
        setSeleccionada(item)
        setForm({
            categoria: item.categoria,
            titulo: item.titulo,
            usuario: item.usuario ?? "",
            password: "",
            url: item.url ?? "",
            notas: item.notas ?? "",
        })
        setDlgEditar(true)
    }

    function openEliminar(item: CredencialRow) {
        setSeleccionada(item)
        setDlgEliminar(true)
    }

    function handleCrear() {
        if (!form.categoria.trim() || !form.titulo.trim() || !form.password) {
            toast.error("Completá categoría, título y contraseña")
            return
        }
        startTransition(async () => {
            const res = await crearCredencial(form)
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success("Credencial guardada")
            setDlgCrear(false)
            location.reload()
        })
    }

    function handleEditar() {
        if (!seleccionada) return
        if (!form.categoria.trim() || !form.titulo.trim()) {
            toast.error("Completá categoría y título")
            return
        }
        startTransition(async () => {
            const res = await actualizarCredencial(seleccionada.id, form)
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success("Credencial actualizada")
            setDlgEditar(false)
            location.reload()
        })
    }

    function handleEliminar() {
        if (!seleccionada) return
        startTransition(async () => {
            const res = await eliminarCredencial(seleccionada.id)
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success("Credencial eliminada")
            setDlgEliminar(false)
            location.reload()
        })
    }

    function toggleRevelar(id: string) {
        if (revelados[id]) {
            setRevelados(prev => {
                const next = { ...prev }
                delete next[id]
                return next
            })
            return
        }
        setRevelando(id)
        startTransition(async () => {
            const res = await revelarPassword(id)
            setRevelando(null)
            if (res?.error || !res.password) {
                toast.error(res?.error || "No se pudo revelar la contraseña")
                return
            }
            setRevelados(prev => ({ ...prev, [id]: res.password! }))
            setTimeout(() => {
                setRevelados(prev => {
                    const next = { ...prev }
                    delete next[id]
                    return next
                })
            }, REVEAL_TIMEOUT_MS)
        })
    }

    async function copiarPassword(id: string) {
        let password = revelados[id]
        if (!password) {
            const res = await revelarPassword(id)
            if (res?.error || !res.password) {
                toast.error(res?.error || "No se pudo copiar la contraseña")
                return
            }
            password = res.password
        }
        try {
            await navigator.clipboard.writeText(password)
            toast.success("Contraseña copiada")
        } catch {
            toast.error("No se pudo copiar al portapapeles")
        }
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
                    <Link href="/admin" className="text-gray-500 hover:text-gray-800">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
                            <KeyRound className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg leading-none">Contraseñas del negocio</h1>
                            <p className="text-xs text-gray-500 mt-1">Instagram, MercadoLibre, cámaras y demás accesos</p>
                        </div>
                    </div>
                    <div className="flex-1" />
                    <Button onClick={openCrear} className="gap-1">
                        <Plus className="w-4 h-4" /> Nueva
                    </Button>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                <div className="relative max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                        placeholder="Buscar por título, categoría o usuario..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="pl-9 bg-white"
                    />
                </div>

                {agrupados.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <Lock className="w-10 h-10 mx-auto mb-2" />
                        {items.length === 0 ? "Todavía no cargaste ninguna contraseña." : "No hay resultados para esa búsqueda."}
                    </div>
                )}

                {agrupados.map(([categoria, lista]) => (
                    <div key={categoria} className="space-y-2">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">{categoria}</h2>
                        <div className="bg-white rounded-xl border divide-y">
                            {lista.map(item => (
                                <div key={item.id} className="p-4 flex flex-col gap-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-gray-900">{item.titulo}</p>
                                            {item.usuario && <p className="text-sm text-gray-500">{item.usuario}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {item.url && (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir enlace">
                                                        <ExternalLink className="w-4 h-4 text-gray-400" />
                                                    </Button>
                                                </a>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditar(item)} title="Editar">
                                                <Pencil className="w-4 h-4 text-gray-400" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEliminar(item)} title="Eliminar">
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 bg-gray-50 border rounded-md px-3 py-1.5 text-sm font-mono text-gray-700 select-all">
                                            {revelados[item.id] ?? "••••••••••••"}
                                        </code>
                                        <Button
                                            variant="outline" size="icon" className="h-8 w-8"
                                            onClick={() => toggleRevelar(item.id)}
                                            disabled={revelando === item.id}
                                            title={revelados[item.id] ? "Ocultar" : "Mostrar"}
                                        >
                                            {revelados[item.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                        <Button
                                            variant="outline" size="icon" className="h-8 w-8"
                                            onClick={() => copiarPassword(item.id)}
                                            title="Copiar"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    {item.notas && <p className="text-sm text-gray-500 whitespace-pre-wrap">{item.notas}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Crear */}
            <Dialog open={dlgCrear} onOpenChange={setDlgCrear}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nueva credencial</DialogTitle></DialogHeader>
                    <CredencialForm form={form} setForm={setForm} categorias={categorias} esEdicion={false} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDlgCrear(false)}>Cancelar</Button>
                        <Button onClick={handleCrear} disabled={isPending}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editar */}
            <Dialog open={dlgEditar} onOpenChange={setDlgEditar}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar credencial</DialogTitle></DialogHeader>
                    <CredencialForm form={form} setForm={setForm} categorias={categorias} esEdicion />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDlgEditar(false)}>Cancelar</Button>
                        <Button onClick={handleEditar} disabled={isPending}>Guardar cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={dlgEliminar}
                onOpenChange={setDlgEliminar}
                title="Eliminar credencial"
                description={`¿Seguro que querés eliminar "${seleccionada?.titulo}"? Esta acción no se puede deshacer.`}
                variant="danger"
                confirmLabel="Eliminar"
                isLoading={isPending}
                onConfirm={handleEliminar}
            />
        </div>
    )
}

function CredencialForm({
    form, setForm, categorias, esEdicion,
}: {
    form: typeof emptyForm
    setForm: (f: typeof emptyForm) => void
    categorias: string[]
    esEdicion: boolean
}) {
    const sugerencias = Array.from(new Set([...categorias, ...CATEGORIAS_SUGERIDAS]))
    return (
        <div className="space-y-3">
            <div>
                <Label>Categoría</Label>
                <Input
                    list="categorias-sugeridas"
                    value={form.categoria}
                    onChange={e => setForm({ ...form, categoria: e.target.value })}
                    placeholder="Instagram, MercadoLibre, Cámaras..."
                />
                <datalist id="categorias-sugeridas">
                    {sugerencias.map(c => <option key={c} value={c} />)}
                </datalist>
            </div>
            <div>
                <Label>Título</Label>
                <Input
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Instagram @tienda_martin"
                />
            </div>
            <div>
                <Label>Usuario / email</Label>
                <Input
                    value={form.usuario}
                    onChange={e => setForm({ ...form, usuario: e.target.value })}
                />
            </div>
            <div>
                <Label>{esEdicion ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}</Label>
                <Input
                    type="text"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="font-mono"
                />
            </div>
            <div>
                <Label>URL (opcional)</Label>
                <Input
                    value={form.url}
                    onChange={e => setForm({ ...form, url: e.target.value })}
                    placeholder="https://..."
                />
            </div>
            <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                    value={form.notas}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                    rows={2}
                />
            </div>
        </div>
    )
}
