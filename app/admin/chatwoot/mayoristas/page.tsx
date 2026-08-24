"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MessageCircle, Database, Send, Save, Loader2, Image as ImageIcon, FileText, Video, Type, Play, Eye } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Importamos las acciones para guardar y leer la base de datos
import { getMayoristas, createMayorista } from "@/app/actions/mayoristas"

export default function MayoristasPage() {
    // -------------------------------------------------------------------------
    // ESTADOS (VARIABLES) DE LA PANTALLA
    // -------------------------------------------------------------------------

    // 1. Estados para agregar un cliente a mano
    const [nombre, setNombre] = useState("")
    const [telefono, setTelefono] = useState("")
    const [guardando, setGuardando] = useState(false)

    // 2. Estados para la tabla de clientes guardados
    const [dbMayoristas, setDbMayoristas] = useState<any[]>([])
    const [cargandoDb, setCargandoDb] = useState(true)
    const [enviando, setEnviando] = useState(false)

    // 3. ESTADOS PARA LA PLANTILLA (Aquí están los campos exactos de tu n8n)
    const [plantilla, setPlantilla] = useState({
        titulo: "",
        descripcion1: "",
        descripcion2: "",
        precio: "",
        url_foto: ""
    })

    // 4. Tipo de archivo adjunto para la difusión
    const [tipoAdjunto, setTipoAdjunto] = useState<"imagen" | "pdf" | "video" | "texto">("imagen")

    // Función que actualiza lo que escribes en los casilleros de la plantilla
    const handlePlantillaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPlantilla({
            ...plantilla,
            [e.target.id]: e.target.value
        })
    }

    // -------------------------------------------------------------------------
    // VISTA PREVIA: arma el mensaje EXACTO como lo arma n8n con cada plantilla
    // de Meta (letra fija + variables), para saber cómo le va a llegar al cliente.
    // -------------------------------------------------------------------------
    const getVistaPrevia = (): { header: null | { tipo: "imagen"; url: string } | { tipo: "video" } | { tipo: "documento"; nombre: string }, cuerpo: string } => {
        const titulo = plantilla.titulo || "..."

        if (tipoAdjunto === "imagen") {
            return {
                header: { tipo: "imagen", url: plantilla.url_foto },
                cuerpo: `🔥 ${titulo} 🔥\n${plantilla.descripcion1 || "..."}\n${plantilla.descripcion2 || "..."}\n💰 Precio: ${plantilla.precio || "..."}\nConsultanos disponibilidad para envío inmediato.`
            }
        }
        if (tipoAdjunto === "pdf") {
            return {
                header: { tipo: "documento", nombre: "Lista_de_Precios.pdf" },
                cuerpo: `Hola gente! \n\n${titulo}\n\nPara visualizarla correctamente lo ideal es abrirla en Computadora. Cualquier duda nos escriben al numero de siempre. Saludos!`
            }
        }
        if (tipoAdjunto === "video") {
            return {
                header: { tipo: "video" },
                cuerpo: `Mira el siguiente video\n\n${titulo}\n\nConsultanos`
            }
        }
        // texto
        return {
            header: null,
            cuerpo: `Gente querida! como va?\n\n${titulo}\n\nescribinos cualquier consulta`
        }
    }

    // -------------------------------------------------------------------------
    // FUNCIONES DE LA BASE DE DATOS Y BOTONES
    // -------------------------------------------------------------------------

    // Traer los clientes de la base de datos
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

    // Cargar clientes apenas abrimos la página
    useEffect(() => {
        fetchMayoristas()
    }, [])

    // Guardar un cliente nuevo a mano
    const handleGuardarEnBD = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nombre || !telefono) return

        setGuardando(true)
        try {
            await createMayorista({ nombre, telefono })
            setNombre("")
            setTelefono("")
            await fetchMayoristas()
            alert("¡Mayorista guardado correctamente en la Base de Datos!")
        } catch (error) {
            console.error("Error al guardar:", error)
            alert("Hubo un error al intentar guardar. Revisa que el número no esté duplicado.")
        } finally {
            setGuardando(false)
        }
    }

    // ENVIAR TODO A n8n (Contactos + Textos de la Plantilla)
    const handleEnviarDifusion = async () => {
        if (dbMayoristas.length === 0) return

        // Validación según tipo de adjunto
        if (tipoAdjunto === "imagen" && (!plantilla.titulo || !plantilla.precio)) {
            alert("Por favor, completa al menos el Título y el Precio para enviar la difusión.")
            return
        }
        if (tipoAdjunto === "pdf" && (!plantilla.titulo || !plantilla.url_foto)) {
            alert("Por favor, completa el texto del mensaje y el link del PDF para enviar la difusión.")
            return
        }
        if (tipoAdjunto === "video" && (!plantilla.titulo || !plantilla.url_foto)) {
            alert("Por favor, completa el texto del mensaje y el link del video para enviar la difusión.")
            return
        }
        if (tipoAdjunto === "texto" && !plantilla.titulo) {
            alert("Por favor, completa el texto del mensaje para enviar la difusión.")
            return
        }

        setEnviando(true)
        try {
            const respuesta = await fetch("/api/chatwoot/difusion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mayoristas: dbMayoristas,
                    mensaje: plantilla,
                    tipo_adjunto: tipoAdjunto
                }),
            })

            if (respuesta.ok) {
                alert(`¡Excelente! Se envió la orden a n8n para contactar a ${dbMayoristas.length} mayoristas con esta promoción.`)
            } else {
                alert("Hubo un problema de conexión con n8n. Revisa la consola.")
            }
        } catch (error) {
            alert("Error crítico al intentar conectar con el servidor web.")
        } finally {
            setEnviando(false)
        }
    }

    // -------------------------------------------------------------------------
    // DISEÑO VISUAL DE LA PANTALLA (HTML/UI)
    // -------------------------------------------------------------------------
    return (
        <div className="space-y-6 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <MessageCircle className="h-8 w-8 text-teal-600" />
                    Mensajes Mayoristas
                </h1>
                <p className="text-gray-500">Administra el directorio de mayoristas y envía promociones masivas con imagen.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* ---------------- TARJETA 1: AGENDAR ---------------- */}
                <Card className="border-t-4 border-t-teal-500 shadow-md h-fit">
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

                {/* ---------------- TARJETA 2: LA PLANTILLA Y EL BOTÓN DE ENVÍO ---------------- */}
                <Card className="border-t-4 border-t-emerald-500 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Send className="h-5 w-5 text-emerald-600" />
                            Preparar Difusión Masiva
                        </CardTitle>
                        <CardDescription>
                            Completa los datos de la promoción para enviarla a la base.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        {/* CASILLEROS PARA LA PLANTILLA */}
                        <div className="space-y-3 bg-slate-50 p-4 rounded-md border border-slate-200">
                            {/* TIPO DE ADJUNTO: PRIMER CAMPO */}
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                    Tipo de Archivo Adjunto
                                </Label>
                                <Select value={tipoAdjunto} onValueChange={(v) => setTipoAdjunto(v as "imagen" | "pdf" | "video" | "texto")} disabled={enviando}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="imagen">
                                            <span className="flex items-center gap-2">
                                                <ImageIcon size={14} /> Imagen
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="pdf">
                                            <span className="flex items-center gap-2">
                                                <FileText size={14} /> PDF
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="video">
                                            <span className="flex items-center gap-2">
                                                <Video size={14} /> Video
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="texto">
                                            <span className="flex items-center gap-2">
                                                <Type size={14} /> Solo texto
                                            </span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {tipoAdjunto === "imagen" ? (
                                <>
                                    {/* CAMPOS IMAGEN: título, descripciones, precio, url */}
                                    <div className="space-y-1 pt-2 border-t mt-2">
                                        <Label htmlFor="titulo" className="text-xs font-bold text-slate-500 uppercase">Título del Producto</Label>
                                        <Input id="titulo" placeholder="Ej: TAPA CDI 125" value={plantilla.titulo} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="descripcion1" className="text-xs font-bold text-slate-500 uppercase">Descripción 1</Label>
                                            <Input id="descripcion1" placeholder="Ej: * IDEAL POTENCIACION" value={plantilla.descripcion1} onChange={handlePlantillaChange} disabled={enviando} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="descripcion2" className="text-xs font-bold text-slate-500 uppercase">Descripción 2</Label>
                                            <Input id="descripcion2" placeholder="Ej: * MAS POTENCIA" value={plantilla.descripcion2} onChange={handlePlantillaChange} disabled={enviando} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="precio" className="text-xs font-bold text-slate-500 uppercase">Precio</Label>
                                        <Input id="precio" placeholder="Ej: $115.000" value={plantilla.precio} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="url_foto" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <ImageIcon size={14} /> Link de la Imagen (URL)
                                        </Label>
                                        <Input id="url_foto" placeholder="https://res.cloudinary.com/..." value={plantilla.url_foto} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                </>
                            ) : tipoAdjunto === "pdf" ? (
                                <>
                                    {/* CAMPOS PDF: texto {{1}} + URL */}
                                    <div className="space-y-1 pt-2 border-t mt-2">
                                        <Label htmlFor="titulo" className="text-xs font-bold text-slate-500 uppercase">
                                            Texto del mensaje <span className="text-emerald-600 normal-case font-mono">{"{{1}}"}</span>
                                        </Label>
                                        <Input id="titulo" placeholder="Ej: Lista de precios Mayo 2025" value={plantilla.titulo} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="url_foto" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <FileText size={14} /> Link del PDF (URL)
                                        </Label>
                                        <Input id="url_foto" placeholder="https://res.cloudinary.com/..." value={plantilla.url_foto} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                </>
                            ) : tipoAdjunto === "video" ? (
                                <>
                                    {/* CAMPOS VIDEO: texto {{1}} ("Mira el siguiente video {{1}} Consultanos") + URL */}
                                    <div className="space-y-1 pt-2 border-t mt-2">
                                        <Label htmlFor="titulo" className="text-xs font-bold text-slate-500 uppercase">
                                            Texto del mensaje <span className="text-emerald-600 normal-case font-mono">{"{{1}}"}</span>
                                        </Label>
                                        <Input id="titulo" placeholder="Ej: ESCAPE PAOLUCCI 110 STAGE 2" value={plantilla.titulo} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="url_foto" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Video size={14} /> Link del Video (URL)
                                        </Label>
                                        <Input id="url_foto" placeholder="https://drive.google.com/file/d/..." value={plantilla.url_foto} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* CAMPOS TEXTO: solo texto {{1}} ("Gente querida! como va? {{1}} escribinos cualquier consulta"), sin adjunto */}
                                    <div className="space-y-1 pt-2 border-t mt-2">
                                        <Label htmlFor="titulo" className="text-xs font-bold text-slate-500 uppercase">
                                            Texto del mensaje <span className="text-emerald-600 normal-case font-mono">{"{{1}}"}</span>
                                        </Label>
                                        <Input id="titulo" placeholder="Ej: Este finde tenemos descuentos especiales en escapes" value={plantilla.titulo} onChange={handlePlantillaChange} disabled={enviando} />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ---------------- VISTA PREVIA: como le va a llegar EXACTO al cliente ---------------- */}
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Eye size={14} /> Vista previa (así le va a llegar al cliente)
                            </Label>
                            {(() => {
                                const preview = getVistaPrevia()
                                return (
                                    <div className="bg-[#e5ddd5] rounded-md p-4 flex justify-end">
                                        <div className="max-w-[85%] bg-[#dcf8c6] rounded-lg rounded-tr-none shadow-sm overflow-hidden">
                                            {preview.header?.tipo === "imagen" && (
                                                preview.header.url ? (
                                                    <img
                                                        src={preview.header.url}
                                                        alt="Vista previa"
                                                        className="w-full h-40 object-cover bg-slate-200"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                                                    />
                                                ) : (
                                                    <div className="w-full h-40 bg-slate-300 flex flex-col items-center justify-center text-slate-500 gap-1">
                                                        <ImageIcon size={28} />
                                                        <span className="text-xs">Sin imagen cargada</span>
                                                    </div>
                                                )
                                            )}
                                            {preview.header?.tipo === "video" && (
                                                <div className="w-full h-40 bg-slate-800 flex items-center justify-center">
                                                    <div className="h-12 w-12 rounded-full bg-white/80 flex items-center justify-center">
                                                        <Play size={22} className="text-slate-800 ml-1" fill="currentColor" />
                                                    </div>
                                                </div>
                                            )}
                                            {preview.header?.tipo === "documento" && (
                                                <div className="flex items-center gap-2 p-3 bg-white/60 border-b border-black/5">
                                                    <FileText size={26} className="text-red-500 shrink-0" />
                                                    <span className="text-sm font-medium text-slate-700">{preview.header.nombre}</span>
                                                </div>
                                            )}
                                            <p className="px-3 py-2 text-sm text-slate-800 whitespace-pre-line">{preview.cuerpo}</p>
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>

                        <div className="pt-2 text-center py-3 bg-emerald-50 border border-emerald-100 rounded-md">
                            <p className="text-sm text-emerald-800 font-medium mb-1">Destinatarios totales:</p>
                            <p className="text-3xl font-bold text-emerald-600">
                                {cargandoDb ? "..." : dbMayoristas.length}
                            </p>
                        </div>

                        {/* BOTÓN MÁGICO QUE ENVÍA A n8n */}
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
                                    Enviar Promoción a TODOS
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* ---------------- TARJETA 3: TABLA ---------------- */}
            <Card className="border-t-4 border-t-blue-500 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Database className="h-5 w-5 text-blue-600" />
                        Base de Datos de Mayoristas
                    </CardTitle>
                    <CardDescription>
                        Directorio de clientes que recibirán la difusión.
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
