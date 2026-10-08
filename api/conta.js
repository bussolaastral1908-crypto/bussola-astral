// api/conta.js — Contas da Bússola Astral (cadastro, login, perfil, Premium, exclusão, senha).
// Uma função só, rota /api/conta?acao=... (o vercel.json mapeia /api/x → /api/x.js).
//
// Dados no Postgres (api/_lib/store.js, tabela kv) — o mesmo onde o webhook grava premium:<email>:
//   conta:<email>   → { id, email, name, passHash, birth_date, birth_time, birth_city, phone, createdAt, ver }
//   reset:<sha256>  → email (1h)
// Sessão: token assinado (HMAC) com SESSION_SECRET — email.versão.expira.assinatura (30 dias).
// Trocar a senha ou excluir a conta muda a "versão" e derruba as sessões antigas.
//
// Env: DATABASE_URL, SESSION_SECRET, opcional RESEND_API_KEY + RESEND_FROM (e-mail de senha).
import { kv } from './_lib/store.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SITE = 'https://www.bussolaastral.com';
const CAMPOS = ['name', 'birth_date', 'birth_time', 'birth_city', 'phone'];

const keyConta = (email) => `conta:${email}`;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto');
  return s;
}
const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');
const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('hex');

function makeToken(email, ver) {
  const payload = `${b64(email)}.${ver}.${Date.now() + SESSION_MS}`;
  return `${payload}.${sign(payload)}`;
}
function readToken(token) {
  const p = String(token || '').split('.');
  if (p.length !== 4) return null;
  const payload = `${p[0]}.${p[1]}.${p[2]}`;
  const exp = sign(payload);
  if (p[3].length !== exp.length || !crypto.timingSafeEqual(Buffer.from(p[3]), Buffer.from(exp))) return null;
  if (Date.now() > Number(p[2])) return null;
  return { email: unb64(p[0]), ver: Number(p[1]) };
}

async function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pass, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function checkPass(pass, stored) {
  const [scheme, salt, key] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await scrypt(String(pass), Buffer.from(salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

async function premiumDe(email) {
  const p = await kv.get(`premium:${email}`);
  return !!p && p.active === true;
}

// O que o navegador recebe (nunca o hash da senha).
async function publico(conta) {
  const out = { email: conta.email, createdAt: conta.createdAt };
  for (const c of CAMPOS) out[c] = conta[c] || '';
  out.is_premium = await premiumDe(conta.email);
  return out;
}

export async function sessao(req) {
  const h = req.headers.authorization || '';
  const t = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!t) return null;
  const conta = await kv.get(keyConta(t.email));
  if (!conta || (conta.ver || 0) !== t.ver) return null;
  return conta;
}

function corpo(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

function limpaPerfil(b) {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim().slice(0, 120);
  if (b.birth_date !== undefined) out.birth_date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.birth_date)) ? String(b.birth_date) : '';
  if (b.birth_time !== undefined) out.birth_time = /^\d{2}:\d{2}/.test(String(b.birth_time || '')) ? String(b.birth_time).slice(0, 5) : '';
  if (b.birth_city !== undefined) out.birth_city = String(b.birth_city || '').trim().slice(0, 120);
  if (b.phone !== undefined) out.phone = String(b.phone || '').replace(/[^\d+()\s-]/g, '').slice(0, 30);
  return out;
}

const ACOES = {
  // Cadastro: e-mail, senha (mín. 6, como a tela) e dados de nascimento.
  async cadastro(req, res) {
    const b = corpo(req);
    const email = normEmail(b.email);
    const senha = String(b.password || '');
    if (!emailOk(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    if (await kv.get(keyConta(email))) return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login para continuar.' });
    const conta = { id: crypto.randomUUID(), email, passHash: await hashPass(senha), createdAt: new Date().toISOString(), ver: 1, ...limpaPerfil(b) };
    await kv.set(keyConta(email), conta);
    return res.status(201).json({ token: makeToken(email, conta.ver), profile: await publico(conta) });
  },

  async login(req, res) {
    const b = corpo(req);
    const email = normEmail(b.email);
    const conta = await kv.get(keyConta(email));
    if (!conta || !(await checkPass(b.password, conta.passHash))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    return res.status(200).json({ token: makeToken(email, conta.ver || 0), profile: await publico(conta) });
  },

  // GET: perfil + Premium. PUT: atualiza dados de nascimento/nome/celular.
  async perfil(req, res) {
    const conta = await sessao(req);
    if (!conta) return res.status(401).json({ error: 'nao_autenticado' });
    if (req.method === 'PUT' || req.method === 'POST') {
      Object.assign(conta, limpaPerfil(corpo(req)));
      await kv.set(keyConta(conta.email), conta);
    }
    return res.status(200).json({ profile: await publico(conta) });
  },

  // Exclusão da conta: pelo app (sessão) ou pela página /excluir-conta (e-mail + senha).
  async excluir(req, res) {
    let conta = await sessao(req);
    if (!conta) {
      const b = corpo(req);
      const c = await kv.get(keyConta(normEmail(b.email)));
      if (c && (await checkPass(b.password, c.passHash))) conta = c;
    }
    if (!conta) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    await kv.del(keyConta(conta.email));
    // O registro de pagamento (premium:<email>) fica: é prova de compra e permite
    // reativar o acesso se a pessoa criar a conta de novo com o mesmo e-mail.
    return res.status(200).json({ ok: true });
  },

  // Esqueci a senha: sempre responde ok (não revela se o e-mail existe).
  async esqueci(req, res) {
    const email = normEmail(corpo(req).email);
    const conta = emailOk(email) ? await kv.get(keyConta(email)) : null;
    if (conta && process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
      const token = crypto.randomBytes(32).toString('base64url');
      await kv.set(`reset:${crypto.createHash('sha256').update(token).digest('hex')}`, email, { ex: 3600 });
      const link = `${SITE}/redefinir-senha.html?token=${encodeURIComponent(token)}`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM,
          to: email,
          subject: 'Redefinir sua senha da Bússola Astral',
          text: `Recebemos um pedido para redefinir a senha da sua conta da Bússola Astral.\n\nAbra o link abaixo para criar uma senha nova (vale por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.\n\nBússola Astral`,
          html: `<p>Recebemos um pedido para redefinir a senha da sua conta da Bússola Astral.</p><p><a href="${link}">Criar uma senha nova</a> (vale por 1 hora).</p><p>Se não foi você, ignore este e-mail.</p>`,
        }),
      });
      if (!r.ok) console.error('[conta/esqueci] Resend', r.status);
    } else if (conta) {
      console.warn('[conta/esqueci] RESEND_* não configurado — e-mail não enviado');
    }
    return res.status(200).json({ ok: true });
  },

  async redefinir(req, res) {
    const b = corpo(req);
    const senha = String(b.password || '');
    if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    const k = `reset:${crypto.createHash('sha256').update(String(b.token || '')).digest('hex')}`;
    const email = await kv.get(k);
    const conta = email ? await kv.get(keyConta(email)) : null;
    if (!conta) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
    conta.passHash = await hashPass(senha);
    conta.ver = (conta.ver || 0) + 1;
    await kv.set(keyConta(email), conta);
    await kv.del(k);
    return res.status(200).json({ ok: true });
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', SITE);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const acao = ACOES[String(req.query?.acao || '')];
  if (!acao) return res.status(404).json({ error: 'acao_desconhecida' });
  try {
    return await acao(req, res);
  } catch (err) {
    console.error(`[conta/${req.query?.acao}]`, err.message);
    return res.status(500).json({ error: 'Não deu certo agora. Tente de novo em instantes.' });
  }
}
