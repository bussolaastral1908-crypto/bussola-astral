// api/webhook.js
// Vercel Serverless Function — recebe confirmações do AbacatePay e ativa Premium

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validação opcional de assinatura do webhook (recomendada em produção)
  // const sig = req.headers['x-abacatepay-signature'];
  // if (sig !== process.env.ABACATEPAY_WEBHOOK_SECRET) {
  //   return res.status(401).json({ error: 'Assinatura inválida' });
  // }

  const event = req.body;
  console.log('[webhook] Evento recebido:', JSON.stringify(event));

  // AbacatePay envia: event.type = 'subscription.active' | 'subscription.cancelled' | etc.
  const email = event?.customer?.email || event?.data?.customer?.email;
  const subscriptionId = event?.id || event?.data?.id;
  const status = event?.type || event?.status;

  if (!email) {
    return res.status(400).json({ error: 'Email não encontrado no evento' });
  }

  try {
    if (status === 'subscription.active' || status === 'active') {
      // Ativa premium: guarda no KV por 400 dias (renovação mensal com margem)
      await kv.set(`premium:${email}`, {
        active: true,
        subscriptionId,
        activatedAt: new Date().toISOString(),
        plan: event?.metadata?.plan || 'mensal',
      }, { ex: 400 * 24 * 60 * 60 });

      console.log(`[webhook] Premium ativado: ${email}`);

    } else if (status === 'subscription.cancelled' || status === 'cancelled') {
      // Cancela premium
      await kv.del(`premium:${email}`);
      console.log(`[webhook] Premium cancelado: ${email}`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[webhook] Erro ao salvar no KV:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
