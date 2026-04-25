require('dotenv').config();
const { LoginTicket, Wsfev1 } = require('afip-apis');
const path = require('path');

async function testFactura() {
    console.log("--- Iniciando Test de Facturación Directa ---");
    
    const config = {
        CUIT: process.env.AFIP_CUIT || 20269957361,
        cert: path.join(__dirname, process.env.AFIP_CERT_FILE || 'certificado.crt'),
        key: path.join(__dirname, process.env.AFIP_KEY_FILE || 'privada.key'),
        urlWsaa: process.env.AFIP_WSAA_URL,
        urlWsfe: process.env.AFIP_WSFE_URL,
        puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA) || 9,
        tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE) || 11 
    };

    try {
        const loginTicket = LoginTicket.getInstance();
        let ta;
        console.log("1. Obteniendo Ticket de Acceso...");
        try {
            ta = await loginTicket.wsaaLogin('wsfe', config.urlWsaa, config.cert, config.key);
        } catch (error) {
            if (error.extra && error.extra.fault && error.extra.fault.faultcode === 'ns1:coe.alreadyAuthenticated') {
                console.log("   (Ticket ya existente en AFIP, intentando continuar...)");
                // En este caso, si no tenemos el TA en memoria, el test fallará.
                // Pero usualmente la librería lo tiene si se llamó antes en el mismo proceso.
                // Para este script, si falla aquí, es porque no pudimos recuperarlo.
                throw new Error("No se pudo recuperar el ticket existente. AFIP bloquea la nueva solicitud.");
            }
            throw error;
        }

        const auth = {
            Token: ta.token,
            Sign: ta.sign,
            Cuit: config.CUIT
        };

        const wsfe = new Wsfev1(config.urlWsfe);
        
        console.log("2. Consultando último comprobante...");
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth,
            PtoVta: config.puntoDeVenta,
            CbteTipo: config.tipoComprobante
        });

        const lastNumber = ultimoRes.FECompUltimoAutorizadoResult.CbteNro;
        console.log(`   Último comprobante: ${lastNumber}`);
        
        const nextNumber = lastNumber + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const monto = 1.50; // Monto de prueba pequeño

        console.log(`3. Solicitando factura Nro ${nextNumber} por $${monto}...`);
        
        const facturaData = {
            FeCAEReq: {
                FeCabReq: {
                    CantReg: 1,
                    PtoVta: config.puntoDeVenta,
                    CbteTipo: config.tipoComprobante
                },
                FeDetReq: {
                    FECAEDetRequest: {
                        Concepto: 1, 
                        DocTipo: 99, // 99 = Consumidor Final
                        DocNro: 0,
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
                    }
                }
            }
        };

        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData });
        const result = resARCA.FECAESolicitarResult;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            console.log("✅ FACTURA AUTORIZADA EXITOSAMENTE!");
            console.log("CAE:", det.CAE);
            console.log("Vencimiento:", det.CAEFchVto);
            console.log("Número:", nextNumber);
        } else {
            console.error("❌ FACTURA RECHAZADA POR ARCA:");
            console.error(JSON.stringify(result.Errors || result.FeDetResp.FECAEDetResponse.Observaciones, null, 2));
        }

    } catch (error) {
        console.error("❌ ERROR DURANTE EL TEST:");
        console.error(error);
    }
}

testFactura();
