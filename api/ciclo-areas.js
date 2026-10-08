// api/ciclo-areas.js — Texto das áreas da vida no ciclo de 6 meses (Premium).
// POST { ciclo: "8 out 2026 – 9 abr 2027", areas: [{ id, nome, nota, faixa, melhor, atencao, fatores: [texto] }] }
// Authorization: Bearer <sessão>
//
// As notas e os fatores são calculados no navegador (astro-areas.js, sobre o motor de eventos
// conferido com o Swiss Ephemeris). A IA só escreve o texto a partir desses fatos.
// Cache por conta + fatos (o mesmo ciclo não gera duas vezes) e limite de gerações por dia.
import crypto from 'node:crypto';
import { kv } from './_lib/store.js';
import { gerarJSON } from './_lib/ia.js';
import { sessao } from './conta.js';

// a IA pode levar ~30 s para as 5 áreas
export const config = { maxDuration: 60 };

const IDS = ['amor', 'trabalho', 'dinheiro', 'saude', 'espiritualidade'];
const LIMITE_DIA = 6;
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);

function limpa(body) {
  const b = typeof body === 'string' ? JSON.parse(body || '{}') : body || {};
  const areas = (Array.isArray(b.areas) ? b.areas : []).filter((a) => a && IDS.includes(a.id)).slice(0, 5).map((a) => ({
    id: a.id, nome: txt(a.nome, 40), nota: Math.max(1, Math.min(10, Math.round(Number(a.nota) || 5))), faixa: txt(a.faixa, 20),
    melhor: txt(a.melhor, 20), atencao: txt(a.atencao, 20),
    fatores: (Array.isArray(a.fatores) ? a.fatores : []).slice(0, 4).map((f) => txt(f, 160)),
  }));
  return { ciclo: txt(b.ciclo, 60), areas };
}

function prompt({ ciclo, areas }) {
  const linhas = areas.map((a) => `- ${a.id} (${a.nome}): fluidez ${a.nota}/10 (${a.faixa})${a.melhor ? `; fase mais favorável: ${a.melhor}` : ''}${a.atencao ? `; pede atenção em: ${a.atencao}` : ''}. Fatos: ${a.fatores.join('; ') || 'sem trânsitos fortes nesta área'}.`).join('\n');
  return `Você é uma astróloga brasileira experiente, que escreve como uma amiga que entende de astrologia: direta, calorosa e com profundidade, sem ser religiosa nem exagerada.

Escreva a previsão por área da vida para o ciclo ${ciclo} de uma pessoa, a partir APENAS destes fatos calculados do mapa dela (não invente planetas, aspectos, casas nem datas):
${linhas}

Responda SOMENTE com este JSON (sem markdown), uma chave por área recebida:
{ "<id>": { "titulo": "frase curta (até 7 palavras)", "texto": "2 a 3 frases que expliquem o clima da área citando 1 ou 2 dos fatos acima em linguagem simples, e terminem com um conselho prático" } }

Regras: português do Brasil; trate a pessoa só por "você"; linguagem neutra de gênero (evite palavras flexionadas como "cansada", "sozinho" — reescreva sem elas); o tom acompanha a nota (nota baixa = fase de ajuste e aprendizado, sem catastrofismo; nota alta = fase de fluidez, sem euforia); cite meses só se estiverem nos fatos; nada de promessas de dinheiro, cura, casamento ou certeza do futuro.`;
}

function valida(ids) {
  return (h) => {
    const out = {};
    for (const id of ids) {
      if (!h || !h[id] || typeof h[id].texto !== 'string' || !h[id].texto.trim()) throw new Error(`área ${id} faltando`);
      out[id] = { titulo: txt(h[id].titulo, 80), texto: txt(h[id].texto, 700) };
    }
    return out;
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const conta = await sessao(req);
  if (!conta) return res.status(401).json({ error: 'Entre na sua conta.' });
  const p = await kv.get(`premium:${conta.email}`);
  if (!p || p.active !== true) return res.status(403).json({ error: 'Recurso do Premium.' });

  let dados;
  try { dados = limpa(req.body); } catch { return res.status(400).json({ error: 'Dados inválidos.' }); }
  if (!dados.areas.length) return res.status(400).json({ error: 'Nenhuma área enviada.' });

  const hash = crypto.createHash('sha256').update(conta.email + JSON.stringify(dados)).digest('hex').slice(0, 32);
  const chave = `areas:v1:${hash}`;
  try {
    const cache = await kv.get(chave);
    if (cache) return res.status(200).json({ areas: cache, cache: true });
  } catch (e) { console.error('[ciclo-areas] cache', e.message); }

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const chaveLim = `areas-lim:${conta.email}:${hoje}`;
  const usados = Number(await kv.get(chaveLim)) || 0;
  if (usados >= LIMITE_DIA) return res.status(429).json({ error: 'Limite de hoje atingido. Os textos calculados continuam valendo.' });
  await kv.set(chaveLim, usados + 1, { ex: 2 * 86400 });

  const areas = await gerarJSON(prompt(dados), valida(dados.areas.map((a) => a.id)), 'ciclo-areas', 0.7);
  if (!areas) return res.status(502).json({ error: 'Não conseguimos escrever agora. Tente de novo em instantes.' });
  try { await kv.set(chave, areas, { ex: 200 * 86400 }); } catch (e) { console.error('[ciclo-areas] salvar', e.message); }
  return res.status(200).json({ areas });
}

