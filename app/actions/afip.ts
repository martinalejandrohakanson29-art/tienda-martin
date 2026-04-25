"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

// Esta es la clave: Ruta absoluta para que no importe el modo standalone
const BASE_REGISTRACION = '/app/Registracion';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    certPath: path.join(BASE_REGISTRACION, process.env.AFIP_CERT_FILE || 'produccion.crt'),
    keyPath: path.join(BASE_REGISTRACION, process.env.AFIP_KEY_FILE || 'produccion.key'),
    cachePath: path.join(BASE_REGISTRACION, 'ticket_cache.json'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11")
};

async function obtenerTicketAcceso() {
    const loginTicket = LoginTicket.getInstance();

    console.log("🔍 [AFIP] Configuración actual:", {
        urlWsaa: AFIP_CONFIG.urlWsaa,
        certPath: AFIP_CONFIG.certPath,
        keyPath: AFIP_CONFIG.keyPath,
        cuit: AFIP_CONFIG.CUIT
    });

    // Verificación física en la ruta absoluta
    if (!fs.existsSync(AFIP_CONFIG.certPath)) {
        console.error(`❌ [AFIP] Certificado NO ENCONTRADO en: ${AFIP_CONFIG.certPath}`);
        throw new Error(`Certificado no encontrado en ${AFIP_CONFIG.certPath}`);
    }
    if (!fs.existsSync(AFIP_CONFIG.keyPath)) {
        console.error(`❌ [AFIP] Key NO ENCONTRADA en: ${AFIP_CONFIG.keyPath}`);
        throw new Error(`Key no encontrada en ${AFIP_CONFIG.keyPath}`);
    }

    console.log("✅ [AFIP] Archivos de certificados encontrados.");

    if (fs.existsSync(AFIP_CONFIG.cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(AFIP_CONFIG.cachePath, 'utf8'));
            const expTime = cacheData.header?.expirationTime || cacheData.credentials?.expirationTime;
            if (expTime && new Date(expTime) > new Date()) {
                console.log("♻️ [AFIP] Usando ticket de acceso de caché.");
                return cacheData;
            }
            console.log("🕒 [AFIP] Ticket en caché expirado.");
        } catch (e) {
            console.log("⚠️ [AFIP] Error en caché de ticket, solicitando nuevo.");
        }
    }

    try {
        console.log("🌐 [AFIP] Solicitando nuevo Ticket de Acceso a WSAA...");
        const ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
        console.log("✅ [AFIP] Ticket de Acceso obtenido exitosamente.");

        try {
            fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(ta, null, 2));
        } catch (cacheErr) {
            console.error("⚠️ [AFIP] No se pudo escribir el cachePath:", cacheErr);
        }

        return ta;
    } catch (error: any) {
        console.error("❌ [AFIP] Error en wsaaLogin:", error);
        // Intentar capturar error más detallado si es posible
        if (error.response) {
            console.error("❌ [AFIP] Detalles de la respuesta de error:", error.response);
        }

        if (error.message?.includes('alreadyAuthenticated')) {
            console.log("🔄 [AFIP] Ya autenticado, intentando recuperar ticket...");
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
    try {
        console.log("🚀 [AFIP] Iniciando test de conexión...");
        await obtenerTicketAcceso();
        return { success: true, message: "Conexión exitosa con ARCA (ex-AFIP)" };
    } catch (error: any) {
        console.error("❌ [AFIP] Falló testAfipConnection:", error);
        return { success: false, error: error.message || "Error desconocido en la conexión" };
    }
}

export async function facturarVenta(data: {
    monto: number,
    docTipo: number,
    docNro: number,
    ivaReceptor?: number,
    concepto?: number
}) {
    console.log("📝 [AFIP] Iniciando facturación de venta:", data);
    try {
        const { monto, docTipo, docNro, ivaReceptor = 5, concepto = 1 } = data;
        const ta = await obtenerTicketAcceso();

        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        if (!token || !sign) {
            console.error("❌ [AFIP] Token o Sign faltantes en el ticket:", ta);
            throw new Error("Token o Sign faltantes en el ticket de acceso");
        }

        const auth = { Token: token, Sign: sign, Cuit: parseInt(AFIP_CONFIG.CUIT) };
        console.log("📡 [AFIP] Conectando a WSFE en:", AFIP_CONFIG.urlWsfe);
        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);

        console.log("🔢 [AFIP] Solicitando último comprobante autorizado...");
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: AFIP_CONFIG.tipoComprobante
        });

        if (!ultimoRes?.FECompUltimoAutorizadoResult) {
            console.error("❌ [AFIP] Respuesta inválida de FECompUltimoAutorizado:", ultimoRes);
            throw new Error("Error al obtener último comprobante");
        }

        const lastCbte = ultimoRes.FECompUltimoAutorizadoResult.CbteNro;
        const nextNumber = lastCbte + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        console.log(`🧾 [AFIP] Preparando factura nro ${nextNumber} para DNI/CUIT ${docNro}`);

        const facturaData = {
            FeCAEReq: {
                FeCabReq: { CantReg: 1, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: AFIP_CONFIG.tipoComprobante },
                FeDetReq: {
                    FECAEDetRequest: [{
                        Concepto: concepto, DocTipo: docTipo, DocNro: docNro, CbteDesde: nextNumber, CbteHasta: nextNumber,
                        CbteFch: fecha, ImpTotal: monto, ImpTotConc: 0, ImpNeto: monto, ImpOpEx: 0, ImpTrib: 0, ImpIVA: 0,
                        MonId: 'PES', MonCotiz: 1, CondicionIVAReceptorId: ivaReceptor
                    }]
                }
            }
        };

        console.log("📤 [AFIP] Enviando solicitud de CAE...");
        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData } as any);
        console.log("📥 [AFIP] Respuesta de FECAESolicitar recibida.");

        const result = resARCA.FECAESolicitarResult as any;
        if (!result) {
            console.error("❌ [AFIP] Respuesta vacía de FECAESolicitar");
            throw new Error("Respuesta vacía de ARCA");
        }

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            console.log(`✅ [AFIP] Factura autorizada! CAE: ${det.CAE}`);
            return { success: true, cae: det.CAE, numero: nextNumber };
        } else {
            const errors = result.Errors?.Err || result.Errors || [];
            const errorMsg = Array.isArray(errors) ? errors.map((e: any) => e.Msg).join(', ') : (errors.Msg || "Error desconocido");
            console.error("❌ [AFIP] Factura RECHAZADA:", errorMsg);
            if (result.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones) {
                console.warn("⚠️ [AFIP] Observaciones:", result.FeDetResp.FECAEDetResponse[0].Observaciones);
            }
            return { success: false, error: "Factura rechazada", details: errorMsg };
        }
    } catch (error: any) {
        console.error("💥 [AFIP] Error crítico en facturarVenta:", error);
        return { success: false, error: error.message || "Error interno del servidor" };
    }
}
