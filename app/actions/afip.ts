"use server"

import { LoginTicket, Wsfev1, PersonaServiceA5, PersonaServiceA13 } from 'afip-apis';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Esta es la clave: Ruta absoluta para que no importe el modo standalone
// Detectamos si estamos en producción (ej: Railway) o local (Windows/Mac)
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync('/app');
const BASE_REGISTRACION = isProduction
    ? '/app/Registracion'
    : path.join(process.cwd(), 'Registracion');

// En producción /app/Registracion es de solo lectura: el cache del ticket de
// acceso debe escribirse en un directorio con permisos de escritura (/tmp),
// de lo contrario se re-autentica contra WSAA en cada request (riesgo de que
// ARCA bloquee por exceso de logins). Los certificados se siguen leyendo de
// BASE_REGISTRACION.
const CACHE_DIR = isProduction ? os.tmpdir() : BASE_REGISTRACION;

const AFIP_CONFIG = {
    CUIT: process.env.AFIP_CUIT!,
    certPath: path.join(BASE_REGISTRACION, process.env.AFIP_CERT_FILE || 'certificado.crt'),
    keyPath: path.join(BASE_REGISTRACION, process.env.AFIP_KEY_FILE || 'privada.key'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA || "9"),
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE || "6")
};

// ARCA (ex-AFIP) devuelve intermitentemente SoapFaultError con statusCode 503
// cuando su propio servicio WSFE está saturado/inestable. No es un error de
// nuestro lado: reintentamos con backoff antes de dar la venta por fallida.
function esErrorServicioNoDisponible(error: any): boolean {
    return error?.extra?.fault?.statusCode === 503;
}

async function conReintentos<T>(fn: () => Promise<T>, intentos = 3, delayBaseMs = 2000): Promise<T> {
    let ultimoError: any;
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            return await fn();
        } catch (error: any) {
            ultimoError = error;
            if (!esErrorServicioNoDisponible(error) || intento === intentos) throw error;
            const espera = delayBaseMs * intento;
            console.warn(`⏳ [AFIP] ARCA devolvió 503 (Servicio no disponible). Reintentando en ${espera}ms (intento ${intento}/${intentos})...`);
            await new Promise(resolve => setTimeout(resolve, espera));
        }
    }
    throw ultimoError;
}

async function obtenerTicketAcceso(servicio: string = 'wsfe') {
    const loginTicket = LoginTicket.getInstance();

    // El cache depende de la URL para evitar usar tickets de Homologación en Producción
    const envHash = AFIP_CONFIG.urlWsaa.includes('homo') ? 'homo' : 'prod';
    const cachePath = path.join(CACHE_DIR, `ticket_cache_${servicio}_${envHash}.json`);

    console.log(`🔍 [AFIP] Configurando servicio "${servicio}" | env: ${envHash} | cert: ${AFIP_CONFIG.certPath}`);

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
                try {
                    fs.writeFileSync(cachePath, JSON.stringify(recuperado, null, 2));
                } catch (e) {
                    console.error("⚠️ [AFIP] No se pudo escribir cachePath (recuperado):", e);
                }
                return recuperado;
            }
        }
        throw error;
    }
}

export async function consultarPadron(documento: string | number) {
    const docStr = documento.toString().replace(/\D/g, '');
    console.log(`🔍 [AFIP] Consultando padrón A5 para: ${docStr}`);

    try {
        const ta = await obtenerTicketAcceso('ws_sr_constancia_inscripcion');
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        if (!token || !sign) {
            throw new Error("Token o Sign faltantes en el ticket de acceso");
        }

        const padron = new PersonaServiceA5(
            AFIP_CONFIG.urlWsaa.includes('homo')
                ? PersonaServiceA5.testWSDL
                : PersonaServiceA5.produccionWSDL
        );

        let cuitBusqueda = docStr;

        // Si tiene 8 dígitos o menos, asumimos que es DNI y buscamos el CUIT/CUIL asociado
        if (docStr.length <= 8) {
            console.log(`📇 [AFIP] Buscando CUIT asociado al DNI: ${docStr}`);
            try {
                const ta13 = await obtenerTicketAcceso('ws_sr_padron_a13');
                const token13 = (ta13 as any).token || (ta13 as any).credentials?.token;
                const sign13 = (ta13 as any).sign || (ta13 as any).credentials?.sign;

                const padron13 = new PersonaServiceA13(
                    AFIP_CONFIG.urlWsaa.includes('homo')
                        ? "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL"
                        : "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL"
                );

                const resCuit: any = await padron13.getIdPersonaListByDocumento({
                    token: token13,
                    sign: sign13,
                    cuitRepresentada: parseInt(AFIP_CONFIG.CUIT),
                    documento: docStr
                });

                console.log("DEBUG A13 RAW RESPONSE:", JSON.stringify(resCuit, null, 2));

                const list = resCuit.idPersonaListReturn?.idPersona;
                if (Array.isArray(list) && list.length > 0) {
                    cuitBusqueda = list[0].toString();
                } else if (list) {
                    cuitBusqueda = list.toString();
                } else {
                    console.warn("⚠️ [AFIP] A13 no devolvió CUIT para el documento:", docStr);
                    return { success: false, error: "No se encontró un CUIT asociado a este DNI" };
                }
                console.log(`✅ [AFIP] CUIT encontrado por DNI: ${cuitBusqueda}`);
            } catch (err13) {
                console.error("❌ [AFIP] Error buscando CUIT por DNI:", err13);
                return { success: false, error: "Error al buscar CUIT asociado al DNI" };
            }
        }

        console.log(`🚀 [AFIP] Consultando Padrón A5 para ID: ${cuitBusqueda}`);
        const res: any = await padron.getPersona({
            token,
            sign,
            cuitRepresentada: parseInt(AFIP_CONFIG.CUIT),
            idPersona: parseInt(cuitBusqueda)
        });

        console.log("DEBUG A5 RAW RESPONSE:", JSON.stringify(res, null, 2));

        if (!res?.personaReturn && !res['ns2:personaReturn']) {
            console.error("❌ [AFIP] No se encontraron datos (personaReturn vacío) para:", cuitBusqueda);
            return { success: false, error: "No se encontró la persona en el padrón A5" };
        }

        // Función auxiliar para extraer propiedades ignorando prefijos (ns2:) y mayúsculas
        const getProp = (obj: any, key: string): any => {
            if (!obj) return undefined;
            if (Array.isArray(obj)) return getProp(obj[0], key);
            const lowKey = key.toLowerCase();
            if (obj[key] !== undefined) return obj[key];
            const foundKey = Object.keys(obj).find(k => {
                const kLow = k.toLowerCase();
                return kLow === lowKey || kLow.endsWith(":" + lowKey);
            });
            return foundKey ? obj[foundKey] : undefined;
        };

        const personaReturn = getProp(res, 'personaReturn') || res;
        const persona = getProp(personaReturn, 'persona') || personaReturn;
        
        console.log("🔍 [AFIP] Extrayendo datos del objeto persona...");

        const dg = getProp(persona, 'datosGenerales');
        const drg = getProp(persona, 'datosRegimenGeneral');
        const dm = getProp(persona, 'datosMonotributo');
        const ec = getProp(persona, 'errorConstancia'); // Caso detectado en logs

        const razonSocial = getProp(dg, 'razonSocial') || getProp(persona, 'razonSocial') || getProp(ec, 'razonSocial');
        const apellido = getProp(dg, 'apellido') || getProp(persona, 'apellido') || getProp(ec, 'apellido');
        const nombreReal = getProp(dg, 'nombre') || getProp(persona, 'nombre') || getProp(ec, 'nombre');

        const nombre = (razonSocial || `${apellido || ''} ${nombreReal || ''}`.trim()) || "Sin Nombre";

        // Impuestos en A5
        const rawImpuestos = getProp(drg, 'impuesto');
        const impuestos = rawImpuestos ? (Array.isArray(rawImpuestos) ? rawImpuestos : [rawImpuestos]) : [];
        
        const tieneIVA = impuestos.some((imp: any) => {
            const id = getProp(imp, 'idImpuesto');
            return Number(id) === 30 || id === "30";
        });
        const esMonotributista = !!dm;

        const soyMonotributista = AFIP_CONFIG.tipoComprobante === 11;
        const tipoFactura = soyMonotributista ? 11 : (tieneIVA ? 1 : 6);

        let condicionIva = 5;
        if (tieneIVA) condicionIva = 1;
        else if (esMonotributista) condicionIva = 6;

        console.log(`✨ [AFIP] Resultado final -> Nombre: ${nombre}, Cnd. IVA: ${condicionIva}`);

        const domicilioObj = getProp(dg, 'domicilioFiscal');
        const direccion = getProp(domicilioObj, 'direccion');

        return {
            success: true,
            cuit: cuitBusqueda,
            nombre: nombre,
            domicilio: direccion,
            tipoFactura,
            condicionIva
        };

    } catch (error: any) {
        console.error("❌ [AFIP] Error consultando padrón A5:", error);
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
        const monto = data.monto;
        // 1. Sanitización de Documento y Tipo
        const docNroStr = String(data.docNro || "0").replace(/\D/g, "");
        let finalDocNro = parseInt(docNroStr, 10) || 0;
        let finalDocTipo = data.docTipo;

        if (finalDocNro === 0) {
            finalDocTipo = 99; // Sin identificar
        } else if (docNroStr.length === 11) {
            finalDocTipo = 80; // CUIT
        } else if (docNroStr.length === 7 || docNroStr.length === 8) {
            finalDocTipo = 96; // DNI
        } else if (!finalDocTipo || finalDocTipo === 99) {
            finalDocTipo = 99;
        }

        // 2. Sanitización y coherencia de Tipo de Comprobante e IVA Receptor
        let finalIvaReceptor = data.ivaReceptor ?? 5; // Default Consumidor Final
        let cbteTipo = data.tipoComprobante || AFIP_CONFIG.tipoComprobante;
        const concepto = data.concepto || 1;

        // Reglas estrictas de ARCA:
        // - Si el receptor es Responsable Inscripto (1):
        if (finalIvaReceptor === 1) {
            if (finalDocTipo === 80) {
                // A un RI con CUIT le corresponde Factura A
                cbteTipo = 1;
            } else {
                // Sin CUIT (DNI o anónimo), no puede ser RI fiscalmente: normalizamos a Consumidor Final
                finalIvaReceptor = 5;
                cbteTipo = 6;
            }
        }

        // - Si el comprobante es Factura B (6):
        if (cbteTipo === 6) {
            // AFIP rechaza Factura B si ivaReceptor es 1 (Error 10243)
            if (finalIvaReceptor === 1) {
                finalIvaReceptor = 5;
            }
        }

        // - Si el comprobante es Factura A (1):
        if (cbteTipo === 1) {
            if (finalDocTipo !== 80 || finalDocNro === 0) {
                throw new Error("Factura A requiere CUIT de 11 dígitos válido");
            }
            finalIvaReceptor = 1;
        }

        console.log(`🧾 [AFIP] Parámetros saneados -> CbteTipo: ${cbteTipo}, DocTipo: ${finalDocTipo}, DocNro: ${finalDocNro}, IvaReceptor: ${finalIvaReceptor}`);

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

        const total = parseFloat(monto.toFixed(2));
        const esResponsableInscripto = [1, 6].includes(cbteTipo);

        // Todo el ciclo (consultar último comprobante + enviar CAE) se reintenta como
        // unidad ante un 503 de ARCA, para que cada intento re-consulte el último
        // número autorizado y así nunca reenviar un CbteDesde ya usado.
        const { resARCA, nextNumber } = await conReintentos(async () => {
            console.log("🔢 [AFIP] Solicitando último comprobante autorizado...");
            const ultimoRes = await wsfe.FECompUltimoAutorizado({
                Auth: auth, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: cbteTipo
            });

            if (!ultimoRes?.FECompUltimoAutorizadoResult) {
                console.error("❌ [AFIP] Respuesta inválida de FECompUltimoAutorizado:", ultimoRes);
                throw new Error("Error al obtener último comprobante");
            }

            const lastCbte = Number(ultimoRes.FECompUltimoAutorizadoResult.CbteNro);
            console.log(`🔢 [AFIP] Último comprobante para PtoVta ${AFIP_CONFIG.puntoDeVenta} Tipo ${cbteTipo}: ${lastCbte}`);

            const nextNumber = lastCbte + 1;
            const fecha = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(/-/g, '');

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

            console.log(`🧾 [AFIP] Preparando factura nro ${nextNumber} para DNI/CUIT ${finalDocNro}`, { total, neto, importeIva });

            const facturaData = {
                FeCAEReq: {
                    FeCabReq: { CantReg: 1, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: cbteTipo },
                    FeDetReq: {
                        FECAEDetRequest: [{
                            Concepto: concepto,
                            DocTipo: finalDocTipo,
                            DocNro: finalDocNro,
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
                            CondicionIVAReceptorId: finalIvaReceptor,
                            ...(ivaArray ? { Iva: ivaArray } : {})
                        }]
                    }
                }
            };

            console.log("📤 [AFIP] Enviando solicitud de CAE...");
            const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData } as any);
            console.log("📥 [AFIP] Respuesta de FECAESolicitar recibida.");

            return { resARCA, nextNumber };
        });

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
            return {
                success: true,
                cae: det.CAE,
                numero: nextNumber,
                vencimiento: det.CAEFchVto,
                tipoComprobante: cbteTipo,
                docTipo: finalDocTipo,
                docNro: finalDocNro,
                condicionIva: finalIvaReceptor
            };
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

/**
 * Genera una Nota de Crédito para anular una factura existente
 */
export async function generarNotaCredito(ventaOriginal: {
    total: number,
    docTipo: number,
    docNro: any, // Lo cambiamos a any para sanitizarlo adentro
    tipoFacturaOriginal: number,
    puntoVentaOriginal: number,
    numeroFacturaOriginal: number,
    condicionIva: number
}) {
    console.log("🔄 [AFIP] Iniciando generación de NC. Datos brutos:", JSON.stringify(ventaOriginal, null, 2));

    try {
        // 1. SANITIZACIÓN CRÍTICA: Evitar el error 500 de ARCA
        // Limpiamos el CUIT de cualquier caracter no numérico y convertimos a número
        const docNroFinal = parseInt(ventaOriginal.docNro.toString().replace(/\D/g, '')) || 0;
        const docTipoFinal = ventaOriginal.docTipo || 99;

        // Validaciones preventivas para evitar el SoapFault (Error 500)
        if (!ventaOriginal.puntoVentaOriginal || !ventaOriginal.numeroFacturaOriginal) {
            throw new Error(`Datos de factura original incompletos: PtoVta ${ventaOriginal.puntoVentaOriginal}, Nro ${ventaOriginal.numeroFacturaOriginal}`);
        }

        let tipoNC = 13;
        if (ventaOriginal.tipoFacturaOriginal === 1) tipoNC = 3;
        if (ventaOriginal.tipoFacturaOriginal === 6) tipoNC = 8;
        if (ventaOriginal.tipoFacturaOriginal === 11) tipoNC = 13;

        const ta = await obtenerTicketAcceso('wsfe');
        const token = (ta as any).token || (ta as any).credentials?.token;
        const sign = (ta as any).sign || (ta as any).credentials?.sign;

        const auth = { Token: token, Sign: sign, Cuit: parseInt(AFIP_CONFIG.CUIT) };
        const wsfe = new Wsfev1(AFIP_CONFIG.urlWsfe);

        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth,
            PtoVta: AFIP_CONFIG.puntoDeVenta,
            CbteTipo: tipoNC
        });

        const nextNumber = Number(ultimoRes.FECompUltimoAutorizadoResult.CbteNro) + 1;
        const fecha = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).replace(/-/g, '');

        const total = parseFloat(ventaOriginal.total.toFixed(2));
        let neto = total;
        let importeIva = 0;
        let ivaArray = null;

        if ([3, 8].includes(tipoNC)) {
            neto = parseFloat((total / 1.21).toFixed(2));
            importeIva = parseFloat((total - neto).toFixed(2));
            ivaArray = {
                AlicIva: [{
                    Id: 5, // 21%
                    BaseImp: neto,
                    Importe: importeIva
                }]
            };
        }

        const ncData = {
            FeCAEReq: {
                FeCabReq: { CantReg: 1, PtoVta: AFIP_CONFIG.puntoDeVenta, CbteTipo: tipoNC },
                FeDetReq: {
                    FECAEDetRequest: [{
                        Concepto: 1,
                        DocTipo: docTipoFinal,
                        DocNro: docNroFinal, // Ahora estamos seguros de que es un número
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
                        CondicionIVAReceptorId: ventaOriginal.condicionIva || 5,
                        CbtesAsoc: {
                            CbteAsoc: [{
                                Tipo: ventaOriginal.tipoFacturaOriginal,
                                PtoVta: ventaOriginal.puntoVentaOriginal,
                                Nro: ventaOriginal.numeroFacturaOriginal
                            }]
                        },
                        ...(ivaArray ? { Iva: ivaArray } : {})
                    }]
                }
            }
        };

        console.log(`📤 [AFIP] Enviando NC tipo ${tipoNC} nro ${nextNumber} para Cliente ${docNroFinal}...`);

        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...ncData } as any);
        const result = resARCA.FECAESolicitarResult as any;

        if (result.FeCabResp.Resultado === 'A') {
            const det = Array.isArray(result.FeDetResp.FECAEDetResponse)
                ? result.FeDetResp.FECAEDetResponse[0]
                : result.FeDetResp.FECAEDetResponse;

            return {
                success: true,
                cae: det.CAE,
                numero: nextNumber,
                vencimiento: det.CAEFchVto,
                tipoComprobante: tipoNC
            };
        } else {
            console.error("❌ [AFIP] NC Rechazada por Reglas de Negocio:", JSON.stringify(result, null, 2));
            return { success: false, error: "ARCA rechazó la NC", details: result };
        }

    } catch (error: any) {
        console.error("💥 [AFIP] Error crítico en generarNotaCredito:");
        if (error.extra && error.extra.fault) {
            console.error("SOAP FAULT REASON:", error.extra.fault.reason?.text);
            console.error("DETALLE COMPLETO:", JSON.stringify(error.extra.fault, null, 2));
        } else {
            console.error(error);
        }
        return { success: false, error: error.message };
    }
}



