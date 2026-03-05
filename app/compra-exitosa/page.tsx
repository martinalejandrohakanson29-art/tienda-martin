"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
// Importamos nuestras nuevas acciones
import { updateVentaWebStatus, updateVentaWebCliente } from "@/app/actions/ventas-web";

function CompraExitosaContent() {
  const searchParams = useSearchParams();
  const { cart, clearCart } = useCart();
  
  const paymentId = searchParams.get("payment_id") || "No disponible";
  const mpStatus = searchParams.get("status") || "";
  const externalReference = searchParams.get("external_reference") || "";
  
  const [productNames, setProductNames] = useState("");
  const [error, setError] = useState("");

  // 1. Guardamos el pago en BD apenas entra a la página (Por si cierra antes del formulario)
  useEffect(() => {
    if (externalReference && paymentId !== "No disponible") {
      const nuevoEstado = mpStatus === "approved" ? "APROBADO" : "PENDIENTE";
      updateVentaWebStatus(externalReference, paymentId, nuevoEstado);
    }
  }, [externalReference, paymentId, mpStatus]);

  // 2. Guardamos los nombres de los productos para WhatsApp
  useEffect(() => {
    if (cart && cart.length > 0) {
      const names = cart.map((item) => `${item.quantity}x ${item.product.title}`).join(", ");
      setProductNames(names);
    }
  }, [cart]);

  // 3. Lógica Meta Pixel
  useEffect(() => {
    if (
        typeof window !== "undefined" && 
        (window as any).fbq && 
        cart.length > 0 && 
        paymentId !== "No disponible"
    ) {
        const totalValue = cart.reduce((acc, item) => {
            return acc + (Number(item.product.price) * item.quantity);
        }, 0);

        const contentIds = cart.map((item) => item.product.id);

        (window as any).fbq('track', 'Purchase', {
            value: totalValue,
            currency: 'ARS',
            content_ids: contentIds,
            content_type: 'product',
            order_id: paymentId
        });
    }
  }, [cart, paymentId]);


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

  const handleWhatsApp = async () => {
    const { nombre, dni, domicilio, ciudad, provincia, telefono, email, cp, referencias } = formData;

    if (!nombre || !dni || !domicilio || !ciudad || !provincia || !telefono || !email || !cp) {
      setError("Por favor completa todos los campos obligatorios para poder coordinar el envío.");
      return;
    }

    // ¡NUEVO! Guardamos los datos de envío silenciosamente en la Base de Datos
    if (externalReference) {
      await updateVentaWebCliente(externalReference, formData);
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
    
    window.open(url, "_blank");
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
