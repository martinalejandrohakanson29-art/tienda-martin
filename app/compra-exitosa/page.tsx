"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, CheckCircle2, ShoppingBag, AlertCircle } from "lucide-react";
import { useCart } from "@/hooks/use-cart";

function CompraExitosaContent() {
  const searchParams = useSearchParams();
  // Extraemos cart y clearCart del hook
  const { cart, clearCart } = useCart();
  
  const paymentId = searchParams.get("payment_id") || "No disponible";
  
  const [productNames, setProductNames] = useState("");
  const [error, setError] = useState("");

  // Guardamos los nombres de los productos antes de que el carrito se limpie
  useEffect(() => {
    if (cart && cart.length > 0) {
      const names = cart.map((item) => `${item.quantity}x ${item.product.title}`).join(", ");
      setProductNames(names);
    }
  }, [cart]);

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
    if (error) setError("");
  };

  const handleWhatsApp = () => {
    const { nombre, dni, domicilio, ciudad, provincia, telefono, email, cp, referencias } = formData;

    // Validación de campos obligatorios
    if (!nombre || !dni || !domicilio || !ciudad || !provincia || !telefono || !email || !cp) {
      setError("Por favor completa todos los campos obligatorios para poder coordinar el envío.");
      return;
    }

    // Armado del mensaje profesional
    const message = `¡Hola! Realicé una compra de: ${productNames}
    
ID de Pago MP: ${paymentId}

*DATOS PARA ENVÍO*
------------------
*NOMBRE:* ${nombre}
*DNI:* ${dni}
*DOMICILIO:* ${domicilio}
*CIUDAD:* ${ciudad}
*PROVINCIA:* ${provincia}
*TELÉFONO:* ${telefono}
*E-MAIL:* ${email}
*CP:* ${cp}
*REFERENCIAS:* ${referencias || "Sin referencias"}`;

    const phoneNumber = "5493512404003"; 
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    // Abrimos WhatsApp
    window.open(url, "_blank");

    // Limpiamos el carrito DESPUÉS de abrir el link para que el proceso quede finalizado
    clearCart();
  };

  return (
    <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center border-b bg-white rounded-t-lg pb-8">
          <div className="mx-auto mb-4 bg-green-100 text-green-600 rounded-full p-3 w-fit">
            <CheckCircle2 size={48} />
          </div>
          <CardTitle className="text-3xl font-bold text-green-700">¡Pago Exitoso!</CardTitle>
          <CardDescription className="text-lg mt-2">
             ID de operación: <span className="font-bold text-black">{paymentId}</span>
             <br/>
             <span className="text-red-600 font-semibold">IMPORTANTE:</span> Completa tus datos para coordinar el envío.
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
            {/* ... Resto de los campos igual que antes ... */}
          </div>

          {/* Reutiliza tus inputs de Domicilio, Ciudad, etc. */}
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
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono <span className="text-red-500">*</span></Label>
              <Input id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail <span className="text-red-500">*</span></Label>
              <Input id="email" name="email" value={formData.email} onChange={handleChange} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referencias">Referencias (Opcional)</Label>
            <Textarea id="referencias" name="referencias" value={formData.referencias} onChange={handleChange} />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md flex items-center gap-2 text-sm border border-red-200">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <Button 
            onClick={handleWhatsApp}
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6 mt-4 gap-2 shadow-md"
          >
            <Send className="w-5 h-5" />
            Confirmar Envío por WhatsApp
          </Button>
        </CardContent>
    </Card>
  );
}

export default function CompraExitosaPage() {
  return (
    <div className="container mx-auto py-10 px-4 flex justify-center items-start min-h-screen bg-slate-50">
      <Suspense fallback={<div>Cargando...</div>}>
        <CompraExitosaContent />
      </Suspense>
    </div>
  );
}
