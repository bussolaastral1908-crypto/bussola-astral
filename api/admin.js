// api/admin.js — Painel administrativo (/admin.html).
//   GET  ?acao=dados       → { usuarios: [...], pagosSemConta: [...] }
//   GET  ?acao=pagamentos  → { payments: [...] } (checkouts da AbacatePay)
//   POST ?acao=premium     { email, conceder: true|false } → libera ou retira o Premium
// Acesso: sessão da conta do site (Authorization: Bearer) com e-mail em ADMIN_EMAILS
// (lista separada por vírgula, na Vercel). Substitui o admin antigo, que dependia do Supabase apagado.
import { kv } from './_lib/store.js';
import { sessao } from './conta.js';

const PREMIUM_MANUAL_DIAS = 183; // mesmo prazo do Premium vendido (6 meses)

function admins() {
  return String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

const SIGNOS = [[1, 20, 'Capricórnio'], [2, 19, 'Aquário'], [3, 20, 'Peixes'], [4, 20, 'Áries'], [5, 20, 'Touro'], [6, 20, 'Gêmeos'],
  [7, 22, 'Câncer'], [8, 22, 'Leão'], [9, 22, 'Virgem'], [10, 22, 'Libra'], [11, 21, 'Escorpião'], [12, 21, 'Sagitário'], [12, 31, 'Capricórnio']];
function signo(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ''));
  if (!m) return '';
  const mes = +m[2], dia = +m[3];
  for (const [mm, dd, nome] of SIGNOS) if (mes < mm || (mes === mm && dia <= dd)) return nome;
  return 'Capricórnio';
}

async function dados() {
  const [contas, premiums] = await Promise.all([kv.list('conta:', 2000), kv.list('premium:', 2000)]);
  const prem = new Map(premiums.map((r) => [r.key.slice('premium:'.length), r]));
  const usuarios = contas.map((r) => {
    const c = r.value || {}, p = prem.get(c.email);
    const ativo = !!(p && p.value && p.value.active === true);
    return {
      email: c.email, name: c.name || '', sign: signo(c.birth_date), birth_date: c.birth_date || '',
      created_at: c.createdAt || null, last_sign_in_at: c.lastLogin || null,
      is_premium: ativo, premium_expires_at: ativo ? p.expires_at : null,
      premium_origem: ativo ? (p.value.plan === 'manual' ? 'manual' : 'pagamento') : null,
    };
  }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const emails = new Set(usuarios.map((u) => u.email));
  const pagosSemConta = premiums.filter((r) => r.value && r.value.active === true && !emails.has(r.key.slice('premium:'.length)))
    .map((r) => ({ email: r.key.slice('premium:'.length), granted_at: r.value.activatedAt || r.value.grantedAt || r.updated_at, expires_at: r.expires_at }));
  return { usuarios, pagosSemConta };
}

async function pagamentos() {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw Object.assign(new Error('Pagamentos não configurados (ABACATEPAY_API_KEY).'), { status: 500 });
  const r = await fetch('https://api.abacatepay.com/v2/checkouts/list', { headers: { Authorization: `Bearer ${key}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw Object.assign(new Error('A AbacatePay não respondeu.'), { status: 502 });
  return { payments: data.data || [] };
}

async function premium(body, admin) {
  const b = typeof body === 'string' ? JSON.parse(body || '{}') : body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('E-mail inválido.'), { status: 400 });
  const atual = await kv.get(`premium:${email}`);
  const agora = new Date().toISOString();
  if (b.conceder) {
    await kv.set(`premium:${email}`, { ...(atual || {}), active: true, plan: atual && atual.active ? atual.plan : 'manual', grantedBy: admin, grantedAt: agora },
      { ex: PREMIUM_MANUAL_DIAS * 86400 });
  } else {
    // o registro fica (é prova de compra); só desativa, com quem e quando
    if (!atual) return { ok: true };
    await kv.set(`premium:${email}`, { ...atual, active: false, revokedBy: admin, revokedAt: agora }, { ex: 400 * 86400 });
  }
  console.log(`[admin] ${admin} ${b.conceder ? 'concedeu' : 'retirou'} Premium de ${email}`);
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const conta = await sessao(req);
  if (!conta) return res.status(401).json({ error: 'Entre na sua conta.' });
  if (!admins().includes(String(conta.email).toLowerCase())) return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  const acao = String(req.query?.acao || '');
  try {
    if (acao === 'dados' && req.method === 'GET') return res.status(200).json({ ...(await dados()), admin: conta.email });
    if (acao === 'pagamentos' && req.method === 'GET') return res.status(200).json(await pagamentos());
    if (acao === 'premium' && req.method === 'POST') return res.status(200).json(await premium(req.body, conta.email));
    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    console.error('[admin]', acao, e.message);
    return res.status(e.status || 500).json({ error: e.message || 'Erro interno.' });
  }
}
