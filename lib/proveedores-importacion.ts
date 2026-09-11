export interface ProveedorImportacionInfo {
  id: string
  nombre: string
  nombreCorto: string
  nombreOriginalFabrica?: string
  taxId: string
  telefono: string
  fax?: string
  direccion: string
  ciudad: string
  provincia: string
  pais: string
  condicionesGenerales: {
    packing: string
    paymentTerm: string
    portOfLoading: string
    destination: string
  }
  datosBancarios: {
    swift: string
    accountNumber: string
    accountName: string
    bankName: string
    bankAddress: string
    countryRegion: string
    typeOfAccount: string
    bankCode?: string
    branchCode?: string
  }
}

export interface CompradorImportacionInfo {
  nombre: string
  cuit: string
  telefono: string
  ciudad: string
  provincia: string
  pais: string
  direccion: string
}

export const COMPRADOR_OFICIAL: CompradorImportacionInfo = {
  nombre: "OLIVA PEIRONE JOSE LUIS",
  cuit: "20269957361",
  telefono: "+5493516864436",
  ciudad: "CORDOBA",
  provincia: "CORDOBA",
  pais: "ARGENTINA",
  direccion: "REVOLUCION DE MAYO 1605 DPTO:5-BARRIO",
}

export const PROVEEDORES_IMPORTACION_PRECARGADOS: ProveedorImportacionInfo[] = [
  {
    id: "cmoll33dc001cnhpx3ky6c6l1",
    nombre: "CHINA-MATT",
    nombreCorto: "CHINA-MATT",
    nombreOriginalFabrica: "Fuding Guansheng Locomotive Parts Co., Ltd",
    taxId: "91350982MA332EQXXM",
    telefono: "+86 13860327361 / +86-593-7568961",
    fax: "+86-593-7568960",
    direccion: "No.7 Tietang Industrial Park B, Shanqian District",
    ciudad: "Fuding County, Ningde City",
    provincia: "Fujian Province",
    pais: "China",
    condicionesGenerales: {
      packing: 'STANDARD CARTON PACKING with " made in china "',
      paymentTerm: "50% advance - 50% boarded",
      portOfLoading: "CHINA",
      destination: "CORDOBA - ARGENTINA",
    },
    datosBancarios: {
      swift: "DHBKHKHH (DHBKHKHHXXX * If 11 characters are required)",
      accountNumber: "79969133739",
      accountName: "Fuding Guansheng Locomotive Parts Co., Ltd.",
      bankName: "DBS Bank (Hong Kong) Limited",
      bankAddress: "11th Floor, The Center, 99 Queen's Road Central, Central, Hong Kong",
      countryRegion: "Hong Kong",
      typeOfAccount: "Business Account",
      bankCode: "016",
      branchCode: "478 * If paying from Hong Kong banks",
    },
  },
]

export function buscarProveedorPorNombre(nombre?: string | null): ProveedorImportacionInfo | undefined {
  if (!nombre) return undefined
  const norm = nombre.toLowerCase().trim()
  return PROVEEDORES_IMPORTACION_PRECARGADOS.find(
    (p) =>
      p.id === norm ||
      p.nombre.toLowerCase().includes(norm) ||
      norm.includes(p.nombre.toLowerCase()) ||
      norm.includes("china-matt") ||
      norm.includes("fuding") ||
      norm.includes("guansheng") ||
      (p.nombreOriginalFabrica && (
        p.nombreOriginalFabrica.toLowerCase().includes(norm) ||
        norm.includes(p.nombreOriginalFabrica.toLowerCase())
      ))
  )
}

export function formatearEncabezadoSeller(proveedor?: ProveedorImportacionInfo | null, nombreFallback?: string): string {
  const nombreExportacion = proveedor?.nombreOriginalFabrica || proveedor?.nombre || nombreFallback || "SUPPLIER"
  if (!proveedor) {
    return `${nombreExportacion}\nInternational Trade Department`
  }
  const parts = [nombreExportacion]
  const sub = `${proveedor.direccion}, ${proveedor.ciudad}, ${proveedor.provincia}, ${proveedor.pais}`
  const contact = `Tel: ${proveedor.telefono}${proveedor.fax ? `  Fax: ${proveedor.fax}` : ""}`
  parts.push(`${sub} ${contact}`)
  return parts.join("\n")
}

export function formatearTarjetaBuyer(buyer: CompradorImportacionInfo = COMPRADOR_OFICIAL): string {
  return [
    `Buyer: ${buyer.nombre}`,
    `Cuit（tax id) : ${buyer.cuit} Tel: ${buyer.telefono}`,
    `City: ${buyer.ciudad}`,
    `Status: ${buyer.provincia} Country: ${buyer.pais}`,
    `Address: ${buyer.direccion}`,
  ].join("\n")
}

export function formatearTarjetaSeller(proveedor?: ProveedorImportacionInfo | null, nombreFallback?: string): string {
  const nombreExportacion = proveedor?.nombreOriginalFabrica || proveedor?.nombre || nombreFallback || "SUPPLIER"
  if (!proveedor) {
    return `Seller:  ${nombreExportacion}`
  }
  return [
    `Seller:  ${nombreExportacion} Cuit(tax id): ${proveedor.taxId}`,
    `Tel: ${proveedor.telefono}`,
    `City: ${proveedor.ciudad} Status: ${proveedor.provincia} Country: ${proveedor.pais}`,
    `Address: ${proveedor.direccion}`,
  ].join("\n")
}

export function formatearCondicionesGenerales(
  proveedor?: ProveedorImportacionInfo | null,
  fechaEntrega?: string | null,
  observacionesPersonalizadas?: string | null
): string {
  if (observacionesPersonalizadas && observacionesPersonalizadas.trim()) {
    return observacionesPersonalizadas.trim()
  }

  const cond = proveedor?.condicionesGenerales || {
    packing: 'STANDARD CARTON PACKING with " made in china "',
    paymentTerm: "50% advance - 50% boarded",
    portOfLoading: "CHINA",
    destination: "CORDOBA - ARGENTINA",
  }

  const fEntrega = fechaEntrega || "A coordinar"

  return [
    `1. PACKING: ${cond.packing}`,
    `2. DELIVERY DATE: ${fEntrega}`,
    `3. PAYMENT TERM: ${cond.paymentTerm}`,
    `4. PORT OF LOADING: ${cond.portOfLoading}`,
    `5. DESTINATION: ${cond.destination}`,
  ].join("\n")
}

export function formatearDatosBancarios(proveedor?: ProveedorImportacionInfo | null): string {
  const b = proveedor?.datosBancarios
  if (!b) return ""

  return [
    "Bank Detail:",
    "",
    `SWIFT/BIC: ${b.swift}`,
    `Account Number: ${b.accountNumber}`,
    `Account Name: ${b.accountName}`,
    `Bank Name: ${b.bankName}`,
    `Bank Address: ${b.bankAddress}`,
    `Country/Region: ${b.countryRegion}`,
    `Type of Account: ${b.typeOfAccount}${b.bankCode ? ` Bank Code: ${b.bankCode}` : ""}`,
    b.branchCode ? `Branch Code: ${b.branchCode}` : "",
  ].filter(Boolean).join("\n")
}

