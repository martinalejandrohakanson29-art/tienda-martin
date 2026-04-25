"use server"

import { LoginTicket, Wsfev1 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    // Estas rutas coinciden exactamente con los "Mount Path" que pusiste en Coolify
    certPath: path.join(process.cwd(), 'Registracion', 'produccion.crt'),
    keyPath: path.join(process.cwd(), 'Registracion', 'produccion.key'),
    cachePath: path.join(process.cwd(), 'Registracion', 'ticket_cache.json'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11")
};

async function obtenerTicketAcceso() {
    const loginTicket = LoginTicket.getInstance();

    // Verificación didáctica: Si no existen, avisamos por qué
    if (!fs.existsSync(AFIP_CONFIG.certPath)) {
        throw new Error(`No se encontró el certificado en ${AFIP_CONFIG.certPath}. Revisá el File Mount en Coolify.`);
    }

    if (fs.existsSync(AFIP_CONFIG.cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(AFIP_CONFIG.cachePath, 'utf8'));
            const expTime = cacheData.header?.expirationTime || cacheData.credentials?.expirationTime;
            if (expTime && new Date(expTime) > new Date()) return cacheData;
        } catch (e) {
            console.log("⚠️ Error en caché de ticket.");
        }
    }

    // Al ser archivos físicos directos, la librería no tiene errores de formato
    const ta = await loginTicket.wsaaLogin('wsfe', AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
    fs.writeFileSync(AFIP_CONFIG.cachePath, JSON.stringify(ta, null, 2));
    return ta;
}

export async function testAfipConnection() {
    try {
        console.log("🚀 Probando conexión ARCA con File Mounts...");
        await obtenerTicketAcceso();
        return { success: true, message: "Conexión exitosa con ARCA" };
    } catch (error: any) {
        console.error("❌ Error de conexión:", error.message);
        return { success: false, error: error.message };
    }
}

// ... el resto de la función facturarVenta se mantiene igual