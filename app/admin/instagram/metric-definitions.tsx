"use client";

import React, { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  HelpCircle, 
  Sparkles, 
  Lightbulb, 
  Calculator, 
  TrendingUp, 
  CheckCircle2, 
  DollarSign,
  Package,
  Layers,
  Percent,
  Target,
  MessageSquare
} from "lucide-react";

export interface MetricDetail {
  id: string;
  title: string;
  category?: string;
  icon?: React.ReactNode;
  deQueTrata: string;
  queIndica: string;
  comoSeCalcula: string;
  formulaVisual?: string;
  ejemplo?: string;
  interpretacion?: {
    verde?: string;
    amarillo?: string;
    rojo?: string;
  };
}

export const METRIC_DEFINITIONS: Record<string, MetricDetail> = {
  // -------------------------------------------------------------
  // TABLA GENERAL DE CAMPAÑAS
  // -------------------------------------------------------------
  campana: {
    id: "campana",
    title: "Campaña Publicitaria",
    category: "Estructura Meta Ads",
    icon: <Target className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Es el nombre y estado de la campaña que creaste en Facebook o Instagram para promocionar tus productos.",
    queIndica: "Te muestra si la publicidad está actualmente circulando ('Activa') o apagada ('Pausada'), y la fecha en que se puso en marcha.",
    comoSeCalcula: "Se sincroniza de forma automática con tu cuenta de anuncios de Meta.",
    ejemplo: "Campaña 'Promoción Invierno Buzos' iniciada el 15/05."
  },

  inversion: {
    id: "inversion",
    title: "Inversión / Gasto Publicitario",
    category: "Gasto en Publicidad",
    icon: <DollarSign className="h-5 w-5 text-blue-600" />,
    deQueTrata: "Es el dinero total que le pagaste a Meta (Facebook e Instagram) para mostrar estos anuncios durante el período que estás mirando.",
    queIndica: "Cuánta plata pusiste en publicidad. Sirve de base para saber si las ventas que conseguiste compensaron ese gasto.",
    comoSeCalcula: "Suma de todos los cobros de Meta Ads generados por esta campaña o anuncio en el rango de fechas elegido.",
    formulaVisual: "Suma de gastos facturados por Meta en el período",
    ejemplo: "Si gastaste $15.000 en los últimos 7 días, ese es tu gasto publicitario."
  },

  leads: {
    id: "leads",
    title: "Leads (Mensajes Nuevos)",
    category: "Consultas de Clientes",
    icon: <MessageSquare className="h-5 w-5 text-green-600" />,
    deQueTrata: "Es la cantidad de personas interesadas que vieron tu anuncio y te escribieron un mensaje privado por WhatsApp o Instagram Direct preguntando por el producto.",
    queIndica: "Qué tan atractivo fue el anuncio para convencer a la gente de hacer una consulta. A mayor cantidad de mensajes, más oportunidades de venta tenés.",
    comoSeCalcula: "Conteo directo de cada nueva conversación de chat iniciada por alguien que tocó el anuncio.",
    formulaVisual: "Cantidad total de conversaciones nuevas iniciadas desde el anuncio",
    ejemplo: "Si 45 personas te enviaron un mensaje luego de ver el anuncio, tenés 45 leads."
  },

  costoLead: {
    id: "costoLead",
    title: "Costo por Lead (Costo / Mensaje)",
    category: "Eficiencia Publicitaria",
    icon: <TrendingUp className="h-5 w-5 text-orange-600" />,
    deQueTrata: "Cuánto dinero te costó en promedio conseguir que una persona te escriba consultando por el producto.",
    queIndica: "Qué tan barato o caro resulta atraer a un potencial comprador. Cuanto más bajo sea este valor, más consultas conseguís por cada peso gastado.",
    comoSeCalcula: "Se divide el dinero gastado en publicidad entre la cantidad de mensajes recibidos.",
    formulaVisual: "Dinero Invertido ÷ Cantidad de Mensajes",
    ejemplo: "Si gastaste $10.000 y te escribieron 50 personas: $10.000 ÷ 50 = $200 por cada mensaje.",
    interpretacion: {
      verde: "Menos de $300 por mensaje suele ser un costo muy eficiente.",
      amarillo: "Entre $300 y $600 por mensaje es un costo intermedio.",
      rojo: "Más de $600 por mensaje indica que el anuncio puede estar desgastado o la audiencia es muy cara."
    }
  },

  estructura: {
    id: "estructura",
    title: "Estructura de la Campaña",
    category: "Organización Publicitaria",
    icon: <Layers className="h-5 w-5 text-blue-600" />,
    deQueTrata: "Muestra cómo está armada la campaña por dentro: cuántos conjuntos de público y cuántos anuncios individuales tiene adentro.",
    queIndica: "Te permite saber si estás probando varias imágenes/videos diferentes o si todo el presupuesto va a un único anuncio.",
    comoSeCalcula: "Conteo de los conjuntos de anuncios ('AdSets') y anuncios individuales ('Ads') vinculados a la campaña.",
    formulaVisual: "Total de Conjuntos de anuncios + Total de Anuncios",
    ejemplo: "2 conj. • 5 ads = 2 audiencias distintas con 5 videos/fotos compitiendo entre sí."
  },

  articulos: {
    id: "articulos",
    title: "Artículos Promocionados Asignados",
    category: "Ventas de Tu Tienda",
    icon: <Package className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Son los productos o packs de tu catálogo que estás mostrando en esta campaña.",
    queIndica: "Permite que el sistema cruce automáticamente el dinero gastado en anuncios con las ventas reales de tu negocio para saber si ganaste o perdiste plata.",
    comoSeCalcula: "Los asignás vos mismo haciendo clic en '+ Asignar' eligiendo los artículos correspondientes.",
    ejemplo: "Si el anuncio muestra 'Remeras de Algodón', le asignás el artículo 'Remera Algodón' para medir cuántas se vendieron."
  },

  rendimiento: {
    id: "rendimiento",
    title: "Semáforo de Salud / Rendimiento",
    category: "Diagnóstico Financiero",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "Es un diagnóstico automático que te dice si la campaña te está dejando dinero de verdad en el bolsillo o si te está dando pérdidas.",
    queIndica: "Muestra el estado financiero global evaluando si la ganancia de las ventas supera el gasto de publicidad.",
    comoSeCalcula: "Compara la ganancia de las ventas generadas contra la inversión publicitaria.",
    interpretacion: {
      verde: "🟢 Rentable: La ganancia obtenida supera el gasto en publicidad. ¡Conviene mantenerla o aumentarle presupuesto!",
      amarillo: "🟡 Ajustado: Está cerca del empate; cubre costos pero deja poco margen libre.",
      rojo: "🔴 No rentable: Gastaste más en publicidad de lo que ganaste vendiendo el producto. Conviene corregir el anuncio o pausarlo.",
    },
    ejemplo: "Si ganaste $50.000 netos de mercadería y la pauta costó $20.000, el semáforo marcará 'Rentable'."
  },

  accion: {
    id: "accion",
    title: "Ver Desglose de Campaña",
    category: "Navegación",
    icon: <Sparkles className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Acceso para entrar a ver la 'radiografía' completa de la campaña.",
    queIndica: "Al hacer clic, ves exactamente qué anuncio individual funcionó mejor, cuáles artículos se vendieron y todas las métricas de rentabilidad desglosadas.",
    comoSeCalcula: "Navega hacia el detalle quirúrgico de la campaña seleccionada."
  },

  // -------------------------------------------------------------
  // TABLA DESGLOSADA (CONJUNTOS Y ANUNCIOS) - COLUMNAS DISPONIBLES
  // -------------------------------------------------------------
  adset_ad: {
    id: "adset_ad",
    title: "Conjunto / Anuncio",
    category: "Estructura Creativa",
    icon: <Layers className="h-5 w-5 text-blue-600" />,
    deQueTrata: "Es el público específico (Conjunto) o la imagen/video puntual (Anuncio) que ve la gente en Instagram y Facebook.",
    queIndica: "Te ayuda a identificar qué foto o video específico fue el que más vendió o atrajo clientes más baratos.",
    comoSeCalcula: "Datos sincronizados desde Meta Ads."
  },

  articulosPromocionados: {
    id: "articulosPromocionados",
    title: "Artículos Promocionados",
    category: "Asignación de Catálogo",
    icon: <Package className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Artículos o packs específicos asociados a este conjunto o anuncio individual.",
    queIndica: "A qué productos específicos se les atribuyen los resultados económicos generados por esta pieza de anuncio.",
    comoSeCalcula: "Asignación directa o heredada de la campaña."
  },

  salud: {
    id: "salud",
    title: "Salud del Anuncio",
    category: "Rentabilidad por Anuncio",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "Indica si este anuncio o video puntual fue un éxito financiero o si dio pérdidas.",
    queIndica: "Te permite apagar anuncios que pierden plata y dejar prendidos solo los que generan ganancias.",
    comoSeCalcula: "Ganancia real de los productos asignados a este anuncio menos el dinero gastado en este anuncio específico."
  },

  spend: {
    id: "spend",
    title: "Gasto / Inversión",
    category: "Gasto en Publicidad",
    icon: <DollarSign className="h-5 w-5 text-blue-600" />,
    deQueTrata: "El dinero consumido por este conjunto o anuncio en Meta Ads durante el período seleccionado.",
    queIndica: "Cuánto presupuesto absorbió esta pieza publicitaria específica.",
    comoSeCalcula: "Gasto reportado por Meta Ads para este elemento.",
    formulaVisual: "Suma de inversión en este anuncio"
  },

  messages: {
    id: "messages",
    title: "Mensajes (Leads)",
    category: "Consultas de Clientes",
    icon: <MessageSquare className="h-5 w-5 text-green-600" />,
    deQueTrata: "Cantidad de personas que tocaron este anuncio puntual y te mandaron un mensaje privado.",
    queIndica: "El poder de este creativo para generar conversaciones comerciales.",
    comoSeCalcula: "Conteo directo de mensajes iniciados desde este anuncio específico."
  },

  ventasReales: {
    id: "ventasReales",
    title: "Ventas Reales (Unidades)",
    category: "Ventas de Tu Tienda",
    icon: <Package className="h-5 w-5 text-purple-600" />,
    deQueTrata: "La cantidad física de artículos o packs que efectivamente vendiste en tu tienda durante las fechas seleccionadas.",
    queIndica: "Cuántas unidades salieron del stock gracias a los artículos asignados a esta publicidad.",
    comoSeCalcula: "Suma de todas las unidades vendidas en tus ventas/pedidos para los artículos asignados.",
    formulaVisual: "Suma de unidades vendidas de los productos asignados",
    ejemplo: "Si se vendieron 12 remeras y 4 pantalones, el total es 16 unidades."
  },

  facturacion: {
    id: "facturacion",
    title: "Facturación Bruta (Ingresos)",
    category: "Dinero en Caja",
    icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "El dinero total cobrado por la venta de los productos asignados a este anuncio (la plata total que entró a la caja).",
    queIndica: "El volumen total de ventas en pesos, antes de descontar costos de mercadería o publicidad.",
    comoSeCalcula: "Se multiplica cada unidad vendida por su precio de venta.",
    formulaVisual: "Unidades Vendidas × Precio de Venta",
    ejemplo: "Si vendiste 10 buzos a $20.000 c/u, la facturación bruta es $200.000."
  },

  pctGastoVenta: {
    id: "pctGastoVenta",
    title: "% Gasto sobre Venta",
    category: "Incidencia Publicitaria",
    icon: <Percent className="h-5 w-5 text-amber-600" />,
    deQueTrata: "Qué porcentaje de la plata que cobraste por las ventas se tuvo que usar para pagar los anuncios.",
    queIndica: "Qué porción de cada venta se 'come' la publicidad. Cuanto más chico sea este porcentaje, más dinero te queda a favor.",
    comoSeCalcula: "Se divide el dinero gastado en publicidad entre la facturación bruta y se multiplica por 100.",
    formulaVisual: "(Inversión en Publicidad ÷ Facturación Bruta) × 100",
    ejemplo: "Si gastaste $15.000 en anuncios y facturaste $100.000: ($15.000 ÷ $100.000) × 100 = 15%.",
    interpretacion: {
      verde: "Menor al 15%: Excelente. El costo publicitario es muy liviano.",
      amarillo: "Entre 15% y 30%: Aceptable y dentro de lo habitual.",
      rojo: "Mayor al 30% o Sin ventas: Alerta. La publicidad se está comiendo gran parte del precio de venta."
    }
  },

  margenBruto: {
    id: "margenBruto",
    title: "Ganancia Bruta (Margen Comercial)",
    category: "Ganancia de Mercadería",
    icon: <DollarSign className="h-5 w-5 text-blue-600" />,
    deQueTrata: "La ganancia que te queda por vender los productos, restando lo que te costó comprarlos o producirlos, antes de pagar la publicidad.",
    queIndica: "El 'colchón' o margen total disponible que tenés para pagar los anuncios y quedarte con la ganancia neta.",
    comoSeCalcula: "A la facturación total se le resta el costo de compra de todos los artículos vendidos.",
    formulaVisual: "Facturación Bruta − Costo de Mercadería Vendida",
    ejemplo: "Si vendiste $100.000 y el costo de fabricar/comprar esa ropa fue $40.000, tu ganancia bruta es $60.000."
  },

  pctGastoMargen: {
    id: "pctGastoMargen",
    title: "% Gasto sobre Ganancia",
    category: "Consumo del Margen",
    icon: <Percent className="h-5 w-5 text-indigo-600" />,
    deQueTrata: "Qué porcentaje de tu ganancia comercial se fue en pagar los anuncios.",
    queIndica: "Te dice si la publicidad te dejó ganar plata o si se quedó con todo tu esfuerzo.",
    comoSeCalcula: "Se divide la inversión publicitaria entre la ganancia bruta y se multiplica por 100.",
    formulaVisual: "(Inversión en Publicidad ÷ Ganancia Bruta) × 100",
    ejemplo: "Si tu ganancia bruta fue $60.000 y gastaste $24.000 en pauta: ($24.000 ÷ $60.000) × 100 = 40%.",
    interpretacion: {
      verde: "Menor al 40%: Excelente. Te queda más del 60% de tu ganancia limpia en el bolsillo.",
      amarillo: "Entre 40% y 75%: Aceptable. La publicidad absorbe una parte considerable del margen.",
      rojo: "Mayor al 75% o superando el 100%: Peligro. Si supera el 100%, estás pagando más en anuncios de lo que ganás con el producto."
    }
  },

  margenNeto: {
    id: "margenNeto",
    title: "Margen Neto (Plata Limpia de Bolsillo)",
    category: "Resultado Final",
    icon: <TrendingUp className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "La plata real, definitiva y limpia que te quedó en la mano luego de pagar la mercadería Y pagar la publicidad.",
    queIndica: "El veredicto final: si el número está en verde ganaste plata de verdad; si está en rojo pusiste plata de tu bolsillo.",
    comoSeCalcula: "A la ganancia bruta se le resta lo que pagaste de publicidad.",
    formulaVisual: "Ganancia Bruta − Gasto en Publicidad",
    ejemplo: "Si ganaste $60.000 de mercadería y pagaste $20.000 de publicidad, tu Margen Neto es +$40.000 en mano.",
    interpretacion: {
      verde: "Positivo (+$): Tu campaña es rentable y genera ganancias netas.",
      rojo: "Negativo (-$): Estás perdiendo dinero; la publicidad superó el beneficio de las ventas."
    }
  },

  poas: {
    id: "poas",
    title: "POAS (Retorno sobre Ganancia Real)",
    category: "Rentabilidad Real",
    icon: <Target className="h-5 w-5 text-indigo-600" />,
    deQueTrata: "Indica cuántos pesos de ganancia de mercadería generás por cada $1 que invertís en publicidad.",
    queIndica: "Es la métrica más confiable de todas porque no se engaña con la facturación: mira tu ganancia de verdad.",
    comoSeCalcula: "Se divide la Ganancia Bruta entre el Gasto Publicitario.",
    formulaVisual: "Ganancia Bruta ÷ Dinero Gastado en Publicidad",
    ejemplo: "Si tu ganancia bruta fue $30.000 y gastaste $15.000: $30.000 ÷ $15.000 = 2.00x (Ganás $2 por cada $1 invertido).",
    interpretacion: {
      verde: "Más de 1.50x: Muy rentable. Multiplicás tu inversión y ganás buen dinero.",
      amarillo: "Entre 1.00x y 1.50x: Ajustado. Cubrís el gasto publicitario y queda algo de ganancia.",
      rojo: "Menor a 1.00x: No rentable. Por cada $1 que ponés en Meta, recuperás menos de $1 de ganancia."
    }
  },

  roas: {
    id: "roas",
    title: "ROAS (Retorno sobre Facturación)",
    category: "Retorno Tradicional",
    icon: <Percent className="h-5 w-5 text-teal-600" />,
    deQueTrata: "Indica cuántos pesos de facturación bruta entraron a la caja por cada $1 gastado en publicidad.",
    queIndica: "La velocidad de venta en caja generada por los anuncios (ojo: no tiene en cuenta el costo de la ropa, solo la venta total).",
    comoSeCalcula: "Se divide la Facturación Bruta entre el Gasto Publicitario.",
    formulaVisual: "Facturación Bruta ÷ Dinero Gastado en Publicidad",
    ejemplo: "Si facturaste $100.000 y gastaste $20.000: $100.000 ÷ $20.000 = 5.00x ($5 de venta por cada $1 de anuncio)."
  },

  cpa: {
    id: "cpa",
    title: "CPA Real (Costo por Venta de Unidad)",
    category: "Costo de Venta",
    icon: <DollarSign className="h-5 w-5 text-orange-600" />,
    deQueTrata: "Cuánto dinero en publicidad tuviste que gastar para conseguir vender 1 unidad de producto.",
    queIndica: "Te dice cuánto te cuesta 'comprar' cada venta. Debe ser siempre menor a la ganancia unitaria que te deja el producto.",
    comoSeCalcula: "Se divide el gasto publicitario entre las unidades vendidas.",
    formulaVisual: "Dinero Invertido ÷ Unidades Vendidas",
    ejemplo: "Si gastaste $10.000 y vendiste 5 remeras: $10.000 ÷ 5 = $2.000 de costo publicitario por cada remera vendida."
  },

  costPerMsg: {
    id: "costPerMsg",
    title: "Costo por Mensaje",
    category: "Eficiencia",
    icon: <TrendingUp className="h-5 w-5 text-orange-600" />,
    deQueTrata: "Cuánto te costó en promedio que una persona te envíe un mensaje a través de este anuncio puntual.",
    queIndica: "La eficiencia del anuncio para generar consultas a bajo costo.",
    comoSeCalcula: "Gasto en este anuncio dividido por la cantidad de mensajes que generó.",
    formulaVisual: "Gasto del Anuncio ÷ Mensajes Recibidos"
  },

  cpm: {
    id: "cpm",
    title: "CPM (Costo por Mil Impresiones)",
    category: "Costo de Audiencia",
    icon: <Layers className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Cuánto te cobra Meta por mostrar tu anuncio 1.000 veces en la pantalla de la gente.",
    queIndica: "Qué tan barato o caro resulta llegar a esa audiencia. Si es muy alto, quizás el público elegido es muy chico o muy competido.",
    comoSeCalcula: "Se divide el dinero gastado entre las impresiones totales y se multiplica por 1.000.",
    formulaVisual: "(Dinero Gastado ÷ Total de Visualizaciones) × 1.000",
    ejemplo: "Si gastaste $5.000 para que el anuncio se muestre 10.000 veces: ($5.000 ÷ 10.000) × 1.000 = $500 CPM."
  },

  // -------------------------------------------------------------
  // TABLA DE ARTÍCULOS Y PACKS VINCULADOS
  // -------------------------------------------------------------
  articuloPack: {
    id: "articuloPack",
    title: "Artículo o Pack Promocionado",
    category: "Catálogo",
    icon: <Package className="h-5 w-5 text-purple-600" />,
    deQueTrata: "El producto individual o combo de tu tienda cuyas ventas se están rastreando.",
    queIndica: "Permite saber qué producto específico es el responsable del éxito o fracaso de la campaña.",
    comoSeCalcula: "Nombre y configuración guardada en tu catálogo de productos."
  },

  stock: {
    id: "stock",
    title: "Stock Disponible",
    category: "Inventario",
    icon: <Package className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "Cantidad actual de unidades listas para vender en tu depósito o tienda.",
    queIndica: "Si tenés suficiente mercadería para no quedarte sin stock mientras los anuncios siguen atrayendo compradores.",
    comoSeCalcula: "Inventario en tiempo real registrado en el sistema."
  },

  precioRegular: {
    id: "precioRegular",
    title: "Precio de Venta al Público",
    category: "Precios",
    icon: <DollarSign className="h-5 w-5 text-slate-700" />,
    deQueTrata: "El precio regular al que los clientes compran este artículo en la tienda.",
    queIndica: "El valor unitario que ingresa por cada venta.",
    comoSeCalcula: "Precio cargado en la ficha del producto."
  },

  costoUnitario: {
    id: "costoUnitario",
    title: "Costo Unitario de Compra / Fabricación",
    category: "Costos",
    icon: <DollarSign className="h-5 w-5 text-slate-500" />,
    deQueTrata: "Lo que a vos te cuesta reponer o fabricar una unidad de este producto.",
    queIndica: "La base para calcular cuánta ganancia te queda en cada venta.",
    comoSeCalcula: "Costo unitario cargado en el sistema de gestión."
  },

  unidadesVendidas: {
    id: "unidadesVendidas",
    title: "Unidades Vendidas en el Período",
    category: "Volumen",
    icon: <Package className="h-5 w-5 text-purple-600" />,
    deQueTrata: "Total de unidades de este producto vendidas en el rango de fechas que estás consultando.",
    queIndica: "El ritmo de venta física que tuvo este artículo durante la campaña publicitaria.",
    comoSeCalcula: "Suma de unidades despachadas en las ventas del período."
  },

  facturacionBruto: {
    id: "facturacionBruto",
    title: "Facturación Bruta del Producto",
    category: "Ingresos",
    icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
    deQueTrata: "Dinero total recaudado únicamente por la venta de este artículo.",
    queIndica: "Cuánto dinero en total aportó este producto a los ingresos de tu negocio.",
    comoSeCalcula: "Unidades vendidas de este producto multiplicadas por su precio de venta.",
    formulaVisual: "Unidades Vendidas × Precio Regular"
  },

  gananciaBrutaItem: {
    id: "gananciaBrutaItem",
    title: "Ganancia Bruta del Producto",
    category: "Margen de Producto",
    icon: <DollarSign className="h-5 w-5 text-blue-600" />,
    deQueTrata: "La plata que te dejó este producto luego de descontar su costo de compra.",
    queIndica: "El margen libre que aportó este producto antes de descontarle la parte de publicidad.",
    comoSeCalcula: "Facturación total de este producto menos el costo total de las unidades vendidas.",
    formulaVisual: "Facturación del Producto − (Unidades × Costo Unitario)"
  },

  pctGastoVentaItem: {
    id: "pctGastoVentaItem",
    title: "% Gasto Publicitario sobre Venta",
    category: "Incidencia en Producto",
    icon: <Percent className="h-5 w-5 text-amber-600" />,
    deQueTrata: "Qué porcentaje del precio de venta de este producto se gastó en anuncios para venderlo.",
    queIndica: "Si el producto tolera la pauta publicitaria o si los anuncios resultan demasiado costosos para su precio.",
    comoSeCalcula: "Gasto de publicidad atribuido al producto dividido entre su facturación.",
    formulaVisual: "(Publicidad Asignada ÷ Facturación del Producto) × 100"
  },

  pctGastoMargenItem: {
    id: "pctGastoMargenItem",
    title: "% Gasto Publicitario sobre Ganancia",
    category: "Consumo de Margen",
    icon: <Percent className="h-5 w-5 text-indigo-600" />,
    deQueTrata: "Qué porción de la ganancia de este producto se consumió la publicidad.",
    queIndica: "Si supera el 100%, significa que la publicidad costó más que la ganancia del producto, provocando pérdidas.",
    comoSeCalcula: "Gasto publicitario atribuido al producto dividido entre su ganancia bruta.",
    formulaVisual: "(Publicidad Asignada ÷ Ganancia Bruta del Producto) × 100"
  }
};

/**
 * Componente modal interactivo para explicar la métrica
 */
export function MetricHelpModal({
  metricId,
  isOpen,
  onClose
}: {
  metricId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!metricId || !METRIC_DEFINITIONS[metricId]) return null;

  const data = METRIC_DEFINITIONS[metricId];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto p-6 bg-white border-slate-200 shadow-2xl rounded-xl">
        <DialogHeader className="border-b border-slate-100 pb-4 text-left">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100 text-purple-700">
                {data.icon || <HelpCircle className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                    {data.title}
                  </DialogTitle>
                </div>
                {data.category && (
                  <span className="text-[11px] font-semibold text-purple-700 tracking-wide uppercase mt-0.5 inline-block">
                    {data.category}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Explicación detallada y sencilla de la métrica publicitaria {data.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm text-slate-700">
          {/* SECCIÓN 1: ¿DE QUÉ TRATA? */}
          <div className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <span className="text-purple-600">📌</span>
              <span>¿De qué trata?</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {data.deQueTrata}
            </p>
          </div>

          {/* SECCIÓN 2: ¿QUÉ INDICA? */}
          <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-wider">
              <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
              <span>¿Qué indica para tu negocio?</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {data.queIndica}
            </p>

            {/* GUÍA DE COLORES O INTERPRETACIÓN SI APLICA */}
            {data.interpretacion && (
              <div className="mt-2 pt-2 border-t border-blue-100/80 space-y-1.5 text-xs">
                {data.interpretacion.verde && (
                  <div className="flex items-start gap-1.5 text-emerald-800 bg-emerald-50/80 px-2 py-1 rounded border border-emerald-200">
                    <span className="font-bold">🟢</span>
                    <span>{data.interpretacion.verde}</span>
                  </div>
                )}
                {data.interpretacion.amarillo && (
                  <div className="flex items-start gap-1.5 text-amber-800 bg-amber-50/80 px-2 py-1 rounded border border-amber-200">
                    <span className="font-bold">🟡</span>
                    <span>{data.interpretacion.amarillo}</span>
                  </div>
                )}
                {data.interpretacion.rojo && (
                  <div className="flex items-start gap-1.5 text-rose-800 bg-rose-50/80 px-2 py-1 rounded border border-rose-200">
                    <span className="font-bold">🔴</span>
                    <span>{data.interpretacion.rojo}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECCIÓN 3: ¿CÓMO SE CALCULA? */}
          <div className="rounded-lg bg-purple-50/40 border border-purple-100 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 uppercase tracking-wider">
              <Calculator className="h-3.5 w-3.5 text-purple-600" />
              <span>¿Cómo se calcula?</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {data.comoSeCalcula}
            </p>

            {data.formulaVisual && (
              <div className="mt-1.5 bg-white rounded-md border border-purple-200/90 p-2.5 text-center">
                <span className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider block mb-0.5">
                  Fórmula simple
                </span>
                <code className="text-xs sm:text-sm font-mono font-bold text-purple-900 bg-purple-50/60 px-2 py-0.5 rounded">
                  {data.formulaVisual}
                </code>
              </div>
            )}

            {data.ejemplo && (
              <div className="text-xs text-slate-600 bg-white/80 rounded p-2 border border-slate-200/60 mt-1">
                <span className="font-semibold text-slate-800">Ejemplo: </span>
                {data.ejemplo}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between sm:justify-end gap-2">
          <Button 
            onClick={onClose} 
            className="w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold h-9 px-5 shadow-xs"
          >
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botón interactivo '?' diseñado para incrustarse en los encabezados de columnas
 */
export function ColumnHelpButton({
  metricId,
  onClick,
  className = ""
}: {
  metricId: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(e);
      }}
      title="Ver explicación de esta columna"
      className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold transition-all shrink-0 select-none shadow-2xs opacity-40 hover:opacity-100 group-hover/col:opacity-100 bg-purple-100/70 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200/80 hover:border-purple-600 cursor-pointer ${className}`}
      aria-label="Ayuda sobre esta columna"
    >
      ?
    </button>
  );
}
