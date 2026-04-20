import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import RendimientoNegocioClient from "../rendimiento-negocio-client";

export default function RendimientoNegocioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/mercadolibre/interna">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
      </div>
      <RendimientoNegocioClient />
    </div>
  );
}
