require('dotenv').config();
const { LoginTicket, Wsfev1 } = require('afip-apis');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// CONFIGURACIÓN (Vía Variables de Entorno) 
const config = {
    CUIT: process.env.AFIP_CUIT || 20269957361,
    cert: path.join(__dirname, process.env.AFIP_CERT_FILE || 'certificado.crt'),
    key: path.join(__dirname, process.env.AFIP_KEY_FILE || 'privada.key'),
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA) || 9,
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE) || 11 // 11 = Factura C 
};

// Instancia de los servicios
// En v0.5.5, LoginTicket se maneja preferentemente como Singleton
const loginTicket = LoginTicket.getInstance();
const wsfe = new Wsfev1(config.urlWsfe);

app.post('/facturar', async (req, res) => {
    try {
        const { monto, docTipo, docNro, concepto } = req.body;

        console.log(`>>> Iniciando facturación para DNI/CUIT: ${docNro} por $${monto}`);

        // 1. Obtener Ticket de Acceso (WSAA) - Versión 0.5.5
        let ta;
        try {
            ta = await loginTicket.wsaaLogin('wsfe', config.urlWsaa, config.cert, config.key);
        } catch (error) {
            // Si ya estamos autenticados, el ticket debería estar cacheado o podemos reintentar
            // con un método que lo recupere. afip-apis suele manejar esto, pero si lanza error:
            if (error.extra && error.extra.fault && error.extra.fault.faultcode === 'ns1:coe.alreadyAuthenticated') {
                console.log(">>> Usando ticket ya existente en AFIP...");
                // Intentamos obtener el TA cacheado si la librería lo permite, 
                // o simplemente lanzamos un error informativo si no podemos recuperarlo.
                // NOTA: En la mayoría de los casos, re-instanciar o usar el singleton debería funcionar.
                // Si la librería no expone el cache, este es un punto de dolor conocido.
                throw new Error("AFIP indica que ya existe un ticket válido. Por favor, reinicia el servicio o espera a que expire.");
            }
            throw error;
        }

        const auth = {
            Token: ta.token,
            Sign: ta.sign,
            Cuit: config.CUIT
        };

        // 2. Consultar último comprobante autorizado
        const ultimoRes = await wsfe.FECompUltimoAutorizado({
            Auth: auth,
            PtoVta: config.puntoDeVenta,
            CbteTipo: config.tipoComprobante
        });

        const nextNumber = ultimoRes.FECompUltimoAutorizadoResult.CbteNro + 1;
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        // 3. Preparar datos de la factura
        const facturaData = {
            FeCAEReq: {
                FeCabReq: {
                    CantReg: 1,
                    PtoVta: config.puntoDeVenta,
                    CbteTipo: config.tipoComprobante
                },
                FeDetReq: {
                    FECAEDetRequest: {
                        Concepto: concepto || 1, // 1 = Productos
                        DocTipo: docTipo || 96,  // 96 = DNI, 80 = CUIT, 99 = Consumidor Final
                        DocNro: docNro || 0,
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

        // 4. Solicitar CAE a ARCA
        const resARCA = await wsfe.FECAESolicitar({ Auth: auth, ...facturaData });
        const result = resARCA.FECAESolicitarResult;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse[0] || result.FeDetResp.FECAEDetResponse;
            res.status(200).send({
                status: 'success',
                cae: det.CAE,
                vencimiento: det.CAEFchVto,
                numero: nextNumber,
                puntoVenta: config.puntoDeVenta
            });
        } else {
            res.status(400).send({
                status: 'error',
                message: "Factura rechazada por ARCA",
                errors: result.Errors || result.FeDetResp.FECAEDetResponse.Observaciones
            });
        }

    } catch (error) {
        console.error("ERROR ARCA:", error);
        res.status(500).send({ 
            status: 'error', 
            message: error.message || "Error de conexión con ARCA"
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`>>> Servidor de Facturación Revolución Motos corriendo en puerto ${PORT}`);
});