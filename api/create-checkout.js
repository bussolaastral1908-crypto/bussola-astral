// api/create-checkout.js — Vercel Serverless Function
// Cria uma cobrança AbacatePay e retorna a URL de pagamento.
// Env vars: ABACATEPAY_API_KEY, ABACATEPAY_PRODUCT_MENSAL, ABACATEPAY_PRODUCT_ANUAL

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bussolaastral.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) return res.status(500).json({ error: 'Pagamento não configurado' });

  const { email = '', name = '', plan = 'monthly' } = req.body || {};

  // Seleciona o produto correto
  const isAnual = plan === 'annual' || plan === 'anual';
  const productId   = isAnual ? process.env.ABACATEPAY_PRODUCT_ANUAL : process.env.ABACATEPAY_PRODUCT_MENSAL;
  const productName = isAnual ? 'Bússola Astral Premium — Anual' : 'Bússola Astral Premium — Mensal';
  const price       = isAnual ? 24900 : 2900; // centavos: R$249 ou R$29

  try {
    const payload = {
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: productId || (isAnual ? 'premium_anual' : 'premium_mensal'),
          name: productName,
          description: 'Acesso Premium: trânsitos 30 dias, sinastria, revolução solar e mais.',
          quantity: 1,
          price
        }
      ],
      returnUrl:     'https://www.bussolaastral.com/obrigado.html',
      completionUrl: 'https://www.bussolaastral.com/obrigado.html',
      ...(email || name ? {
        customer: {
          ...(name  ? { name }  : {}),
          ...(email ? { email } : {})
        }
      } : {})
    };

    const abResp = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await abResp.json();

    if (!abResp.ok) {
      console.error('AbacatePay error:', abResp.status, JSON.stringify(data));
      return res.status(502).json({ error: 'Erro no provedor de pagamento', detail: data });
    }

    const url = data?.data?.url || data?.url;
    if (!url) return res.status(502).json({ error: 'URL de checkout não retornada', raw: data });

    return res.status(200).json({ url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
