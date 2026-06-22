"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Package, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { obtenerPedidosAndreaniPendientes } from "@/app/actions/ventas-mostrador";

// ── Endpoints n8n ─────────────────────────────────────────────────────────────

const EP = {
  PROCESS:  "https://n8n.revolucionmotos.tech/webhook/andreani/process",
  APPEND:   "https://n8n.revolucionmotos.tech/webhook/andreani/append",
  DOWNLOAD: "https://n8n.revolucionmotos.tech/webhook/andreani/download",
  CLEAR:    "https://n8n.revolucionmotos.tech/webhook/andreani/clear",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

type PedidoVenta = {
  id: string;
  cliente: string;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  info?: string | null;
  totalFinal: number;
  estadoPedido?: string | null;
  tipoEnvio?: string | null;
  numeroVenta?: number;
  createdAt: string;
  items: { nombre: string; cantidad: number; precio_unit: number }[];
};

type StatusState = "idle" | "loading" | "ok" | "warn" | "error";

type FinalData = Record<string, unknown> & {
  peso_grs?: number;
  alto_cm?: number;
  ancho_cm?: number;
  valor_declarado?: number;
  nombre?: string;
  apellido?: string;
  dni?: string;
  email?: string;
  tel_codigo?: string;
  tel_numero?: string;
  calle?: string;
  numero?: string;
  ciudad?: string;
  partido_o_localidad?: string;
  provincia?: string;
  cp?: string;
  referencias?: string;
  telefono_estado?: string;
  telefono_msg?: string;
  validacion_cp?: string;
  motivo_validacion?: string;
  localidad_sugerida?: string;
  cp_sugerido?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULTS = { peso_grs: 500, alto_cm: 10, ancho_cm: 10, valor_declarado: 50000 };

const ESTADOS_PEDIDO = [
  { value: "TODOS",              label: "Todos" },
  { value: "PENDIENTE",          label: "Pendiente" },
  { value: "LISTO_PARA_PREPARAR", label: "Listo para preparar" },
  { value: "PREPARADO",          label: "Preparado" },
  { value: "DESPACHADO",         label: "Despachado" },
  { value: "ENTREGADO",          label: "Entregado" },
  { value: "CANCELADO",          label: "Cancelado" },
];

function applyDefaults(d: FinalData): FinalData {
  const out = { ...d };
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const cur: unknown = out[k as keyof typeof DEFAULTS];
    if (cur === undefined || cur === null || (typeof cur === "string" && cur.trim() === "")) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function toFinalPayload(d: FinalData): FinalData {
  const keep = [
    "peso_grs","alto_cm","ancho_cm","profundidad_cm","valor_declarado",
    "nombre","apellido","dni","email","tel_codigo","tel_numero",
    "calle","numero","depto","ciudad","partido_o_localidad","provincia","cp","referencias",
    "telefono_estado","telefono_msg",
  ];
  const src: FinalData = { ...d };
  if (!src.tel_codigo && (src as FinalData & { cel_codigo?: string }).cel_codigo) {
    src.tel_codigo = (src as FinalData & { cel_codigo?: string }).cel_codigo;
  }
  if (!src.tel_numero && (src as FinalData & { cel_numero?: string }).cel_numero) {
    src.tel_numero = (src as FinalData & { cel_numero?: string }).cel_numero;
  }
  src.tel_codigo = String(src.tel_codigo ?? "").trim();
  src.tel_numero = String(src.tel_numero ?? "").trim();
  const out: FinalData = {};
  keep.forEach(k => { if (k in src) (out as Record<string, unknown>)[k] = src[k as keyof FinalData]; });
  return out;
}

function formatDni(dni: unknown): string {
  const digits = String(dni ?? "").replace(/\D/g, "");
  if (digits.length === 8) return digits.replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3");
  if (digits.length === 7) return digits.replace(/(\d{1})(\d{3})(\d{3})/, "$1.$2.$3");
  return digits;
}

function extractReferencia(ref: unknown): string {
  if (!ref) return "";
  let txt = String(ref);
  const m = txt.match(/referencia\s*de\s*casa\s*[:\-]?\s*(.+)$/i);
  if (m?.[1]) txt = m[1];
  return txt.replace(/[.,;]+$/, "").trim().toUpperCase();
}

function buildPretty(d: FinalData): string {
  const nombre = String(d.nombre ?? "").trim();
  const apellido = String(d.apellido ?? "").trim();
  const nombreCompleto = `${apellido} ${nombre}`.trim().toUpperCase();
  const dni = formatDni(d.dni);
  const calle = String(d.calle ?? "").toUpperCase();
  const numero = String(d.numero ?? "").toUpperCase();
  const ciudad = String(d.ciudad ?? d.partido_o_localidad ?? "").toUpperCase();
  const provincia = String(d.provincia ?? "").toUpperCase();
  const cp = String(d.cp ?? "").toUpperCase();
  const email = String(d.email ?? "");
  const telCod = String(d.tel_codigo ?? "").trim();
  const telNum = String(d.tel_numero ?? "").trim();
  const tel = telCod && telNum ? `${telCod}-${telNum}` : (telCod + telNum).trim();
  const referencias = extractReferencia(d.referencias);
  const peso = d.peso_grs ?? "";
  const alto = d.alto_cm ?? "";
  const ancho = d.ancho_cm ?? "";
  const valorDec = d.valor_declarado ?? "";

  const lines: string[] = [];
  if (nombreCompleto) lines.push(nombreCompleto);
  if (dni) lines.push(`DNI:${dni}`);
  if (calle || numero) lines.push(`DOMICILIO: ${calle} ${numero}`.trim());
  if (ciudad) lines.push(`CIUDAD: ${ciudad}`);
  if (provincia) lines.push(`PROVINCIA: ${provincia}`);
  if (tel) lines.push(`TEL:${tel}`);
  if (email) lines.push(`E-MAIL: ${email}`);
  if (cp) lines.push(`CODIGO POSTAL:${cp}`);
  if (referencias) lines.push(`REFERENCIA DE CASA: ${referencias}`);
  if (peso !== "") lines.push(`PESO: ${peso}`);
  if (alto !== "") lines.push(`ALTO: ${alto}`);
  if (ancho !== "") lines.push(`ANCHO: ${ancho}`);
  if (valorDec !== "") lines.push(`VALOR DECLARADO: ${valorDec}`);
  return lines.join("\n");
}

function getMissing(d: FinalData): string[] {
  const miss: string[] = [];
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
  if (!has(d.dni)) miss.push("Falta DNI");
  const telOK = (has(d.tel_codigo) && has(d.tel_numero)) || String(d.telefono_estado ?? "").toUpperCase() === "OK";
  if (!telOK) miss.push("Falta teléfono (código y número)");
  if (!/.+@.+\..+/.test(String(d.email ?? ""))) miss.push("Email faltante o inválido");
  if (!has(d.numero)) miss.push("Falta altura de calle");
  return miss;
}

function getWarnings(d: FinalData): string[] {
  const warns: string[] = [];
  if (String(d.numero ?? "").trim() === "0") warns.push("Altura no provista (se usa 0)");
  return warns;
}

async function callJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text?.slice(0, 400) || "(sin cuerpo)"}`);
  if (!ct.includes("application/json")) throw new Error(`Respuesta no JSON: ${text?.slice(0, 400) || "(sin cuerpo)"}`);
  if (!text) throw new Error("El servidor respondió JSON vacío");
  return JSON.parse(text);
}

function buildRawFromPedido(p: PedidoVenta): string {
  const lines: string[] = [];
  if (p.cliente) lines.push(`Nombre completo: ${p.cliente}`);
  if (p.dni) lines.push(`DNI: ${p.dni}`);
  if (p.telefono) lines.push(`Teléfono: ${p.telefono}`);
  if (p.email) lines.push(`E-Mail: ${p.email}`);
  if (p.info) lines.push(p.info);
  return lines.join("\n");
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EnviosAndreaniTab() {
  const [pedidos, setPedidos] = useState<PedidoVenta[]>([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);
  const [pedidoSelId, setPedidoSelId] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");

  const [raw, setRaw] = useState("");
  const [finalData, setFinalData] = useState<FinalData>({});
  const [prettyOut, setPrettyOut] = useState("");
  const [plc, setPlc] = useState("");
  const [sugs, setSugs] = useState("");

  const [peso, setPeso] = useState<string>("");
  const [alto, setAlto] = useState<string>("");
  const [ancho, setAncho] = useState<string>("");
  const [valorDeclarado, setValorDeclarado] = useState<string>("50000");

  const [status, setStatus] = useState<StatusState>("idle");
  const [statusMsg, setStatusMsg] = useState("—");
  const [missing, setMissing] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [telefonoMsg, setTelefonoMsg] = useState("");

  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [addedItems, setAddedItems] = useState<string[]>([]);

  // ── Cargar pedidos ──────────────────────────────────────────────────────────

  const cargarPedidos = useCallback(async (estado?: string) => {
    setCargandoPedidos(true);
    setStatus("loading");
    setStatusMsg("Cargando pedidos…");
    try {
      const filtro = estado ?? estadoFiltro;
      const data = await obtenerPedidosAndreaniPendientes(filtro);
      setPedidos(data as PedidoVenta[]);
      setStatus("ok");
      const label = filtro === "TODOS" ? "todos los estados" : filtro;
      setStatusMsg(`${data.length} pedidos (${label})`);
      setPedidoSelId("");
    } catch (e) {
      setStatus("error");
      setStatusMsg("No se pudieron cargar los pedidos: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCargandoPedidos(false);
    }
  }, [estadoFiltro]);

  useEffect(() => { cargarPedidos(); }, []);

  // ── Selección de pedido ─────────────────────────────────────────────────────

  const handlePedidoChange = (id: string) => {
    setPedidoSelId(id);
    if (!id) return;
    const p = pedidos.find(x => x.id === id);
    if (!p) return;
    const rawText = buildRawFromPedido(p);
    setRaw(rawText);
    setStatus("ok");
    setStatusMsg(`Pedido #${p.numeroVenta ?? p.id.slice(0, 8)} cargado`);
  };

  // ── Sync controles → finalData ──────────────────────────────────────────────

  const syncControls = useCallback((base: FinalData) => {
    const updated = { ...base };
    const p = Number(peso); if (Number.isFinite(p) && p > 0) updated.peso_grs = p;
    const a = Number(alto); if (Number.isFinite(a) && a > 0) updated.alto_cm = a;
    const an = Number(ancho); if (Number.isFinite(an) && an > 0) updated.ancho_cm = an;
    const vd = Number(valorDeclarado); if (Number.isFinite(vd) && vd > 0) updated.valor_declarado = vd;
    return updated;
  }, [peso, alto, ancho, valorDeclarado]);

  const applyAndRender = useCallback((d: FinalData) => {
    const merged = syncControls(applyDefaults(d));
    setFinalData(merged);
    setPrettyOut(buildPretty(merged));
    const miss = getMissing(merged);
    const warns = getWarnings(merged);
    setMissing(miss);
    setWarnings(warns);
    const tMsg = String((merged as FinalData & { telefono_msg?: string }).telefono_msg ?? "").trim();
    const tState = String(merged.telefono_estado ?? "").toUpperCase();
    setTelefonoMsg(tState !== "OK" ? tMsg : "");
    setCanConfirm(miss.length === 0 && (merged.validacion_cp ?? "OK") !== "REVISAR");
    setPeso(String(merged.peso_grs ?? ""));
    setAlto(String(merged.alto_cm ?? ""));
    setAncho(String(merged.ancho_cm ?? ""));
    setValorDeclarado(String(merged.valor_declarado ?? ""));
  }, [syncControls]);

  // ── Procesar con IA ─────────────────────────────────────────────────────────

  const onProcess = async () => {
    if (!raw.trim()) {
      setStatus("error");
      setStatusMsg("Pegá el texto del cliente o elegí un pedido");
      return;
    }
    setProcesando(true);
    setStatus("loading");
    setStatusMsg("Procesando…");
    setCanConfirm(false);
    try {
      const out = await callJSON(EP.PROCESS, { body: { raw } });
      let d: FinalData = out?.data ?? out;
      if (Array.isArray(d)) d = (d[0] as FinalData) ?? {};

      const prov = String(d.provincia ?? "").toUpperCase();
      const loc = String(d.partido_o_localidad ?? d.ciudad ?? "").toUpperCase();
      const cp = String(d.cp ?? "");
      setPlc(`${prov} / ${loc} / ${cp}`);
      setSugs([d.localidad_sugerida, d.cp_sugerido].filter(Boolean).join(" · "));

      const estado = String(d.validacion_cp ?? "OK");
      const info = String(d.motivo_validacion ?? "");
      setStatus(estado === "OK" ? "ok" : estado === "CORREGIDO" ? "warn" : "error");
      setStatusMsg(info || estado);

      applyAndRender(toFinalPayload(d));
    } catch (e) {
      setStatus("error");
      setStatusMsg(e instanceof Error ? e.message : String(e));
      setCanConfirm(false);
    } finally {
      setProcesando(false);
    }
  };

  // ── Confirmar y agregar ─────────────────────────────────────────────────────

  const onConfirm = async () => {
    setConfirmando(true);
    try {
      await callJSON(EP.APPEND, { data: finalData });
      setStatus("ok");
      setStatusMsg("Agregado a la hoja Carga");
      const label = pedidos.find(p => p.id === pedidoSelId)
        ? `${pedidos.find(p => p.id === pedidoSelId)?.numeroVenta ?? pedidoSelId.slice(0, 8)} - ${pedidos.find(p => p.id === pedidoSelId)?.cliente}`
        : raw.split("\n")[0]?.trim() || "Pedido manual";
      if (label && !addedItems.includes(label)) setAddedItems(prev => [...prev, label]);
      setRaw("");
      setPedidoSelId("");
    } catch (e) {
      setStatus("error");
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmando(false);
    }
  };

  // ── Descargar XLSX ──────────────────────────────────────────────────────────

  const onDownload = () => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = EP.DOWNLOAD;
    let cleared = false;
    const doClear = async () => {
      if (cleared) return;
      cleared = true;
      try {
        const res = await fetch(EP.CLEAR, { method: "POST", keepalive: true });
        if (!res.ok) throw new Error(`Clear falló (${res.status})`);
        setAddedItems([]);
        alert("Listo: descarga iniciada y la hoja \"Carga\" quedó vacía.");
      } catch (e) {
        alert(`Descarga ok, pero falló el borrado de "Carga". Revisá n8n/CORS/token.`);
      } finally {
        setTimeout(() => iframe.remove(), 2000);
      }
    };
    const fallback = setTimeout(doClear, 2000);
    iframe.onload = () => { clearTimeout(fallback); doClear(); };
    document.body.appendChild(iframe);
  };

  // ── Re-render pretty cuando cambian los controles ───────────────────────────

  const onControlChange = () => {
    if (Object.keys(finalData).length === 0) return;
    applyAndRender(finalData);
  };

  // ── UI ──────────────────────────────────────────────────────────────────────

  const statusColor = status === "ok" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : status === "warn" ? "bg-amber-100 text-amber-800 border-amber-300"
    : status === "error" ? "bg-red-100 text-red-800 border-red-300"
    : status === "loading" ? "bg-blue-100 text-blue-800 border-blue-300"
    : "bg-slate-100 text-slate-600 border-slate-300";

  return (
    <div className="flex-grow overflow-auto p-6 bg-slate-50">
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Panel izquierdo: Entrada ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-blue-600 flex items-center gap-2">
              <Package className="h-5 w-5" /> Entrada de Pedido
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              1. Cargá un pedido de ventas y luego procesá con IA.
            </p>
          </div>

          {/* Filtro por estado + botón actualizar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Filtrar por estado
              </label>
              <select
                value={estadoFiltro}
                onChange={e => {
                  const val = e.target.value;
                  setEstadoFiltro(val);
                  cargarPedidos(val);
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {ESTADOS_PEDIDO.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => cargarPedidos()}
              disabled={cargandoPedidos}
              variant="outline"
              className="h-9 gap-2"
            >
              {cargandoPedidos ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar
            </Button>
          </div>

          {/* Dropdown de pedidos */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Pedido ({pedidos.length} disponibles)
            </label>
            <select
              value={pedidoSelId}
              onChange={e => handlePedidoChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Elegí un pedido…</option>
              {pedidos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.numeroVenta ? `#${p.numeroVenta} - ` : ""}{p.cliente}
                  {p.estadoPedido ? ` [${p.estadoPedido}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Textarea raw */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Datos del cliente (editable)
            </label>
            <Textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={"Pega aquí los datos del cliente, por ejemplo:\nNombre completo: ...\nDNI: ...\nDomicilio: ...\n..."}
              className="h-52 text-sm font-mono resize-y"
            />
          </div>

          <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2">
            <Button
              onClick={onProcess}
              disabled={procesando || !raw.trim()}
              className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
            >
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : "⚙️"}
              Procesar con IA
            </Button>
            <Button
              onClick={onConfirm}
              disabled={confirmando || !canConfirm}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar y agregar
            </Button>
            <Button
              onClick={onDownload}
              variant="outline"
              className="gap-2"
            >
              ⬇️ Descargar XLSX
            </Button>
          </div>

          {/* Pedidos agregados en esta sesión */}
          {addedItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                ✅ Pedidos agregados en esta sesión:
              </p>
              <div className="flex flex-wrap gap-2">
                {addedItems.map(lbl => (
                  <Badge key={lbl} className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold">
                    {lbl}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Panel derecho: Previsualización ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-rose-500 flex items-center gap-2">
              ✨ Previsualización y Validación
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              2. Revisá los datos, corregí lo necesario y Confirmá.
            </p>
          </div>

          {/* Dimensiones */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
              📦 Dimensiones y valor por defecto:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Peso (grs)", val: peso, set: setPeso },
                { label: "Alto (cm)", val: alto, set: setAlto },
                { label: "Ancho (cm)", val: ancho, set: setAncho },
                { label: "Valor declarado ($)", val: valorDeclarado, set: setValorDeclarado },
              ].map(({ label, val, set }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
                  <Input
                    type="number"
                    value={val}
                    min={1}
                    onChange={e => { set(e.target.value); onControlChange(); }}
                    className="h-9 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Estado */}
          <div className="flex items-center gap-3">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold border ${statusColor}`}>
              {status === "loading" ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Procesando</span>
                : status === "ok" ? <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />OK</span>
                : status === "warn" ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Corregido</span>
                : status === "error" ? <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Revisar</span>
                : "Esperando…"}
            </span>
            <span className="text-sm text-slate-500 truncate">{statusMsg}</span>
          </div>

          {/* Alertas de validación */}
          {(missing.length > 0 || warnings.length > 0 || telefonoMsg) && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">⚠️ Avisos de validación:</p>
              <div className="flex flex-wrap gap-2">
                {warnings.map(w => (
                  <Badge key={w} className="bg-amber-100 text-amber-800 border border-amber-300">{w}</Badge>
                ))}
                {missing.map(m => (
                  <Badge key={m} className="bg-red-100 text-red-800 border border-red-300">{m}</Badge>
                ))}
                {telefonoMsg && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-300">{telefonoMsg}</Badge>
                )}
              </div>
            </div>
          )}

          {/* Datos finales */}
          {prettyOut && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">📋 Datos finales para la hoja:</p>
              <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                {prettyOut}
              </pre>
            </div>
          )}

          {/* Provincia / Localidad / CP */}
          {(plc || sugs) && (
            <div className="grid grid-cols-1 gap-3">
              {plc && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Provincia / Localidad / CP</label>
                  <Input value={plc} readOnly className="text-sm bg-slate-50" />
                </div>
              )}
              {sugs && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Sugerencias (CP / Localidad)</label>
                  <Input value={sugs} readOnly className="text-sm bg-slate-50" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
