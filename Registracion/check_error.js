require('dotenv').config();
const { LoginTicket } = require('afip-apis');
const path = require('path');

async function diagnostico() {
    console.log("--- Iniciando Diagnóstico v0.5.5 ---");
    const cert = path.join(__dirname, process.env.AFIP_CERT_FILE || 'certificado.crt');
    const key = path.join(__dirname, process.env.AFIP_KEY_FILE || 'privada.key');
    const url = process.env.AFIP_WSAA_URL;

    console.log("CUIT:", process.env.AFIP_CUIT);
    console.log("Certificado en:", cert);

    try {
        // En la v0.5.5 se usa getInstance()
        const loginTicket = LoginTicket.getInstance();
        
        console.log("Intentando wsaaLogin...");
        // Firma: (servicio, url, certPath, keyPath)
        const ta = await loginTicket.wsaaLogin('wsfe', url, cert, key);
        
        console.log("✅ ¡ÉXITO TOTAL!");
        console.log("TA obtenido:", ta);
        if (ta && ta.token) {
            console.log("Token obtenido:", ta.token.substring(0, 20) + "...");
        } else {
            console.log("El TA no tiene la propiedad 'token' como se esperaba.");
        }
    } catch (error) {
        console.error("❌ ERROR DE AFIP:");
        console.error(error); // Log full error object
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
        console.log("\n💡 TIP: Si dice '401' o 'Unauthorized', es que el CUIT o el Certificado no coinciden con la URL de Producción.");
    }
}

diagnostico();