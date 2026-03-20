"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MessageCircle, Users, Send, Plus } from "lucide-react"

export default function ChatwootPage() {
    // Estas variables (estados) guardan lo que escribes en los inputs
    const [nombre, setNombre] = useState("")
    const [telefono, setTelefono] = useState("")
    
    // Esta es una lista temporal para ver en pantalla a quiénes vamos agregando
    const [mayoristas, setMayoristas] = useState<{nombre: string, telefono: string}[]>([])

    // Función que se ejecuta al presionar "Agendar Mayorista"
    const handleAgregar = (e: React.FormEvent) => {
        e.preventDefault() // Evita que la página se recargue
        if (!nombre || !telefono) return
        
        // Agregamos el nuevo cliente a nuestra lista visual
        setMayoristas([...mayoristas, { nombre, telefono }])
        
        // Limpiamos los casilleros para poder agregar el siguiente
        setNombre("")
        setTelefono("")
    }

    // Función que se ejecuta al presionar "Enviar Mensajes a Todos"
    const handleEnviarDifusion = async () => {
        if (mayoristas.length === 0) {
            alert("Agrega al menos un mayorista antes de enviar.")
            return
        }
        
        // Mensaje temporal hasta que lo conectemos con n8n
        alert("¡Botón presionado! En el próximo paso conectaremos esto con tu Webhook de n8n.")
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <MessageCircle className="h-8 w-8 text-teal-600" />
                    Gestión Chatwoot y Difusión
                </h1>
                <p className="text-gray-500">Administra tus contactos mayoristas y envía plantillas de WhatsApp.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. TARJETA PARA AGREGAR MAYORISTAS */}
                <Card className="border-t-4 border-t-teal-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Users className="h-5 w-5 text-teal-600" />
                            Agendar Nuevo Mayorista
                        </CardTitle>
                        <CardDescription>
                            Ingresa los datos del cliente para agregarlo a la lista de difusión.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAgregar} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nombre">Nombre / Empresa</Label>
                                <Input 
                                    id="nombre" 
                                    placeholder="Ej: Repuestos Córdoba" 
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="telefono">Número de WhatsApp</Label>
                                <Input 
                                    id="telefono" 
                                    placeholder="Ej: 5493512345678" 
                                    value={telefono}
                                    onChange={(e) => setTelefono(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-gray-500">Ingresar código de país y área sin el +. Ej: 549 para Argentina seguido del número local.</p>
                            </div>
                            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2">
                                <Plus size={18} />
                                Agregar a la lista
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* 2. TARJETA PARA ENVIAR LA DIFUSIÓN */}
                <Card className="border-t-4 border-t-emerald-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Send className="h-5 w-5 text-emerald-600" />
                            Enviar Difusión
                        </CardTitle>
                        <CardDescription>
                            Dispara la plantilla de Meta a todos los mayoristas en la lista.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        
                        {/* Aquí mostramos un resumen de tu plantilla de Meta */}
                        <div className="bg-slate-50 p-4 rounded-md border text-sm text-slate-700">
                            <p className="font-semibold mb-2">Plantilla Autorizada a enviar:</p>
                            <p className="italic">"Hola 👋! Te contactamos de Revolución Motos. Tenemos nuevo stock mayorista disponible..."</p>
                        </div>
                        
                        <div className="pt-2">
                            <p className="text-sm font-medium mb-2">Contactos listos para recibir ({mayoristas.length}):</p>
                            
                            {/* Si no hay nadie agregado, mostramos un aviso. Si hay, mostramos la lista. */}
                            {mayoristas.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No hay clientes agregados todavía.</p>
                            ) : (
                                <ul className="text-sm text-gray-600 mb-4 bg-white border rounded-md p-2 max-h-32 overflow-y-auto">
                                    {mayoristas.map((m, index) => (
                                        <li key={index} className="border-b last:border-0 py-1">
                                            <span className="font-medium">{m.nombre}</span> - {m.telefono}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <Button 
                            onClick={handleEnviarDifusion} 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            disabled={mayoristas.length === 0} // El botón se apaga si la lista está vacía
                        >
                            <Send size={18} />
                            Enviar Mensajes a Todos
                        </Button>
                    </CardContent>
                </Card>

            </div>
        </div>
    )
}
