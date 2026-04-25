"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    // Estas rutas deben coincidir con los "Mount Path" que pusiste en Coolify
    certPath: path.join(process.cwd(), 'Registracion', 'produccion.crt'),
    keyPath: path.join(process.cwd(), 'Registracion', 'produccion.key'),
    cachePath: path.join(process.cwd(), 'Registracion', 'ticket_cache.json'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11")
};

/**
 * Obtiene el Ticket de Acceso (TA) leyendo directamente los archivos del File Mount.
 */
async function obtenerTicketAcceso() {
    const loginTicket = LoginTicket.getInstance();

    // Verificación de archivos
    if (!fs.existsSync(AFIP_CONFIG.certPath) || !fs.existsSync(AFIP_CONFIG.keyPath)) {
        throw new Error(`Archivos de certificado no encontrados en Registracion/. Verifica los File Mounts en Coolify.`);
    }

    if (fs.existsSync(AFIP_CONFIG.cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(AFIP_CONFIG.cachePath, 'utf8'));
            const expTime = cacheData.header?.expirationTime || cacheData.credentials?.expirationTime;
            if (expTime && new Date(expTime) > new Date()) return cacheData;
        } catch (e) {
            console.log("⚠️ [AFIP] Error en caché de ticket.");
        }
    }

    // Solicitamos nuevo ticket usando los archivos físicos
    const ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
    fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(ta, null, 2));
    return ta;
}

/**
 * Prueba de conexión para el panel administrativo.
 */
export async function testAfipConnection() {
    try {
        console.log("🚀 [AFIP] Probando conexión ARCA...");
        await obtenerTicketAcceso();
        return { success: true, message: "Conexión exitosa con ARCA" };
    } catch (error: any) {
        console.error("❌ [AFIP] Error de conexión:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Emisión de factura electrónica (C) - RG 5616.
 */
export async function facturarVenta(data: {
    monto: number,
    docTipo: number,
    docNro: number,
    ivaReceptor?: number,
    concepto?: number
}) {
    console.log(`🚀 [AFIP] Facturando $${data.monto} a Doc: ${data.docNro}...`);
    try {
        const { monto, docTipo, docNro, ivaReceptor = 5, concepto = 1 } = data;

        const ta = await obtenerTicketAcceso();
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        const auth = { Token: token, Sign: sign, Cuit: parseInt(AFIP_CONFIG.CUIT) };
        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);

        // Obtenemos último número
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: AFIP_CONFIG.tipoComprobante
        });

        const nextNumber = ultimoRes.FECompUltimoAutorizadoResult.CbteNro + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        const facturaData = {
            FeCAEReq: {
                FeCabReq: { CantReg: 1, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: AFIP_CONFIG.tipoComprobante },
                FeDetReq: {
                    FECAEDetRequest: [{
                        Concepto: concepto,
                        DocTipo: docTipo,
                        DocNro: docNro,
                        CbteDesde: nextNumber,
                        CbteHasta: nextNumber,
                        CbteFch: fecha,
                        ImpTotal: monto,
                        ImpTotConc: 0,
                        ImpNeto: monto,
                        ImpOpEx: 0,
                        ImpTrib: 0,
                        ImpIVA: 0,
                        MonId: 'PES',
                        MonCotiz: 1,
                        CondicionIVAReceptorId: ivaReceptor
                    }]
                }
            }
        };

        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData } as any);
        const result = resARCA.FECAESolicitarResult as any;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            console.log("✅ [AFIP] Factura Autorizada! CAE:", det.CAE);
            return { success: true, cae: det.CAE, numero: nextNumber };
        } else {
            const errorMsg = result.Errors?.Err?.Msg || result.Errors?.[0]?.Msg || "Error de validación";
            const obsMsg = result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.Obs?.Msg || "";
            console.error("⚠️ [AFIP] Rechazo:", errorMsg, obsMsg);
            return { success: false, error: "Factura rechazada", details: `${errorMsg} ${obsMsg}`.trim() };
        }
    } catch (error: any) {
        console.error("❌ [AFIP] Error:", error.message);
        return { success: false, error: error.message };
    }
}