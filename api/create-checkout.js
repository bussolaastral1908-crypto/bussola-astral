// api/create-checkout.js — Vercel Serverless Function
// Creates an AbacatePay billing charge and returns the checkout URL.
// Env vars required: ABACATEPAY_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, plan } = req.body || {};
  const key = process.env.ABACATEPAY_KEY;

  if (!key) {
    return res.status(500).json({ error: 'Payment provider not configured' });
  }

  try {
    const payload = {
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      products: [
        {
          externalId: 'premium_monthly',
          name: 'Bússola Astral Premium — 1 mês',
          description: 'Acesso completo: trânsitos 30 dias, sinastria, revolução solar e mais.',
          quantity: 1,
          price: 2900  // R$ 29,00 in centavos
        }
      ],
      returnUrl: 'https://bussolaastral.com/obrigado.html',
      completionUrl: 'https://bussolaastral.com/obrigado.html',
      customer: {
        ...(name  ? { name }  : {}),
        ...(email ? { email } : {})
      }
    };

    const abResp = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!abResp.ok) {
      const errBody = await abResp.text();
      console.error('AbacatePay error:', abResp.status, errBody);
      return res.status(502).json({ error: 'Payment provider error', detail: errBody });
    }

    const data = await abResp.json();
    // AbacatePay returns: { data: { url: "https://..." } }
    const url = data?.data?.url || data?.url;

    if (!url) {
      return res.status(502).json({ error: 'No checkout URL returned', raw: data });
    }

    return res.status(200).json({ url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
