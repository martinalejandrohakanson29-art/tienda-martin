"use server"

import { LoginTicket, Wsfev1, PersonaServiceA13 } from 'afip-apis';
import path from 'path';
import fs from 'fs';

// Esta es la clave: Ruta absoluta para que no importe el modo standalone
// Detectamos si estamos en producción (ej: Railway) o local (Windows/Mac)
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync('/app');
const BASE_REGISTRACION = isProduction 
    ? '/app/Registracion' 
    : path.join(process.cwd(), 'Registracion');

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT || "20269957361",
    certPath: path.join(BASE_REGISTRACION, process.env.AFIP_CERT_FILE || 'certificado.crt'),
    keyPath: path.join(BASE_REGISTRACION, process.env.AFIP_KEY_FILE || 'privada.key'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "11")
};

async function obtenerTicketAcceso(servicio: string = 'wsfe') {
    const loginTicket = LoginTicket.getInstance();
    
    // El cache depende de la URL para evitar usar tickets de Homologación en Producción
    const envHash = AFIP_CONFIG.urlWsaa.includes('homo') ? 'homo' : 'prod';
    const cachePath = path.join(BASE_REGISTRACION, `ticket_cache_${servicio}_${envHash}.json`);

    console.log(`🔍 [AFIP] Configuración actual para ${servicio}:`, {
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

    if (fs.existsSync(cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const expTime = cacheData.header?.expirationTime || cacheData.credentials?.expirationTime;
            if (expTime && new Date(expTime) > new Date()) {
                console.log(`♻️ [AFIP] Usando ticket de acceso de caché para ${servicio}.`);
                return cacheData;
            }
            console.log(`🕒 [AFIP] Ticket en caché de ${servicio} expirado.`);
        } catch (e) {
            console.log(`⚠️ [AFIP] Error en caché de ${servicio}, solicitando nuevo.`);
        }
    }

    try {
        console.log(`🌐 [AFIP] Solicitando nuevo Ticket de Acceso para ${servicio}...`);
        const ta = await loginTicket.wsaaLogin(servicio, AFIP_CONFIG.urlWsaa, AFIP_CONFIG.certPath, AFIP_CONFIG.keyPath);
        console.log(`✅ [AFIP] Ticket de Acceso para ${servicio} obtenido exitosamente.`);

        try {
            fs.writeFileSync(cachePath, JSON.stringify(ta, null, 2));
        } catch (cacheErr) {
            console.error(`⚠️ [AFIP] No se pudo escribir el cachePath para ${servicio}:`, cacheErr);
        }

        return ta;
    } catch (error: any) {
        console.error(`❌ [AFIP] Error en wsaaLogin para ${servicio}:`, error);

        if (error.message?.includes('alreadyAuthenticated')) {
            console.log(`🔄 [AFIP] ${servicio} ya autenticado, intentando recuperar ticket...`);
            const recuperado = (loginTicket as any).ticket;
            if (recuperado) {
                fs.writeFileSync(cachePath, JSON.stringify(recuperado, null, 2));
                return recuperado;
            }
        }
        throw error;
    }
}

export async function consultarPadron(documento: string | number) {
    const docStr = documento.toString().replace(/-/g, '');
    console.log(`🔍 [AFIP] Consultando padrón A13 para: ${docStr}`);
    
    try {
        const ta = await obtenerTicketAcceso('ws_sr_padron_a13');
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        if (!token || !sign) {
            throw new Error("Token o Sign faltantes en el ticket de acceso");
        }

        const padron = new PersonaServiceA13("https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL");
        
        let cuitBusqueda = docStr;

        // Si tiene 8 dígitos o menos, asumimos que es DNI y buscamos el CUIT/CUIL asociado
        if (docStr.length <= 8) {
            console.log(`📇 [AFIP] Buscando CUIT asociado al DNI: ${docStr}`);
            const resCuit: any = await padron.getIdPersonaListByDocumento({
                token,
                sign,
                cuitRepresentada: parseInt(AFIP_CONFIG.CUIT),
                documento: docStr
            });

            const list = resCuit.idPersonaListReturn?.idPersona;
            if (Array.isArray(list) && list.length > 0) {
                cuitBusqueda = list[0];
            } else if (typeof list === 'string') {
                cuitBusqueda = list;
            } else {
                return { success: false, error: "No se encontró un CUIT asociado a este DNI" };
            }
            console.log(`✅ [AFIP] CUIT encontrado: ${cuitBusqueda}`);
        }

        const res: any = await padron.getPersona({
            token,
            sign,
            cuitRepresentada: parseInt(AFIP_CONFIG.CUIT),
            idPersona: cuitBusqueda
        });

        if (!res?.personaReturn?.persona) {
            console.error("❌ [AFIP] No se encontraron datos para:", cuitBusqueda);
            return { success: false, error: "No se encontró la persona en el padrón" };
        }

        const datos = res.personaReturn.persona;

        // Lógica de decisión automática según condición del vendedor y comprador
        const impuestos = Array.isArray(datos.impuesto) ? datos.impuesto : (datos.impuesto ? [datos.impuesto] : []);
        const tieneIVA = impuestos.some((imp: any) => imp.idImpuesto === 30); // 30 = IVA
        const esMonotributista = impuestos.some((imp: any) => imp.idImpuesto === 20); // 20 = Monotributo
        
        // Si el vendedor (vos) es Monotributista (11), solo emite C (11)
        // Si el vendedor es Responsable Inscripto, emite A (1) si el cliente tiene IVA, sino B (6)
        const soyMonotributista = AFIP_CONFIG.tipoComprobante === 11;
        
        const tipoFactura = soyMonotributista ? 11 : (tieneIVA ? 1 : 6);
        
        // Condición IVA Receptor: 1=RI, 6=Monotributo, 5=Consumidor Final (RG 5616)
        let condicionIva = 5;
        if (tieneIVA) condicionIva = 1;
        else if (esMonotributista) condicionIva = 6;

        console.log(`✅ [AFIP] Datos obtenidos: ${datos.razonSocial || datos.apellido}, Comprador: ${tieneIVA ? 'RI' : (esMonotributista ? 'Monotributo' : 'Final')}, Sugerencia: Factura ${tipoFactura === 11 ? 'C' : (tipoFactura === 1 ? 'A' : 'B')}`);

        return {
            success: true,
            cuit: cuitBusqueda,
            nombre: datos.razonSocial || `${datos.apellido || ''} ${datos.nombre || ''}`.trim(),
            domicilio: datos.domicilioFiscal?.direccion,
            tipoFactura,
            condicionIva
        };

    } catch (error: any) {
        console.error("❌ [AFIP] Error consultando padrón A13:", error);
        return { success: false, error: "Error en la consulta al Padrón ARCA" };
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
    concepto?: number,
    tipoComprobante?: number
}) {
    console.log("📝 [AFIP] Iniciando facturación de venta:", data);
    try {
        const { monto, docTipo, docNro, ivaReceptor = 5, concepto = 1, tipoComprobante } = data;
        const cbteTipo = tipoComprobante || AFIP_CONFIG.tipoComprobante;
        const ta = await obtenerTicketAcceso('wsfe');

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
            Auth: auth, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: cbteTipo
        });

        if (!ultimoRes?.FECompUltimoAutorizadoResult) {
            console.error("❌ [AFIP] Respuesta inválida de FECompUltimoAutorizado:", ultimoRes);
            throw new Error("Error al obtener último comprobante");
        }

        const lastCbte = ultimoRes.FECompUltimoAutorizadoResult.CbteNro;
        console.log(`🔢 [AFIP] Último comprobante para PtoVta ${AFIP_CONFIG.puntoDeVenta} Tipo ${cbteTipo}: ${lastCbte}`);
        
        const nextNumber = lastCbte + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        const total = parseFloat(monto.toFixed(2));
        const esResponsableInscripto = [1, 6].includes(cbteTipo);

        let neto = total;
        let importeIva = 0;
        let ivaArray = null;

        // Si el emisor es RI, el IVA es obligatorio incluso en Factura B (aunque el cliente no lo vea discriminado)
        if (esResponsableInscripto) {
            neto = parseFloat((total / 1.21).toFixed(2));
            importeIva = parseFloat((total - neto).toFixed(2));
            ivaArray = {
                AlicIva: [
                    {
                        Id: 5, // 21%
                        BaseImp: neto,
                        Importe: importeIva
                    }
                ]
            };
        }

        console.log(`🧾 [AFIP] Preparando factura nro ${nextNumber} para DNI/CUIT ${docNro}`, { total, neto, importeIva });

        const facturaData = {
            FeCAEReq: {
                FeCabReq: { CantReg: 1, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: cbteTipo },
                FeDetReq: {
                    FECAEDetRequest: [{
                        Concepto: concepto,
                        DocTipo: docTipo,
                        DocNro: docNro,
                        CbteDesde: nextNumber,
                        CbteHasta: nextNumber,
                        CbteFch: fecha,
                        ImpTotal: total,
                        ImpTotConc: 0,
                        ImpNeto: neto,
                        ImpOpEx: 0,
                        ImpTrib: 0,
                        ImpIVA: importeIva,
                        MonId: 'PES',
                        MonCotiz: 1,
                        CondicionIVAReceptorId: ivaReceptor,
                        ...(ivaArray ? { Iva: ivaArray } : {})
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

        // 1. Caso de Éxito (Aprobada)
        if (result.FeCabResp.Resultado === 'A') {
            const det = Array.isArray(result.FeDetResp.FECAEDetResponse)
                ? result.FeDetResp.FECAEDetResponse[0]
                : result.FeDetResp.FECAEDetResponse;

            console.log(`✅ [AFIP] Factura autorizada! CAE: ${det.CAE}`);
            return { success: true, cae: det.CAE, numero: nextNumber, vencimiento: det.CAEFchVto };
        }

        // 2. Caso de Rechazo (R) u Observaciones
        else {
            // Extraer errores generales del encabezado
            const errors = result.Errors?.Err || result.Errors || [];
            const errorMsg = Array.isArray(errors)
                ? errors.map((e: any) => `${e.Code}: ${e.Msg}`).join(', ')
                : (errors.Msg ? `${errors.Code}: ${errors.Msg}` : "");

            // Extraer observaciones específicas del detalle (Aquí suele estar el motivo real)
            const detResp = Array.isArray(result.FeDetResp?.FECAEDetResponse)
                ? result.FeDetResp.FECAEDetResponse[0]
                : result.FeDetResp?.FECAEDetResponse;

            const obs = detResp?.Observaciones?.Obs || [];
            const obsMsg = Array.isArray(obs)
                ? obs.map((o: any) => `${o.Code}: ${o.Msg}`).join(' | ')
                : (obs.Msg ? `${obs.Code}: ${obs.Msg}` : "");

            const fullError = [errorMsg, obsMsg].filter(Boolean).join(" - Detalle: ");

            console.error("❌ [AFIP] Factura RECHAZADA.");
            console.error("🔍 [AFIP] Motivos:", fullError);

            // Log extra en formato JSON para inspección profunda en la terminal
            console.log("DEBUG COMPLETO:", JSON.stringify(result, null, 2));

            return {
                success: false,
                error: "Factura rechazada",
                details: fullError || "Error no especificado por ARCA"
            };
        }
    } catch (error: any) {
        console.error("💥 [AFIP] Error crítico en facturarVenta:", error);
        // Esto ayuda a ver errores de conexión o de la librería
        if (error.fault) console.error("SOAP FAULT:", JSON.stringify(error.fault, null, 2));

        return { success: false, error: error.message || "Error interno del servidor" };
    }
}
