"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Save,
  Store,
  Phone,
  MapPin,
  Instagram,
  Link as LinkIcon,
  MessageSquare,
  CreditCard,
  Image as ImageIcon,
  Ruler,
  Megaphone,
  Globe,
  Sparkles,
  ShieldCheck,
  Truck,
  Wrench,
  HelpCircle,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
} from "lucide-react"
import {
  updateConfig,
  saveLandingFaq,
  deleteLandingFaq,
  seedDefaultLandingFaqs,
} from "@/app/actions/config"
import { Config, LandingFaq } from "@prisma/client"
import { toast } from "sonner"

interface ConfigClientProps {
  initialConfig: Config
  initialFaqs: LandingFaq[]
}

export default function ConfigClient({ initialConfig, initialFaqs }: ConfigClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [faqLoading, setFaqLoading] = useState(false)

  // Formulario General y Landing/SEO
  const [formData, setFormData] = useState({
    companyName: initialConfig.companyName || "",
    logoUrl: initialConfig.logoUrl || "",
    logoHeight: initialConfig.logoHeight || "80px",
    announcementText: initialConfig.announcementText || "",
    whatsappNumber: initialConfig.whatsappNumber || "",
    instagramUrl: initialConfig.instagramUrl || "",
    tiktokUrl: initialConfig.tiktokUrl || "",
    welcomeText: initialConfig.welcomeText || "",
    locationUrl: initialConfig.locationUrl || "",
    paymentMethods: initialConfig.paymentMethods || "Efectivo,Transferencia,Tarjeta",

    // Beneficios / Confianza
    showTrustBar: (initialConfig as any).showTrustBar ?? true,
    trust1Title: (initialConfig as any).trust1Title || "Envíos a Todo el País",
    trust1Desc: (initialConfig as any).trust1Desc || "Por Correo Argentino, Andreani y Encomiendas",
    trust2Title: (initialConfig as any).trust2Title || "Medios de Pago",
    trust2Desc: (initialConfig as any).trust2Desc || "Tarjetas de crédito, débito y transferencias con descuento",
    trust3Title: (initialConfig as any).trust3Title || "Asesoramiento Técnico",
    trust3Desc: (initialConfig as any).trust3Desc || "Consultanos por WhatsApp y te guiamos en tu compra",
    trust4Title: (initialConfig as any).trust4Title || "Local en Córdoba",
    trust4Desc: (initialConfig as any).trust4Desc || "Retiro en sucursal y atención personalizada",

    // Bloque Semántico SEO
    showSeoSection: (initialConfig as any).showSeoSection ?? true,
    seoTitle: (initialConfig as any).seoTitle || "Especialistas en Potenciación y Repuestos para Motos",
    seoSubtitle:
      (initialConfig as any).seoSubtitle ||
      "Repuestos, cilindros, levas y kits de competición para talleres y particulares con envíos a toda Argentina.",
    seoText1:
      (initialConfig as any).seoText1 ||
      "En Revolución Motos somos apasionados por la preparación y la mecánica de precisión. Te ofrecemos el stock más completo en kits de potenciación para motos, cilindros armados, pistones forjados, árboles de levas con cruce especial, tapas de cilindro trabajadas, embragues de competición y carburadores cortina plana para llevar el rendimiento de tu motor al límite.",
    seoText2:
      (initialConfig as any).seoText2 ||
      "Contamos con repuestos y accesorios compatibles para las marcas y modelos más populares: Honda (Wave 110, CG Titán 150, XR 150/250, Tornado 250, Twister), Yamaha (YBR 125, FZ 16, Crypton), Motomel, Gilera Smash, Corven Energy, Zanella y Bajaj Rouser. Despachos rápidos y asegurados a cualquier punto del país, con asesoramiento técnico directo y venta mayorista para talleres mecánicos.",
    seoTags:
      (initialConfig as any).seoTags ||
      "Honda, Yamaha, Motomel, Corven, Gilera, Bajaj, Kits de Potenciación, Cilindros, Levas, Carburadores, Escapes",

    // FAQs
    showFaqSection: (initialConfig as any).showFaqSection ?? true,
  })

  // Lista de FAQs en estado local
  const [faqs, setFaqs] = useState<LandingFaq[]>(initialFaqs || [])

  // Nueva FAQ en edición o creación
  const [editingFaq, setEditingFaq] = useState<{
    id?: string
    question: string
    answer: string
    order: number
    isActive: boolean
  } | null>(null)

  const transformDriveLink = (url: string) => {
    if (url.includes("drive.google.com") && url.includes("/d/")) {
      const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (idMatch && idMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${idMatch[1]}`
      }
    }
    return url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const dataToSave = {
        ...formData,
        logoUrl: transformDriveLink(formData.logoUrl),
      }
      const res = await updateConfig(dataToSave)
      if ((res as any)?.error) {
        toast.error("Error al guardar: " + (res as any).error)
      } else {
        toast.success("¡Configuración guardada con éxito!")
        router.refresh()
      }
    } catch (error) {
      toast.error("Error al guardar la configuración")
    } finally {
      setLoading(false)
    }
  }

  // Guardar una FAQ (crear o editar)
  const handleSaveFaq = async () => {
    if (!editingFaq || !editingFaq.question.trim() || !editingFaq.answer.trim()) {
      toast.error("Por favor completa la pregunta y la respuesta")
      return
    }

    setFaqLoading(true)
    try {
      const res = await saveLandingFaq(editingFaq)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(editingFaq.id ? "Pregunta actualizada" : "Pregunta agregada")
        setEditingFaq(null)
        router.refresh()
      }
    } catch (error) {
      toast.error("Error al guardar la pregunta frecuente")
    } finally {
      setFaqLoading(false)
    }
  }

  // Eliminar FAQ
  const handleDeleteFaq = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta pregunta frecuente?")) return

    setFaqLoading(true)
    try {
      const res = await deleteLandingFaq(id)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Pregunta eliminada")
        setFaqs((prev) => prev.filter((f) => f.id !== id))
        router.refresh()
      }
    } catch (error) {
      toast.error("Error al eliminar la pregunta")
    } finally {
      setFaqLoading(false)
    }
  }

  // Alternar estado activo de FAQ rápidamente
  const handleToggleFaqActive = async (faq: LandingFaq) => {
    try {
      const updated = { ...faq, isActive: !faq.isActive }
      await saveLandingFaq(updated)
      setFaqs((prev) => prev.map((f) => (f.id === faq.id ? updated : f)))
      toast.success(updated.isActive ? "Pregunta activada" : "Pregunta ocultada")
    } catch (error) {
      toast.error("Error al cambiar estado")
    }
  }

  // Cargar FAQs predeterminadas para SEO
  const handleSeedFaqs = async () => {
    if (!confirm("¿Deseas cargar las 5 preguntas sugeridas para SEO en la landing?")) return

    setFaqLoading(true)
    try {
      await seedDefaultLandingFaqs()
      toast.success("¡Preguntas sugeridas cargadas con éxito!")
      router.refresh()
    } catch (error) {
      toast.error("Error al cargar preguntas")
    } finally {
      setFaqLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto mb-16 p-2 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Configuración de la Tienda
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Personaliza la identidad de marca, redes, barra de anuncios, beneficios y posicionamiento SEO.
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 shadow-sm"
        >
          <Save className="h-4 w-4" />
          {loading ? "Guardando..." : "Guardar Todo"}
        </Button>
      </div>

      <Tabs defaultValue="landing-seo" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-slate-100 p-1 border">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Store className="h-4 w-4 text-blue-600" />
            <span>General & Marca</span>
          </TabsTrigger>
          <TabsTrigger value="landing-seo" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>Landing & SEO</span>
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* PESTAÑA 1: GENERAL & MARCA */}
        {/* ============================================================== */}
        <TabsContent value="general" className="space-y-6">
          {/* BARRA DE ANUNCIOS */}
          <Card className="border-l-4 border-l-purple-600 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-purple-700 text-lg">
                <Megaphone size={20} /> Barra de Anuncios Superior
              </CardTitle>
              <CardDescription>
                Mensaje destacado arriba del todo en la tienda (ofertas, envíos gratis, promociones).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-700">Texto del Anuncio</Label>
                <Input
                  value={formData.announcementText}
                  onChange={(e) => setFormData({ ...formData, announcementText: e.target.value })}
                  placeholder="Ej: 🔥 10% OFF pagando con Transferencia | 🚛 Envíos a todo el país"
                  className="font-medium"
                />
                <p className="text-xs text-slate-500">
                  Dejar vacío para ocultar la barra automáticamente en toda la web.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* IDENTIDAD DE LA TIENDA */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Store className="h-5 w-5 text-blue-600" /> Identidad de la Tienda
              </CardTitle>
              <CardDescription>Define el nombre, logo y sus dimensiones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6 items-start">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">Nombre de la Empresa</Label>
                  <Input
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Ej: Revolución Motos"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon size={16} className="text-purple-600" /> Logo (URL)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Ruler size={14} className="text-slate-400" />
                      <Label className="text-xs text-slate-500">Altura</Label>
                      <Input
                        className="h-7 w-20 text-xs bg-slate-50"
                        value={formData.logoHeight}
                        onChange={(e) => setFormData({ ...formData, logoHeight: e.target.value })}
                        placeholder="80px"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 items-center">
                    <div className="w-14 h-14 border rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {formData.logoUrl ? (
                        <img
                          src={transformDriveLink(formData.logoUrl)}
                          alt="Preview"
                          className="w-full h-full object-contain p-1"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ImageIcon className="text-slate-300" />
                      )}
                    </div>
                    <Input
                      value={formData.logoUrl}
                      onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                      placeholder="Link de imagen o Google Drive..."
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-slate-700 flex items-center gap-2">
                  <MessageSquare size={16} /> Texto de Bienvenida
                </Label>
                <Input
                  value={formData.welcomeText}
                  onChange={(e) => setFormData({ ...formData, welcomeText: e.target.value })}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700 flex items-center gap-2">
                    <Phone size={16} className="text-emerald-600" /> WhatsApp Oficial (con código de área)
                  </Label>
                  <Input
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    placeholder="Ej: 5493512345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700 flex items-center gap-2">
                    <CreditCard size={16} className="text-blue-600" /> Métodos de Pago Aceptados
                  </Label>
                  <Input
                    value={formData.paymentMethods}
                    onChange={(e) => setFormData({ ...formData, paymentMethods: e.target.value })}
                    placeholder="Efectivo, Transferencia, Tarjetas"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-slate-700 flex items-center gap-2">
                  <MapPin size={16} className="text-rose-600" /> Ubicación (Enlace de Google Maps)
                </Label>
                <Input
                  value={formData.locationUrl}
                  onChange={(e) => setFormData({ ...formData, locationUrl: e.target.value })}
                  placeholder="https://maps.google.com/..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700 flex items-center gap-2">
                    <Instagram size={16} className="text-pink-600" /> Instagram URL
                  </Label>
                  <Input
                    value={formData.instagramUrl}
                    onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                    placeholder="https://instagram.com/revolucionmotoscba"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700 flex items-center gap-2">
                    <LinkIcon size={16} className="text-slate-800" /> TikTok URL
                  </Label>
                  <Input
                    value={formData.tiktokUrl}
                    onChange={(e) => setFormData({ ...formData, tiktokUrl: e.target.value })}
                    placeholder="https://tiktok.com/@..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/* PESTAÑA 2: LANDING & SEO */}
        {/* ============================================================== */}
        <TabsContent value="landing-seo" className="space-y-8">
          {/* SECCIÓN 1: BARRA DE BENEFICIOS Y CONFIANZA */}
          <Card className="border-l-4 border-l-slate-800 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                    <ShieldCheck className="h-5 w-5 text-red-600" />
                    Barra de Beneficios & Servicios
                  </CardTitle>
                  <CardDescription>
                    4 bloques de servicio en la landing que transmiten confianza al comprador antes de ordenar.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="trust-bar-switch" className="text-xs font-medium text-slate-600">
                    {formData.showTrustBar ? "Visible" : "Oculta"}
                  </Label>
                  <Switch
                    id="trust-bar-switch"
                    checked={formData.showTrustBar}
                    onCheckedChange={(val) => setFormData({ ...formData, showTrustBar: val })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Beneficio 1 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <Truck className="w-4 h-4 text-red-600" /> Servicio 1 (Envíos)
                  </div>
                  <Input
                    value={formData.trust1Title}
                    onChange={(e) => setFormData({ ...formData, trust1Title: e.target.value })}
                    placeholder="Título (ej: Envíos a Todo el País)"
                    className="text-sm font-semibold"
                  />
                  <Input
                    value={formData.trust1Desc}
                    onChange={(e) => setFormData({ ...formData, trust1Desc: e.target.value })}
                    placeholder="Detalle (ej: Por Correo Argentino, Andreani...)"
                    className="text-xs"
                  />
                </div>

                {/* Beneficio 2 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <CreditCard className="w-4 h-4 text-red-600" /> Servicio 2 (Pagos)
                  </div>
                  <Input
                    value={formData.trust2Title}
                    onChange={(e) => setFormData({ ...formData, trust2Title: e.target.value })}
                    placeholder="Título (ej: Medios de Pago)"
                    className="text-sm font-semibold"
                  />
                  <Input
                    value={formData.trust2Desc}
                    onChange={(e) => setFormData({ ...formData, trust2Desc: e.target.value })}
                    placeholder="Detalle (ej: Tarjetas en cuotas, transferencia...)"
                    className="text-xs"
                  />
                </div>

                {/* Beneficio 3 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <Wrench className="w-4 h-4 text-red-600" /> Servicio 3 (Asesoramiento)
                  </div>
                  <Input
                    value={formData.trust3Title}
                    onChange={(e) => setFormData({ ...formData, trust3Title: e.target.value })}
                    placeholder="Título (ej: Asesoramiento Técnico)"
                    className="text-sm font-semibold"
                  />
                  <Input
                    value={formData.trust3Desc}
                    onChange={(e) => setFormData({ ...formData, trust3Desc: e.target.value })}
                    placeholder="Detalle (ej: Soporte mecánico por WhatsApp)"
                    className="text-xs"
                  />
                </div>

                {/* Beneficio 4 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <MapPin className="w-4 h-4 text-red-600" /> Servicio 4 (Ubicación Local)
                  </div>
                  <Input
                    value={formData.trust4Title}
                    onChange={(e) => setFormData({ ...formData, trust4Title: e.target.value })}
                    placeholder="Título (ej: Local en Córdoba)"
                    className="text-sm font-semibold"
                  />
                  <Input
                    value={formData.trust4Desc}
                    onChange={(e) => setFormData({ ...formData, trust4Desc: e.target.value })}
                    placeholder="Detalle (ej: Retiro en sucursal y compras en el mostrador)"
                    className="text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>


          {/* SECCIÓN 2: BLOQUE SEMÁNTICO DE AUTORIDAD SEO */}
          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-red-800 text-lg">
                    <Globe className="h-5 w-5 text-red-600" />
                    Bloque Semántico SEO (Texto de Autoridad)
                  </CardTitle>
                  <CardDescription>
                    Párrafos y etiquetas diseñadas para que los motores de búsqueda de Google entiendan las marcas, modelos y kits que ofrece tu tienda.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="seo-section-switch" className="text-xs font-medium text-slate-600">
                    {formData.showSeoSection ? "Visible" : "Oculta"}
                  </Label>
                  <Switch
                    id="seo-section-switch"
                    checked={formData.showSeoSection}
                    onCheckedChange={(val) => setFormData({ ...formData, showSeoSection: val })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">Título Principal (H2 SEO)</Label>
                  <Input
                    value={formData.seoTitle}
                    onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                    placeholder="Especialistas en Potenciación y Repuestos para Motos"
                    className="font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">Subtítulo Descriptivo</Label>
                  <Input
                    value={formData.seoSubtitle}
                    onChange={(e) => setFormData({ ...formData, seoSubtitle: e.target.value })}
                    placeholder="Breve frase que describe la especialidad y cobertura nacional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-slate-700">Párrafo 1: Enfoque Técnico y Potenciación</Label>
                <Textarea
                  rows={3}
                  value={formData.seoText1}
                  onChange={(e) => setFormData({ ...formData, seoText1: e.target.value })}
                  placeholder="Texto con keywords de cilindros, levas, preparación, etc."
                />
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-slate-700">Párrafo 2: Marcas, Modelos y Envíos</Label>
                <Textarea
                  rows={3}
                  value={formData.seoText2}
                  onChange={(e) => setFormData({ ...formData, seoText2: e.target.value })}
                  placeholder="Texto con mención de modelos Honda Wave, Titán, Tornado, Yamaha, etc."
                />
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-slate-700">
                  Etiquetas de Marcas & Categorías Populares (Separadas por comas)
                </Label>
                <Input
                  value={formData.seoTags}
                  onChange={(e) => setFormData({ ...formData, seoTags: e.target.value })}
                  placeholder="Honda, Yamaha, Motomel, Kits de Potenciación, Cilindros, Levas..."
                />
                <p className="text-xs text-slate-500">
                  Aparecen como chips clickeables en la landing para que el usuario filtre directamente los repuestos.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SECCIÓN 3: PREGUNTAS FRECUENTES (FAQ) CON SCHEMA ORG */}
          <Card className="border-l-4 border-l-slate-800 shadow-sm">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                    <HelpCircle className="h-5 w-5 text-red-600" />
                    Preguntas Frecuentes (FAQ) & Schema de Google
                  </CardTitle>
                  <CardDescription>
                    Google Search Console detecta estas preguntas como <strong>FAQPage</strong> para mostrar resultados expandidos en Google.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="faq-section-switch" className="text-xs font-medium text-slate-600">
                      {formData.showFaqSection ? "Visible" : "Oculta"}
                    </Label>
                    <Switch
                      id="faq-section-switch"
                      checked={formData.showFaqSection}
                      onCheckedChange={(val) => setFormData({ ...formData, showFaqSection: val })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSeedFaqs}
                    disabled={faqLoading}
                    className="text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Restablecer Sugeridas
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      setEditingFaq({
                        question: "",
                        answer: "",
                        order: faqs.length + 1,
                        isActive: true,
                      })
                    }
                    className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1 font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nueva Pregunta
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Formulario de creación o edición rápida */}
              {editingFaq && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-300 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-900">
                      {editingFaq.id ? "Editar Pregunta" : "Agregar Nueva Pregunta"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingFaq(null)}
                      className="h-7 text-xs text-slate-500"
                    >
                      Cancelar
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Pregunta</Label>
                    <Input
                      value={editingFaq.question}
                      onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                      placeholder="Ej: ¿Hacen envíos a todo el país?"
                      className="bg-white font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Respuesta</Label>
                    <Textarea
                      rows={3}
                      value={editingFaq.answer}
                      onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                      placeholder="Explicación detallada y clara para el cliente..."
                      className="bg-white text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-slate-600">Orden:</Label>
                        <Input
                          type="number"
                          value={editingFaq.order}
                          onChange={(e) =>
                            setEditingFaq({ ...editingFaq, order: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 h-7 text-xs bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-600">Activa:</Label>
                        <Switch
                          checked={editingFaq.isActive}
                          onCheckedChange={(val) => setEditingFaq({ ...editingFaq, isActive: val })}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveFaq}
                      disabled={faqLoading}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5 font-semibold"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {editingFaq.id ? "Actualizar Pregunta" : "Guardar Pregunta"}
                    </Button>
                  </div>
                </div>
              )}


              {/* Listado de FAQs existentes */}
              {faqs.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <HelpCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">Aún no hay preguntas cargadas.</p>
                  <p className="text-xs text-slate-400 mt-1 mb-3">
                    Presiona el botón "Restablecer Sugeridas" para cargar las 5 preguntas optimizadas para SEO.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSeedFaqs}
                    disabled={faqLoading}
                    className="text-xs border-amber-400 text-amber-800"
                  >
                    Cargar Preguntas Sugeridas
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {faqs.map((faq, idx) => (
                    <div
                      key={faq.id || idx}
                      className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        faq.isActive ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            #{faq.order}
                          </span>
                          <h4 className="text-sm font-bold text-slate-800 truncate">
                            {faq.question}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {faq.answer}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleFaqActive(faq)}
                          className="h-8 text-xs text-slate-600 hover:text-slate-900"
                          title={faq.isActive ? "Ocultar" : "Mostrar"}
                        >
                          {faq.isActive ? "Visible" : "Oculta"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingFaq({
                              id: faq.id,
                              question: faq.question,
                              answer: faq.answer,
                              order: faq.order,
                              isActive: faq.isActive,
                            })
                          }
                          className="h-8 text-xs"
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFaq(faq.id)}
                          className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Botón flotante o inferior para guardar */}
      <div className="pt-4 border-t flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={loading}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 shadow-md px-8"
        >
          <Save className="h-5 w-5" />
          {loading ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </div>
    </div>
  )
}
