export function numeroALetras(num: number): string {
  const Unidades = (n: number) => {
    switch (n) {
      case 1: return "UN"; case 2: return "DOS"; case 3: return "TRES"; case 4: return "CUATRO"; case 5: return "CINCO"; case 6: return "SEIS"; case 7: return "SIETE"; case 8: return "OCHO"; case 9: return "NUEVE"; default: return "";
    }
  };
  const Decenas = (n: number) => {
    const decena = Math.floor(n / 10); const unidad = n - (decena * 10);
    switch (decena) {
      case 1: switch (unidad) { case 0: return "DIEZ"; case 1: return "ONCE"; case 2: return "DOCE"; case 3: return "TRECE"; case 4: return "CATORCE"; case 5: return "QUINCE"; default: return "DIECI" + Unidades(unidad); }
      case 2: return unidad === 0 ? "VEINTE" : "VEINTI" + Unidades(unidad);
      case 3: return DecenasY("TREINTA", unidad); case 4: return DecenasY("CUARENTA", unidad); case 5: return DecenasY("CINCUENTA", unidad);
      case 6: return DecenasY("SESENTA", unidad); case 7: return DecenasY("SETENTA", unidad); case 8: return DecenasY("OCHENTA", unidad);
      case 9: return DecenasY("NOVENTA", unidad); case 0: return Unidades(unidad); default: return "";
    }
  };
  const DecenasY = (strSin: string, numUnidades: number) => numUnidades > 0 ? strSin + " Y " + Unidades(numUnidades) : strSin;
  const Centenas = (n: number) => {
    const centenas = Math.floor(n / 100); const decenas = n - (centenas * 100);
    switch (centenas) {
      case 1: return decenas > 0 ? "CIENTO " + Decenas(decenas) : "CIEN"; case 2: return "DOSCIENTOS " + Decenas(decenas); case 3: return "TRESCIENTOS " + Decenas(decenas);
      case 4: return "CUATROCIENTOS " + Decenas(decenas); case 5: return "QUINIENTOS " + Decenas(decenas); case 6: return "SEISCIENTOS " + Decenas(decenas);
      case 7: return "SETECIENTOS " + Decenas(decenas); case 8: return "OCHOCIENTOS " + Decenas(decenas); case 9: return "NOVECIENTOS " + Decenas(decenas); default: return Decenas(decenas);
    }
  };
  const Miles = (n: number) => {
    const divisor = 1000; const cientos = Math.floor(n / divisor); const resto = n - (cientos * divisor);
    let strMiles = "";
    if (cientos > 0) strMiles = cientos > 1 ? Centenas(cientos) + " MIL" : "UN MIL";
    return strMiles === "" ? Centenas(resto) : strMiles + " " + Centenas(resto);
  };
  const Millones = (n: number) => {
    const divisor = 1000000; const cientos = Math.floor(n / divisor); const resto = n - (cientos * divisor);
    let strMillones = "";
    if (cientos > 0) strMillones = cientos > 1 ? Centenas(cientos) + " MILLONES" : "UN MILLON";
    return strMillones === "" ? Miles(resto) : strMillones + " " + Miles(resto);
  };

  const enteros = Math.floor(num);
  const centavos = Math.round((num - enteros) * 100).toString().padStart(2, '0');
  if (enteros === 0) return `CERO CON ${centavos}/100`;
  return `${Millones(enteros).trim()} CON ${centavos}/100`;
}
