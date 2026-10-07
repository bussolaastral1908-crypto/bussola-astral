// api/daily-horoscope.js — Horóscopo do dia por signo, com o céu REAL do dia.
// GET /api/daily-horoscope?sign=leao[&date=AAAA-MM-DD]
//
// 1. Calcula no servidor (astronomy-engine) a posição dos planetas, a fase da Lua e os
//    aspectos do dia; 2. pede à IA um texto ancorado nesse céu (Gemini grátis; OpenAI de
//    reserva); 3. guarda por signo+dia no banco (api/_lib/store.js) — 12 gerações por dia.
// Gratuito para todos (a página /hoje usa); o Premium é o mapa completo e os 6 meses.
// Env: GEMINI_API_KEY e/ou OPENAI_API_KEY, DATABASE_URL.
// astronomy-engine (MIT) incluída no projeto em versão CommonJS: a versão ESM do pacote não
// carrega na Vercel e o require dinâmico deixava o pacote fora do deploy.
import A from './_lib/astronomy.cjs';
import { kv } from './_lib/store.js';

const SIGNS = ['aries', 'touro', 'gemeos', 'cancer', 'leao', 'virgem', 'libra', 'escorpiao', 'sagitario', 'capricornio', 'aquario', 'peixes'];
const SIGN_NAMES = ['Áries', 'Touro', 'Gêmeos', 'Câncer', 'Leão', 'Virgem', 'Libra', 'Escorpião', 'Sagitário', 'Capricórnio', 'Aquário', 'Peixes'];
const PLANETAS = [
  ['Sun', 'Sol'], ['Moon', 'Lua'], ['Mercury', 'Mercúrio'], ['Venus', 'Vênus'], ['Mars', 'Marte'],
  ['Jupiter', 'Júpiter'], ['Saturn', 'Saturno'], ['Uranus', 'Urano'], ['Neptune', 'Netuno'], ['Pluto', 'Plutão'],
];
const ASPECTOS = [[0, 'conjunção', 8], [60, 'sextil', 5], [90, 'quadratura', 6], [120, 'trígono', 6], [180, 'oposição', 7]];
const VERSAO = 'v2';

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function longitude(body, d) {
  if (body === 'Sun') return A.SunPosition(d).elon;
  if (body === 'Moon') return A.EclipticGeoMoon(d).lon;
  return A.Ecliptic(A.GeoVector(body, d, true)).elon;
}

function faseLua(graus) {
  if (graus < 22.5 || graus >= 337.5) return 'Lua Nova';
  if (graus < 67.5) return 'Lua Crescente';
  if (graus < 112.5) return 'Quarto Crescente';
  if (graus < 157.5) return 'Lua Gibosa Crescente';
  if (graus < 202.5) return 'Lua Cheia';
  if (graus < 247.5) return 'Lua Gibosa Minguante';
  if (graus < 292.5) return 'Quarto Minguante';
  return 'Lua Minguante';
}

// Céu ao meio-dia (horário de Brasília) da data pedida.
export function ceuDoDia(dateStr) {
  const d = new Date(`${dateStr}T15:00:00Z`);
  const planetas = PLANETAS.map(([body, nome]) => {
    const lon = ((longitude(body, d) % 360) + 360) % 360;
    const amanha = ((longitude(body, new Date(d.getTime() + 86400000)) % 360) + 360) % 360;
    let mov = amanha - lon; if (mov > 180) mov -= 360; if (mov < -180) mov += 360;
    return { nome, signo: SIGN_NAMES[Math.floor(lon / 30)], grau: Math.floor(lon % 30), lon, retrogrado: body !== 'Sun' && body !== 'Moon' && mov < 0 };
  });
  const aspectos = [];
  for (let i = 0; i < planetas.length; i++) {
    for (let j = i + 1; j < planetas.length; j++) {
      let diff = Math.abs(planetas[i].lon - planetas[j].lon); if (diff > 180) diff = 360 - diff;
      for (const [ang, nome, orbe] of ASPECTOS) {
        const desvio = Math.abs(diff - ang);
        if (desvio <= orbe) { aspectos.push({ a: planetas[i].nome, b: planetas[j].nome, tipo: nome, orbe: Math.round(desvio * 10) / 10 }); break; }
      }
    }
  }
  // Aspectos mais exatos primeiro; os que envolvem planetas lentos entre si pesam menos no dia.
  const lentos = new Set(['Júpiter', 'Saturno', 'Urano', 'Netuno', 'Plutão']);
  aspectos.sort((x, y) => (lentos.has(x.a) && lentos.has(x.b)) - (lentos.has(y.a) && lentos.has(y.b)) || x.orbe - y.orbe);
  const graus = A.MoonPhase(d);
  const ilum = Math.round(A.Illumination('Moon', d).phase_fraction * 100);
  return {
    planetas: planetas.map(({ lon, ...p }) => p),
    aspectos: aspectos.slice(0, 6),
    lua: { fase: faseLua(graus), iluminacao: ilum },
  };
}

function prompt(signo, dataBR, ceu) {
  const pos = ceu.planetas.map((p) => `${p.nome} em ${p.signo} ${p.grau}°${p.retrogrado ? ' (retrógrado)' : ''}`).join('; ');
  const asp = ceu.aspectos.map((a) => `${a.a} em ${a.tipo} com ${a.b}`).join('; ') || 'nenhum aspecto exato';
  return `Você é uma astróloga brasileira experiente, que escreve como uma amiga que entende de astrologia: direta, calorosa e com profundidade, sem ser religiosa nem exagerada.

Escreva o horóscopo do dia ${dataBR} para o signo de ${signo}.
Céu REAL deste dia (use só isto, não invente posições): ${pos}. Fase da Lua: ${ceu.lua.fase}. Aspectos: ${asp}.

Responda SOMENTE com este JSON (sem markdown):
{
  "resumo": "2 a 3 frases sobre o dia de ${signo}, falando com a pessoa (você)",
  "niveis": { "energia": 0-100, "amor": 0-100, "trabalho": 0-100, "financas": 0-100, "saude": 0-100 },
  "atencao": "1 frase curta: o principal cuidado do dia",
  "areas": {
    "amor":            { "titulo": "frase curta (até 8 palavras)", "texto": "2 a 3 frases" },
    "trabalho":        { "titulo": "...", "texto": "..." },
    "dinheiro":        { "titulo": "...", "texto": "..." },
    "familia":         { "titulo": "...", "texto": "..." },
    "saude":           { "titulo": "...", "texto": "..." },
    "espiritualidade": { "titulo": "...", "texto": "..." }
  },
  "porque": { "texto": "1 a 2 frases explicando, com planetas e aspectos do céu real acima, por que hoje está diferente para ${signo}", "itens": ["3 efeitos práticos curtos que isso pode trazer"] },
  "momento": "2 frases sobre o período atual de ${signo}"
}

Regras: português do Brasil; trate a pessoa só por "você" (nunca "amiga", "amigo", "querida" ou apelidos do signo); use linguagem neutra de gênero (evite palavras flexionadas como "cansada", "mesma", "sozinha" — reescreva a frase sem elas); específico para ${signo}; níveis coerentes com o texto (variados, não todos altos); tom positivo mas honesto; nada de promessas de dinheiro, cura ou certeza do futuro.`;
}

async function gerarGemini(texto) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem GEMINI_API_KEY');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts.map((p) => p.text || '').join(''));
}

async function gerarOpenAI(texto) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('sem OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: texto }], response_format: { type: 'json_object' }, temperature: 0.8, max_tokens: 1400 }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

const pct = (v) => Math.max(5, Math.min(98, Math.round(Number(v) || 50)));

function valida(h) {
  const areas = ['amor', 'trabalho', 'dinheiro', 'familia', 'saude', 'espiritualidade'];
  if (!h || typeof h.resumo !== 'string' || !h.areas) throw new Error('resposta incompleta');
  for (const a of areas) if (!h.areas[a] || !h.areas[a].texto) throw new Error(`área ${a} faltando`);
  const n = h.niveis || {};
  return {
    resumo: h.resumo, atencao: h.atencao || '', momento: h.momento || '',
    niveis: { energia: pct(n.energia), amor: pct(n.amor), trabalho: pct(n.trabalho), financas: pct(n.financas), saude: pct(n.saude) },
    areas: Object.fromEntries(areas.map((a) => [a, { titulo: String(h.areas[a].titulo || ''), texto: String(h.areas[a].texto) }])),
    porque: { texto: String(h.porque?.texto || ''), itens: Array.isArray(h.porque?.itens) ? h.porque.itens.slice(0, 4).map(String) : [] },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sign = String(req.query?.sign || '');
  const idx = SIGNS.indexOf(sign);
  if (idx < 0) return res.status(400).json({ error: 'Signo inválido' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date || '')) ? String(req.query.date) : hojeSP();
  const cacheKey = `horo:${VERSAO}:${sign}:${date}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached) { res.setHeader('X-Cache', 'HIT'); res.setHeader('Cache-Control', 'public, max-age=600'); return res.status(200).json(cached); }
  } catch (e) { console.error('[daily-horoscope] cache', e.message); }

  const ceu = ceuDoDia(date);
  const [y, m, d] = date.split('-');
  const texto = prompt(SIGN_NAMES[idx], `${d}/${m}/${y}`, ceu);
  let horo;
  for (const gerar of [gerarGemini, gerarOpenAI]) {
    try { horo = valida(await gerar(texto)); break; } catch (e) { console.error('[daily-horoscope]', gerar.name, e.message); }
  }
  if (!horo) return res.status(502).json({ error: 'Não conseguimos gerar o horóscopo agora. Tente de novo em instantes.' });

  const out = { signo: SIGN_NAMES[idx], sign, date, ...horo, ceu };
  try { await kv.set(cacheKey, out, { ex: 36 * 3600 }); } catch (e) { console.error('[daily-horoscope] salvar', e.message); }
  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).json(out);
}
