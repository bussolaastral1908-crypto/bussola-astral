
// api/webhook.js
// Vercel Serverless Function — recebe confirmações do AbacatePay e ativa Premium

import { kv } from './_lib/store.js';
import crypto from 'crypto';

// Vercel parseia o body antes de chegar aqui; precisamos do raw body para verificar HMAC.
// Configurar em vercel.json: "bodyParser": false NÃO funciona em Vercel Functions default.
// Por ora usamos comparação direta do secret que o AbacatePay envia no header.
// Quando tivermos o raw body disponível, migrar para HMAC-SHA256.

// Confere se o aviso veio mesmo da AbacatePay. O segredo (WEBHOOK_SECRET) chega no próprio
// endereço chamado (?webhookSecret=...) ou num cabeçalho; aceitamos os dois. Sem o segredo
// certo, o aviso é recusado — antes, aviso sem assinatura passava (qualquer um ganhava Premium).
function iguais(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function verifySignature(req, rawBody) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] WEBHOOK_SECRET não configurado — aviso recusado');
    return false;
  }
  const doEndereco = req.query?.webhookSecret || req.query?.secret;
  const doCabecalho = req.headers['x-webhook-secret'] || req.headers['x-abacatepay-signature'] || req.headers['x-webhook-signature'];
  if (iguais(doEndereco, secret) || iguais(doCabecalho, secret)) return true;
  if (doCabecalho && rawBody) {
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const b64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    if (iguais(doCabecalho, hmac) || iguais(doCabecalho, `sha256=${hmac}`) || iguais(doCabecalho, b64)) return true;
  }
  console.error('[webhook] segredo ausente ou errado — recusado', JSON.stringify({
    segredoNoEndereco: !!doEndereco, cabecalhosDeAssinatura: ['x-webhook-secret', 'x-abacatepay-signature', 'x-webhook-signature'].filter((h) => req.headers[h]),
  }));
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

  const event = req.body || {};

  // Formato do aviso varia entre versões da AbacatePay (v1/v2, checkout/transparente):
  // procura o e-mail do cliente em qualquer parte do aviso.
  function acharEmail(o, prof = 0) {
    if (!o || typeof o !== 'object' || prof > 6) return '';
    for (const k of ['email', 'customerEmail']) if (typeof o[k] === 'string' && o[k].includes('@')) return o[k];
    for (const k of ['customer', 'payer', 'billing', 'checkout', 'metadata', 'data']) { const e = acharEmail(o[k], prof + 1); if (e) return e; }
    for (const v of Object.values(o)) { const e = acharEmail(v, prof + 1); if (e) return e; }
    return '';
  }
  // Estrutura do aviso (só nomes dos campos, sem valores/dados pessoais), pra diagnóstico.
  function estrutura(o, prof = 0) {
    if (!o || typeof o !== 'object' || prof > 3) return typeof o;
    return Object.fromEntries(Object.entries(o).slice(0, 25).map(([k, v]) => [k, estrutura(v, prof + 1)]));
  }

  // Código do pagamento (bill_…): se o site criou esse checkout pra uma conta logada,
  // o Premium vai pra essa conta — não pro e-mail digitado no pagamento.
  function acharBill(o, prof = 0) {
    if (!o || typeof o !== 'object' || prof > 6) return '';
    for (const v of Object.values(o)) {
      if (typeof v === 'string' && /^bill_[A-Za-z0-9]+$/.test(v)) return v;
      const b = acharBill(v, prof + 1); if (b) return b;
    }
    return '';
  }
  const eventType = event?.event || event?.type;
  const billId = acharBill(event);
  const vinculo = billId ? await kv.get(`checkout:${billId}`).catch(() => null) : null;
  const emailPagamento = String(acharEmail(event)).trim().toLowerCase();
  const email = (vinculo && vinculo.email) || emailPagamento;
  const subscriptionId = event?.data?.id || event?.data?.checkout?.id || event?.id;

  console.log(`[webhook] contaVinculada=${!!vinculo} tipo=${eventType} status=${event?.data?.status || event?.status || ''} temEmail=${!!email} estrutura=${JSON.stringify(estrutura(event))}`);

  if (!email) {
    console.error('[webhook] E-mail não encontrado no evento (ver estrutura acima)');
    return res.status(400).json({ error: 'Email não encontrado no evento' });
  }

  try {
    const EVENTOS_ATIVAR = [
      'subscription.completed',
      'subscription.renewed',
      'checkout.completed',
      'transparent.completed',
      'billing.paid',
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
