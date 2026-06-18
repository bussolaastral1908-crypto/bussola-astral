// api/create-checkout.js
// Vercel Serverless Function — cria sessão de checkout no AbacatePay

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, plan = 'mensal' } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email obrigatório' });
  }

  const ABACATEPAY_API_KEY = process.env.ABACATEPAY_API_KEY;
  if (!ABACATEPAY_API_KEY) {
    return res.status(500).json({ error: 'Chave API não configurada' });
  }

  // Substitua pelos IDs reais dos produtos criados no painel AbacatePay
  const PRODUCT_IDS = {
    mensal: process.env.ABACATEPAY_PRODUCT_MENSAL || 'prod_mensal_placeholder',
    anual:  process.env.ABACATEPAY_PRODUCT_ANUAL  || 'prod_anual_placeholder',
  };

  const productId = PRODUCT_IDS[plan] || PRODUCT_IDS.mensal;

  try {
    const response = await fetch('https://api.abacatepay.com/v2/subscriptions/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ABACATEPAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [{ externalId: productId, quantity: 1 }],
        customer: { email },
        returnUrl:  'https://bussolaastral.com/obrigado',
        cancelUrl:  'https://bussolaastral.com/premium',
        metadata: { plan },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[AbacatePay] Erro:', data);
      return res.status(response.status).json({ error: data.message || 'Erro no pagamento' });
    }

    return res.status(200).json({ checkoutUrl: data.url, subscriptionId: data.id });

  } catch (err) {
    console.error('[create-checkout] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
