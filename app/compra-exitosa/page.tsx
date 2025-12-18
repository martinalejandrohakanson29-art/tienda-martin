"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, CheckCircle2, ShoppingBag, AlertCircle } from "lucide-react"; // Agregué el ícono de alerta

import useCart from "@/hooks/use-cart";

export default function CompraExitosaPage() {
  const searchParams = useSearchParams();
  const cart = useCart();
  
  const paymentId = searchParams.get("payment_id") || "No disponible";
  
  const [productNames, setProductNames] = useState("");
  // Estado para manejar el error de validación
  const [error, setError] = useState("");

  useEffect(() => {
    if (cart.items.length > 0) {
      const names = cart.items.map((item) => item.product.title).join(", ");
      setProductNames(names);
      // cart.removeAll(); 
    }
  }, [cart.items]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Si el usuario empieza a escribir, borramos el error para que no moleste
    if (error) setError("");
  };

  const handleWhatsApp = () => {
    const { nombre, dni, domicilio, ciudad, provincia, telefono, email, cp, referencias } = formData;

    // --- 1. VALIDACIÓN ---
    // Verificamos que los campos obligatorios no estén vacíos.
    // Nota: "Referencias" no está en esta lista, así que es opcional.
    // "Domicilio" incluye calle y altura.
    if (!nombre || !dni || !domicilio || !ciudad || !provincia || !telefono || !email || !cp) {
      setError("Por favor completa todos los campos obligatorios para poder coordinar el envío.");
      return; // ⛔️ Cortamos la ejecución aquí si falta algo
    }

    // --- 2. ENVÍO ---
    // Si pasa la validación, armamos el mensaje
    const message = `Hola! Realicé la compra del producto: ${productNames || "Varios productos"}
    
Por MercadoPago, ID de pago: ${paymentId}

*DATOS PARA ENVIO*
------------------
*NOMBRE COMPLETO:* ${nombre}
*DNI:* ${dni}
*DOMICILIO:* ${domicilio}
*CIUDAD:* ${ciudad}
*PROVINCIA:* ${provincia}
*TELEFONO:* ${telefono}
*E-MAIL:* ${email}
*CODIGO POSTAL:* ${cp}
*REFERENCIAS DE LA CASA:* ${referencias}`;

    // RECUERDA: CAMBIA ESTE NÚMERO POR EL TUYO
    const phoneNumber = "5493512404003"; 
    
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="container mx-auto py-10 px-4 flex justify-center items-start min-h-screen bg-slate-50">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center border-b bg-white rounded-t-lg pb-8">
          <div className="mx-auto mb-4 bg-green-100 text-green-600 rounded-full p-3 w-fit">
            <CheckCircle2 size={48} />
          </div>
          <CardTitle className="text-3xl font-bold text-green-700">¡Pago Exitoso!</CardTitle>
          <CardDescription className="text-lg mt-2">
             Tu ID de operación es: <span className="font-bold text-black">{paymentId}</span>
             <br/>
             Para finalizar, por favor completa los datos de envío.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-8 bg-white rounded-b-lg">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre Completo <span className="text-red-500">*</span></Label>
              <Input id="nombre" name="nombre" placeholder="Juan Pérez" value={formData.nombre} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dni">DNI <span className="text-red-500">*</span></Label>
              <Input id="dni" name="dni" placeholder="12345678" value={formData.dni} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono <span className="text-red-500">*</span></Label>
              <Input id="telefono" name="telefono" type="tel" placeholder="351..." value={formData.telefono} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail <span className="text-red-500">*</span></Label>
              <Input id="email" name="email" type="email" placeholder="juan@ejemplo.com" value={formData.email} onChange={handleChange} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2 md:col-span-2">
              <Label htmlFor="domicilio">Domicilio (Calle y Altura) <span className="text-red-500">*</span></Label>
              <Input id="domicilio" name="domicilio" placeholder="Av. Colón 1234" value={formData.domicilio} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ciudad">Ciudad <span className="text-red-500">*</span></Label>
              <Input id="ciudad" name="ciudad" value={formData.ciudad} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provincia">Provincia <span className="text-red-500">*</span></Label>
              <Input id="provincia" name="provincia" value={formData.provincia} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp">Código Postal <span className="text-red-500">*</span></Label>
              <Input id="cp" name="cp" value={formData.cp} onChange={handleChange} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referencias">Referencias de la casa (Opcional)</Label>
            <Textarea 
              id="referencias" name="referencias" 
              placeholder="Ej: Casa de rejas negras, esquina, portón gris..." 
              value={formData.referencias} onChange={handleChange} 
              className="min-h-[100px]"
            />
          </div>

          {/* Mensaje de Error Visual */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md flex items-center gap-2 text-sm border border-red-200">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <Button 
            onClick={handleWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6 mt-4 gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <Send className="w-5 h-5" />
            Enviar Datos por WhatsApp
          </Button>

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
