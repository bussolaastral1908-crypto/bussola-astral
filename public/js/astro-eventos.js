/**
 * Bússola Astral — motor de eventos do ciclo (trânsitos com datas reais).
 * Para um mapa natal e uma janela (padrão: 6 meses a partir de hoje), calcula:
 *  - trânsitos: planeta do céu × ponto natal × aspecto, com início, fim e datas exatas (picos);
 *    passagens retrógradas do mesmo trânsito viram um só evento com vários picos;
 *  - lunações (Lua Nova/Cheia) e eclipses, com a casa natal onde caem;
 *  - estações e períodos retrógrados, com a casa natal;
 *  - entradas dos planetas lentos em casas natais e em signos.
 * Mesma fórmula de longitude do resto do site (conferida com o Swiss Ephemeris).
 * Funciona no navegador (window.Astronomy) e no Node (AstroEventos.usar(lib)).
 */
(function (root) {
  let AE = (typeof window !== 'undefined' && window.Astronomy) || null;
  const lib = () => AE || (typeof window !== 'undefined' && window.Astronomy);
  const DIA = 86400000;
  const norm = (v) => ((v % 360) + 360) % 360;
  const BODY = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };

  function lon(k, d) {
    const A = lib();
    if (k === 'sun') return norm(A.SunPosition(d).elon);
    if (k === 'moon') return norm(A.EclipticGeoMoon(d).lon);
    return norm(A.Ecliptic(A.GeoVector(BODY[k], d, false)).elon);
  }

  const TRANSITANTES = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const LENTOS = new Set(['jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
  const ORBE = { sun: 1, mercury: 1, venus: 1, mars: 1.5, jupiter: 2, saturn: 2, uranus: 1.5, neptune: 1.5, pluto: 1.5 };
  const ASPECTOS = [
    { a: 0, nome: 'Conjunção', tom: 'fusão', w: 1 }, { a: 180, nome: 'Oposição', tom: 'tensão', w: 0.9 },
    { a: 90, nome: 'Quadratura', tom: 'tensão', w: 0.9 }, { a: 120, nome: 'Trígono', tom: 'harmonia', w: 0.75 },
    { a: 60, nome: 'Sextil', tom: 'harmonia', w: 0.55 },
  ];
  // Peso de relevância: planeta do céu (lento pesa mais) × ponto natal pessoal × aspecto.
  const PESO_T = { pluto: 10, neptune: 9, uranus: 9, saturn: 9, jupiter: 7, mars: 4, sun: 2.5, venus: 2, mercury: 1.5 };
  const PESO_N = { sun: 3, moon: 3, asc: 3, mc: 3, mercury: 2, venus: 2, mars: 2, jupiter: 1.5, saturn: 1.5, uranus: 1, neptune: 1, pluto: 1, node: 1 };

  function casaDe(l, c) {
    if (!c) return null;
    for (let i = 0; i < 12; i++) { if (norm(l - c[i]) < norm(c[(i + 1) % 12] - c[i])) return i + 1; }
    return 12;
  }
  const sep = (a, b) => { const d = Math.abs(norm(a - b)); return d > 180 ? 360 - d : d; };

  // Raiz de f entre t0 e t1 (ms) por bissecção, ~1 min de precisão.
  function raiz(f, t0, t1) {
    let a = t0, b = t1, fa = f(a);
    for (let i = 0; i < 40 && b - a > 60000; i++) {
      const m = (a + b) / 2, fm = f(m);
      if ((fm <= 0) === (fa <= 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }
  // Mínimo de f em [t0, t1] (busca áurea).
  function minimo(f, t0, t1) {
    const g = (Math.sqrt(5) - 1) / 2;
    let a = t0, b = t1, c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < 50 && b - a > 60000; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
    }
    return (a + b) / 2;
  }

  function serie(k, t0, n) { const v = new Array(n); for (let i = 0; i < n; i++) v[i] = lon(k, new Date(t0 + i * DIA)); return v; }

  function transitos(natal, cuspides, ini, fim) {
    const out = [];
    for (const tp of TRANSITANTES) {
      const margem = LENTOS.has(tp) ? 730 : 60;
      const t0 = ini - margem * DIA, n = Math.ceil((fim - t0) / DIA) + (LENTOS.has(tp) ? 730 : 60);
      const L = serie(tp, t0, n), orbe = ORBE[tp];
      for (const [np, nl] of Object.entries(natal)) {
        for (const asp of ASPECTOS) {
          const dev = (t) => Math.abs(sep(lon(tp, new Date(t)), nl) - asp.a);
          const devI = (i) => Math.abs(sep(L[i], nl) - asp.a);
          // intervalos dentro do orbe (amostra diária, bordas refinadas)
          const ints = [];
          let dentro = devI(0) <= orbe, comeco = dentro ? { t: t0, borda: true } : null;
          for (let i = 1; i < n; i++) {
            const agora = devI(i) <= orbe;
            if (agora === dentro) continue;
            const t = raiz((x) => dev(x) - orbe, t0 + (i - 1) * DIA, t0 + i * DIA);
            if (agora) comeco = { t, borda: false };
            else { ints.push({ ini: comeco.t, iniBorda: comeco.borda, fim: t, fimBorda: false, i0: Math.round((comeco.t - t0) / DIA), i1: i }); comeco = null; }
            dentro = agora;
          }
          if (comeco) ints.push({ ini: comeco.t, iniBorda: comeco.borda, fim: t0 + (n - 1) * DIA, fimBorda: true, i0: Math.round((comeco.t - t0) / DIA), i1: n - 1 });
          if (!ints.length) continue;
          // passagens retrógradas próximas = um só trânsito
          const grupos = [];
          for (const it of ints) {
            const ult = grupos[grupos.length - 1];
            if (ult && LENTOS.has(tp) && it.ini - ult[ult.length - 1].fim < 300 * DIA) ult.push(it); else grupos.push([it]);
          }
          for (const g of grupos) {
            const a = g[0], z = g[g.length - 1];
            if (z.fim < ini || a.ini > fim) continue;
            const picos = [];
            for (const it of g) {
              for (let i = Math.max(it.i0, 1); i <= Math.min(it.i1, n - 2); i++) {
                if (devI(i) <= devI(i - 1) && devI(i) < devI(i + 1)) {
                  const t = minimo(dev, t0 + (i - 1) * DIA, t0 + (i + 1) * DIA);
                  const d = dev(t);
                  if (d < 0.05) picos.push(t); // contato exato (a menos de 3')
                }
              }
            }
            const melhor = picos.length ? null : minimo(dev, Math.max(a.ini, ini), Math.min(z.fim, fim));
            const dur = (Math.min(z.fim, fim) - Math.max(a.ini, ini)) / DIA;
            const ref = picos.find((p) => p >= ini) || picos[picos.length - 1] || melhor;
            out.push({
              tp, np, asp: asp.a, nome: asp.nome, tom: asp.tom,
              inicio: new Date(a.ini), fim: new Date(z.fim), inicioAntes: a.iniBorda, fimDepois: z.fimBorda,
              picos: picos.map((p) => new Date(p)), maisPerto: melhor ? { data: new Date(melhor), orbe: dev(melhor) } : null,
              passagens: g.length, ativoNoInicio: g.some((it) => it.ini <= ini && it.fim >= ini),
              casaCeu: casaDe(lon(tp, new Date(ref)), cuspides), casaNatal: casaDe(nl, cuspides),
              // exato dentro do ciclo pesa mais; trânsito que só encosta na janela pesa menos
              peso: Math.round(PESO_T[tp] * (PESO_N[np] || 1) * asp.w * (picos.some((p) => p >= ini && p <= fim) ? 1 : picos.length ? 0.75 : 0.6) * Math.min(1, 0.4 + dur / 60) * 10) / 10,
              diasNoCiclo: Math.round(dur),
            });
          }
        }
      }
    }
    return out.sort((x, y) => y.peso - x.peso || x.inicio - y.inicio);
  }

  function lunacoes(natal, cuspides, ini, fim) {
    const A = lib(), out = [];
    const eclipses = [];
    try { let e = A.SearchGlobalSolarEclipse(new Date(ini - 20 * DIA)); while (e.peak.date.getTime() < fim + 20 * DIA) { eclipses.push({ tipo: 'solar', kind: e.kind, t: e.peak.date.getTime() }); e = A.NextGlobalSolarEclipse(e.peak); } } catch (err) { /* sem eclipses */ }
    try { let e = A.SearchLunarEclipse(new Date(ini - 20 * DIA)); while (e.peak.date.getTime() < fim + 20 * DIA) { eclipses.push({ tipo: 'lunar', kind: e.kind, t: e.peak.date.getTime() }); e = A.NextLunarEclipse(e.peak); } } catch (err) { /* sem eclipses */ }
    for (const [fase, tipo] of [[0, 'nova'], [180, 'cheia']]) {
      let t = new Date(ini);
      for (;;) {
        const r = A.SearchMoonPhase(fase, t, 40); if (!r) break;
        const d = r.date; if (d.getTime() > fim) break;
        const l = tipo === 'nova' ? lon('sun', d) : lon('moon', d);
        const ec = eclipses.find((e) => Math.abs(e.t - d.getTime()) < 1.5 * DIA && (e.tipo === 'solar') === (tipo === 'nova'));
        const toca = Object.entries(natal).filter(([, nl]) => sep(l, nl) <= 3).map(([k]) => k);
        out.push({ tipo, data: d, lon: l, casa: casaDe(l, cuspides), eclipse: ec ? { tipo: ec.tipo, kind: ec.kind } : null, toca });
        t = new Date(d.getTime() + 2 * DIA);
      }
    }
    return out.sort((a, b) => a.data - b.data);
  }

  function retrogrados(natal, cuspides, ini, fim) {
    const out = [];
    const t0 = ini - 240 * DIA, n = Math.ceil((fim - t0) / DIA) + 240;
    for (const k of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      const L = serie(k, t0, n + 1);
      const mov = (i) => { let m = L[i + 1] - L[i]; if (m > 180) m -= 360; if (m < -180) m += 360; return m; };
      const movT = (t) => { let m = lon(k, new Date(t + DIA / 4)) - lon(k, new Date(t - DIA / 4)); if (m > 180) m -= 360; if (m < -180) m += 360; return m; };
      const est = [];
      for (let i = 1; i < n; i++) {
        if ((mov(i) < 0) !== (mov(i - 1) < 0)) {
          const t = raiz(movT, t0 + (i - 1) * DIA, t0 + (i + 1) * DIA);
          est.push({ t, tipo: mov(i) < 0 ? 'retro' : 'direto', lon: lon(k, new Date(t)) });
        }
      }
      if (mov(0) < 0) est.unshift({ t: t0, tipo: 'retro', lon: L[0], antes: true });
      for (let i = 0; i < est.length; i++) {
        if (est[i].tipo !== 'retro') continue;
        const fimR = est[i + 1] && est[i + 1].tipo === 'direto' ? est[i + 1] : null;
        const a = est[i].t, z = fimR ? fimR.t : t0 + n * DIA;
        if (z < ini || a > fim) continue;
        const toca = (l) => Object.entries(natal).filter(([, nl]) => sep(l, nl) <= 2).map(([kk]) => kk);
        out.push({
          planeta: k, inicio: new Date(a), fim: new Date(z), inicioAntes: !!est[i].antes, fimDepois: !fimR,
          lonInicio: est[i].lon, lonFim: fimR ? fimR.lon : null,
          casa: casaDe(est[i].lon, cuspides), casaFim: fimR ? casaDe(fimR.lon, cuspides) : null,
          tocaInicio: est[i].antes ? [] : toca(est[i].lon), tocaFim: fimR ? toca(fimR.lon) : [],
        });
      }
    }
    return out.sort((a, b) => a.inicio - b.inicio);
  }

  // Entradas de planetas lentos (e Marte) em casas natais e em signos.
  function ingressos(cuspides, ini, fim) {
    const casas = [], signos = [];
    const n = Math.ceil((fim - ini) / DIA) + 1;
    for (const k of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      const L = serie(k, ini, n);
      for (let i = 1; i < n; i++) {
        const s0 = Math.floor(L[i - 1] / 30), s1 = Math.floor(L[i] / 30);
        if (s0 !== s1) {
          const alvo = (s1 === (s0 + 1) % 12 ? s1 : s0) * 30;
          const t = raiz((x) => { let d = norm(lon(k, new Date(x)) - alvo); return d > 180 ? d - 360 : d; }, ini + (i - 1) * DIA, ini + i * DIA);
          signos.push({ planeta: k, data: new Date(t), signo: s1, retro: s1 !== (s0 + 1) % 12 });
        }
        if (cuspides) {
          const c0 = casaDe(L[i - 1], cuspides), c1 = casaDe(L[i], cuspides);
          if (c0 !== c1) {
            const cusp = cuspides[(c1 === c0 % 12 + 1 ? c1 : c0) - 1];
            const t = raiz((x) => { let d = norm(lon(k, new Date(x)) - cusp); return d > 180 ? d - 360 : d; }, ini + (i - 1) * DIA, ini + i * DIA);
            casas.push({ planeta: k, data: new Date(t), casa: c1, retro: c1 !== c0 % 12 + 1 });
          }
        }
      }
    }
    return { casas: casas.sort((a, b) => a.data - b.data), signos: signos.sort((a, b) => a.data - b.data) };
  }

  /**
   * natal: { sun: lon, moon: lon, …, node?: lon, asc?: lon, mc?: lon } (graus)
   * cuspides: 12 cúspides natais ou null (sem hora/cidade)
   */
  function calcular({ natal, cuspides = null, inicio = new Date(), dias = 183 }) {
    const ini = new Date(inicio).setHours(0, 0, 0, 0), fim = ini + dias * DIA;
    const ing = ingressos(cuspides, ini, fim);
    return {
      inicio: new Date(ini), fim: new Date(fim),
      transitos: transitos(natal, cuspides, ini, fim),
      lunacoes: lunacoes(natal, cuspides, ini, fim),
      retrogrados: retrogrados(natal, cuspides, ini, fim),
      ingressosCasa: ing.casas, ingressosSigno: ing.signos,
    };
  }

  const api = { calcular, lon, casaDe, ORBE, usar: (A) => { AE = A; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AstroEventos = api;
})(typeof window !== 'undefined' ? window : globalThis);
