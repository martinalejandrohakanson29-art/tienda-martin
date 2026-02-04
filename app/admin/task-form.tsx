"use client"

import { useState, useRef, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createTodo } from "@/app/actions/todos"
import { ClipboardList, Loader2, CheckCircle2 } from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface User {
    id: string
    username: string
}

export default function TaskForm({ users }: { users: User[] }) {
    const [isPending, startTransition] = useTransition()
    const [showSuccess, setShowSuccess] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)

    async function handleSubmit(formData: FormData) {
        // Iniciamos la transición para la animación de carga
        startTransition(async () => {
            await createTodo(formData)
            
            // 1. Borramos la info del formulario
            formRef.current?.reset()
            
            // 2. Mostramos el texto de éxito
            setShowSuccess(true)
            
            // 3. Ocultamos el texto después de 3 segundos
            setTimeout(() => {
                setShowSuccess(false)
            }, 3000)
        })
    }

    return (
        <>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-primary">
                    <ClipboardList className="h-5 w-5" />
                    Asignar de tareas
                </CardTitle>
                <CardDescription>
                    Crear y asignar tareas específicas por usuario
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form 
                    ref={formRef} 
                    action={handleSubmit} 
                    className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
                >
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Tarea / Pendiente</label>
                        <Input 
                            name="content" 
                            placeholder="Ej: actualizar lista de precios Paolucci..." 
                            required 
                            className="bg-white"
                            disabled={isPending}
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Prioridad</label>
                        <select 
                            name="priority" 
                            defaultValue="media"
                            disabled={isPending}
                            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            <option value="baja">Baja</option>
                            <option value="media">Media</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">⚠️ Urgente</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Asignar a</label>
                        <select 
                            name="userId" 
                            required 
                            disabled={isPending}
                            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            <option value="">Seleccionar...</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>@{user.username}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button 
                            type="submit" 
                            disabled={isPending}
                            className={`w-full md:w-auto gap-2 transition-all active:scale-95 ${isPending ? 'opacity-70' : ''}`}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Asignando...
                                </>
                            ) : (
                                "Asignar Tarea"
                            )}
                        </Button>
                        
                        {/* Texto de éxito con animación suave */}
                        {showSuccess && (
                            <span className="flex items-center gap-1 text-green-600 text-sm font-bold animate-in fade-in slide-in-from-left-2 duration-300">
                                <CheckCircle2 className="h-4 w-4" />
                                Tarea asignada
                            </span>
                        )}
                    </div>
                </form>
            </CardContent>
        </>
    )
}
