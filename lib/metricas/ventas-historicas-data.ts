// ARCHIVO GENERADO AUTOMÁTICAMENTE — no editar a mano.
// Fuente: n8n-workflows/resumen_cuentas_ingreso.csv (export del sistema viejo).
// Regenerar con:  node scripts/generar-historico.mjs
//
// Datos de ventas mensuales por canal, meses cerrados (inmutables).
// Importes en pesos NOMINALES de cada mes (ojo inflación al comparar montos).

export interface MesHistorico {
  anio: number;
  mes: number; // 1-12
  /** importe por canal canónico, en pesos nominales del mes */
  canales: Record<string, number>;
}

export const VENTAS_HISTORICAS: MesHistorico[] = [
  {
    "anio": 2022,
    "mes": 1,
    "canales": {
      "Mayorista": 79496,
      "Mostrador": 2000
    }
  },
  {
    "anio": 2022,
    "mes": 2,
    "canales": {
      "MercadoLibre": 2929971.96,
      "Mostrador": 2183745.22,
      "Instagram": 496280.15,
      "Mayorista": 218768.56
    }
  },
  {
    "anio": 2022,
    "mes": 3,
    "canales": {
      "MercadoLibre": 3952728.46,
      "Mostrador": 1674958.73,
      "Instagram": 644530.26,
      "Mayorista": 451111.25
    }
  },
  {
    "anio": 2022,
    "mes": 4,
    "canales": {
      "MercadoLibre": 4438551.4,
      "Mostrador": 1699002,
      "Instagram": 1232250.28,
      "Mayorista": 434936
    }
  },
  {
    "anio": 2022,
    "mes": 5,
    "canales": {
      "MercadoLibre": 5777878.81,
      "Instagram": 963193.79,
      "Mostrador": 949322.97,
      "Mayorista": 656151.18
    }
  },
  {
    "anio": 2022,
    "mes": 6,
    "canales": {
      "MercadoLibre": 6362669.92,
      "Instagram": 1582744.87,
      "Mostrador": 1126912.74,
      "Mayorista": 665593.87
    }
  },
  {
    "anio": 2022,
    "mes": 7,
    "canales": {
      "MercadoLibre": 7218545.01,
      "Instagram": 1426092.22,
      "Mayorista": 1111240.99,
      "Mostrador": 966753.52
    }
  },
  {
    "anio": 2022,
    "mes": 8,
    "canales": {
      "MercadoLibre": 5106195.82,
      "Mostrador": 1380964.04,
      "Instagram": 1302012.7,
      "Mayorista": 856225
    }
  },
  {
    "anio": 2022,
    "mes": 9,
    "canales": {
      "MercadoLibre": 5344529.4,
      "Instagram": 1806911.35,
      "Mostrador": 1610104.7,
      "Mayorista": 679148
    }
  },
  {
    "anio": 2022,
    "mes": 10,
    "canales": {
      "MercadoLibre": 5716562.99,
      "Instagram": 1810783.45,
      "Mostrador": 1689869.82,
      "Mayorista": 701896.04
    }
  },
  {
    "anio": 2022,
    "mes": 11,
    "canales": {
      "MercadoLibre": 6569439.87,
      "Mostrador": 1724641.22,
      "Instagram": 1514500.08,
      "Mayorista": 493463
    }
  },
  {
    "anio": 2022,
    "mes": 12,
    "canales": {
      "MercadoLibre": 6828428.3,
      "Mostrador": 1668454.2,
      "Instagram": 1296442.33,
      "Mayorista": 540558.96
    }
  },
  {
    "anio": 2023,
    "mes": 1,
    "canales": {
      "MercadoLibre": 9256359.27,
      "Mostrador": 2512060.98,
      "Instagram": 1576376.29,
      "Mayorista": 1160702.97
    }
  },
  {
    "anio": 2023,
    "mes": 2,
    "canales": {
      "MercadoLibre": 7400392.53,
      "Mostrador": 2934501.35,
      "Instagram": 1653435.47,
      "Mayorista": 844956
    }
  },
  {
    "anio": 2023,
    "mes": 3,
    "canales": {
      "MercadoLibre": 8877974.38,
      "Mostrador": 2173944.46,
      "Instagram": 1991384.97,
      "Mayorista": 1313074
    }
  },
  {
    "anio": 2023,
    "mes": 4,
    "canales": {
      "MercadoLibre": 9144021.36,
      "Instagram": 2058576.25,
      "Mostrador": 2041049.99,
      "Mayorista": 1695615
    }
  },
  {
    "anio": 2023,
    "mes": 5,
    "canales": {
      "MercadoLibre": 10044975.77,
      "Instagram": 2803988.26,
      "Mostrador": 1962501.58,
      "Mayorista": 1693868
    }
  },
  {
    "anio": 2023,
    "mes": 6,
    "canales": {
      "MercadoLibre": 9910688.03,
      "Instagram": 3142936.56,
      "Mostrador": 2279551.78,
      "Mayorista": 2228059
    }
  },
  {
    "anio": 2023,
    "mes": 7,
    "canales": {
      "MercadoLibre": 12254571.51,
      "Instagram": 3444275.39,
      "Mostrador": 2193927.38,
      "Mayorista": 2016189.84
    }
  },
  {
    "anio": 2023,
    "mes": 8,
    "canales": {
      "MercadoLibre": 15193009.06,
      "Instagram": 4199450.3,
      "Mostrador": 2799755.83,
      "Mayorista": 1523216.98
    }
  },
  {
    "anio": 2023,
    "mes": 9,
    "canales": {
      "MercadoLibre": 14040336.11,
      "Mostrador": 3239633.9,
      "Mayorista": 3198610,
      "Instagram": 2615462.39
    }
  },
  {
    "anio": 2023,
    "mes": 10,
    "canales": {
      "MercadoLibre": 17295992.27,
      "Mostrador": 3345766.37,
      "Instagram": 2460369.58,
      "Mayorista": 1842865
    }
  },
  {
    "anio": 2023,
    "mes": 11,
    "canales": {
      "MercadoLibre": 14905413.73,
      "Mostrador": 3242612.61,
      "Instagram": 2227562.89,
      "Mayorista": 2050832
    }
  },
  {
    "anio": 2023,
    "mes": 12,
    "canales": {
      "MercadoLibre": 18346630.64,
      "Mostrador": 4511484.73,
      "Instagram": 2642487.51,
      "Mayorista": 527674
    }
  },
  {
    "anio": 2024,
    "mes": 1,
    "canales": {
      "MercadoLibre": 18635258.9,
      "Mostrador": 3718977.83,
      "Instagram": 2710414.99,
      "Mayorista": 1291944
    }
  },
  {
    "anio": 2024,
    "mes": 2,
    "canales": {
      "MercadoLibre": 18080255.11,
      "Mostrador": 7036630.9,
      "Instagram": 2639619.37,
      "Mayorista": 1105081
    }
  },
  {
    "anio": 2024,
    "mes": 3,
    "canales": {
      "MercadoLibre": 25708447.19,
      "Mostrador": 5041618.1,
      "Instagram": 3788323.59,
      "Mayorista": 2231279
    }
  },
  {
    "anio": 2024,
    "mes": 4,
    "canales": {
      "MercadoLibre": 26017492.17,
      "Mostrador": 4837308.41,
      "Instagram": 3469401.53,
      "Mayorista": 1788205
    }
  },
  {
    "anio": 2024,
    "mes": 5,
    "canales": {
      "MercadoLibre": 33079462.19,
      "Mostrador": 4746053.34,
      "Instagram": 3546483.98,
      "Mayorista": 2216241
    }
  },
  {
    "anio": 2024,
    "mes": 6,
    "canales": {
      "MercadoLibre": 43077441.9,
      "Mostrador": 4985999.11,
      "Instagram": 2323060,
      "Mayorista": 1917963
    }
  },
  {
    "anio": 2024,
    "mes": 7,
    "canales": {
      "MercadoLibre": 44546562.7,
      "Mostrador": 5997352.99,
      "Instagram": 5630685.65,
      "Mayorista": 3429282
    }
  },
  {
    "anio": 2024,
    "mes": 8,
    "canales": {
      "MercadoLibre": 50590355.25,
      "Mayorista": 11194292.99,
      "Mostrador": 5825081.19,
      "Instagram": 2908844.49
    }
  },
  {
    "anio": 2024,
    "mes": 9,
    "canales": {
      "MercadoLibre": 50304310.58,
      "Mayorista": 6669576,
      "Mostrador": 6633418.16,
      "Instagram": 4930884.02
    }
  },
  {
    "anio": 2024,
    "mes": 10,
    "canales": {
      "MercadoLibre": 42736983.02,
      "Mayorista": 11636994.02,
      "Mostrador": 6273490.02,
      "Instagram": 4020861.32
    }
  },
  {
    "anio": 2024,
    "mes": 11,
    "canales": {
      "MercadoLibre": 44726981.99,
      "Mayorista": 9999448,
      "Mostrador": 6048958.62,
      "Instagram": 5030084.36
    }
  },
  {
    "anio": 2024,
    "mes": 12,
    "canales": {
      "MercadoLibre": 39120470.83,
      "Mostrador": 8207501.99,
      "Mayorista": 7545499,
      "Instagram": 3872382.69
    }
  },
  {
    "anio": 2025,
    "mes": 1,
    "canales": {
      "MercadoLibre": 45090238.45,
      "Mayorista": 9683546.68,
      "Mostrador": 6869933.17,
      "Instagram": 3989440.75
    }
  },
  {
    "anio": 2025,
    "mes": 2,
    "canales": {
      "MercadoLibre": 30149126.44,
      "Mostrador": 9750407.89,
      "Mayorista": 8113112,
      "Instagram": 3741621.61
    }
  },
  {
    "anio": 2025,
    "mes": 3,
    "canales": {
      "MercadoLibre": 33766878.77,
      "Mayorista": 11281190.84,
      "Mostrador": 5284716.7,
      "Instagram": 4210967.46
    }
  },
  {
    "anio": 2025,
    "mes": 4,
    "canales": {
      "MercadoLibre": 37287724.5,
      "Mayorista": 10386143.84,
      "Mostrador": 6524332.94,
      "Instagram": 2277974.49
    }
  },
  {
    "anio": 2025,
    "mes": 5,
    "canales": {
      "MercadoLibre": 52478867.23,
      "Mayorista": 7796266.2,
      "Mostrador": 6281465.23,
      "Instagram": 3309047.82
    }
  },
  {
    "anio": 2025,
    "mes": 6,
    "canales": {
      "MercadoLibre": 47271586.27,
      "Mayorista": 8590856,
      "Mostrador": 4969776.52,
      "Instagram": 4169262.55
    }
  },
  {
    "anio": 2025,
    "mes": 7,
    "canales": {
      "MercadoLibre": 45274619.5,
      "Mayorista": 6773169.03,
      "Instagram": 5107238.94,
      "Mostrador": 3972749.34
    }
  },
  {
    "anio": 2025,
    "mes": 8,
    "canales": {
      "MercadoLibre": 52057140.99,
      "Mayorista": 10455334,
      "Instagram": 5697069.15,
      "Mostrador": 2054096.42
    }
  },
  {
    "anio": 2025,
    "mes": 9,
    "canales": {
      "MercadoLibre": 43302592.05,
      "Mayorista": 10429310,
      "Instagram": 6259740.37,
      "Mostrador": 1746490.42
    }
  },
  {
    "anio": 2025,
    "mes": 10,
    "canales": {
      "MercadoLibre": 50286268.96,
      "Mayorista": 7295806.4,
      "Instagram": 7165510.35,
      "Mostrador": 1556942.49
    }
  },
  {
    "anio": 2025,
    "mes": 11,
    "canales": {
      "MercadoLibre": 50692210.91,
      "Mayorista": 7414117,
      "Instagram": 7010371.64,
      "Mostrador": 1114666
    }
  },
  {
    "anio": 2025,
    "mes": 12,
    "canales": {
      "MercadoLibre": 54345995.02,
      "Instagram": 6910712.21,
      "Mayorista": 6259270,
      "Mostrador": 1060200
    }
  },
  {
    "anio": 2026,
    "mes": 1,
    "canales": {
      "MercadoLibre": 66085684.25,
      "Mayorista": 6652919,
      "Instagram": 6302381.21,
      "Mostrador": 746389
    }
  },
  {
    "anio": 2026,
    "mes": 2,
    "canales": {
      "MercadoLibre": 44899458.49,
      "Instagram": 8137397.49,
      "Mostrador": 8070830.19,
      "Mayorista": 4242645
    }
  },
  {
    "anio": 2026,
    "mes": 3,
    "canales": {
      "MercadoLibre": 64094203.32,
      "Mostrador": 14439003.31,
      "Mayorista": 8132360,
      "Instagram": 6286131.55
    }
  },
  {
    "anio": 2026,
    "mes": 4,
    "canales": {
      "MercadoLibre": 48267985.18,
      "Mostrador": 13581461.51,
      "Mayorista": 8938464,
      "Instagram": 7301174.45
    }
  }
];
