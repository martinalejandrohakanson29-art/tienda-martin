"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  TrendingUp, 
  DollarSign, 
  Plus, 
  Edit, 
  Trash2,
  Save,
  X,
  BarChart3,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  obtenerRendimientoPorMes,
  guardarRendimiento,
  eliminarRendimiento,
  obtenerTodosRendimientos,
  obtenerAniosDisponibles,
  obtenerMesesDisponibles,
  obtenerGastosPorMes,
  guardarGasto,
  actualizarGasto,
  eliminarGasto,
  obtenerTodosGastos,
  obtenerAniosGastos,
  obtenerMesesGastos,
  type RendimientoData,
  type GastoData,
} from "@/app/actions/rendimiento-negocio";

const UNIDADES_NEGOCIO = [
  { value: "mostrador", label: "Mostrador", color: "bg-blue-500" },
  { value: "mercadolibre", label: "MercadoLibre", color: "bg-yellow-500" },
  { value: "mayorista", label: "Mayorista", color: "bg-green-500" },
  { value: "instagram", label: "Instagram", color: "bg-pink-500" },
];

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const CATEGORIAS_GASTOS = [
  "Alquiler",
  "Servicios (Luz, Gas, Agua)",
  "Internet/Telefono",
  "Sueldos",
  "Insumos",
  "Marketing/Publicidad",
  "Logistica/Envios",
  "Mantenimiento",
  "Impuestos",
  "Otros",
];

export default function RendimientoNegocioClient() {
  // Estado para Rendimiento
  const [rendimientos, setRendimientos] = useState<RendimientoData[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(new Date().getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(new Date().getMonth() + 1);
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);
  const [editingRendimiento, setEditingRendimiento] = useState<RendimientoData | null>(null);
  const [showRendimientoDialog, setShowRendimientoDialog] = useState(false);
  const [expandedMeses, setExpandedMeses] = useState<Set<string>>(new Set());

  // Estado para Gastos
  const [gastos, setGastos] = useState<GastoData[]>([]);
  const [anioGasto, setAnioGasto] = useState<number>(new Date().getFullYear());
  const [mesGasto, setMesGasto] = useState<number>(new Date().getMonth() + 1);
  const [aniosGastos, setAniosGastos] = useState<number[]>([]);
  const [editingGasto, setEditingGasto] = useState<GastoData | null>(null);
  const [showGastoDialog, setShowGastoDialog] = useState(false);
  const [expandedGastosMeses, setExpandedGastosMeses] = useState<Set<string>>(new Set());

  // Formulario Rendimiento
  const [formRendimiento, setFormRendimiento] = useState({
    unidadNegocio: "mostrador",
    ventaTotal: "",
  });

  // Formulario Gasto
  const [formGasto, setFormGasto] = useState({
    categoria: "Alquiler",
    descripcion: "",
    monto: "",
  });

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatos();
  }, []);

  // Cargar datos cuando cambia el mes/año seleccionado
  useEffect(() => {
    cargarRendimientoMes();
  }, [mesSeleccionado, anioSeleccionado]);

  useEffect(() => {
    cargarGastosMes();
  }, [mesGasto, anioGasto]);

  async function cargarDatos() {
    const [todosRendimientos, anios, todosGastos, aniosG] = await Promise.all([
      obtenerTodosRendimientos(),
      obtenerAniosDisponibles(),
      obtenerTodosGastos(),
      obtenerAniosGastos(),
    ]);

    setRendimientos(todosRendimientos);
    setAniosDisponibles(anios.length > 0 ? anios : [new Date().getFullYear()]);
    setGastos(todosGastos);
    setAniosGastos(aniosG.length > 0 ? aniosG : [new Date().getFullYear()]);
  }

  async function cargarRendimientoMes() {
    const datos = await obtenerRendimientoPorMes(mesSeleccionado, anioSeleccionado);
    setRendimientos(prev => {
      // Actualizar solo los del mes/año seleccionado
      const otros = prev.filter(r => !(r.mes === mesSeleccionado && r.anio === anioSeleccionado));
      return [...otros, ...datos];
    });
  }

  async function cargarGastosMes() {
    const datos = await obtenerGastosPorMes(mesGasto, anioGasto);
    setGastos(prev => {
      const otros = prev.filter(g => !(g.mes === mesGasto && g.anio === anioGasto));
      return [...otros, ...datos];
    });
  }

  // Handlers para Rendimiento
  async function handleGuardarRendimiento() {
    if (!formRendimiento.ventaTotal || parseFloat(formRendimiento.ventaTotal) <= 0) {
      toast.error("Ingresa un monto válido para la venta total");
      return;
    }

    const result = await guardarRendimiento({
      mes: mesSeleccionado,
      anio: anioSeleccionado,
      unidadNegocio: formRendimiento.unidadNegocio,
      ventaTotal: parseFloat(formRendimiento.ventaTotal),
    });

    if (result.success) {
      toast.success("Rendimiento guardado correctamente");
      setShowRendimientoDialog(false);
      setFormRendimiento({ unidadNegocio: "mostrador", ventaTotal: "" });
      await cargarDatos();
      await cargarRendimientoMes();
    } else {
      toast.error(result.error);
    }
  }

  async function handleEditarRendimiento(rendimiento: RendimientoData) {
    setEditingRendimiento(rendimiento);
    setFormRendimiento({
      unidadNegocio: rendimiento.unidadNegocio,
      ventaTotal: rendimiento.ventaTotal.toString(),
    });
    setShowRendimientoDialog(true);
  }

  async function handleActualizarRendimiento() {
    if (!editingRendimiento) return;

    const result = await guardarRendimiento({
      mes: mesSeleccionado,
      anio: anioSeleccionado,
      unidadNegocio: formRendimiento.unidadNegocio,
      ventaTotal: parseFloat(formRendimiento.ventaTotal),
    });

    if (result.success) {
      toast.success("Rendimiento actualizado correctamente");
      setShowRendimientoDialog(false);
      setEditingRendimiento(null);
      setFormRendimiento({ unidadNegocio: "mostrador", ventaTotal: "" });
      await cargarDatos();
      await cargarRendimientoMes();
    } else {
      toast.error(result.error);
    }
  }

  async function handleEliminarRendimiento(id: string) {
    if (!confirm("¿Estás seguro de eliminar este rendimiento?")) return;

    const result = await eliminarRendimiento(id);
    if (result.success) {
      toast.success("Rendimiento eliminado");
      await cargarDatos();
      await cargarRendimientoMes();
    } else {
      toast.error(result.error);
    }
  }

  // Handlers para Gastos
  async function handleGuardarGasto() {
    if (!formGasto.monto || parseFloat(formGasto.monto) <= 0) {
      toast.error("Ingresa un monto válido para el gasto");
      return;
    }

    const result = await guardarGasto({
      categoria: formGasto.categoria,
      descripcion: formGasto.descripcion || undefined,
      monto: parseFloat(formGasto.monto),
      mes: mesGasto,
      anio: anioGasto,
    });

    if (result.success) {
      toast.success("Gasto guardado correctamente");
      setShowGastoDialog(false);
      setFormGasto({ categoria: "Alquiler", descripcion: "", monto: "" });
      await cargarDatos();
      await cargarGastosMes();
    } else {
      toast.error(result.error);
    }
  }

  async function handleEditarGasto(gasto: GastoData) {
    setEditingGasto(gasto);
    setFormGasto({
      categoria: gasto.categoria,
      descripcion: gasto.descripcion || "",
      monto: gasto.monto.toString(),
    });
    setShowGastoDialog(true);
  }

  async function handleActualizarGasto() {
    if (!editingGasto) return;

    const result = await actualizarGasto(editingGasto.id, {
      categoria: formGasto.categoria,
      descripcion: formGasto.descripcion || undefined,
      monto: parseFloat(formGasto.monto),
      mes: mesGasto,
      anio: anioGasto,
    });

    if (result.success) {
      toast.success("Gasto actualizado correctamente");
      setShowGastoDialog(false);
      setEditingGasto(null);
      setFormGasto({ categoria: "Alquiler", descripcion: "", monto: "" });
      await cargarDatos();
      await cargarGastosMes();
    } else {
      toast.error(result.error);
    }
  }

  async function handleEliminarGasto(id: string) {
    if (!confirm("¿Estás seguro de eliminar este gasto?")) return;

    const result = await eliminarGasto(id);
    if (result.success) {
      toast.success("Gasto eliminado");
      await cargarDatos();
      await cargarGastosMes();
    } else {
      toast.error(result.error);
    }
  }

  // Cálculos
  function getRendimientosMes(mes: number, anio: number) {
    return rendimientos.filter(r => r.mes === mes && r.anio === anio);
  }

  function getTotalVentasMes(mes: number, anio: number) {
    return getRendimientosMes(mes, anio).reduce((sum, r) => sum + r.ventaTotal, 0);
  }

  function getPorcentajeUnidad(ventaTotal: number, totalMes: number) {
    if (totalMes === 0) return 0;
    return (ventaTotal / totalMes) * 100;
  }

  function getGastosMes(mes: number, anio: number) {
    return gastos.filter(g => g.mes === mes && g.anio === anio);
  }

  function getTotalGastosMes(mes: number, anio: number) {
    return getGastosMes(mes, anio).reduce((sum, g) => sum + g.monto, 0);
  }

  function toggleExpandedMes(mes: number, anio: number) {
    const key = `${mes}-${anio}`;
    setExpandedMeses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  function toggleExpandedGastosMes(mes: number, anio: number) {
    const key = `${mes}-${anio}`;
    setExpandedGastosMeses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  function formatMoney(amount: number) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  // Obtener meses con datos
  function getMesesConDatos(tipo: "rendimiento" | "gastos" = "rendimiento") {
    if (tipo === "rendimiento") {
      const mesesSet = new Set(
        rendimientos
          .filter(r => r.anio === anioSeleccionado)
          .map(r => r.mes)
      );
      return Array.from(mesesSet).sort((a, b) => a - b);
    } else {
      const mesesSet = new Set(
        gastos
          .filter(g => g.anio === anioGasto)
          .map(g => g.mes)
      );
      return Array.from(mesesSet).sort((a, b) => a - b);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Rendimiento del Negocio</h1>
      </div>

      <Tabs defaultValue="rendimiento" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rendimiento" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Rendimiento por Unidad
          </TabsTrigger>
          <TabsTrigger value="gastos" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Gastos del Negocio
          </TabsTrigger>
        </TabsList>

        {/* TAB: RENDIMIENTO */}
        <TabsContent value="rendimiento" className="space-y-6">
          {/* Selector de Año y Mes */}
          <Card>
            <CardHeader>
              <CardTitle>Filtrar por Período</CardTitle>
              <CardDescription>Selecciona el año y mes para ver o cargar datos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label>Año</Label>
                  <Select
                    value={anioSeleccionado.toString()}
                    onValueChange={(v) => setAnioSeleccionado(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar año" />
                    </SelectTrigger>
                    <SelectContent>
                      {aniosDisponibles.map(anio => (
                        <SelectItem key={anio} value={anio.toString()}>
                          {anio}
                        </SelectItem>
                      ))}
                      <SelectItem value={(new Date().getFullYear()).toString()}>
                        {new Date().getFullYear()}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label>Mes</Label>
                  <Select
                    value={mesSeleccionado.toString()}
                    onValueChange={(v) => setMesSeleccionado(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar mes" />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((mes, idx) => (
                        <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                          {mes}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Dialog open={showRendimientoDialog} onOpenChange={(open) => {
                    setShowRendimientoDialog(open);
                    if (!open) {
                      setEditingRendimiento(null);
                      setFormRendimiento({ unidadNegocio: "mostrador", ventaTotal: "" });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        {editingRendimiento ? "Editar Venta" : "Cargar Venta"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingRendimiento ? "Editar Venta" : "Cargar Venta Total"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <Label>Unidad de Negocio</Label>
                          <Select
                            value={formRendimiento.unidadNegocio}
                            onValueChange={(v) => setFormRendimiento(prev => ({ ...prev, unidadNegocio: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIDADES_NEGOCIO.map(u => (
                                <SelectItem key={u.value} value={u.value}>
                                  {u.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Venta Total del Mes ({MESES[mesSeleccionado - 1]} {anioSeleccionado})</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={formRendimiento.ventaTotal}
                            onChange={(e) => setFormRendimiento(prev => ({ ...prev, ventaTotal: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowRendimientoDialog(false);
                              setEditingRendimiento(null);
                              setFormRendimiento({ unidadNegocio: "mostrador", ventaTotal: "" });
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={editingRendimiento ? handleActualizarRendimiento : handleGuardarRendimiento}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {editingRendimiento ? "Actualizar" : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen del Mes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Resumen: {MESES[mesSeleccionado - 1]} {anioSeleccionado}
              </CardTitle>
              <CardDescription>
                Total de ventas: {formatMoney(getTotalVentasMes(mesSeleccionado, anioSeleccionado))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {UNIDADES_NEGOCIO.map(unidad => {
                  const rendimiento = getRendimientosMes(mesSeleccionado, anioSeleccionado)
                    .find(r => r.unidadNegocio === unidad.value);
                  const venta = rendimiento?.ventaTotal || 0;
                  const total = getTotalVentasMes(mesSeleccionado, anioSeleccionado);
                  const porcentaje = getPorcentajeUnidad(venta, total);

                  return (
                    <Card key={unidad.value} className="border-l-4" style={{ borderLeftColor: unidad.color.replace("bg-", "").replace("-500", "") }}>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full ${unidad.color}`} />
                          <span className="font-medium">{unidad.label}</span>
                        </div>
                        <p className="text-2xl font-bold">{formatMoney(venta)}</p>
                        <p className="text-sm text-muted-foreground">
                          {porcentaje.toFixed(1)}% del total
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tabla de Rendimientos por Mes */}
          <Card>
            <CardHeader>
              <CardTitle>Historial por Mes - Año {anioSeleccionado}</CardTitle>
              <CardDescription>
                Haz clic en un mes para ver el detalle de cada unidad de negocio
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getMesesConDatos("rendimiento").length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay datos cargados para este año
                </p>
              ) : (
                <div className="space-y-2">
                  {getMesesConDatos("rendimiento").map(mes => {
                    const key = `${mes}-${anioSeleccionado}`;
                    const isExpanded = expandedMeses.has(key);
                    const datosMes = getRendimientosMes(mes, anioSeleccionado);
                    const totalMes = getTotalVentasMes(mes, anioSeleccionado);

                    return (
                      <div key={mes} className="border rounded-lg">
                        <button
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                          onClick={() => toggleExpandedMes(mes, anioSeleccionado)}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                            <span className="font-medium">{MESES[mes - 1]} {anioSeleccionado}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground">
                              {datosMes.length} unidades
                            </span>
                            <span className="font-bold text-lg">
                              {formatMoney(totalMes)}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Unidad de Negocio</TableHead>
                                  <TableHead className="text-right">Venta Total</TableHead>
                                  <TableHead className="text-right">% del Total</TableHead>
                                  <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {datosMes.map(rendimiento => {
                                  const unidad = UNIDADES_NEGOCIO.find(u => u.value === rendimiento.unidadNegocio);
                                  const porcentaje = getPorcentajeUnidad(rendimiento.ventaTotal, totalMes);

                                  return (
                                    <TableRow key={rendimiento.id}>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <div className={`w-3 h-3 rounded-full ${unidad?.color || "bg-gray-500"}`} />
                                          {unidad?.label || rendimiento.unidadNegocio}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatMoney(rendimiento.ventaTotal)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          {porcentaje.toFixed(1)}%
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditarRendimiento(rendimiento)}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEliminarRendimiento(rendimiento.id)}
                                          >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: GASTOS */}
        <TabsContent value="gastos" className="space-y-6">
          {/* Selector de Año y Mes para Gastos */}
          <Card>
            <CardHeader>
              <CardTitle>Filtrar Gastos por Período</CardTitle>
              <CardDescription>Selecciona el año y mes para ver o cargar gastos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label>Año</Label>
                  <Select
                    value={anioGasto.toString()}
                    onValueChange={(v) => setAnioGasto(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar año" />
                    </SelectTrigger>
                    <SelectContent>
                      {aniosGastos.map(anio => (
                        <SelectItem key={anio} value={anio.toString()}>
                          {anio}
                        </SelectItem>
                      ))}
                      <SelectItem value={(new Date().getFullYear()).toString()}>
                        {new Date().getFullYear()}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label>Mes</Label>
                  <Select
                    value={mesGasto.toString()}
                    onValueChange={(v) => setMesGasto(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar mes" />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((mes, idx) => (
                        <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                          {mes}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Dialog open={showGastoDialog} onOpenChange={(open) => {
                    setShowGastoDialog(open);
                    if (!open) {
                      setEditingGasto(null);
                      setFormGasto({ categoria: "Alquiler", descripcion: "", monto: "" });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        {editingGasto ? "Editar Gasto" : "Agregar Gasto"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingGasto ? "Editar Gasto" : "Agregar Gasto"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <Label>Categoría</Label>
                          <Select
                            value={formGasto.categoria}
                            onValueChange={(v) => setFormGasto(prev => ({ ...prev, categoria: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIAS_GASTOS.map(cat => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Descripción (opcional)</Label>
                          <Input
                            placeholder="Detalle adicional..."
                            value={formGasto.descripcion}
                            onChange={(e) => setFormGasto(prev => ({ ...prev, descripcion: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Monto ({MESES[mesGasto - 1]} {anioGasto})</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={formGasto.monto}
                            onChange={(e) => setFormGasto(prev => ({ ...prev, monto: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowGastoDialog(false);
                              setEditingGasto(null);
                              setFormGasto({ categoria: "Alquiler", descripcion: "", monto: "" });
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={editingGasto ? handleActualizarGasto : handleGuardarGasto}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {editingGasto ? "Actualizar" : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen de Gastos del Mes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-red-600" />
                Gastos: {MESES[mesGasto - 1]} {anioGasto}
              </CardTitle>
              <CardDescription>
                Total de gastos: {formatMoney(getTotalGastosMes(mesGasto, anioGasto))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getGastosMes(mesGasto, anioGasto).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay gastos cargados para este mes
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getGastosMes(mesGasto, anioGasto).map(gasto => (
                      <TableRow key={gasto.id}>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {gasto.categoria}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {gasto.descripcion || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(gasto.monto)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditarGasto(gasto)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEliminarGasto(gasto.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Historial de Gastos por Mes */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de Gastos - Año {anioGasto}</CardTitle>
              <CardDescription>
                Haz clic en un mes para ver el detalle de gastos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getMesesConDatos("gastos").length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay gastos cargados para este año
                </p>
              ) : (
                <div className="space-y-2">
                  {getMesesConDatos("gastos").map(mes => {
                    const key = `${mes}-${anioGasto}`;
                    const isExpanded = expandedGastosMeses.has(key);
                    const datosMes = getGastosMes(mes, anioGasto);
                    const totalMes = getTotalGastosMes(mes, anioGasto);

                    return (
                      <div key={mes} className="border rounded-lg">
                        <button
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                          onClick={() => toggleExpandedGastosMes(mes, anioGasto)}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                            <span className="font-medium">{MESES[mes - 1]} {anioGasto}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground">
                              {datosMes.length} gastos
                            </span>
                            <span className="font-bold text-lg text-red-600">
                              {formatMoney(totalMes)}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Categoría</TableHead>
                                  <TableHead>Descripción</TableHead>
                                  <TableHead className="text-right">Monto</TableHead>
                                  <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {datosMes.map(gasto => (
                                  <TableRow key={gasto.id}>
                                    <TableCell>
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        {gasto.categoria}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {gasto.descripcion || "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatMoney(gasto.monto)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEditarGasto(gasto)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEliminarGasto(gasto.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={2} className="font-bold">
                                    Total del Mes
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-red-600">
                                    {formatMoney(totalMes)}
                                  </TableCell>
                                  <TableCell />
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
