import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompraExitosaPage() {
  return (
    <div className="container mx-auto py-10 px-4 flex justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 bg-green-100 text-green-600 rounded-full p-3 w-fit">
            {/* Ícono de Check simple */}
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-green-700">¡Gracias por tu compra!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            El pago se procesó correctamente. Ahora necesitamos unos datos extra para coordinar el envío.
          </p>

          {/* Aquí podrías poner un formulario real o un link a WhatsApp */}
          <div className="bg-slate-50 p-4 rounded-md text-left text-sm space-y-2 border">
            <p><strong>Siguientes pasos:</strong></p>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>Revisa tu correo para ver el comprobante.</li>
              <li>Contáctanos para confirmar la dirección de entrega.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full bg-green-600 hover:bg-green-700">
              <Link href="https://wa.me/549XXXXXXXXXX?text=Hola,%20hice%20una%20compra%20y%20quiero%20coordinar%20el%20envío">
                Coordinar Envío por WhatsApp
              </Link>
            </Button>
            
            <Button variant="outline" asChild className="w-full">
              <Link href="/shop">
                Volver a la tienda
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
