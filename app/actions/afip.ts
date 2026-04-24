"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import { prisma } from '@/lib/prisma';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    // Usamos las rutas de los certificados que están en la carpeta Registracion
    cert: path.join(process.cwd(), 'Registracion', process.env.AFIP_CERT_FILE || 'certificado.crt'),
    key: path.join(process.cwd(), 'Registracion', process.env.AFIP_KEY_FILE || 'privada.key'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11") 
};

/**
 * Prueba la conexión con AFIP y devuelve el estado
 */
export async function testAfipConnection() {
    try {
        const loginTicket = LoginTicket.getInstance();
        let ta;
        try {
            ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.cert, AFIP_CONFIG.key);
        } catch (error: any) {
            if (error.extra && error.extra.fault && error.extra.fault.faultcode === 'ns1:coe.alreadyAuthenticated') {
                return { success: true, message: "Conectado (Ticket previo activo)", environment: AFIP_CONFIG.urlWsaa.includes('homo') ? 'Homologación' : 'Producción' };
            }
            throw error;
        }
        return { 
            success: true, 
            message: "Conexión exitosa", 
            environment: AFIP_CONFIG.urlWsaa.includes('homo') ? 'Homologación' : 'Producción',
            tokenPrefix: ta?.credentials?.token ? ta.credentials.token.substring(0, 10) + "..." : "N/A"
        };
    } catch (error: any) {
        console.error("AFIP Connection Error:", error);
        return { success: false, error: error.message || "Error desconocido de conexión" };
    }
}

/**
 * Factura una venta individual
 */
export async function facturarVenta(data: { monto: number, docTipo: number, docNro: number, concepto?: number }) {
    try {
        const { monto, docTipo, docNro, concepto = 1 } = data;
        
        const loginTicket = LoginTicket.getInstance();
        let ta;
        try {
            ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.cert, AFIP_CONFIG.key);
        } catch (error: any) {
            if (error.extra && error.extra.fault && error.extra.fault.faultcode === 'ns1:coe.alreadyAuthenticated') {
                // Si ya está autenticado, el singleton debería tener el ticket cargado
                ta = loginTicket.ticket; 
            } else {
                throw error;
            }
        }

        const token = ta?.credentials?.token;
        const sign = ta?.credentials?.sign;

        if (!token || !sign) {
            throw new Error("No se pudo obtener el Token de Acceso de AFIP. Intenta de nuevo.");
        }

        const auth = {
            Token: token,
            Sign: sign,
            Cuit: parseInt(AFIP_CONFIG.CUIT)
        };

        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);
        
        // 1. Obtener último número
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth,
            PtoVta: AFIP_CONFIG.puntoDeVenta,
            CbteTipo: AFIP_CONFIG.tipoComprobante
        });

        const nextNumber = ultimoRes.FECompUltimoAutorizadoResult.CbteNro + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        // 2. Preparar datos
        const facturaData = {
            FeCAEReq: {
                FeCabReq: {
                    CantReg: 1,
                    PtoVta: AFIP_CONFIG.puntoDeVenta,
                    CbteTipo: AFIP_CONFIG.tipoComprobante
                },
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
                        MonCotiz: 1
                    }]
                }
            }
        };

        // 3. Solicitar CAE
        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData });
        const result = resARCA.FECAESolicitarResult;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            return {
                success: true,
                cae: det.CAE,
                vencimiento: det.CAEFchVto,
                numero: nextNumber,
                puntoVenta: AFIP_CONFIG.puntoDeVenta
            };
        } else {
            return {
                success: false,
                error: "Factura rechazada por ARCA",
                details: result.Errors || result.FeDetResp.FECAEDetResponse.Observaciones
            };
        }

    } catch (error: any) {
        console.error("Error en facturación AFIP:", error);
        return { success: false, error: error.message || "Error interno de facturación" };
    }
}
