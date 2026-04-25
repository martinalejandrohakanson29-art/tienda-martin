"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    // Directorio base para certificados y caché
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
 * Reconstruye los archivos físicos desde Base64 en Coolify si no existen.
 */
function asegurarArchivosFisicos() {
    if (!fs.existsSync(AFIP_CONFIG.basePath)) {
        fs.mkdirSync(AFIP_CONFIG.basePath, { recursive: true });
        console.log("📁 [AFIP] Carpeta Registracion creada.");
    }

    if (!fs.existsSync(AFIP_CONFIG.certPath) && process.env.AFIP_CERT_B64) {
        fs.writeFileSync(AFIP_CONFIG.certPath, Buffer.from(process.env.AFIP_CERT_B64, 'base64'));
        console.log("📄 [AFIP] Certificado reconstruido desde Base64.");
    }

    if (!fs.existsSync(AFIP_CONFIG.keyPath) && process.env.AFIP_KEY_B64) {
        fs.writeFileSync(AFIP_CONFIG.keyPath, Buffer.from(process.env.AFIP_KEY_B64, 'base64'));
        console.log("🔑 [AFIP] Llave privada reconstruida desde Base64.");
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
        } catch (e) { console.log("⚠️ [AFIP] Error en caché."); }
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

export async function testAfipConnection() {
    console.log("🚀 [AFIP] Probando conexión...");
    try {
        asegurarArchivosFisicos();
        await obtenerTicketAcceso();
        return { success: true, message: "Conexión exitosa" };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

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
                        // Cumplimiento RG 5616
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
            const obsMsg = result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.Obs?.Msg
                || result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.[0]?.Msg
                || "";

            console.error("⚠️ [AFIP] Rechazo:", errorMsg, obsMsg);
            console.dir(result, { depth: null });

            return {
                success: false,
                error: "Factura rechazada",
                details: `${errorMsg} ${obsMsg}`.trim() || "Revisar logs"
            };
        }
    } catch (error: any) {
        console.error("❌ [AFIP] Error:", error.message);
        return { success: false, error: error.message };
    }
}