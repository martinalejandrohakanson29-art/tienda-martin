"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Users, Bell, Plus, Pencil, Key, Trash2,
    ShieldAlert, ShieldCheck, User, ArrowLeft,
    CheckCircle, XCircle,
} from "lucide-react"
import Link from "next/link"
import {
    getUsers, createUser, updateUser, updatePassword, deleteUser,
} from "@/app/actions/users"
import {
    getNotificationRules, createNotificationRule,
    updateNotificationRule, deleteNotificationRule,
} from "@/app/actions/notification-rules"
import { EVENT_TYPES } from "@/lib/notification-event-types"

type UserRow = {
    id: string
    username: string
    name: string | null
    role: "SUPER_ADMIN" | "ADMIN" | "USER"
    isActive: boolean
    createdAt: string
}

type RuleRow = {
    id: string
    name: string
    eventType: string
    sourceUserId: string | null
    targetUserId: string
    isActive: boolean
    createdAt: string
    targetUser: { username: string }
    sourceUser: { username: string } | null
}

interface Props {
    initialUsers: UserRow[]
    initialRules: RuleRow[]
    currentUserId: string
}

const ROLE_CONFIG = {
    SUPER_ADMIN: { label: "Super Admin", badge: "bg-purple-100 text-purple-800 border-purple-200", icon: ShieldAlert, avatar: "bg-purple-500" },
    ADMIN: { label: "Admin", badge: "bg-blue-100 text-blue-800 border-blue-200", icon: ShieldCheck, avatar: "bg-blue-500" },
    USER: { label: "Usuario", badge: "bg-gray-100 text-gray-700 border-gray-200", icon: User, avatar: "bg-emerald-500" },
}

function RoleBadge({ role }: { role: keyof typeof ROLE_CONFIG }) {
    const cfg = ROLE_CONFIG[role]
    const Icon = cfg.icon
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
            <Icon className="w-3 h-3" />
            {cfg.label}
        </span>
    )
}

function Avatar({ username, role }: { username: string; role: string }) {
    const color = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG]?.avatar ?? "bg-gray-500"
    return (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${color}`}>
            {username.charAt(0).toUpperCase()}
        </div>
    )
}

export default function UsuariosClient({ initialUsers, initialRules, currentUserId }: Props) {
    const [isPending, startTransition] = useTransition()
    const [users, setUsers] = useState<UserRow[]>(initialUsers)
    const [rules, setRules] = useState<RuleRow[]>(initialRules)

    // Dialog visibility
    const [dlg, setDlg] = useState({
        createUser: false, editUser: false, changePass: false, deleteUser: false,
        createRule: false, editRule: false, deleteRule: false,
    })

    const openDlg = (key: keyof typeof dlg) => setDlg(d => ({ ...d, [key]: true }))
    const closeDlg = (key: keyof typeof dlg) => setDlg(d => ({ ...d, [key]: false }))

    const [selUser, setSelUser] = useState<UserRow | null>(null)
    const [selRule, setSelRule] = useState<RuleRow | null>(null)

    // Create user form
    const [cu, setCu] = useState({ username: "", name: "", role: "USER", password: "", confirm: "" })
    // Edit user form
    const [eu, setEu] = useState({ username: "", name: "", role: "USER", isActive: true })
    // Change password form
    const [cp, setCp] = useState({ password: "", confirm: "" })
    // Create rule form
    const [cr, setCr] = useState({ name: "", eventType: "", sourceUserId: "any", targetUserId: "" })
    // Edit rule form
    const [er, setEr] = useState({ name: "", eventType: "", sourceUserId: "any", targetUserId: "", isActive: true })

    async function refreshUsers() {
        const fresh = await getUsers()
        setUsers(JSON.parse(JSON.stringify(fresh)) as UserRow[])
    }

    async function refreshRules() {
        const fresh = await getNotificationRules()
        setRules(JSON.parse(JSON.stringify(fresh)) as RuleRow[])
    }

    // ── User handlers ──
    function openEditUser(u: UserRow) {
        setSelUser(u)
        setEu({ username: u.username, name: u.name || "", role: u.role, isActive: u.isActive })
        openDlg("editUser")
    }
    function openChangePass(u: UserRow) { setSelUser(u); setCp({ password: "", confirm: "" }); openDlg("changePass") }
    function openDeleteUser(u: UserRow) { setSelUser(u); openDlg("deleteUser") }
    function openCreateUser() { setCu({ username: "", name: "", role: "USER", password: "", confirm: "" }); openDlg("createUser") }

    async function handleCreateUser() {
        if (cu.password !== cu.confirm) { toast.error("Las contraseñas no coinciden"); return }
        startTransition(async () => {
            const r = await createUser({ username: cu.username, password: cu.password, name: cu.name || undefined, role: cu.role })
            if ("error" in r) { toast.error(r.error); return }
            toast.success("Usuario creado")
            closeDlg("createUser")
            await refreshUsers()
        })
    }

    async function handleEditUser() {
        if (!selUser) return
        startTransition(async () => {
            const r = await updateUser(selUser.id, { username: eu.username, name: eu.name, role: eu.role, isActive: eu.isActive })
            if ("error" in r) { toast.error(r.error); return }
            toast.success("Usuario actualizado")
            closeDlg("editUser")
            await refreshUsers()
        })
    }

    async function handleChangePass() {
        if (!selUser) return
        if (cp.password !== cp.confirm) { toast.error("Las contraseñas no coinciden"); return }
        startTransition(async () => {
            const r = await updatePassword(selUser.id, cp.password)
            if ("error" in r) { toast.error(r.error); return }
            toast.success("Contraseña actualizada")
            closeDlg("changePass")
        })
    }

    async function handleDeleteUser() {
        if (!selUser) return
        startTransition(async () => {
            const r = await deleteUser(selUser.id)
            if ("error" in r) { toast.error(r.error); return }
            toast.success("Usuario eliminado")
            closeDlg("deleteUser")
            await refreshUsers()
        })
    }

    // ── Rule handlers ──
    function openEditRule(rule: RuleRow) {
        setSelRule(rule)
        setEr({ name: rule.name, eventType: rule.eventType, sourceUserId: rule.sourceUserId || "any", targetUserId: rule.targetUserId, isActive: rule.isActive })
        openDlg("editRule")
    }
    function openDeleteRule(rule: RuleRow) { setSelRule(rule); openDlg("deleteRule") }
    function openCreateRule() { setCr({ name: "", eventType: "", sourceUserId: "any", targetUserId: "" }); openDlg("createRule") }

    async function handleCreateRule() {
        startTransition(async () => {
            const r = await createNotificationRule({ name: cr.name, eventType: cr.eventType, sourceUserId: cr.sourceUserId === "any" ? undefined : cr.sourceUserId, targetUserId: cr.targetUserId })
            if ("error" in r) { toast.error(r.error); return }
            toast.success("Regla creada")
            closeDlg("createRule")
            await refreshRules()
        })
    }

    async function handleEditRule() {
        if (!selRule) return
        startTransition(async () => {
            const r = await updateNotificationRule(selRule.id, { name: er.name, eventType: er.eventType, sourceUserId: er.sourceUserId === "any" ? null : er.sourceUserId, targetUserId: er.targetUserId, isActive: er.isActive })
            if ("error" in r) { toast.error(String(r.error)); return }
            toast.success("Regla actualizada")
            closeDlg("editRule")
            await refreshRules()
        })
    }

    async function handleToggleRule(rule: RuleRow) {
        startTransition(async () => {
            await updateNotificationRule(rule.id, { isActive: !rule.isActive })
            await refreshRules()
        })
    }

    async function handleDeleteRule() {
        if (!selRule) return
        startTransition(async () => {
            const r = await deleteNotificationRule(selRule.id)
            if ("error" in r) { toast.error(String(r.error)); return }
            toast.success("Regla eliminada")
            closeDlg("deleteRule")
            await refreshRules()
        })
    }

    const stats = {
        total: users.length,
        active: users.filter(u => u.isActive).length,
        admins: users.filter(u => u.role === "ADMIN").length,
        superAdmins: users.filter(u => u.role === "SUPER_ADMIN").length,
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Link href="/admin" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-sm">
                        <ArrowLeft className="w-4 h-4" />
                        Dashboard
                    </Link>
                    <span className="text-gray-300">/</span>
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-600" />
                        <span className="font-semibold text-gray-900 text-sm">Administración de Usuarios</span>
                    </div>
                </div>
            </div>

            <div className="p-6 max-w-5xl mx-auto">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: "Total usuarios", value: stats.total, color: "text-gray-900" },
                        { label: "Activos", value: stats.active, color: "text-emerald-600" },
                        { label: "Administradores", value: stats.admins, color: "text-blue-600" },
                        { label: "Super Admins", value: stats.superAdmins, color: "text-purple-600" },
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                        </div>
                    ))}
                </div>

                <Tabs defaultValue="usuarios">
                    <TabsList className="mb-4">
                        <TabsTrigger value="usuarios" className="gap-2">
                            <Users className="w-4 h-4" /> Usuarios
                        </TabsTrigger>
                        <TabsTrigger value="reglas" className="gap-2">
                            <Bell className="w-4 h-4" /> Reglas de Notificación
                        </TabsTrigger>
                    </TabsList>

                    {/* ══ USUARIOS ══ */}
                    <TabsContent value="usuarios">
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                <h2 className="font-semibold text-gray-900">Usuarios del sistema</h2>
                                <Button size="sm" onClick={openCreateUser} className="gap-1.5">
                                    <Plus className="w-4 h-4" /> Nuevo usuario
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                            <th className="px-5 py-3 text-left">Usuario</th>
                                            <th className="px-5 py-3 text-left">Nombre</th>
                                            <th className="px-5 py-3 text-left">Rol</th>
                                            <th className="px-5 py-3 text-left">Estado</th>
                                            <th className="px-5 py-3 text-left">Creado</th>
                                            <th className="px-5 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {users.map(u => (
                                            <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <Avatar username={u.username} role={u.role} />
                                                        <div>
                                                            <span className="font-medium text-gray-900">{u.username}</span>
                                                            {u.id === currentUserId && (
                                                                <span className="ml-1.5 text-xs text-gray-400">(tú)</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600">
                                                    {u.name || <span className="text-gray-400 italic text-xs">Sin nombre</span>}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <RoleBadge role={u.role} />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    {u.isActive ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                            <CheckCircle className="w-3 h-3" /> Activo
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                                                            <XCircle className="w-3 h-3" /> Inactivo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-xs text-gray-500">
                                                    {new Date(u.createdAt).toLocaleDateString("es-AR")}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center justify-end gap-0.5">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-900" title="Editar" onClick={() => openEditUser(u)}>
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-amber-700" title="Cambiar contraseña" onClick={() => openChangePass(u)}>
                                                            <Key className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                            title="Eliminar"
                                                            disabled={u.id === currentUserId}
                                                            onClick={() => openDeleteUser(u)}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {users.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                                                    No hay usuarios registrados
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ══ REGLAS ══ */}
                    <TabsContent value="reglas">
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                <div>
                                    <h2 className="font-semibold text-gray-900">Reglas de notificación</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">Define qué eventos generan alertas y quién las recibe</p>
                                </div>
                                <Button size="sm" onClick={openCreateRule} className="gap-1.5">
                                    <Plus className="w-4 h-4" /> Nueva regla
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                            <th className="px-5 py-3 text-left">Nombre</th>
                                            <th className="px-5 py-3 text-left">Evento</th>
                                            <th className="px-5 py-3 text-left">Origen</th>
                                            <th className="px-5 py-3 text-left">Destino</th>
                                            <th className="px-5 py-3 text-left">Estado</th>
                                            <th className="px-5 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {rules.map(rule => {
                                            const evLabel = EVENT_TYPES.find(e => e.value === rule.eventType)?.label ?? rule.eventType
                                            return (
                                                <tr key={rule.id} className="hover:bg-gray-50/70 transition-colors">
                                                    <td className="px-5 py-3.5 font-medium text-gray-900">{rule.name}</td>
                                                    <td className="px-5 py-3.5 text-gray-600 text-xs">{evLabel}</td>
                                                    <td className="px-5 py-3.5">
                                                        {rule.sourceUser
                                                            ? <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">{rule.sourceUser.username}</code>
                                                            : <span className="text-gray-400 text-xs italic">Cualquier usuario</span>}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs">{rule.targetUser.username}</code>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <button
                                                            onClick={() => handleToggleRule(rule)}
                                                            disabled={isPending}
                                                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border cursor-pointer transition-all ${rule.isActive ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" : "text-gray-500 bg-gray-100 border-gray-200 hover:bg-gray-200"}`}
                                                        >
                                                            {rule.isActive ? <><CheckCircle className="w-3 h-3" /> Activa</> : <><XCircle className="w-3 h-3" /> Inactiva</>}
                                                        </button>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center justify-end gap-0.5">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-900" onClick={() => openEditRule(rule)}>
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => openDeleteRule(rule)}>
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {rules.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-5 py-12 text-center">
                                                    <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                                    <div className="text-gray-400 text-sm">No hay reglas configuradas</div>
                                                    <div className="text-gray-300 text-xs mt-1">Las reglas definen quién recibe alertas cuando ocurre un evento</div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* ══ DIALOG: Crear usuario ══ */}
            <Dialog open={dlg.createUser} onOpenChange={v => !v && closeDlg("createUser")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nuevo Usuario</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label>Nombre de usuario *</Label>
                            <Input placeholder="ej: benjamin" value={cu.username} onChange={e => setCu(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nombre completo</Label>
                            <Input placeholder="ej: Benjamín García" value={cu.name} onChange={e => setCu(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Rol *</Label>
                            <Select value={cu.role} onValueChange={v => setCu(p => ({ ...p, role: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USER">Usuario</SelectItem>
                                    <SelectItem value="ADMIN">Administrador</SelectItem>
                                    <SelectItem value="SUPER_ADMIN">Super Administrador</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Contraseña *</Label>
                            <Input type="password" placeholder="Mínimo 6 caracteres" value={cu.password} onChange={e => setCu(p => ({ ...p, password: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Confirmar contraseña *</Label>
                            <Input type="password" placeholder="Repetir contraseña" value={cu.confirm} onChange={e => setCu(p => ({ ...p, confirm: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("createUser")}>Cancelar</Button>
                        <Button onClick={handleCreateUser} disabled={isPending || !cu.username || !cu.password}>
                            {isPending ? "Creando..." : "Crear usuario"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Editar usuario ══ */}
            <Dialog open={dlg.editUser} onOpenChange={v => !v && closeDlg("editUser")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar Usuario — {selUser?.username}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label>Nombre de usuario *</Label>
                            <Input value={eu.username} onChange={e => setEu(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Nombre completo</Label>
                            <Input placeholder="Nombre para mostrar" value={eu.name} onChange={e => setEu(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Rol</Label>
                            <Select value={eu.role} onValueChange={v => setEu(p => ({ ...p, role: v }))} disabled={selUser?.id === currentUserId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USER">Usuario</SelectItem>
                                    <SelectItem value="ADMIN">Administrador</SelectItem>
                                    <SelectItem value="SUPER_ADMIN">Super Administrador</SelectItem>
                                </SelectContent>
                            </Select>
                            {selUser?.id === currentUserId && <p className="text-xs text-amber-600">No podés cambiar tu propio rol</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Estado</Label>
                            <div className="flex gap-2">
                                {[{ v: true, label: "Activo" }, { v: false, label: "Inactivo" }].map(opt => (
                                    <button
                                        key={String(opt.v)}
                                        disabled={selUser?.id === currentUserId}
                                        onClick={() => setEu(p => ({ ...p, isActive: opt.v }))}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${eu.isActive === opt.v ? (opt.v ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-100 border-gray-400 text-gray-700") : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                                    >{opt.label}</button>
                                ))}
                            </div>
                            {selUser?.id === currentUserId && <p className="text-xs text-amber-600">No podés desactivar tu propia cuenta</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("editUser")}>Cancelar</Button>
                        <Button onClick={handleEditUser} disabled={isPending || !eu.username}>
                            {isPending ? "Guardando..." : "Guardar cambios"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Cambiar contraseña ══ */}
            <Dialog open={dlg.changePass} onOpenChange={v => !v && closeDlg("changePass")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Cambiar Contraseña — {selUser?.username}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label>Nueva contraseña *</Label>
                            <Input type="password" placeholder="Mínimo 6 caracteres" value={cp.password} onChange={e => setCp(p => ({ ...p, password: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Confirmar nueva contraseña *</Label>
                            <Input type="password" placeholder="Repetir contraseña" value={cp.confirm} onChange={e => setCp(p => ({ ...p, confirm: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("changePass")}>Cancelar</Button>
                        <Button onClick={handleChangePass} disabled={isPending || !cp.password}>
                            {isPending ? "Actualizando..." : "Actualizar contraseña"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Eliminar usuario ══ */}
            <Dialog open={dlg.deleteUser} onOpenChange={v => !v && closeDlg("deleteUser")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Eliminar Usuario</DialogTitle></DialogHeader>
                    <p className="text-sm text-gray-600 py-1">
                        ¿Estás seguro de que querés eliminar al usuario{" "}
                        <strong className="text-gray-900">{selUser?.username}</strong>?
                        Esta acción no se puede deshacer.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("deleteUser")}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDeleteUser} disabled={isPending}>
                            {isPending ? "Eliminando..." : "Eliminar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Crear regla ══ */}
            <Dialog open={dlg.createRule} onOpenChange={v => !v && closeDlg("createRule")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nueva Regla de Notificación</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label>Nombre de la regla *</Label>
                            <Input placeholder="ej: Alerta cambio estado a Ivan" value={cr.name} onChange={e => setCr(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Evento *</Label>
                            <Select value={cr.eventType} onValueChange={v => setCr(p => ({ ...p, eventType: v }))}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar evento..." /></SelectTrigger>
                                <SelectContent>
                                    {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Usuario que dispara el evento</Label>
                            <Select value={cr.sourceUserId} onValueChange={v => setCr(p => ({ ...p, sourceUserId: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Cualquier usuario</SelectItem>
                                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">Quién genera el evento. Dejá en "cualquier usuario" para todos.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Usuario que recibe la alerta *</Label>
                            <Select value={cr.targetUserId} onValueChange={v => setCr(p => ({ ...p, targetUserId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                    {users.filter(u => u.isActive).map(u => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("createRule")}>Cancelar</Button>
                        <Button onClick={handleCreateRule} disabled={isPending || !cr.name || !cr.eventType || !cr.targetUserId}>
                            {isPending ? "Creando..." : "Crear regla"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Editar regla ══ */}
            <Dialog open={dlg.editRule} onOpenChange={v => !v && closeDlg("editRule")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar Regla — {selRule?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5">
                            <Label>Nombre *</Label>
                            <Input value={er.name} onChange={e => setEr(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Evento *</Label>
                            <Select value={er.eventType} onValueChange={v => setEr(p => ({ ...p, eventType: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Usuario origen</Label>
                            <Select value={er.sourceUserId} onValueChange={v => setEr(p => ({ ...p, sourceUserId: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Cualquier usuario</SelectItem>
                                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Usuario destino *</Label>
                            <Select value={er.targetUserId} onValueChange={v => setEr(p => ({ ...p, targetUserId: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {users.filter(u => u.isActive).map(u => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Estado</Label>
                            <div className="flex gap-2">
                                {[{ v: true, label: "Activa" }, { v: false, label: "Inactiva" }].map(opt => (
                                    <button
                                        key={String(opt.v)}
                                        onClick={() => setEr(p => ({ ...p, isActive: opt.v }))}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${er.isActive === opt.v ? (opt.v ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-100 border-gray-400 text-gray-700") : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                                    >{opt.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("editRule")}>Cancelar</Button>
                        <Button onClick={handleEditRule} disabled={isPending || !er.name || !er.eventType || !er.targetUserId}>
                            {isPending ? "Guardando..." : "Guardar cambios"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ DIALOG: Eliminar regla ══ */}
            <Dialog open={dlg.deleteRule} onOpenChange={v => !v && closeDlg("deleteRule")}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Eliminar Regla</DialogTitle></DialogHeader>
                    <p className="text-sm text-gray-600 py-1">
                        ¿Estás seguro de que querés eliminar la regla{" "}
                        <strong className="text-gray-900">"{selRule?.name}"</strong>?
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => closeDlg("deleteRule")}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDeleteRule} disabled={isPending}>
                            {isPending ? "Eliminando..." : "Eliminar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
