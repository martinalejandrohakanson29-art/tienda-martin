"use client"

import React from "react"
import { 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  DollarSign, 
  Settings, 
  Eye, 
  ShoppingCart, 
  ChevronRight, 
  Zap 
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function MarketingClient({ data }: { data: any }) {
  const { campaigns, autoResponses } = data

  const totalSpend = campaigns.reduce((acc: any, curr: any) => acc + curr.spend, 0)
  const totalMessages = campaigns.reduce((acc: any, curr: any) => acc + curr.messages, 0)
  const totalReach = campaigns.reduce((acc: any, curr: any) => acc + curr.reach, 0)

  return (
    <div className="w-full space-y-6">
      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Inversión Total" 
          value={`$${totalSpend.toLocaleString('es-AR')}`} 
          icon={<DollarSign className="h-4 w-4 text-blue-600" />}
          subtitle="Últimos 21 días"
          borderColor="border-l-blue-500"
        />
        <StatCard 
          title="Mensajes" 
          value={totalMessages} 
          icon={<MessageSquare className="h-4 w-4 text-green-600" />}
          subtitle="Leads totales"
          borderColor="border-l-green-500"
        />
        <StatCard 
          title="Costo Promedio" 
          value={`$${(totalSpend / totalMessages).toFixed(2)}`} 
          icon={<TrendingUp className="h-4 w-4 text-orange-600" />}
          subtitle="Por mensaje iniciado"
          borderColor="border-l-orange-500"
        />
        <StatCard 
          title="Alcance" 
          value={(totalReach / 1000).toFixed(1) + "k"} 
          icon={<Eye className="h-4 w-4 text-purple-600" />}
          subtitle="Personas alcanzadas"
          borderColor="border-l-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TABLA DE CAMPAÑAS */}
        <Card className="lg:col-span-2 bg-white shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-red-600" />
              Rendimiento por Campaña
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead>Gasto</TableHead>
                <TableHead className="text-center">Mensajes</TableHead>
                <TableHead className="text-center">Carritos</TableHead>
                <TableHead className="text-right">Costo/Msj</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((camp: any) => (
                <TableRow key={camp.id}>
                  <TableCell>
                    <div className="font-medium text-slate-700">{camp.name}</div>
                    <div className="text-[10px] text-slate-400">ID: {camp.id}</div>
                  </TableCell>
                  <TableCell className="font-medium font-mono text-sm">
                    ${camp.spend.toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {camp.messages}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 text-sm">
                      <ShoppingCart className="h-3 w-3" />
                      {camp.carts}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-700">
                    <span className={camp.costPerMsg < 300 ? "text-green-600" : ""}>
                      ${camp.costPerMsg.toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* AGENTE DE RESPUESTAS */}
        <Card className="bg-white shadow-sm border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              Agente de IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {autoResponses.map((res: any, i: number) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-slate-200 transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">AD ID: {res.adId}</span>
                  <Settings className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
                </div>
                <h3 className="font-semibold text-red-600 text-xs mb-1">{res.name}</h3>
                <p className="text-[11px] text-slate-500 italic line-clamp-2">"{res.response}"</p>
              </div>
            ))}
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-6">
              Nueva Respuesta
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, subtitle, borderColor }: any) {
  return (
    <Card className={`bg-white shadow-sm border-l-4 ${borderColor}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        <div className="p-1.5 bg-slate-50 rounded-md">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  )
}
