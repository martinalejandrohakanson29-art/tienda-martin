"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MessageCircle, Users, Send, Plus, Loader2, Database } from "lucide-react"

// Importamos la acción que trae los datos de tu base. 
// (Si tu función se llama distinto dentro de ese archivo, podés cambiarle el nombre aquí)
import { getMayoristas } from "@/app/actions/mayoristas"

export default function ChatwootPage() {
    // Estados para el formulario de arriba
    const [nombre, setNombre] = useState("")
    const [telefono, setTelefono] = useState("")
    
    // Lista de clientes a los que se les va a enviar el mensaje AHORA
    const [mayoristasDifusion, setMayoristasDifusion] = useState<{nombre: string, telefono: string}[]>([])
    const [enviando, setEnviando] = useState(false)

    // NUEVO: Estados para la Base de Datos de abajo
    const [dbMayoristas, setDbMayoristas] = useState<any[]>([])
    const [cargandoDb, setCargandoDb] = useState(true)

    // Al cargar la página, vamos a buscar todos los mayoristas guardados
    useEffect(() => {
        const fetchMayoristas = async () => {
            try {
                setCargandoDb(true)
                // Llamamos a tu Server Action
                const data = await getMayoristas()
                // Guardamos los datos recibidos (si no hay nada, ponemos un array vacío)
                setDbMayoristas(data || [])
            } catch (error) {
                console.error("Error al cargar la base de datos de mayoristas:", error)
            } finally {
                setCargandoDb(false)
            }
        }
        
        fetchMayoristas()
    }, [])

    // Agregar desde el formulario manual
    const handleAgregarManual = (e: React.FormEvent) => {
        e.preventDefault()
        if (!nombre || !telefono) return
        
        setMayoristasDifusion([...mayoristasDifusion, { nombre, telefono }])
        setNombre("")
        setTelefono("")
    }

    // Agregar directo desde la tabla de abajo
    const handleAgregarDesdeDb = (mayorista: { nombre: string, telefono: string }) => {
        // Chequeamos que no esté ya en la lista para no mandar doble
        const yaExiste = mayoristasDifusion.some(m => m.telefono === mayorista.telefono)
        if (!yaExiste) {
            setMayoristasDifusion([...mayoristasDifusion, { nombre: mayorista.nombre, telefono: mayorista.telefono }])
        }
    }

    // Enviar a n8n
    const handleEnviarDifusion = async () => {
        if (mayoristasDifusion.length === 0) return
        
        setEnviando(true)
        try {
            const respuesta = await fetch("/api/chatwoot/difusion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mayoristas: mayoristasDifusion }),
            })

            if (respuesta.ok) {
                alert("¡Excelente! Los datos se enviaron a n8n correctamente.")
                setMayoristasDifusion([]) // Vaciamos la cola de envío
            } else {
                alert("Hubo un problema de conexión con n8n. Revisa la consola.")
            }
        } catch (error) {
            alert("Error crítico al intentar conectar con el servidor.")
        } finally {
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
                <p className="text-gray-500">Administra tus contactos mayoristas y envía plantillas de WhatsApp de Revolución Motos.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* TARJETA 1: FORMULARIO */}
                <Card className="border-t-4 border-t-teal-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Users className="h-5 w-5 text-teal-600" />
                            Agendar Manualmente
                        </CardTitle>
                        <CardDescription>
                            Ingresa un cliente nuevo que no esté en la base.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAgregarManual} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nombre">Nombre / Empresa</Label>
                                <Input 
                                    id="nombre" 
                                    placeholder="Ej: Repuestos Córdoba" 
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
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
                                    disabled={enviando}
                                />
                            </div>
                            <Button type="submit" disabled={enviando || (!nombre || !telefono)} className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2">
                                <Plus size={18} />
                                Agregar a la cola de envío
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* TARJETA 2: ENVIAR DIFUSIÓN */}
                <Card className="border-t-4 border-t-emerald-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Send className="h-5 w-5 text-emerald-600" />
                            Cola de Envío
                        </CardTitle>
                        <CardDescription>
                            Contactos listos para recibir la plantilla de Meta.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-md border text-sm text-slate-700">
                            <p className="font-semibold mb-2">Plantilla Autorizada:</p>
                            <p className="italic">"Hola 👋! Te contactamos de Revolución Motos. Tenemos nuevo stock..."</p>
                        </div>
                        
                        <div className="pt-2">
                            <p className="text-sm font-medium mb-2">Listos para enviar ({mayoristasDifusion.length}):</p>
                            
                            {mayoristasDifusion.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No hay clientes en la cola todavía.</p>
                            ) : (
                                <ul className="text-sm text-gray-600 mb-4 bg-white border rounded-md p-2 max-h-32 overflow-y-auto">
                                    {mayoristasDifusion.map((m, index) => (
                                        <li key={index} className="border-b last:border-0 py-1 flex justify-between items-center">
                                            <span><span className="font-medium">{m.nombre}</span> - {m.telefono}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <Button 
                            onClick={handleEnviarDifusion} 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            disabled={mayoristasDifusion.length === 0 || enviando} 
                        >
                            {enviando ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    Enviando a n8n...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Enviar Difusión
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* TARJETA 3: BASE DE DATOS DE MAYORISTAS */}
            <Card className="border-t-4 border-t-blue-500 shadow-md mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Database className="h-5 w-5 text-blue-600" />
                        Base de Datos de Mayoristas
                    </CardTitle>
                    <CardDescription>
                        Directorio completo de clientes guardados. Añádelos rápidamente a la cola de envío.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {cargandoDb ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <Loader2 className="h-8 w-8 animate-spin mb-2" />
                            <p>Cargando registros...</p>
                        </div>
                    ) : dbMayoristas.length === 0 ? (
                        <p className="text-center py-8 text-gray-500 italic">No hay mayoristas registrados en la base de datos todavía.</p>
                    ) : (
                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Nombre / Empresa</TableHead>
                                        <TableHead>WhatsApp</TableHead>
                                        <TableHead className="text-right">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dbMayoristas.map((mayorista, index) => (
                                        <TableRow key={mayorista.id || index}>
                                            <TableCell className="font-medium">{mayorista.nombre}</TableCell>
                                            <TableCell>{mayorista.telefono}</TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm"
                                                    className="hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                                                    onClick={() => handleAgregarDesdeDb(mayorista)}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" /> Difusión
                                                </Button>
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
