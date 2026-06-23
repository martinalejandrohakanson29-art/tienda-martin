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
} from "lucide-react";
import Link from "next/link";

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
        <h1 className="text-3xl font-bold tracking-tight">Gestión Mercado Libre</h1>
      </div>

      <p className="text-gray-500 text-lg">Selecciona el área de trabajo operativa.</p>

      {/* Grid de tarjetas */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* TARJETA 0: CÁLCULO DE PRECIO */}
        <Card className="border-l-4 border-l-yellow-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-yellow-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800 text-xl">
              <Calculator className="h-6 w-6" />
              Cálculo de Precio
            </CardTitle>
            <CardDescription className="text-yellow-700/80 font-medium">
              Calculadora de rentabilidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Simula y calcula el precio ideal de publicación en base a costos, comisiones y ganancias.
            </p>
            <Link href="/admin/mercadolibre/calculo-precio">
              <Button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 1: GESTIÓN FULL */}
        <Card className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700 text-xl">
              <Truck className="h-6 w-6" />
              Gestión Full
            </CardTitle>
            <CardDescription className="text-purple-600/80 font-medium">
              Envíos a depósitos de ML
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Preparación y seguimiento de stock enviado a las bodegas de Full.
            </p>
            <Link href="/admin/mercadolibre/full">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 2: GESTIÓN DE ENVÍOS (COLECTA Y FLEX) */}
        <Card className="border-l-4 border-l-blue-600 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-xl">
              <MapPinned className="h-6 w-6" />
              Gestion Etiquetas Colecta y Flex
            </CardTitle>
            <CardDescription className="text-blue-700/80 font-medium">
              Logística local y diaria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Gestión de etiquetas y preparación para colectas y envíos Flex.
            </p>
            <Link href="/admin/mercadolibre/envios">
              <Button className="w-full bg-blue-700 hover:bg-blue-800 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 3: PREPARACIÓN DE ENVÍOS */}
        <Card className="border-l-4 border-l-cyan-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-cyan-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-cyan-800 text-xl">
              <ClipboardCheck className="h-6 w-6" />
              Preparación de Envíos
            </CardTitle>
            <CardDescription className="text-cyan-700/80 font-medium">
              Auditoría y control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Escaneo y validación de productos antes de armar el paquete.
            </p>
            <Link href="/admin/mercadolibre/preparacion">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 4: GESTIÓN DE PEDIDOS DESPACHADOS */}
        <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-emerald-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-800 text-xl">
              <PackageCheck className="h-6 w-6" />
              Gestion de Pedidos Despachados
            </CardTitle>
            <CardDescription className="text-emerald-700/80 font-medium">
              Control post-despacho
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Seguimiento de pedidos despachados.
            </p>
            <Link href="/admin/mercadolibre/despachados">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 5: RENTABILIDAD */}
        <Card className="border-l-4 border-l-amber-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-amber-800 text-xl">
              <BarChart3 className="h-6 w-6" />
              Rentabilidad
            </CardTitle>
            <CardDescription className="text-amber-700/80 font-medium">
              Análisis de márgenes y costos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Cálculo detallado de ganancias, comisiones y costos operativos.
            </p>
            <Link href="/admin/mercadolibre/rentabilidad">
              <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 6: SEGUIMIENTO VENTAS */}
        <Card className="border-l-4 border-l-indigo-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-indigo-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-indigo-800 text-xl">
              <LineChart className="h-6 w-6" />
              Seguimiento Ventas
            </CardTitle>
            <CardDescription className="text-indigo-700/80 font-medium">
              Monitoreo de ingresos y volumen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Visualización de ventas realizadas, estados de pago y métricas de crecimiento.
            </p>
            <Link href="/admin/mercadolibre/seguimiento-ventas">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 7: CREAR PUBLICACIONES */}
        <Card className="border-l-4 border-l-rose-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-rose-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-rose-800 text-xl">
              <PlusSquare className="h-6 w-6" />
              Crear Publicaciones
            </CardTitle>
            <CardDescription className="text-rose-700/80 font-medium">
              Generación con IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Crea títulos, descripciones y características optimizadas para Mercado Libre usando Inteligencia Artificial.
            </p>
            <Link href="/admin/mercadolibre/crear-publicaciones">
              <Button className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 8: VENTAS POR RANGO (NUEVA) */}
        <Card className="border-l-4 border-l-teal-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-teal-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-teal-800 text-xl">
              <CalendarRange className="h-6 w-6" />
              Ventas por Rango
            </CardTitle>
            <CardDescription className="text-teal-700/80 font-medium">
              Consulta por fechas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Consulta las ventas de Mercado Libre filtrando por una fecha de inicio y una fecha de fin.
            </p>
            <Link href="/admin/mercadolibre/ventas-rango">
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 9: SEGUIMIENTO COMPETENCIA */}
        <Card className="border-l-4 border-l-sky-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-sky-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sky-800 text-xl">
              <ScanSearch className="h-6 w-6" />
              Seguimiento Competencia
            </CardTitle>
            <CardDescription className="text-sky-700/80 font-medium">
              Monitoreo de precios en ML
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Configurá keywords de búsqueda por artículo y pack para rastrear precios de la competencia en Mercado Libre.
            </p>
            <Link href="/admin/mercadolibre/seguimiento-competencia">
              <Button className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 10: DESCRIPCIÓN PUBLICACIONES */}
        <Card className="border-l-4 border-l-violet-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-violet-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-violet-800 text-xl">
              <FileSearch className="h-6 w-6" />
              Descripción Publicaciones
            </CardTitle>
            <CardDescription className="text-violet-700/80 font-medium">
              Buscador de palabras en descripciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Sincronizá las descripciones de tus publicaciones activas y encontrá en qué MLA aparece cualquier palabra (ej: &quot;cigüeñal&quot;).
            </p>
            <Link href="/admin/mercadolibre/descripciones">
              <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* TARJETA 11: PREGUNTAS ML */}
        <Card className="border-l-4 border-l-orange-500 shadow-md hover:shadow-lg transition-all bg-gradient-to-br from-white to-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-800 text-xl">
              <MessageCircleQuestionMark className="h-6 w-6" />
              Preguntas ML
            </CardTitle>
            <CardDescription className="text-orange-700/80 font-medium">
              Respuestas automáticas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-6">
              Activá o programá respuestas automáticas a preguntas de compradores fuera del horario comercial.
            </p>
            <Link href="/admin/mercadolibre/preguntas">
              <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white gap-2 shadow-sm h-12 text-lg">
                Entrar <ArrowRight size={18} />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
