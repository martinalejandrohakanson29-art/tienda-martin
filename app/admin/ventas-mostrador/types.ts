export interface Articulo {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  esServicio?: boolean;
  oculto?: boolean;
  costo?: number;
  margenGanancia?: number;
  packItems?: {
    id: string;
    componenteId: string;
    componente: {
      id: string;
      nombre: string;
      precio: number;
      stock: number;
      costo?: number;
    };
    cantidad: number;
  }[];
}

export interface ItemVenta {
  id: string;
  productoId?: string;
  nombre: string;
  cantidad: number;
  precio_unit: number;
  subtotal: number;
  stock: number;
  ultimaModificacion?: string | null;
  esPack?: boolean;
  esServicio?: boolean;
  esNota?: boolean;
  costo?: number;
  packComponentes?: {
    id: string;
    nombre: string;
    cantidad: number;
    precio_unit: number;
    subtotal: number;
    stock: number;
  }[];
}

export interface PuntoVenta {
  id: string;
  nombre: string;
  color?: string | null;
  sucursalId?: string | null;
}

export interface Proveedor {
  id: string;
  razonSocial: string;
  cuit: string;
  nombreFantasia?: string | null;
  email?: string | null;
  telefono?: string | null;
  observaciones?: string | null;
  total?: number | null;
  saldoAnterior?: number | null;
  saldoVencido?: number | null;
}

export interface VentaMostrador {
  id: string;
  numeroVenta?: number | null;
  createdAt: string | Date;
  cliente: string;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  total: number;
  interes?: number | null;
  totalFinal: number;
  metodo_pago: string;
  items: any[];
  itemsCount?: number;
  puntoVentaId?: string | null;
  puntoVenta?: any;
  info?: string | null;
  cupon?: string | null;
  transaccionId?: string | null;
  de?: string | null;
  para?: string | null;
  cae?: string | null;
  vencimientoCae?: string | Date | null;
  facturaNumero?: number | null;
  facturaPuntoVenta?: number | null;
  tipoComprobante?: number | null;
  docTipo?: number | null;
  docNro?: string | null;
  condicionIva?: number | null;
  eventoOffline?: boolean | null;
  mlIdVenta?: string | null;
  mlIdEnvio?: string | null;
  mlPackId?: string | null;
  mlMla?: string | null;
  mlDni?: string | null;
  mlAlerta?: boolean | null;
  mlObservacion?: string | null;
  estadoPedido?: string | null;
  tipoVenta?: string | null;
}
