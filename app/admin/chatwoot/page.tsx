"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MessageCircle, Users, Send, Plus, Loader2 } from "lucide-react"

export default function ChatwootPage() {
    const [nombre, setNombre] = useState("")
    const [telefono, setTelefono] = useState("")
    const [mayoristas, setMayoristas] = useState<{nombre: string, telefono: string}[]>([])
    
    // Nuevo: una variable para saber si estamos esperando la respuesta de n8n
    const [enviando, setEnviando] = useState(false)

    const handleAgregar = (e: React.FormEvent) => {
        e.preventDefault()
        if (!nombre || !telefono) return
        
        setMayoristas([...mayoristas, { nombre, telefono }])
        setNombre("")
        setTelefono("")
    }

    const handleEnviarDifusion = async () => {
        if (mayoristas.length === 0) return
        
        // Prendemos el estado de "cargando"
        setEnviando(true)
        
        try {
            // Llamamos a nuestro intermediario (la ruta API que creamos en el paso 3)
            const respuesta = await fetch("/api/chatwoot/difusion", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ mayoristas }), // Mandamos la lista
            })

            if (respuesta.ok) {
                alert("¡Excelente! Los datos se enviaron a n8n correctamente.")
                setMayoristas([]) // Vaciamos la lista porque ya se mandó
            } else {
                alert("Hubo un problema de conexión con n8n. Revisa la consola.")
            }
        } catch (error) {
            alert("Error crítico al intentar conectar con el servidor.")
        } finally {
            // Apagamos el estado de "cargando" sin importar si salió bien o mal
            setEnviando(false)
        }
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
                                    disabled={enviando}
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
                                    disabled={enviando}
                                />
                                <p className="text-xs text-gray-500">Ingresar código de país y área sin el +. Ej: 549 para Argentina seguido del número local.</p>
                            </div>
                            <Button type="submit" disabled={enviando} className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2">
                                <Plus size={18} />
                                Agregar a la lista
                            </Button>
                        </form>
                    </CardContent>
                </Card>

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
                        
                        <div className="bg-slate-50 p-4 rounded-md border text-sm text-slate-700">
                            <p className="font-semibold mb-2">Plantilla Autorizada a enviar:</p>
                            <p className="italic">"Hola 👋! Te contactamos de Revolución Motos. Tenemos nuevo stock mayorista disponible..."</p>
                        </div>
                        
                        <div className="pt-2">
                            <p className="text-sm font-medium mb-2">Contactos listos para recibir ({mayoristas.length}):</p>
                            
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
                            disabled={mayoristas.length === 0 || enviando} 
                        >
                            {enviando ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    Enviando a n8n...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Enviar Mensajes a Todos
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

            </div>
        </div>
    )
}
