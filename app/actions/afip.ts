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
 * Reconstruye los archivos PEM desde Base64.
 * Sanitiza el string eliminando espacios y verifica las cabeceras.
 */
function asegurarArchivosFisicos() {
    try {
        if (!fs.existsSync(AFIP_CONFIG.basePath)) {
            fs.mkdirSync(AFIP_CONFIG.basePath, { recursive: true });
        }

        const certRaw = process.env.AFIP_CERT_B64 || "";
        const keyRaw = process.env.AFIP_KEY_B64 || "";

        console.log(`📏 [AFIP] Largo Cert B64: ${certRaw.length}`);
        console.log(`📏 [AFIP] Largo Key B64: ${keyRaw.length}`);

        const certB64 = certRaw.replace(/\s/g, '');
        const keyB64 = keyRaw.replace(/\s/g, '');

        if (certB64) {
            const decoded = Buffer.from(certB64, 'base64').toString('utf-8').trim();

            // Log de diagnóstico para verificar integridad en Coolify
            console.log(`🔍 [AFIP] Certificado empieza con: ${decoded.substring(0, 25)}...`);
            console.log(`🔍 [AFIP] Certificado termina con: ...${decoded.substring(decoded.length - 25)}`);

            if (decoded.includes('-----BEGIN CERTIFICATE-----') && decoded.includes('-----END CERTIFICATE-----')) {
                fs.writeFileSync(AFIP_CONFIG.certPath, decoded);
                console.log("✅ [AFIP] Certificado PEM reconstruido correctamente.");
            } else {
                console.error("❌ [AFIP] ERROR: El certificado decodificado está INCOMPLETO (Falta END CERTIFICATE).");
                // Lo escribimos igual para evitar errores de archivo inexistente, pero fallará la auth.
                fs.writeFileSync(AFIP_CONFIG.certPath, decoded);
            }
        }

        if (keyB64) {
            const decodedKey = Buffer.from(keyB64, 'base64').toString('utf-8').trim();
            if (decodedKey.includes('-----BEGIN') && decodedKey.includes('PRIVATE KEY-----')) {
                fs.writeFileSync(AFIP_CONFIG.keyPath, decodedKey);
                console.log("✅ [AFIP] Llave privada PEM reconstruida correctamente.");
            } else {
                console.error("❌ [AFIP] ERROR: La llave privada decodificada no es válida.");
                fs.writeFileSync(AFIP_CONFIG.keyPath, decodedKey);
            }
        }
    } catch (err: any) {
        console.error("❌ [AFIP] Error crítico en archivos:", err.message);
    }
}

/**
 * Obtiene el Ticket de Acceso (TA) manejando la persistencia y errores de sesión.
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
            console.log("⚠️ [AFIP] Error al leer caché, solicitando nuevo ticket.");
        }
    }

    try {
        const ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
        fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(ta, null, 2));
        return ta;
    } catch (error: any) {
        // Manejo especial: si ya existe una sesión activa y no expiró para AFIP
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
 * Función de test para el Dashboard.
 */
export async function testAfipConnection() {
    console.log("🚀 [AFIP] Iniciando prueba de conexión...");
    try {
        asegurarArchivosFisicos();
        await obtenerTicketAcceso();
        console.log("✅ [AFIP] Conexión establecida con éxito.");
        return { success: true, message: "Conexión exitosa con ARCA" };
    } catch (error: any) {
        console.error("❌ [AFIP] Falló el test de conexión:", error);
        return {
            success: false,
            error: error.message || "Error desconocido",
            details: error.code === 'ENOENT' ? "Archivo de certificado no encontrado." : "Verificar Base64 y Delegación."
        };
    }
}

/**
 * Emisión de Factura C con cumplimiento de RG 5616.
 */
export async function facturarVenta(data: {
    monto: number,
    docTipo: number,
    docNro: number,
    ivaReceptor?: number,
    concepto?: number
}) {
    try {
        const { monto, docTipo, docNro, ivaReceptor = 5, concepto = 1 } = data;
        asegurarArchivosFisicos();

        const ta = await obtenerTicketAcceso();
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        const auth = { Token: token, Sign: sign, Cuit: parseInt(AFIP_CONFIG.CUIT) };
        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);

        // 1. Obtener último número autorizado
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: AFIP_CONFIG.tipoComprobante
        });

        const nextNumber = ultimoRes.FECompUltimoAutorizadoResult.CbteNro + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        // 2. Preparar el Payload (RG 5616)
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
                        // Campo obligatorio según RG 5616
                        CondicionIVAReceptorId: ivaReceptor
                    }]
                }
            }
        };

        // 3. Solicitar CAE
        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData } as any);
        const result = resARCA.FECAESolicitarResult as any;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            console.log("✅ [AFIP] CAE obtenido:", det.CAE);
            return { success: true, cae: det.CAE, numero: nextNumber };
        } else {
            const errorMsg = result.Errors?.Err?.Msg || result.Errors?.[0]?.Msg || "Error desconocido";
            const obsMsg = result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.Obs?.Msg || "";
            console.error("⚠️ [AFIP] Factura Rechazada:", errorMsg, obsMsg);
            return { success: false, error: "Rechazo de ARCA", details: `${errorMsg} ${obsMsg}`.trim() };
        }
    } catch (error: any) {
        console.error("❌ [AFIP] Error en proceso de facturación:", error.message);
        return { success: false, error: error.message };
    }
}