// app/admin/mercadolibre/page.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Truck,
  ArrowLeft,
  ArrowRight,
  MapPinned,
  PackageCheck,
  BarChart3,
  LineChart,
  ClipboardCheck,
  PlusSquare,
  Calculator,
  CalendarRange,
  ScanSearch,
  FileSearch,
  MessageCircleQuestionMark,
  FileSpreadsheet,
  ToggleRight,
  MessageSquareText,
} from "lucide-react";
import Link from "next/link";
import ActualizarSheetButton from "./actualizar-sheet/actualizar-sheet-button";

export default function MercadoLibreDashboard() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al Panel General
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Gestión Mercado Libre</h1>
      </div>

      <p className="text-gray-500 text-sm">Selecciona el área de trabajo operativa.</p>

      {/* Grid de tarjetas compactas */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        
        {/* TARJETA 0: CÁLCULO DE PRECIO */}
        <Card className="border-l-4 border-l-yellow-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-yellow-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-800 text-base font-bold">
              <Calculator className="h-5 w-5 shrink-0" />
              Cálculo de Precio
            </CardTitle>
            <CardDescription className="text-yellow-700/80 font-medium text-xs line-clamp-1">
              Calculadora de rentabilidad
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Simula y calcula el precio ideal de publicación en base a costos, comisiones y ganancias.
            </p>
            <Link href="/admin/mercadolibre/calculo-precio">
              <Button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 1: GESTIÓN FULL */}
        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-purple-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-purple-700 text-base font-bold">
              <Truck className="h-5 w-5 shrink-0" />
              Gestión Full
            </CardTitle>
            <CardDescription className="text-purple-600/80 font-medium text-xs line-clamp-1">
              Envíos a depósitos de ML
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Preparación y seguimiento de stock enviado a las bodegas de Full.
            </p>
            <Link href="/admin/mercadolibre/full">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: GESTIÓN DE ENVÍOS (COLECTA Y FLEX) */}
        <Card className="border-l-4 border-l-blue-600 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-blue-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-base font-bold">
              <MapPinned className="h-5 w-5 shrink-0" />
              Etiquetas Colecta / Flex
            </CardTitle>
            <CardDescription className="text-blue-700/80 font-medium text-xs line-clamp-1">
              Logística local y diaria
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Gestión de etiquetas y preparación para colectas y envíos Flex.
            </p>
            <Link href="/admin/mercadolibre/envios">
              <Button className="w-full bg-blue-700 hover:bg-blue-800 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: PREPARACIÓN DE ENVÍOS */}
        <Card className="border-l-4 border-l-cyan-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-cyan-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-cyan-800 text-base font-bold">
              <ClipboardCheck className="h-5 w-5 shrink-0" />
              Preparación Envíos
            </CardTitle>
            <CardDescription className="text-cyan-700/80 font-medium text-xs line-clamp-1">
              Auditoría y control
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Escaneo y validación de productos antes de armar el paquete.
            </p>
            <Link href="/admin/mercadolibre/preparacion">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 4: GESTIÓN DE PEDIDOS DESPACHADOS */}
        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-emerald-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-800 text-base font-bold">
              <PackageCheck className="h-5 w-5 shrink-0" />
              Pedidos Despachados
            </CardTitle>
            <CardDescription className="text-emerald-700/80 font-medium text-xs line-clamp-1">
              Control post-despacho
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Seguimiento y control de pedidos despachados.
            </p>
            <Link href="/admin/mercadolibre/despachados">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 5: RENTABILIDAD */}
        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-amber-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-800 text-base font-bold">
              <BarChart3 className="h-5 w-5 shrink-0" />
              Rentabilidad
            </CardTitle>
            <CardDescription className="text-amber-700/80 font-medium text-xs line-clamp-1">
              Análisis de márgenes y costos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Cálculo detallado de ganancias, comisiones y costos operativos.
            </p>
            <Link href="/admin/mercadolibre/rentabilidad">
              <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 6: SEGUIMIENTO VENTAS */}
        <Card className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-indigo-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-indigo-800 text-base font-bold">
              <LineChart className="h-5 w-5 shrink-0" />
              Seguimiento Ventas
            </CardTitle>
            <CardDescription className="text-indigo-700/80 font-medium text-xs line-clamp-1">
              Monitoreo de ingresos y volumen
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Visualización de ventas realizadas, estados de pago y métricas de crecimiento.
            </p>
            <Link href="/admin/mercadolibre/seguimiento-ventas">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 7: CREAR PUBLICACIONES */}
        <Card className="border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-rose-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-rose-800 text-base font-bold">
              <PlusSquare className="h-5 w-5 shrink-0" />
              Crear Publicaciones
            </CardTitle>
            <CardDescription className="text-rose-700/80 font-medium text-xs line-clamp-1">
              Generación con IA
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Crea títulos, descripciones y fichas técnicas optimizadas usando IA.
            </p>
            <Link href="/admin/mercadolibre/crear-publicaciones">
              <Button className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 8: VENTAS POR RANGO */}
        <Card className="border-l-4 border-l-teal-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-teal-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-teal-800 text-base font-bold">
              <CalendarRange className="h-5 w-5 shrink-0" />
              Ventas por Rango
            </CardTitle>
            <CardDescription className="text-teal-700/80 font-medium text-xs line-clamp-1">
              Consulta por fechas
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Consulta las ventas de Mercado Libre filtrando por rangos de fecha.
            </p>
            <Link href="/admin/mercadolibre/ventas-rango">
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 9: SEGUIMIENTO COMPETENCIA */}
        <Card className="border-l-4 border-l-sky-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-sky-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sky-800 text-base font-bold">
              <ScanSearch className="h-5 w-5 shrink-0" />
              Competencia
            </CardTitle>
            <CardDescription className="text-sky-700/80 font-medium text-xs line-clamp-1">
              Monitoreo de precios
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Configurá keywords por artículo y pack para rastrear precios de rivales en ML.
            </p>
            <Link href="/admin/mercadolibre/seguimiento-competencia">
              <Button className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 10: DESCRIPCIÓN PUBLICACIONES */}
        <Card className="border-l-4 border-l-violet-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-violet-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-violet-800 text-base font-bold">
              <FileSearch className="h-5 w-5 shrink-0" />
              Descripciones
            </CardTitle>
            <CardDescription className="text-violet-700/80 font-medium text-xs line-clamp-1">
              Buscador en descripciones
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Sincronizá y encontrá en qué MLA aparece cualquier palabra clave.
            </p>
            <Link href="/admin/mercadolibre/descripciones">
              <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 11: PREGUNTAS ML */}
        <Card className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-orange-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-orange-800 text-base font-bold">
              <MessageCircleQuestionMark className="h-5 w-5 shrink-0" />
              Preguntas ML
            </CardTitle>
            <CardDescription className="text-orange-700/80 font-medium text-xs line-clamp-1">
              Respuestas automáticas
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Activá o programá respuestas a preguntas fuera del horario comercial.
            </p>
            <Link href="/admin/mercadolibre/preguntas">
              <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 12: ACTUALIZAR SHEET */}
        <Card className="border-l-4 border-l-lime-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-lime-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-lime-800 text-base font-bold">
              <FileSpreadsheet className="h-5 w-5 shrink-0" />
              Actualizar Sheet
            </CardTitle>
            <CardDescription className="text-lime-700/80 font-medium text-xs line-clamp-1">
              Exportar costos a Sheets
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Envía a n8n los costos calculados para actualizar la pestaña Comparador.
            </p>
            <ActualizarSheetButton />
          </CardContent>
        </Card>

        {/* TARJETA 13: ESTADO DE PUBLICACIONES */}
        <Card className="border-l-4 border-l-fuchsia-500 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-fuchsia-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-fuchsia-800 text-base font-bold">
              <ToggleRight className="h-5 w-5 shrink-0" />
              Estado Publicaciones
            </CardTitle>
            <CardDescription className="text-fuchsia-700/80 font-medium text-xs line-clamp-1">
              Activas, pausadas y stock
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Listá publicaciones, filtrá por artículo y pausá o activá directamente.
            </p>
            <Link href="/admin/mercadolibre/estado-publicaciones">
              <Button className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 14: MENSAJES POST-VENTA */}
        <Card className="border-l-4 border-l-emerald-600 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-white to-emerald-50/50 p-4 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-800 text-base font-bold">
              <MessageSquareText className="h-5 w-5 shrink-0" />
              Mensajes Post-Venta
            </CardTitle>
            <CardDescription className="text-emerald-700/80 font-medium text-xs line-clamp-1">
              Recomendaciones y tips
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-1 flex-1 flex flex-col justify-between">
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              Configurá mensajes automáticos por artículo o combo que se envían tras la venta.
            </p>
            <Link href="/admin/mercadolibre/mensajes-post-venta">
              <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-sm h-9 text-sm font-semibold">
                Entrar <ArrowRight size={15} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
