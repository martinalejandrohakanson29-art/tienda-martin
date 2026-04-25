"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    basePath: path.join(process.cwd(), 'Registracion'),
    certPath: path.join(process.cwd(), 'Registracion', process.env.AFIP_CERT_FILE || 'certificado.crt'),
    keyPath: path.join(process.cwd(), 'Registracion', process.env.AFIP_KEY_FILE || 'privada.key'),
    cachePath: path.join(process.cwd(), 'Registracion', 'ticket_cache.json'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11")
};

/**
 * Reconstruye y sanitiza los archivos PEM desde Base64.
 * Elimina espacios y saltos de línea accidentales.
 */
function asegurarArchivosFisicos() {
    try {
        if (!fs.existsSync(AFIP_CONFIG.basePath)) {
            fs.mkdirSync(AFIP_CONFIG.basePath, { recursive: true });
        }

        // Limpieza de variables: eliminamos cualquier espacio, tab o salto de línea
        const certB64 = process.env.AFIP_CERT_B64?.replace(/\s/g, '');
        const keyB64 = process.env.AFIP_KEY_B64?.replace(/\s/g, '');

        if (certB64) {
            const decodedCert = Buffer.from(certB64, 'base64').toString('utf-8').trim();
            if (decodedCert.includes('-----BEGIN CERTIFICATE-----')) {
                fs.writeFileSync(AFIP_CONFIG.certPath, decodedCert);
                console.log("📄 [AFIP] Certificado PEM verificado y escrito.");
            } else {
                console.error("❌ [AFIP] El Certificado decodificado no tiene formato PEM válido.");
            }
        }

        if (keyB64) {
            const decodedKey = Buffer.from(keyB64, 'base64').toString('utf-8').trim();
            if (decodedKey.includes('-----BEGIN') && decodedKey.includes('PRIVATE KEY-----')) {
                fs.writeFileSync(AFIP_CONFIG.keyPath, decodedKey);
                console.log("🔑 [AFIP] Llave privada PEM verificada y escrita.");
            } else {
                console.error("❌ [AFIP] La Llave Privada decodificada no tiene formato PEM válido.");
            }
        }
    } catch (err: any) {
        console.error("❌ [AFIP] Error crítico al escribir archivos:", err.message);
    }
}

/**
 * Obtiene el Ticket de Acceso (TA) con persistencia en disco.
 */
async function obtenerTicketAcceso() {
    asegurarArchivosFisicos();
    const loginTicket = LoginTicket.getInstance();

    if (fs.existsSync(AFIP_CONFIG.cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(AFIP_CONFIG.cachePath, 'utf8'));
            const expTime = cacheData.header?.expirationTime || cacheData.credentials?.expirationTime;
            if (expTime && new Date(expTime) > new Date()) return cacheData;
        } catch (e) {
            console.log("⚠️ [AFIP] Error en caché de ticket, solicitando uno nuevo.");
        }
    }

    try {
        const ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
        fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(ta, null, 2));
        return ta;
    } catch (error: any) {
        if (error.message?.includes('alreadyAuthenticated')) {
            const recuperado = (loginTicket as any).ticket;
            if (recuperado) {
                fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(recuperado, null, 2));
                return recuperado;
            }
        }
        throw error;
    }
}

/**
 * Prueba de conexión integral para el panel administrativo.
 */
export async function testAfipConnection() {
    console.log("🚀 [AFIP] Iniciando Test en entorno:", process.env.NODE_ENV);
    try {
        asegurarArchivosFisicos();
        console.log("⏳ [AFIP] Conectando a WSAA:", AFIP_CONFIG.urlWsaa);
        await obtenerTicketAcceso();
        console.log("✅ [AFIP] Conexión Exitosa.");
        return { success: true, message: "Conexión exitosa con ARCA" };
    } catch (error: any) {
        console.error("❌ [AFIP] Error detallado:", error);
        return {
            success: false,
            error: error.message || "Error desconocido",
            details: error.code === 'certificate-files-error' ? "Error en formato de certificado (PEM)" : "Revisar logs del servidor"
        };
    }
}

/**
 * Emisión de factura electrónica (C) cumpliendo RG 5616.
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
        asegurarArchivosFisicos();

        const ta = await obtenerTicketAcceso();
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        const auth = { Token: token, Sign: sign, Cuit: parseInt(AFIP_CONFIG.CUIT) };
        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);

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
            return { success: true, cae: det.CAE, numero: nextNumber };
        } else {
            const errorMsg = result.Errors?.Err?.Msg || result.Errors?.[0]?.Msg || "Error de validación";
            const obsMsg = result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.Obs?.Msg || "";
            return { success: false, error: "Factura rechazada", details: `${errorMsg} ${obsMsg}`.trim() };
        }
    } catch (error: any) {
        console.error("❌ [AFIP] Error en facturación:", error.message);
        return { success: false, error: error.message };
    }
}