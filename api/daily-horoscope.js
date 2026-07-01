// api/daily-horoscope.js — Horóscopo diário com OpenAI (só para Premium)
import { kv } from '@vercel/kv';

const SIGN_NAMES = {
  aries:'Áries',touro:'Touro',gemeos:'Gêmeos',cancer:'Câncer',
  leao:'Leão',virgem:'Virgem',libra:'Libra',escorpiao:'Escorpião',
  sagitario:'Sagitário',capricornio:'Capricórnio',aquario:'Aquário',peixes:'Peixes'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sign, date } = req.query;
  if (!sign || !SIGN_NAMES[sign]) return res.status(400).json({ error: 'Signo inválido' });

  const today = date || new Date().toISOString().split('T')[0];
  const cacheKey = `horo:${sign}:${today}`;

  // ── 1. Verificar cache KV ─────────────────────────────────────────
  try {
    const cached = await kv.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }
  } catch (e) { /* KV offline — segue sem cache */ }

  // ── 2. Gerar com OpenAI ───────────────────────────────────────────
  const signName = SIGN_NAMES[sign];
  const [year, month, day] = today.split('-');
  const dateFormatted = `${day}/${month}/${year}`;

  const prompt = `Você é um astrólogo experiente. Gere um horóscopo diário personalizado para o signo de ${signName} para o dia ${dateFormatted}.

O horóscopo deve ser específico para esta data, considerar a temporada astrológica atual e os trânsitos planetários relevantes.

Retorne EXATAMENTE este JSON (sem markdown, sem explicações):
{
  "amor": "texto de 2-3 frases sobre amor e relacionamentos",
  "dinheiro": "texto de 2-3 frases sobre dinheiro e carreira",
  "familia": "texto de 2-3 frases sobre família e amigos",
  "saude": "texto de 2-3 frases sobre saúde e bem-estar",
  "espiritualidade": "texto de 2-3 frases sobre espiritualidade e propósito",
  "periodo": "texto de 2-3 frases sobre o momento geral do signo hoje"
}

Regras:
- Linguagem calorosa, em português do Brasil
- Específico para ${signName}, não genérico
- Mencione pelo menos um planeta ou posição astrológica relevante
- Tom positivo mas honesto — não seja excessivamente otimista`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 600
      })
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'Erro ao gerar horóscopo' });
    }

    const data = await openaiRes.json();
    const content = JSON.parse(data.choices[0].message.content);

    // ── 3. Salvar no cache KV por 23h ─────────────────────────────────
    try {
      await kv.set(cacheKey, content, { ex: 82800 }); // 23h em segundos
    } catch (e) { /* KV offline — continua sem cache */ }

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(content);

  } catch (e) {
    console.error('Erro daily-horoscope:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
