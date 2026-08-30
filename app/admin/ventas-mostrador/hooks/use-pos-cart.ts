import { useState, useMemo, useCallback } from "react";
import { Articulo, ItemVenta } from "../types";
import {
  redondearA50,
  calcularPrecioArt,
  calcularMarcacion,
  expandirPackEnComponentes,
} from "../constants";

export function usePosCart(articulos: Articulo[]) {
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [interesTarjeta, setInteresTarjeta] = useState<number>(0);
  const [descuentoTipo, setDescuentoTipo] = useState<"porcentaje" | "monto">("porcentaje");
  const [descuentoValor, setDescuentoValor] = useState<number>(0);
  const [showNotaInput, setShowNotaInput] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [expandirPacks, setExpandirPacks] = useState(true);

  // Estados de edición rápida en línea
  const [marcacionItemEditId, setMarcacionItemEditId] = useState<string | null>(null);
  const [marcacionItemTemp, setMarcacionItemTemp] = useState<string>("");
  const [precioItemEditId, setPrecioItemEditId] = useState<string | null>(null);
  const [precioItemTemp, setPrecioItemTemp] = useState<string>("");

  // Agregar artículo al carrito
  const agregarProducto = useCallback(
    (prod: Articulo, precioOverride?: number) => {
      const precioUnit = redondearA50(
        precioOverride !== undefined ? precioOverride : Number(prod.precio)
      );

      if (prod.esPack && expandirPacks) {
        const componentes = expandirPackEnComponentes(prod.id, articulos);
        if (componentes.length > 0) {
          setItems((prev) => {
            const copia = [...prev];
            for (const comp of componentes) {
              const idx = copia.findIndex((i) => (i.productoId ?? i.id) === comp.id && !i.esNota);
              if (idx > -1) {
                copia[idx] = {
                  ...copia[idx],
                  cantidad: copia[idx].cantidad + comp.cantidad,
                  subtotal: (copia[idx].cantidad + comp.cantidad) * copia[idx].precio_unit,
                };
              } else {
                copia.push(comp);
              }
            }
            return copia;
          });
          return;
        }
      }

      setItems((prev) => {
        const idx = prev.findIndex((i) => (i.productoId ?? i.id) === prod.id && !i.esNota);
        if (idx > -1) {
          const nuevaCant = prev[idx].cantidad + 1;
          const copia = [...prev];
          copia[idx] = {
            ...copia[idx],
            cantidad: nuevaCant,
            subtotal: nuevaCant * copia[idx].precio_unit,
          };
          return copia;
        }

        const componentesPack =
          prod.esPack && !expandirPacks
            ? expandirPackEnComponentes(prod.id, articulos)
            : undefined;

        return [
          ...prev,
          {
            id: prod.id,
            productoId: prod.id,
            nombre: prod.nombre,
            cantidad: 1,
            precio_unit: precioUnit,
            subtotal: precioUnit,
            stock: prod.stock,
            ultimaModificacion: prod.ultimaModificacion,
            esPack: prod.esPack,
            costo: prod.costo,
            packComponentes: componentesPack,
          },
        ];
      });
    },
    [articulos, expandirPacks]
  );

  // Agregar nota
  const agregarNota = useCallback(() => {
    if (!notaTexto.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nombre: notaTexto.trim(),
        cantidad: 0,
        precio_unit: 0,
        subtotal: 0,
        stock: 0,
        esNota: true,
      },
    ]);
    setNotaTexto("");
    setShowNotaInput(false);
  }, [notaTexto]);

  // Actualizar cantidad de un ítem
  const actualizarCantidad = useCallback((itemId: string, cantidad: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              cantidad: Math.max(0, cantidad),
              subtotal: Math.max(0, cantidad) * i.precio_unit,
            }
          : i
      )
    );
  }, []);

  // Eliminar ítem
  const eliminarItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  // Edición de marcación en línea
  const iniciarEdicionMarcacion = useCallback((item: ItemVenta) => {
    if (!item.costo || item.costo <= 0) return;
    const marcActual = calcularMarcacion(item.costo, item.precio_unit);
    setMarcacionItemEditId(item.id);
    setMarcacionItemTemp(marcActual !== null ? String(Number(marcActual.toFixed(1))) : "");
  }, []);

  const cancelarEdicionMarcacion = useCallback(() => {
    setMarcacionItemEditId(null);
    setMarcacionItemTemp("");
  }, []);

  const guardarMarcacion = useCallback((item: ItemVenta) => {
    const nuevoMargen = Number(marcacionItemTemp);
    if (marcacionItemTemp.trim() === "" || isNaN(nuevoMargen) || !item.costo || item.costo <= 0) {
      cancelarEdicionMarcacion();
      return;
    }
    const nuevoPrecio = calcularPrecioArt(item.costo, nuevoMargen);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, precio_unit: nuevoPrecio, subtotal: i.cantidad * nuevoPrecio }
          : i
      )
    );
    cancelarEdicionMarcacion();
  }, [marcacionItemTemp, cancelarEdicionMarcacion]);

  // Edición de precio unitario en línea
  const iniciarEdicionPrecio = useCallback((item: ItemVenta) => {
    setPrecioItemEditId(item.id);
    setPrecioItemTemp(String(redondearA50(item.precio_unit)));
  }, []);

  const guardarPrecio = useCallback((item: ItemVenta) => {
    const nuevoPrecio = redondearA50(Number(precioItemTemp) || 0);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, precio_unit: nuevoPrecio, subtotal: i.cantidad * nuevoPrecio }
          : i
      )
    );
    setPrecioItemEditId(null);
    setPrecioItemTemp("");
  }, [precioItemTemp]);

  const obtenerPrecioItemEnVivo = useCallback(
    (item: ItemVenta): number => {
      if (marcacionItemEditId === item.id && item.costo && item.costo > 0) {
        const tempMarc = Number(marcacionItemTemp);
        if (marcacionItemTemp.trim() !== "" && !isNaN(tempMarc)) {
          return calcularPrecioArt(item.costo, tempMarc);
        }
      }
      return redondearA50(item.precio_unit);
    },
    [marcacionItemEditId, marcacionItemTemp]
  );

  // Totales
  const totalBase = useMemo(
    () => items.reduce((acc, item) => acc + (item.subtotal || 0), 0),
    [items]
  );

  const montoDescuento = useMemo(() => {
    if (descuentoTipo === "porcentaje") {
      return (totalBase * (descuentoValor || 0)) / 100;
    }
    return Math.min(descuentoValor || 0, totalBase);
  }, [totalBase, descuentoTipo, descuentoValor]);

  const totalConDescuento = useMemo(
    () => Math.max(0, totalBase - montoDescuento),
    [totalBase, montoDescuento]
  );

  const totalACobrar = useMemo(
    () => Math.round(totalConDescuento * (1 + interesTarjeta / 100)),
    [totalConDescuento, interesTarjeta]
  );

  const resetCart = useCallback(() => {
    setItems([]);
    setInteresTarjeta(0);
    setDescuentoTipo("porcentaje");
    setDescuentoValor(0);
    setShowNotaInput(false);
    setNotaTexto("");
    setMarcacionItemEditId(null);
    setMarcacionItemTemp("");
    setPrecioItemEditId(null);
    setPrecioItemTemp("");
  }, []);

  return {
    items,
    setItems,
    interesTarjeta,
    setInteresTarjeta,
    descuentoTipo,
    setDescuentoTipo,
    descuentoValor,
    setDescuentoValor,
    showNotaInput,
    setShowNotaInput,
    notaTexto,
    setNotaTexto,
    expandirPacks,
    setExpandirPacks,
    agregarProducto,
    agregarNota,
    actualizarCantidad,
    eliminarItem,
    iniciarEdicionMarcacion,
    cancelarEdicionMarcacion,
    guardarMarcacion,
    marcacionItemEditId,
    marcacionItemTemp,
    setMarcacionItemTemp,
    iniciarEdicionPrecio,
    guardarPrecio,
    precioItemEditId,
    precioItemTemp,
    setPrecioItemTemp,
    obtenerPrecioItemEnVivo,
    totalBase,
    montoDescuento,
    totalConDescuento,
    totalACobrar,
    resetCart,
  };
}
