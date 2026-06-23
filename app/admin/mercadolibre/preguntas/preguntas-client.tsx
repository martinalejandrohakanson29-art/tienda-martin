"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MessageSquare, Clock, Save, Loader2, BotMessageSquare } from "lucide-react";
import { updateAutoRespuestaConfig, type AutoRespuestaConfig } from "@/app/actions/preguntas-ml";

const DIAS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

interface Props {
  config: AutoRespuestaConfig;
}

export function PreguntasClient({ config }: Props) {
  const [habilitado, setHabilitado] = useState(config.habilitado);
  const [mensaje, setMensaje] = useState(config.mensaje);
  const [usarHorario, setUsarHorario] = useState(config.usarHorario);
  const [horaInicio, setHoraInicio] = useState(config.horaInicioComercial);
  const [horaFin, setHoraFin] = useState(config.horaFinComercial);
  const [dias, setDias] = useState<number[]>(
    config.diasComerciales.split(",").map(Number).filter(Boolean)
  );
  const [saving, setSaving] = useState(false);

  const toggleDia = (d: number) => {
    setDias((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateAutoRespuestaConfig({
        habilitado,
        mensaje,
        usarHorario,
        horaInicioComercial: horaInicio,
        horaFinComercial: horaFin,
        diasComerciales: dias.length > 0 ? dias.join(",") : "1,2,3,4,5",
      });
      if (result.success) {
        toast.success("Configuración guardada.");
      } else {
        toast.error(result.error || "No se pudo guardar.");
      }
    } finally {
      setSaving(false);
    }
  };

  const estadoTexto = () => {
    if (!habilitado) return "Respuesta automática desactivada";
    if (!usarHorario) return "Respondiendo automáticamente a todas las preguntas";
    return `Respondiendo fuera del horario comercial (${horaInicio}–${horaFin})`;
  };

  return (
    <div className="max-w-2xl space-y-5">
      {/* Estado / toggle principal */}
      <Card
        className={`border-l-4 shadow-md ${
          habilitado ? "border-l-green-500 bg-green-50/40" : "border-l-gray-300"
        }`}
      >
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3">
            <BotMessageSquare
              className={`h-8 w-8 ${habilitado ? "text-green-600" : "text-gray-400"}`}
            />
            <div>
              <p className="text-lg font-bold text-slate-800">Respuesta automática</p>
              <p className={`text-sm mt-0.5 ${habilitado ? "text-green-700" : "text-slate-400"}`}>
                {estadoTexto()}
              </p>
            </div>
          </div>
          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={habilitado}
            onClick={() => setHabilitado((v) => !v)}
            className={`relative shrink-0 w-14 h-7 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500 ${
              habilitado ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                habilitado ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
        </CardContent>
      </Card>

      {/* Mensaje */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-700 text-base font-semibold">
            <MessageSquare className="h-4 w-4" />
            Mensaje automático
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={4}
            className="resize-none text-sm"
            placeholder="Escribí el mensaje que se enviará automáticamente..."
          />
          <p className="text-xs text-slate-400">{mensaje.length} caracteres</p>
        </CardContent>
      </Card>

      {/* Horario comercial */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-700 text-base font-semibold">
            <Clock className="h-4 w-4" />
            Horario comercial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="usar-horario"
              checked={usarHorario}
              onCheckedChange={(v) => setUsarHorario(!!v)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="usar-horario" className="cursor-pointer font-medium text-slate-800">
                Usar horario comercial
              </Label>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Cuando está activo, la respuesta automática solo se envía{" "}
                <strong>fuera del horario comercial</strong>. Durante el horario hábil, las
                preguntas quedan sin responder para que las atiendas vos.
              </p>
            </div>
          </div>

          {usarHorario && (
            <div className="space-y-4 pl-7 border-l-2 border-slate-100 ml-1.5">
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-2.5 leading-relaxed">
                Definí el horario en el que <strong>atendés vos</strong> (NO se responde
                automático). Las preguntas que lleguen <strong>fuera</strong> de este rango se
                responden solas. El rango puede cruzar la medianoche: por ejemplo{" "}
                <strong>08:30 – 01:00</strong> significa que atendés de 8:30 a 1:00 AM y el bot
                responde solo de <strong>01:00 a 08:30</strong>.
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <Label className="text-xs text-slate-500 mb-1.5 block">Inicio horario</Label>
                  <Input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="w-32 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1.5 block">Fin horario</Label>
                  <Input
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    className="w-32 h-9"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-500 mb-2 block">Días hábiles</Label>
                <div className="flex gap-2 flex-wrap">
                  {DIAS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDia(d.value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        dias.includes(d.value)
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white h-12 text-base gap-2"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Guardando…" : "Guardar configuración"}
      </Button>
    </div>
  );
}
