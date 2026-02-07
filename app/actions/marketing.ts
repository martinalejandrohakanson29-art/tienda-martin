"use server"

export async function getMarketingPerformance() {
  // Estos son los datos reales que me pasaste de la API de Meta
  const campaigns = [
    {
      id: "120241567094910523",
      name: "KIT 200 BARATO IG",
      spend: 39255.04,
      reach: 25963,
      messages: 169,
      carts: 11,
      costPerMsg: 232.27,
      status: 'Active'
    },
    {
      id: "120241567094910524",
      name: "VENTAS - KITS 120 ENERO 26",
      spend: 33622.38,
      reach: 35009,
      messages: 56,
      carts: 175,
      costPerMsg: 600.40,
      status: 'Active'
    },
    {
      id: "120240845800210523",
      name: "KIT 200 INSTAGRAM",
      spend: 14741.41,
      reach: 20973,
      messages: 81,
      carts: 0,
      costPerMsg: 182.00,
      status: 'Active'
    }
  ];

  const autoResponses = [
    { adId: '857597143938113', name: 'Kit 200 Varillero', response: '¡Hola! Este es el kit que buscás para tu varillero. Incluye...' },
    { adId: '910300388222686', name: 'Kit 120 Instagram', response: '¡Hola bro! Para tu 110 tenemos este kit que es una bomba...' }
  ];

  return { campaigns, autoResponses };
}
