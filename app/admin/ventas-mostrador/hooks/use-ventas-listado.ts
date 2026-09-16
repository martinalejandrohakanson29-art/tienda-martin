import { useState, useMemo, useEffect, useCallback } from "react";
import { normalizeText } from "../constants";
import {
  obtenerVentasPorRango,
  obtenerVentasMLPorRango,
  buscarVentaGlobalPorMLId,
  buscarVentaGlobalPorArticulo,
} from "@/app/actions/ventas-mostrador";

export type TipoBusqueda =
  | "venta"
  | "cliente"
  | "articulo"
  | "mla_venta"
  | "mla_envio";

const ITEMS_POR_PAGINA = 50;

export function useVentasListado() {
  const hoyStr = new Date().toISOString().split("T")[0];
  const [fechaDesde, setFechaDesde] = useState(hoyStr);
  const [fechaHasta, setFechaHasta] = useState(hoyStr);

  const [ventasRealizadas, setVentasRealizadas] = useState<any[]>([]);
  const [ventasML, setVentasML] = useState<any[]>([]);
  const [ventasGlobales, setVentasGlobales] = useState<any[] | null>(null);
  const [avisoPendienteML, setAvisoPendienteML] = useState<string | null>(null);
  const [busquedaGlobalTerm, setBusquedaGlobalTerm] = useState<string | null>(null);

  const [isLoadingVentas, setIsLoadingVentas] = useState(false);
  const [isLoadingML, setIsLoadingML] = useState(false);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Filtros
  const [mostrarSoloOffline, setMostrarSoloOffline] = useState(false);
  const [filtroPuntoVenta, setFiltroPuntoVenta] = useState<string[]>([]);
  const [tipoBusqueda, setTipoBusqueda] = useState<TipoBusqueda>("venta");
  const [filtroBusquedaTexto, setFiltroBusquedaTexto] = useState("");
  const [debouncedBusquedaTexto, setDebouncedBusquedaTexto] = useState("");
  const [filtroMetodoPago, setFiltroMetodoPago] = useState("");

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);

  // Debounce en el texto de búsqueda (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBusquedaTexto(filtroBusquedaTexto);
      setPaginaActual(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [filtroBusquedaTexto]);

  // Limpiar ventas globales al cambiar búsqueda
  useEffect(() => {
    setVentasGlobales(null);
    setAvisoPendienteML(null);
    setBusquedaGlobalTerm(null);
  }, [filtroBusquedaTexto, tipoBusqueda]);

  const cargarVentas = useCallback(async (desde: string, hasta: string) => {
    setIsLoadingVentas(true);
    try {
      const res = await obtenerVentasPorRango(desde, hasta, true);
      if (res.success) {
        setVentasRealizadas(res.data || []);
      }
    } catch (error) {
      console.error("Error al cargar ventas:", error);
    } finally {
      setIsLoadingVentas(false);
    }
  }, []);

  const cargarVentasML = useCallback(async (desde: string, hasta: string) => {
    setIsLoadingML(true);
    try {
      const res = await obtenerVentasMLPorRango(desde, hasta);
      if (res.success) {
        setVentasML(res.data || []);
      }
    } catch (error) {
      console.error("Error al cargar ventas ML:", error);
    } finally {
      setIsLoadingML(false);
    }
  }, []);

  const handleCargar = useCallback(async () => {
    setVentasML([]);
    setPaginaActual(1);
    await Promise.all([
      cargarVentas(fechaDesde, fechaHasta),
      cargarVentasML(fechaDesde, fechaHasta),
    ]);
  }, [fechaDesde, fechaHasta, cargarVentas, cargarVentasML]);

  const handleBuscarGlobal = useCallback(async (terminoManual?: string) => {
    const term = (terminoManual ?? filtroBusquedaTexto).trim();
    if (!term) return;
    setIsSearchingGlobal(true);
    setAvisoPendienteML(null);
    setBusquedaGlobalTerm(term);
    try {
      if (tipoBusqueda === "articulo") {
        const res = await buscarVentaGlobalPorArticulo(term);
        if (res.success) {
          setVentasGlobales(res.data || []);
          setPaginaActual(1);
        }
      } else {
        const res = await buscarVentaGlobalPorMLId(term);
        if (res.success) {
          setVentasGlobales(res.data || []);
          if (res.avisoPendiente) {
            setAvisoPendienteML(res.avisoPendiente);
          }
          setPaginaActual(1);
        }
      }
    } catch (error) {
      console.error("Error en búsqueda global:", error);
    } finally {
      setIsSearchingGlobal(false);
    }
  }, [filtroBusquedaTexto, tipoBusqueda]);

  // Carga inicial
  useEffect(() => {
    handleCargar();
  }, []);

  const todasLasVentas = useMemo(
    () => [...ventasRealizadas, ...ventasML],
    [ventasRealizadas, ventasML]
  );

  const ventasFiltradas = useMemo(() => {
    return todasLasVentas.filter((v) => {
      const cumpleOffline = mostrarSoloOffline ? v.eventoOffline === true : true;
      const cumplePuntoVenta =
        filtroPuntoVenta.length > 0 ? filtroPuntoVenta.includes(v.puntoVentaId) : true;

      const cumpleBusqueda = debouncedBusquedaTexto.trim()
        ? (() => {
            const queryWords = normalizeText(debouncedBusquedaTexto)
              .split(/\s+/)
              .filter(Boolean);
            if (queryWords.length === 0) return true;

            if (tipoBusqueda === "venta") {
              const ventaIdNorm = normalizeText(v.id);
              const numVenta = v.numeroVenta?.toString() || "";
              const dniNorm = normalizeText(v.dni);
              return queryWords.every(
                (w) => ventaIdNorm.includes(w) || numVenta.includes(w) || dniNorm.includes(w)
              );
            }
            if (tipoBusqueda === "cliente") {
              const clienteNorm = normalizeText(v.cliente);
              const dniNorm = normalizeText(v.dni);
              const emailNorm = normalizeText(v.email);
              const combined = `${clienteNorm} ${dniNorm} ${emailNorm}`;
              return queryWords.every((w) => combined.includes(w));
            }
            if (tipoBusqueda === "articulo") {
              const tieneItemMatch = v.items?.some((i: any) => {
                const itemText = normalizeText(
                  `${i.nombre || ""} ${i.productoId || ""} ${i.id || ""}`
                );
                return queryWords.every((w) => itemText.includes(w));
              });
              if (tieneItemMatch) return true;

              const saleAllItemsText = normalizeText(
                (v.items || [])
                  .map((i: any) => `${i.nombre || ""} ${i.productoId || ""} ${i.id || ""}`)
                  .join(" ") +
                  " " +
                  (v.mlMla || "")
              );
              return queryWords.every((w) => saleAllItemsText.includes(w));
            }
            if (tipoBusqueda === "mla_venta") {
              const mlIdNorm = normalizeText(v.mlIdVenta);
              const mlPackNorm = normalizeText(v.mlPackId);
              const transaccionNorm = normalizeText(v.transaccionId);
              const cuponNorm = normalizeText(v.cupon);
              const deNorm = normalizeText(v.de);
              return queryWords.every(
                (w) =>
                  mlIdNorm.includes(w) ||
                  mlPackNorm.includes(w) ||
                  transaccionNorm.includes(w) ||
                  cuponNorm.includes(w) ||
                  deNorm.includes(w)
              );
            }
            if (tipoBusqueda === "mla_envio") {
              const mlEnvioNorm = normalizeText(v.mlIdEnvio);
              const transaccionNorm = normalizeText(v.transaccionId);
              const paraNorm = normalizeText(v.para);
              const cuponNorm = normalizeText(v.cupon);
              return queryWords.every(
                (w) =>
                  mlEnvioNorm.includes(w) ||
                  transaccionNorm.includes(w) ||
                  paraNorm.includes(w) ||
                  cuponNorm.includes(w)
              );
            }
            return true;
          })()
        : true;

      const cumpleMetodoPago = filtroMetodoPago
        ? filtroMetodoPago === "MercadoLibre"
          ? v.metodo_pago === "MercadoLibre" || v.metodo_pago === "mercadopago (ML)"
          : v.metodo_pago === filtroMetodoPago
        : true;

      return cumpleOffline && cumplePuntoVenta && cumpleBusqueda && cumpleMetodoPago;
    });
  }, [
    todasLasVentas,
    mostrarSoloOffline,
    filtroPuntoVenta,
    debouncedBusquedaTexto,
    tipoBusqueda,
    filtroMetodoPago,
  ]);

  const esBusquedaML = tipoBusqueda === "mla_venta" || tipoBusqueda === "mla_envio";
  const esBusquedaGlobal = esBusquedaML || tipoBusqueda === "articulo";

  // Disparo automático de búsqueda global cuando se busca un ID de ML (>= 4 caracteres)
  // y no se encuentra en las ventas del día actual cargadas.
  useEffect(() => {
    const term = debouncedBusquedaTexto.trim();
    if (
      esBusquedaML &&
      term.length >= 4 &&
      ventasFiltradas.length === 0 &&
      ventasGlobales === null &&
      !isSearchingGlobal
    ) {
      handleBuscarGlobal(term);
    }
  }, [
    debouncedBusquedaTexto,
    esBusquedaML,
    ventasFiltradas.length,
    ventasGlobales,
    isSearchingGlobal,
    handleBuscarGlobal,
  ]);

  const mostrandoGlobal =
    ventasFiltradas.length === 0 && ventasGlobales !== null && ventasGlobales.length > 0;
  const sinResultadosGlobales =
    ventasFiltradas.length === 0 && ventasGlobales !== null && ventasGlobales.length === 0;
  const busquedaGlobalRealizada = busquedaGlobalTerm !== null && !isSearchingGlobal;
  const ventasParaTabla = mostrandoGlobal ? ventasGlobales! : ventasFiltradas;

  const totalItems = ventasParaTabla.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItems / ITEMS_POR_PAGINA));

  const ventasPaginadas = useMemo(() => {
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    return ventasParaTabla.slice(inicio, inicio + ITEMS_POR_PAGINA);
  }, [ventasParaTabla, paginaActual]);

  return {
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    ventasRealizadas,
    setVentasRealizadas,
    ventasML,
    setVentasML,
    ventasGlobales,
    avisoPendienteML,
    busquedaGlobalTerm,
    busquedaGlobalRealizada,
    sinResultadosGlobales,
    isLoadingVentas,
    isLoadingML,
    isSearchingGlobal,
    mostrarSoloOffline,
    setMostrarSoloOffline,
    filtroPuntoVenta,
    setFiltroPuntoVenta,
    tipoBusqueda,
    setTipoBusqueda,
    filtroBusquedaTexto,
    setFiltroBusquedaTexto,
    filtroMetodoPago,
    setFiltroMetodoPago,
    paginaActual,
    setPaginaActual,
    totalPaginas,
    totalItems,
    itemsPorPagina: ITEMS_POR_PAGINA,
    ventasFiltradas,
    ventasParaTabla,
    ventasPaginadas,
    mostrandoGlobal,
    esBusquedaGlobal,
    cargarVentas,
    cargarVentasML,
    handleCargar,
    handleBuscarGlobal,
  };
}
