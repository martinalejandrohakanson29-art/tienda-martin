import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateN8nToken } from "@/lib/webhook-guard";

export const dynamic = "force-dynamic";

// Calcula si el auto-responder debe dispararse ahora mismo.
// La lógica: si "usarHorario" está activo, responde FUERA del horario comercial.
function computeDebeResponder(config: {
  habilitado: boolean;
  usarHorario: boolean;
  horaInicioComercial: string;
  horaFinComercial: string;
  diasComerciales: string;
}): boolean {
  if (!config.habilitado) return false;
  if (!config.usarHorario) return true;

  // Hora actual en Argentina (UTC-3)
  const now = new Date();
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  // getUTCDay() en la fecha desplazada da el día local; 0=Dom → convertimos a 7
  const diaSemana = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  const diasComerciales = config.diasComerciales.split(",").map(Number).filter(Boolean);

  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  const horaActual = `${hh}:${mm}`;

  // ¿Estamos dentro del horario comercial?
  // Si fin <= inicio, el rango cruza la medianoche (ej: 08:30 → 01:00).
  const dentroComercial =
    config.horaInicioComercial <= config.horaFinComercial
      ? horaActual >= config.horaInicioComercial && horaActual < config.horaFinComercial
      : horaActual >= config.horaInicioComercial || horaActual < config.horaFinComercial;

  // Si hoy es día hábil Y estamos dentro del horario comercial → NO responder
  if (diasComerciales.includes(diaSemana) && dentroComercial) {
    return false;
  }

  return true;
}

export async function GET(req: Request) {
  const unauthorized = validateN8nToken(req);
  if (unauthorized) return unauthorized;

  try {
    let config = await prisma.mlAutoRespuesta.findFirst();
    if (!config) {
      config = await prisma.mlAutoRespuesta.create({ data: {} });
    }

    return NextResponse.json({
      ...config,
      debeResponder: computeDebeResponder(config),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
