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
    // URLs por defecto (Homologación). En Producción cambiar vía .env
    urlWsaa: process.env.AFIP_WSAA_URL || "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    urlWsfe: process.env.AFIP_WSFE_URL || "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    puntoDeVenta: parseInt(process.env.AFIP_PUNTO_VENTA) || 9,
    tipoComprobante: parseInt(process.env.AFIP_TIPO_CBTE) || 11 // 11 = Factura C
};

// Instancia de WSFE
const wsfe = new Wsfev1(config.urlWsfe);

app.post('/facturar', async (req, res) => {
    try {
        const { monto, docTipo, docNro, concepto } = req.body;

        if (!monto) {
            return res.status(400).send({ status: 'error', message: "Falta el campo 'monto'" });
        }

        // 1. Obtener Ticket de Acceso (WSAA)
        const loginTicket = new LoginTicket();
        const auth = await loginTicket.wsaaLogin("wsfe", config.urlWsaa, config.cert, config.key);
        
        const FEAuthRequest = {
            Token: auth.token,
            Sign: auth.sign,
            Cuit: config.CUIT
        };

        // 2. Consultar último número autorizado
        const lastVoucherRes = await wsfe.FECompUltimoAutorizado({
            Auth: FEAuthRequest,
            PtoVta: config.puntoDeVenta,
            CbteTipo: config.tipoComprobante
        });

        const nextNumber = lastVoucherRes.FECompUltimoAutorizadoResult.CbteNro + 1;

        // 3. Preparar Datos de Factura
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        
        const facturaData = {
            Auth: FEAuthRequest,
            FeCAEReq: {
                FeCabReq: {
                    CantReg: 1,
                    PtoVta: config.puntoDeVenta,
                    CbteTipo: config.tipoComprobante
                },
                FeDetReq: {
                    FECAEDetRequest: {
                        Concepto: concepto || 1, // 1=Productos, 2=Servicios
                        DocTipo: docTipo || 99,   // 99=Consumidor Final, 80=CUIT
                        DocNro: docNro || 0,
                        CbteDesde: nextNumber,
                        CbteHasta: nextNumber,
                        CbteFch: date,
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
        const resARCA = await wsfe.FECAESolicitar(facturaData);
        const result = resARCA.FECAESolicitarResult;

        if (result.FeCabResp.Resultado === 'A') {
            const det = result.FeDetResp.FECAEDetResponse;
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
                errors: result.Errors || (result.FeDetResp.FECAEDetResponse && result.FeDetResp.FECAEDetResponse.Observaciones)
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
    console.log(`>>> Servidor de Facturación ARCA listo en puerto ${PORT}`);
    console.log(`>>> Entorno: ${config.urlWsaa.includes('homo') ? 'HOMOLOGACIÓN' : 'PRODUCCIÓN'}`);
});
