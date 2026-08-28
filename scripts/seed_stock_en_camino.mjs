import { PrismaClient } from '@prisma/client';
import https from 'node:https';

const prisma = new PrismaClient();

const USER_STOCK_LIST = [
  { title: 'Codo Admisión 110 A 125 + Carburador Cg 125', code: 'PWZQ17847', qty: 30 },
  { title: 'Kit Potenciacion 150 A 200 Varillero Cigueñal...', code: 'LFOH17156', qty: 20 },
  { title: 'Kit Cilindro + Pistón 110 Potenciado A 120cc....', code: 'KKHU52958', qty: 20 },
  { title: 'Leva Competicion 110cc 6.50 + Bobina Mas Chis...', code: 'JNNO12892', qty: 15 },
  { title: 'Kit Cilindro 170cc Varillero 150 Competición ...', code: 'LMTV21893', qty: 15 },
  { title: 'Codo Admisión 110 A 150 + Carburador Pz 27 15...', code: 'DVNJ18725', qty: 15 },
  { title: 'Kit 150 A 220 Varillero Cigueñal + Cilindro 2...', code: 'YYMZ60013', qty: 15 },
  { title: 'Kit 110 A 120 + Carburador 125 + Codo + Filtr...', code: 'UVWU26330', qty: 11 },
  { title: 'Kit Cilindro 110 A 120cc + Leva De Calle 6.40', code: 'BEXJ12289', qty: 10 },
  { title: 'Tapa Cilindro Cdi 125cc Para Todos Los 110 Co...', code: 'KEZC01166', qty: 10 },
  { title: 'Kit Cilindro 170cc Varillero 150 Competición ...', code: 'OLKY22139', qty: 10 },
  { title: 'Tapa Cilindro Cdi 125cc + Cilindro 120cc Para...', code: 'YVCG39396', qty: 10 },
  { title: 'Cigueñal Dakar 200 Varillera', code: 'PTDJ18080', qty: 10 },
  { title: 'Kit 150 A 200 Varillero Cigueñal + Cilindro 2...', code: 'VUGY16508', qty: 10 },
  { title: 'Kit Dakar 200 Varillero Cigueñal + Cilindro 1...', code: 'YVEY16358', qty: 10 },
  { title: 'Kit 170 Varillero +leva 6.6 + Balancines Rodi...', code: 'NIQW51064', qty: 10 },
  { title: 'Kit Potenciacion Varillero 200: Cigueñal + Ci...', code: 'RGRL34771', qty: 10 },
  { title: 'Kit Potenciacion 110cc A 120cc + Carburador C...', code: 'GRVV56109', qty: 10 },
  { title: 'Balancines Rodillo Kayak 150 200 250 Cbx 150 ...', code: 'TPTQ46838', qty: 10 },
  { title: 'Leva Competicion 110cc 6.50 + Bobina Mas Chis...', code: 'ROXP26459', qty: 10 },
  { title: 'Kit Potenciacion Varillero 220: Cigueñal + Ci...', code: 'VTUA60169', qty: 10 },
  { title: 'Kit Cilindro Honda Titan Xr 190 Piston Alta C...', code: 'UOKP04159', qty: 10 },
  { title: 'Leva Competicion 6.6mm Varillero Rx 150 + Bal...', code: 'QZCF39061', qty: 5 },
  { title: 'Kit Potenciación Cigueñal Dakar 200 + Cilindr...', code: 'FQZP19686', qty: 5 },
  { title: 'Kit Cilindro Potenciacion Tornado Twister 33...', code: 'GHTD05820', qty: 5 },
  { title: 'Kit Potenciacion Motomel S2 A 200cc Cigueñal ...', code: 'YPDN57115', qty: 5 },
  { title: 'Kit Cilindro 170cc Varillero 150 + Leva 7.7mm...', code: 'YTHH84539', qty: 5 },
  { title: 'Kit Dakar 200 Completo + Leva Balancines Vari...', code: 'RTKG15904', qty: 5 },
  { title: 'Tapa Cilindro Cdi 125cc + Cilindro 120cc Reco...', code: 'TVKG20530', qty: 5 },
  { title: 'Tapa Cilindro Cdi + Cilindro 120 + Bujia Irid...', code: 'INPI25673', qty: 5 },
  { title: 'Kit Potenciacion 150 A 220 Varillero Cigueñal...', code: 'MPMJ59585', qty: 5 },
  { title: 'Kit 170 Varillero + Carburador Dakar 200 + Co...', code: 'FTFC06001', qty: 5 },
  { title: 'Kit Cilindro Cg Titan Xr Glh 150 Potenciado 1...', code: 'GNXD11252', qty: 5 },
  { title: 'Kit Potenciacion Biz 125 A 150cc Piston Alta ...', code: 'CDEI33232', qty: 5 },
  { title: 'Tapa De Cilindro 200 Varillera Completa', code: 'JAFK82779', qty: 3 },
  { title: 'Kit Cilindro 220cc Titán Y Xr 150 Perno 14 Ca...', code: 'LVMZ12682', qty: 3 },
  { title: 'Kit Potenciacion 150 A 220 Varillero Cigueñal...', code: 'RPHN59101', qty: 3 },
  { title: 'Kit Cilindro 110 A 120 Potenciado New Wave S ...', code: 'MXRW73759', qty: 3 },
  { title: 'Kit Cilindro 110 A 120cc + Leva De Calle 6.40', code: 'GNLP80177', qty: 2 },
  { title: 'Tapa Cilindro Dakar 200 Varillera Completa + ...', code: 'GFHR89551', qty: 2 },
  { title: 'Kit Cilindro Potenciación Varillero 150 A 170...', code: 'SFTK51541', qty: 2 },
  { title: 'Kit Potenciacion 150 A 200 Varillero Cigueñal...', code: 'DJMW17636', qty: 2 },
  { title: 'Kit Potenciacion 190cc Titan Xr Glh Piston Al...', code: 'QXPA44986', qty: 2 },
  { title: 'Kit Cilindro Honda Titan 220 + Leva De Calle ...', code: 'KAQD05808', qty: 2 },
  { title: 'Cilindro 330 + Muñon Desplazado + Plantilla T...', code: 'ETVP26324', qty: 2 },
  { title: 'Muñon Desplazado +2mm + Plantilla +2mm Twiste...', code: 'CZJH10953', qty: 2 },
  { title: 'Leva Competicion 110cc 6.50 + Carburador 150 ...', code: 'IXAO12546', qty: 1 },
  { title: 'Kit Potenciacion Para 110c A 120cc Competicio...', code: 'ZEBW99093', qty: 1 }
];

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseCSV(text) {
    const lines = [];
    let row = [];
    let current = '';
    let insideQuote = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                current += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            row.push(current.trim());
            current = '';
        } else if ((char === '\r' || char === '\n') && !insideQuote) {
            if (char === '\r' && nextChar === '\n') i++;
            row.push(current.trim());
            if (row.some(cell => cell.length > 0)) lines.push(row);
            row = [];
            current = '';
        } else {
            current += char;
        }
    }
    if (current.length > 0 || row.length > 0) {
        row.push(current.trim());
        if (row.some(cell => cell.length > 0)) lines.push(row);
    }
    return lines;
}

async function main() {
    console.log("1. Creando tabla stock_en_camino_full si no existe...");
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "stock_en_camino_full" (
            "id" TEXT NOT NULL,
            "inventoryId" TEXT NOT NULL,
            "mla" TEXT,
            "titulo" TEXT,
            "cantidad" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "stock_en_camino_full_pkey" PRIMARY KEY ("id")
        );
    `);

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "stock_en_camino_full_inventoryId_key" 
        ON "stock_en_camino_full"("inventoryId");
    `);

    console.log("2. Obteniendo publicaciones de Google Sheets...");
    const rawCsv = await fetchUrl(SHEETS_CSV_URL);
    const rows = parseCSV(rawCsv);
    const bodyRows = rows.slice(1);
    console.log(`Total publicaciones en Sheet: ${bodyRows.length}`);

    console.log("3. Reseteando a 0 todo el stock en camino existente...");
    await prisma.stockEnCaminoFull.updateMany({
        data: { cantidad: 0 }
    });

    console.log("4. Inicializando todas las publicaciones del sheet en stock_en_camino_full con 0...");
    for (const row of bodyRows) {
        const mla = (row[0] || '').trim();
        const invId = (row[1] || '').trim();
        const title = (row[2] || '').trim();
        if (!invId) continue;

        await prisma.stockEnCaminoFull.upsert({
            where: { inventoryId: invId },
            update: {
                mla: mla || undefined,
                titulo: title || undefined,
                cantidad: 0
            },
            create: {
                inventoryId: invId,
                mla: mla || null,
                titulo: title || null,
                cantidad: 0
            }
        });
    }

    console.log("5. Cargando los datos de stock en camino según la lista provista...");
    let loadedCount = 0;
    let totalQty = 0;

    for (const item of USER_STOCK_LIST) {
        const cleanCode = item.code.trim().toUpperCase();
        // Buscar fila correspondiente en el sheet
        const found = bodyRows.find(r => 
            (r[1] && r[1].trim().toUpperCase() === cleanCode) ||
            (r[8] && r[8].trim().toUpperCase() === cleanCode) ||
            (r[0] && r[0].replace(/-/g, '').trim().toUpperCase() === cleanCode.replace(/-/g, ''))
        );

        const mla = found ? (found[0] || '').trim() : null;
        const titulo = found ? (found[2] || '').trim() : item.title;

        await prisma.stockEnCaminoFull.upsert({
            where: { inventoryId: cleanCode },
            update: {
                cantidad: item.qty,
                mla: mla || undefined,
                titulo: titulo || undefined,
                updatedAt: new Date()
            },
            create: {
                inventoryId: cleanCode,
                mla: mla || null,
                titulo: titulo || null,
                cantidad: item.qty
            }
        });

        loadedCount++;
        totalQty += item.qty;
    }

    console.log(`\nCarga finalizada con éxito:`);
    console.log(`- Ítems cargados con stock en camino: ${loadedCount} de ${USER_STOCK_LIST.length}`);
    console.log(`- Cantidad total de unidades en camino: ${totalQty} u.`);

    // Verificar en DB
    const dbItems = await prisma.stockEnCaminoFull.findMany({
        where: { cantidad: { gt: 0 } },
        orderBy: { cantidad: 'desc' }
    });

    console.log(`\nVerificación en Base de Datos: ${dbItems.length} registros con cantidad > 0:`);
    for (const it of dbItems.slice(0, 10)) {
        console.log(`  - [${it.inventoryId}] ${it.mla || 'S/D'} | ${it.cantidad} u. | ${it.titulo?.substring(0, 45)}...`);
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
