"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, CheckCircle2, ShoppingBag } from "lucide-react";

export default function CompraExitosaPage() {
  // Estado para guardar los datos del formulario
  const [formData, setFormData] = useState({
    nombre: "",
    dni: "",
    domicilio: "",
    ciudad: "",
    provincia: "",
    telefono: "",
    email: "",
    cp: "",
    referencias: ""
  });

  // Función que actualiza el estado cuando escriben en los inputs
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Función que arma el mensaje y abre WhatsApp
  const handleWhatsApp = () => {
    const { nombre, dni, domicilio, ciudad, provincia, telefono, email, cp, referencias } = formData;

    // Construimos el mensaje con el formato exacto que pediste
    const message = `*DATOS PARA ENVIO*

*NOMBRE COMPLETO:* ${nombre}
*DNI:* ${dni}
*DOMICILIO:* ${domicilio}
*CIUDAD:* ${ciudad}
*PROVINCIA:* ${provincia}
*TELEFONO:* ${telefono}
*E-MAIL:* ${email}
*CODIGO POSTAL:* ${cp}
*REFERENCIAS DE LA CASA:* ${referencias}`;

    // 👇 IMPORTANTE: CAMBIA ESTE NÚMERO POR EL TUYO (formato internacional sin +)
    // Ejemplo: 5493512345678
    const phoneNumber = "5493512404003"; 
    
    // Creamos el link y lo abrimos
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="container mx-auto py-10 px-4 flex justify-center items-start min-h-screen bg-slate-50">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center border-b bg-white rounded-t-lg pb-8">
          <div className="mx-auto mb-4 bg-green-100 text-green-600 rounded-full p-3 w-fit animate-in zoom-in duration-500">
            <CheckCircle2 size={48} />
          </div>
          <CardTitle className="text-3xl font-bold text-green-700">¡Pago Exitoso!</CardTitle>
          <CardDescription className="text-lg mt-2">
            Muchas gracias por tu compra. Para coordinar el envío, por favor completa tus datos.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-8 bg-white rounded-b-lg">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre Completo */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre Completo</Label>
              <Input 
                id="nombre" name="nombre" 
                placeholder="Juan Pérez" 
                value={formData.nombre} onChange={handleChange} 
              />
            </div>

            {/* DNI */}
            <div className="space-y-2">
              <Label htmlFor="dni">DNI</Label>
              <Input 
                id="dni" name="dni" 
                placeholder="12345678" 
                value={formData.dni} onChange={handleChange} 
              />
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input 
                id="telefono" name="telefono" type="tel"
                placeholder="351..." 
                value={formData.telefono} onChange={handleChange} 
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input 
                id="email" name="email" type="email"
                placeholder="juan@ejemplo.com" 
                value={formData.email} onChange={handleChange} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Domicilio */}
             <div className="space-y-2 md:col-span-2">
              <Label htmlFor="domicilio">Domicilio (Calle y Número)</Label>
              <Input 
                id="domicilio" name="domicilio" 
                placeholder="Av. Colón 1234" 
                value={formData.domicilio} onChange={handleChange} 
              />
            </div>

            {/* Ciudad */}
            <div className="space-y-2">
              <Label htmlFor="ciudad">Ciudad</Label>
              <Input 
                id="ciudad" name="ciudad" 
                value={formData.ciudad} onChange={handleChange} 
              />
            </div>

            {/* Provincia */}
            <div className="space-y-2">
              <Label htmlFor="provincia">Provincia</Label>
              <Input 
                id="provincia" name="provincia" 
                value={formData.provincia} onChange={handleChange} 
              />
            </div>

            {/* Código Postal */}
            <div className="space-y-2">
              <Label htmlFor="cp">Código Postal</Label>
              <Input 
                id="cp" name="cp" 
                value={formData.cp} onChange={handleChange} 
              />
            </div>
          </div>

          {/* Referencias */}
          <div className="space-y-2">
            <Label htmlFor="referencias">Referencias de la casa</Label>
            <Textarea 
              id="referencias" name="referencias" 
              placeholder="Ej: Casa de rejas negras, esquina, portón gris..." 
              value={formData.referencias} onChange={handleChange} 
              className="min-h-[100px]"
            />
          </div>

          {/* Botón Principal - WhatsApp */}
          <Button 
            onClick={handleWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6 mt-4 gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <Send className="w-5 h-5" />
            Enviar Datos por WhatsApp
          </Button>

          {/* Botón Secundario - Volver */}
          <div className="pt-4 border-t flex justify-center">
            <Button variant="ghost" asChild className="text-muted-foreground">
              <Link href="/shop" className="gap-2">
                <ShoppingBag className="w-4 h-4" />
                Volver a la tienda
              </Link>
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
