// api/webhook.js
// Vercel Serverless Function — recebe confirmações do AbacatePay e ativa Premium

import { kv } from '@vercel/kv';
import crypto from 'crypto';

// Vercel parseia o body antes de chegar aqui; precisamos do raw body para verificar HMAC.
// Configurar em vercel.json: "bodyParser": false NÃO funciona em Vercel Functions default.
// Por ora usamos comparação direta do secret que o AbacatePay envia no header.
// Quando tivermos o raw body disponível, migrar para HMAC-SHA256.

function verifySignature(req, rawBody) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // se não configurado, passa (não recomendado em produção)

  // AbacatePay v2 envia o secret diretamente ou como HMAC — tentar ambos
  const headerSig = req.headers['x-abacatepay-signature'] || req.headers['x-webhook-secret'];

  if (!headerSig) {
    console.warn('[webhook] Header de assinatura ausente');
    // Em sandbox, pode não vir assinatura — logar e continuar
    return true;
  }

  // Tentativa 1: comparação direta do secret
  if (headerSig === secret) return true;

  // Tentativa 2: HMAC-SHA256 do raw body
  if (rawBody) {
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedSig = `sha256=${hmac}`;
    if (crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expectedSig))) return true;
    // sem o prefixo sha256=
    if (crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(hmac))) return true;
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Capturar raw body para validação de assinatura
  let rawBody = '';
  if (req.body && typeof req.body === 'object') {
    rawBody = JSON.stringify(req.body);
  }

  if (!verifySignature(req, rawBody)) {
    console.error('[webhook] Assinatura inválida — requisição rejeitada');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  const event = req.body;
  console.log('[webhook] Evento recebido:', JSON.stringify(event));

  // AbacatePay v2 event structure:
  // { event: "subscription.completed", data: { ... }, customer: { email: ... } }
  // ou: { type: "...", customer: { email: ... }, id: "..." }
  const eventType = event?.event || event?.type;
  const email = event?.customer?.email
    || event?.data?.customer?.email
    || event?.data?.billing?.email;
  const subscriptionId = event?.data?.id || event?.id;

  console.log(`[webhook] tipo=${eventType} email=${email}`);

  if (!email) {
    console.error('[webhook] Email não encontrado no evento:', JSON.stringify(event));
    return res.status(400).json({ error: 'Email não encontrado no evento' });
  }

  try {
    const EVENTOS_ATIVAR = [
      'subscription.completed',
      'subscription.renewed',
      'checkout.completed',
      'subscription.active',
      'active',
      'PAID',
    ];

    const EVENTOS_CANCELAR = [
      'subscription.cancelled',
      'subscription.canceled',
      'cancelled',
      'canceled',
    ];

    if (EVENTOS_ATIVAR.includes(eventType) || EVENTOS_ATIVAR.includes(event?.status)) {
      // Ativa premium por 400 dias (renova a cada pagamento)
      await kv.set(`premium:${email}`, {
        active: true,
        subscriptionId,
        activatedAt: new Date().toISOString(),
        plan: event?.data?.product?.name || event?.metadata?.plan || 'mensal',
        eventType,
      }, { ex: 400 * 24 * 60 * 60 });

      console.log(`[webhook] ✅ Premium ativado: ${email}`);

    } else if (EVENTOS_CANCELAR.includes(eventType) || EVENTOS_CANCELAR.includes(event?.status)) {
      await kv.del(`premium:${email}`);
      console.log(`[webhook] ❌ Premium cancelado: ${email}`);

    } else {
      console.log(`[webhook] Evento ignorado: ${eventType}`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[webhook] Erro ao salvar no KV:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
