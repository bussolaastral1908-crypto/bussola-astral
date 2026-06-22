// api/admin-payments.js — Admin: list AbacatePay payments (requires admin auth)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.bussolaastral.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  // Verify session via Supabase Auth API (anon key is public—OK to hardcode)
  const SUPA_URL = 'https://jnjdkfmzkppzqafhjsbl.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuamRrZm16a3BwenFhZmhqc2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDg1MTEsImV4cCI6MjA5NzU4NDUxMX0.xpBcvJ2y6Mj3mL5HrO_XVuj-YD3RIW3P1dMWY_H16y4';

  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPA_KEY }
  });

  if (!userRes.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userRes.json();
  if (user.email !== 'zaikapablo@gmail.com') {
    return res.status(403).json({ error: 'Forbidden — admin only' });
  }

  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) return res.status(500).json({ error: 'Payment provider not configured' });

  try {
    const r = await fetch('https://api.abacatepay.com/v2/checkouts/list', {
      headers: { Authorization: `Bearer ${key}` }
    });
    const data = await r.json();
    if (!data.success) return res.status(502).json({ error: 'AbacatePay error', detail: data });
    return res.status(200).json({ payments: data.data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
