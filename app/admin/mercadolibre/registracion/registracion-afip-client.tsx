"use client"

import { useState, useEffect } from "react"
import { getVentasRegistracion } from "@/app/actions/envios"
import { testAfipConnection, facturarVenta } from "@/app/actions/afip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2, Send, RefreshCcw, Wifi, AlertTriangle, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select"

export default function RegistracionAfipClient() {
    const [loading, setLoading] = useState(true)
    const [ventas, setVentas] = useState<any[]>([])
    const [testResult, setTestResult] = useState<any>(null)
    const [testing, setTesting] = useState(false)
    const [billingId, setBillingId] = useState<string | null>(null)

    // Datos para factura manual
    const [manualDoc, setManualDoc] = useState("20269957361")
    const [manualMonto, setManualMonto] = useState("100")
    const [manualDocTipo, setManualDocTipo] = useState("80")
    const [manualIvaReceptor, setManualIvaReceptor] = useState("5")

    const loadData = async () => {
        setLoading(true)
        const res = await getVentasRegistracion()
        if (res.success) setVentas(res.data)
        setLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [])

    const handleTestConnection = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const res = await testAfipConnection()
            setTestResult(res)
            if (res.success) {
                toast.success("Conexión con AFIP exitosa")
            } else {
                toast.error("Error de conexión: " + res.error)
            }
        } catch (error) {
            toast.error("Error al probar conexión")
        } finally {
            setTesting(false)
        }
    }

    const handleFacturarManual = async () => {
        if (!manualDoc || !manualMonto) {
            toast.error("Completa los datos para la factura manual")
            return
        }

        try {
            setTesting(true)
            const res = await facturarVenta({
                monto: parseFloat(manualMonto),
                docTipo: parseInt(manualDocTipo),
                docNro: parseInt(manualDoc.replace(/-/g, '')),
                ivaReceptor: parseInt(manualIvaReceptor),
                concepto: 1 // Productos
            })

            if (res.success) {
                toast.success(`Factura emitida: CAE ${res.cae}`)
                console.log("Resultado ARCA:", res)
            } else {
                toast.error("Error: " + res.error)
            }
        } catch (error: any) {
            toast.error("Error en la solicitud: " + error.message)
        } finally {
            setTesting(false)
        }
    }

    const handleFacturarVenta = async (venta: any) => {
        setBillingId(venta.shippingId)
        try {
            // Nota: En un sistema real, sacaríamos el CUIT del cliente si lo tenemos.
            // Para testeo, usamos consumidor final (DocTipo 99, DocNro 0) si es menor a cierto monto,
            // o pedimos el CUIT. Por ahora usamos un CUIT de prueba o consumidor final.
            
            const monto = Number(venta.neto || venta.bruto || 0)
            if (monto <= 0) {
                toast.error("La venta no tiene un monto válido")
                return
            }

            const res = await facturarVenta({
                monto: monto,
                docTipo: 99, // Consumidor Final
                docNro: 0,
                ivaReceptor: 5, // Consumidor Final (Mandatorio RG 5616)
                concepto: 1
            })

            if (res.success) {
                toast.success(`¡Venta ${venta.shippingId} facturada! CAE: ${res.cae}`)
                // Aquí podrías actualizar el estado de la venta en la DB si tuvieras un campo 'facturada'
            } else {
                toast.error("Error al facturar: " + res.error)
            }
        } catch (error: any) {
            toast.error("Error: " + error.message)
        } finally {
            setBillingId(null)
        }
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Cabecera y Test */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Wifi className="h-5 w-5 text-blue-500" />
                            Estado de Conexión ARCA
                        </h2>
                        <Button 
                            onClick={handleTestConnection} 
                            disabled={testing}
                            variant="outline"
                            className="rounded-xl"
                        >
                            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                            Probar Conexión
                        </Button>
                    </div>

                    {testResult && (
                        <div className={`p-4 rounded-xl border ${testResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <div className="flex items-start gap-3">
                                {testResult.success ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                                ) : (
                                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                                )}
                                <div>
                                    <p className={`font-bold text-sm ${testResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {testResult.success ? 'Conexión Exitosa' : 'Fallo de Conexión'}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1">{testResult.message || testResult.error}</p>
                                    {testResult.environment && (
                                        <Badge variant="outline" className="mt-2 bg-white font-bold uppercase text-[10px]">
                                            Entorno: {testResult.environment}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Send className="h-5 w-5 text-emerald-500" />
                        Prueba de Facturación Manual
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs uppercase font-black text-slate-400">Tipo Doc</Label>
                            <Select value={manualDocTipo} onValueChange={setManualDocTipo}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="80">CUIT</SelectItem>
                                    <SelectItem value="96">DNI</SelectItem>
                                    <SelectItem value="86">CUIL</SelectItem>
                                    <SelectItem value="99">Sin Doc (Cons. Final)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs uppercase font-black text-slate-400">Condición IVA</Label>
                            <Select value={manualIvaReceptor} onValueChange={setManualIvaReceptor}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5">Consumidor Final</SelectItem>
                                    <SelectItem value="1">Resp. Inscripto</SelectItem>
                                    <SelectItem value="6">Monotributista</SelectItem>
                                    <SelectItem value="4">Exento</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs uppercase font-black text-slate-400">CUIT / Doc</Label>
                            <Input 
                                value={manualDoc} 
                                onChange={(e) => setManualDoc(e.target.value)}
                                className="rounded-xl font-mono"
                                placeholder="20..."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs uppercase font-black text-slate-400">Monto ($)</Label>
                            <Input 
                                type="number"
                                value={manualMonto} 
                                onChange={(e) => setManualMonto(e.target.value)}
                                className="rounded-xl font-mono"
                            />
                        </div>
                    </div>
                    <Button 
                        onClick={handleFacturarManual} 
                        disabled={testing}
                        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                        {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                        Emitir Factura de Prueba
                    </Button>
                </div>
            </div>

            {/* Listado de Ventas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Ventas para Registración</h2>
                        <p className="text-sm text-slate-500">Ventas recolectadas desde n8n listas para facturar.</p>
                    </div>
                    <Button onClick={loadData} variant="ghost" size="sm" className="rounded-xl text-blue-600 font-bold">
                        <RefreshCcw className="h-4 w-4 mr-2" /> Actualizar Lista
                    </Button>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/50">
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500">Envío</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500">Cliente</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-right">Monto Neto</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-center">Categoría</TableHead>
                            <TableHead className="font-bold text-[11px] uppercase text-slate-500 text-center">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                                    Cargando ventas...
                                </TableCell>
                            </TableRow>
                        ) : ventas.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-12 text-center text-slate-400 italic">
                                    No hay ventas pendientes de registración.
                                </TableCell>
                            </TableRow>
                        ) : (
                            ventas.map((venta) => (
                                <TableRow key={venta.shippingId} className="hover:bg-slate-50/30">
                                    <TableCell className="font-mono text-xs font-bold text-slate-600">
                                        {venta.shippingId}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium">
                                        {venta.nombre || "Cliente ML"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-emerald-600">
                                        ${Number(venta.neto || venta.bruto || 0).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline" className="text-[10px] font-black uppercase">
                                            {venta.categoria}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button 
                                            size="sm" 
                                            onClick={() => handleFacturarVenta(venta)}
                                            disabled={billingId === venta.shippingId}
                                            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 text-xs font-bold"
                                        >
                                            {billingId === venta.shippingId ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Send className="h-3 w-3 mr-2" />}
                                            Facturar
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
                <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
                <div className="space-y-2">
                    <h3 className="text-amber-800 font-bold text-sm">Aviso de Entorno</h3>
                    <p className="text-xs text-amber-700 leading-relaxed">
                        Esta sección está en modo <strong>Homologación</strong> por defecto. Para pasar a <strong>Producción</strong>, 
                        debes configurar las variables de entorno correspondientes y asegurarte de tener los certificados oficiales de AFIP delegados correctamente.
                    </p>
                </div>
            </div>
        </div>
    )
}
