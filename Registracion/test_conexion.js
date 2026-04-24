const { LoginTicket } = require('afip-apis');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function probarConexion() {
  console.log("--- Probando conexión con AFIP (Modo Homologación) ---");
  
  // Usamos las rutas del .env o las carpetas por defecto
  const certPath = path.resolve(__dirname, process.env.AFIP_CERT_PATH || './certificado.crt');
  const keyPath = path.resolve(__dirname, process.env.AFIP_KEY_PATH || './privada.key');

  try {
    const loginTicket = LoginTicket.getInstance();
    console.log("Solicitando Ticket de Acceso (WSAA)...");
    
    // Usamos las URLs del .env
    const urlWsaa = process.env.AFIP_WSAA_URL;
    
    const ta = await loginTicket.wsaaLogin('wsfe', urlWsaa, certPath, keyPath);
    
    console.log("✅ ¡CONEXIÓN EXITOSA!");
    console.log("Token obtenido correctamente.");
    if (ta && ta.token) {
        console.log("Token:", ta.token.substring(0, 20) + "...");
    }
    
  } catch (error) {
    if (error.extra && error.extra.fault && error.extra.fault.faultcode === 'ns1:coe.alreadyAuthenticated') {
        console.log("✅ ¡CONEXIÓN EXITOSA! (Ticket ya existente)");
        console.log("AFIP informa que ya tenés un ticket válido activo. Todo funciona correctamente.");
    } else {
        console.error("❌ ERROR DE CONEXIÓN:");
        console.error(error.message || error);
        
        if (error.message && (error.message.includes("DN matching") || error.message.includes("autorizado"))) {
          console.log("\n💡 TIP: AFIP dice que tu certificado no está autorizado todavía.");
          console.log("Asegurate de haber confirmado la relación en la web de AFIP.");
        }
    }
  }
}

probarConexion();