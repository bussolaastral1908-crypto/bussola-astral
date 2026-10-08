// Geração de texto em JSON: Gemini (grátis) primeiro, OpenAI de reserva.
// Env: GEMINI_API_KEY e/ou OPENAI_API_KEY.

export async function gerarGemini(texto, temperatura = 0.8) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem GEMINI_API_KEY');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }], generationConfig: { responseMimeType: 'application/json', temperature: temperatura } }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts.map((p) => p.text || '').join(''));
}

export async function gerarOpenAI(texto, temperatura = 0.8) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('sem OPENAI_API_KEY');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: texto }], response_format: { type: 'json_object' }, temperature: temperatura, max_tokens: 1400 }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

// Tenta cada gerador até um passar na validação.
export async function gerarJSON(texto, valida, rotulo, temperatura) {
  for (const gerar of [gerarGemini, gerarOpenAI]) {
    try { return valida(await gerar(texto, temperatura)); } catch (e) { console.error(`[${rotulo}]`, gerar.name, e.message); }
  }
  return null;
}
