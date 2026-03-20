"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MessageCircle, Database, Send, Save, Loader2 } from "lucide-react"

// Importamos las acciones que actualizamos en el Paso 1
import { getMayoristas, createMayorista } from "@/app/actions/mayoristas"

export default function ChatwootPage() {
    // Estados para el formulario de carga manual
    const [nombre, setNombre] = useState("")
    const [telefono, setTelefono] = useState("")
    const [guardando, setGuardando] = useState(false)
    
    // Estados para la Base de Datos y la tabla
    const [dbMayoristas, setDbMayoristas] = useState<any[]>([])
    const [cargandoDb, setCargandoDb] = useState(true)
    const [enviando, setEnviando] = useState(false)

    // Función que busca los datos en la tabla NumerosMayoristas
    const fetchMayoristas = async () => {
        try {
            setCargandoDb(true)
            const data = await getMayoristas()
            setDbMayoristas(data || [])
        } catch (error) {
            console.error("Error al cargar la base de datos:", error)
        } finally {
            setCargandoDb(false)
        }
    }

    // Ejecutamos la búsqueda apenas entramos a la página
    useEffect(() => {
        fetchMayoristas()
    }, [])

    // Función que se activa al presionar el botón del formulario
    const handleGuardarEnBD = async (e: React.FormEvent) => {
        e.preventDefault() // Evita que la página se recargue
        if (!nombre || !telefono) return
        
        setGuardando(true)
        try {
            // 1. Guardamos en la base de datos llamando a nuestra acción
            await createMayorista({ nombre, telefono })
            
            // 2. Vaciamos los casilleros para poder cargar el siguiente cliente
            setNombre("")
            setTelefono("")
            
            // 3. Volvemos a pedirle a la base de datos la lista actualizada para que aparezca en la tabla
            await fetchMayoristas()
            
            alert("¡Mayorista guardado correctamente en la Base de Datos!")
        } catch (error) {
            console.error("Error al guardar:", error)
            alert("Hubo un error al intentar guardar. Revisa que el número no esté duplicado.")
        } finally {
            setGuardando(false)
        }
    }

    // Función para el botón de difusión masiva
    const handleEnviarDifusion = async () => {
        if (dbMayoristas.length === 0) return
        
        setEnviando(true)
        try {
            const respuesta = await fetch("/api/chatwoot/difusion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mayoristas: dbMayoristas }),
            })

            if (respuesta.ok) {
                alert(`¡Excelente! Se envió la orden a n8n para contactar a los ${dbMayoristas.length} mayoristas de tu base.`)
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
                <p className="text-gray-500">Administra el directorio de mayoristas y envía difusiones masivas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* TARJETA 1: AGENDAR MANUALMENTE EN BASE DE DATOS */}
                <Card className="border-t-4 border-t-teal-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Database className="h-5 w-5 text-teal-600" />
                            Agendar Manualmente
                        </CardTitle>
                        <CardDescription>
                            Ingresa un cliente nuevo que no esté en la base.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleGuardarEnBD} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="nombre">Nombre / Empresa</Label>
                                <Input 
                                    id="nombre" 
                                    placeholder="Ej: Repuestos Córdoba" 
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    disabled={guardando || enviando}
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
                                    disabled={guardando || enviando}
                                    required
                                />
                            </div>
                            <Button type="submit" disabled={guardando || enviando || !nombre || !telefono} className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2">
                                {guardando ? (
                                    <><Loader2 className="animate-spin h-4 w-4" /> Guardando...</>
                                ) : (
                                    <><Save size={18} /> Guardar en Base de Datos</>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* TARJETA 2: ENVIAR DIFUSIÓN A TODOS LOS DE LA BASE */}
                <Card className="border-t-4 border-t-emerald-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Send className="h-5 w-5 text-emerald-600" />
                            Difusión Masiva
                        </CardTitle>
                        <CardDescription>
                            Se enviará la plantilla a TODOS los contactos de la tabla.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-md border text-sm text-slate-700">
                            <p className="font-semibold mb-2">Plantilla Autorizada:</p>
                            <p className="italic">"Hola 👋! Te contactamos de Revolución Motos. Tenemos nuevo stock..."</p>
                        </div>
                        
                        <div className="pt-2 text-center py-4 bg-emerald-50 border border-emerald-100 rounded-md">
                            <p className="text-sm text-emerald-800 font-medium mb-1">Destinatarios en Base de Datos:</p>
                            <p className="text-3xl font-bold text-emerald-600">
                                {cargandoDb ? "..." : dbMayoristas.length}
                            </p>
                        </div>

                        <Button 
                            onClick={handleEnviarDifusion} 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-12 text-lg"
                            disabled={cargandoDb || dbMayoristas.length === 0 || enviando} 
                        >
                            {enviando ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    Transmitiendo a n8n...
                                </>
                            ) : (
                                <>
                                    <Send size={20} />
                                    Enviar Difusión a TODOS
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* TARJETA 3: TABLA DE BASE DE DATOS DE MAYORISTAS */}
            <Card className="border-t-4 border-t-blue-500 shadow-md mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Database className="h-5 w-5 text-blue-600" />
                        Base de Datos de Mayoristas
                    </CardTitle>
                    <CardDescription>
                        Directorio completo de clientes guardados. Estos son los que recibirán la difusión.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {cargandoDb ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <Loader2 className="h-8 w-8 animate-spin mb-2" />
                            <p>Cargando registros de la base de datos...</p>
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
                                        <TableHead>Fecha de Registro</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dbMayoristas.map((mayorista) => (
                                        <TableRow key={mayorista.id}>
                                            <TableCell className="font-medium">{mayorista.nombre || "Sin nombre"}</TableCell>
                                            <TableCell>{mayorista.telefono}</TableCell>
                                            <TableCell className="text-gray-500 text-sm">
                                                {new Date(mayorista.createdAt).toLocaleDateString()}
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
