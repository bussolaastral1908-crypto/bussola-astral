// api/check-premium.js
// Vercel Serverless Function — verifica se um email tem Premium ativo

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email obrigatório' });
  }

  try {
    const data = await kv.get(`premium:${email}`);
    return res.status(200).json({
      premium: !!data && data.active === true,
      plan: data?.plan || null,
    });
  } catch (err) {
    console.error('[check-premium] Erro:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
