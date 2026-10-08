// api/create-checkout.js — Vercel Serverless Function (AbacatePay v2)
// Se a pessoa está logada, guarda "código do pagamento (bill_…) → conta": o webhook usa isso
// pra liberar o Premium na conta certa, mesmo que o e-mail digitado no Pix seja outro.
import { sessao } from './conta.js';
import { kv } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bussolaastral.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) return res.status(500).json({ error: 'Pagamento não configurado' });

  const { plan = 'monthly' } = req.body || {};
  const isAnual = plan === 'annual' || plan === 'anual';
  const productId = isAnual
    ? (process.env.ABACATEPAY_PRODUCT_ANUAL  || 'prod_Dwjgsz1J0UwdWEmMfArL4Qcw')
    : (process.env.ABACATEPAY_PRODUCT_MENSAL || 'prod_qDxZupFrSTSdcG2b0X50fawj');

  const tryCreate = async (methods) => {
    const payload = {
      items: [{ id: productId, quantity: 1 }],
      methods,
      returnUrl:     'https://www.bussolaastral.com/obrigado.html',
      completionUrl: 'https://www.bussolaastral.com/obrigado.html',
    };
    const r = await fetch('https://api.abacatepay.com/v2/checkouts/create', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: r.status, data: await r.json() };
  };

  try {
    // Pix + cartão; se a loja não tiver um dos métodos habilitado (ex.: "CARD is not
    // available for this store"), tenta só com o outro.
    let { status, data } = await tryCreate(['PIX', 'CARD']);
    if (!data.success && /CARD/i.test(String(data.error || ''))) {
      ({ status, data } = await tryCreate(['PIX']));
    } else if (!data.success && /PIX/i.test(String(data.error || ''))) {
      ({ status, data } = await tryCreate(['CARD']));
    }

    if (!data.success) {
      console.error('AbacatePay error:', status, JSON.stringify(data));
      return res.status(502).json({ error: 'Erro no provedor de pagamento', detail: data });
    }

    const url = data?.data?.url;
    if (!url) return res.status(502).json({ error: 'URL não retornada', raw: data });

    try {
      const conta = await sessao(req);
      const billId = data?.data?.id;
      if (conta && billId) await kv.set(`checkout:${billId}`, { email: conta.email, createdAt: new Date().toISOString() }, { ex: 30 * 24 * 3600 });
    } catch (e) { console.error('[create-checkout] vínculo com a conta', e.message); }

    return res.status(200).json({ url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
