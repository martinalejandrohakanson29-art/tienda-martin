"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; 
import { 
  Maximize2, Minimize2, ArrowUp, ArrowDown, Save, Loader2, 
  Check, Copy, XCircle, Truck, Hash, RefreshCw, PlayCircle 
} from "lucide-react";
// 👇 Importamos nuestras nuevas acciones
import { sendPlanningToN8N, runN8nSalesWorkflow, fetchSheetData } from "@/app/actions/planning";

// ... (Componente CopyableCell igual que antes)

export default function PlanningTable({ initialHeaders = [], initialBody = [] }: { initialHeaders?: string[], initialBody?: string[][] }) {
  // 👇 Estados para manejar el flujo dinámico
  const [headers, setHeaders] = useState<string[]>(initialHeaders);
  const [body, setBody] = useState<string[][]>(initialBody);
  const [isProcessingWorkflow, setIsProcessingWorkflow] = useState(false);

  // Estados existentes
  const [expandText, setExpandText] = useState(false);
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
  const [inputValues, setInputValues] = useState<{ [rowIndex: number]: string }>({});
  const [shipmentId, setShipmentId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ index: number | null; direction: "asc" | "desc" }>({ index: null, direction: "asc" });
  const [summaryData, setSummaryData] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition(); 
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // 👇 FUNCIÓN PARA EJECUTAR TODO EL PROCESO
  const handleStartProcess = async () => {
    setIsProcessingWorkflow(true);
    
    // 1. Llamar al Webhook de n8n
    const workflowRes = await runN8nSalesWorkflow();
    
    if (workflowRes.success) {
        // 2. Si n8n terminó bien, traer los datos de la planilla
        const dataRes = await fetchSheetData();
        if (dataRes.success) {
            setHeaders(dataRes.headers);
            setBody(dataRes.body);
        } else {
            alert("⚠️ Workflow OK, pero error al leer la planilla: " + dataRes.message);
        }
    } else {
        alert("❌ Error al ejecutar n8n: " + workflowRes.message);
    }
    
    setIsProcessingWorkflow(false);
  };

  // --- Lógica de Negocio (L = D - K, Totales, Ordenamiento) ---
  const cleanNumber = (value: string) => {
    if (!value) return 0;
    const cleanValue = value.replace(/[^\d.,-]/g, "").replace(/[.]/g, "").replace(",", ".");
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
  };

  const totalQuantity = useMemo(() => {
    return Object.values(inputValues).reduce((acc, val) => acc + cleanNumber(val), 0);
  }, [inputValues]);

  const VISIBLE_INDICES = [0, 1, 2, 3, 8, 9, 10, 11];

  const displayBody = useMemo(() => {
    return body.map(row => {
      const newRow = [...row];
      const valD = cleanNumber(row[3]);
      const valK = cleanNumber(row[10]);
      newRow[11] = (valD - valK).toString();
      return newRow;
    });
  }, [body]);

  // --- Renderizado Condicional ---

  // 👇 1. VISTA INICIAL: Botón de Procesar
  if (body.length === 0 && !isProcessingWorkflow) {
    return (
      <Card className="flex flex-col items-center justify-center p-20 border-dashed border-2 bg-gray-50/50 shadow-inner">
        <div className="text-center space-y-6">
          <div className="bg-blue-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-blue-600 shadow-sm">
            <RefreshCw className="h-12 w-12" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Planificación Lista</h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              Presiona el botón para sincronizar las ventas y el stock actual desde Google Sheets.
            </p>
          </div>
          <Button 
            onClick={handleStartProcess}
            className="bg-blue-600 hover:bg-blue-700 h-16 px-10 text-xl font-black shadow-xl gap-3 transition-all hover:scale-105"
          >
            <PlayCircle className="h-6 w-6" />
            PROCESAR HISTORIAL DE VENTAS Y STOCK
          </Button>
        </div>
      </Card>
    );
  }

  // 👇 2. VISTA DE CARGA: Animación mientras n8n trabaja
  if (isProcessingWorkflow) {
    return (
      <Card className="flex flex-col items-center justify-center p-20 bg-white border-0 shadow-none h-[60vh]">
        <div className="flex flex-col items-center gap-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
            <Loader2 className="h-24 w-24 animate-spin text-blue-600 relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Truck className="h-8 w-8 text-blue-400" />
            </div>
          </div>
          <div className="text-center space-y-3">
            <h3 className="text-2xl font-bold text-gray-800 animate-pulse">Sincronizando planillas...</h3>
            <p className="text-gray-500 font-medium italic">Estamos moviendo los datos en n8n y actualizando el stock.</p>
          </div>
        </div>
      </Card>
    );
  }

  // 👇 3. VISTA DE TABLA: Se muestra cuando ya hay datos
  // ... (Aquí va todo el return de la tabla que ya teníamos configurado anteriormente)
  return (
      <Card className="h-full flex flex-col shadow-none border-0"> 
          {/* ... Resto del código de la tabla ... */}
      </Card>
  );
}
