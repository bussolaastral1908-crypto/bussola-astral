/**
 * Bússola Astral — ângulos, casas (Placidus) e Nodos lunares.
 * Conferido com o Swiss Ephemeris (sweph 2.10) em mapas de referência do hemisfério sul e norte.
 * Funciona no navegador (usa window.Astronomy) e no Node (passando a biblioteca em AstroCasas.usar()).
 */
(function (root) {
  let AE = (typeof window !== 'undefined' && window.Astronomy) || null;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const norm = (v) => ((v % 360) + 360) % 360;

  function julianCenturies(date) {
    return (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
  }
  // Obliquidade média da eclíptica (IAU), em graus.
  function obliquidade(date) {
    const T = julianCenturies(date);
    return 23.439291111 - 0.0130041667 * T - 1.6667e-7 * T * T + 5.0278e-7 * T * T * T;
  }
  // Ascensão reta do meio do céu (RAMC), em graus, a partir do tempo sideral de Greenwich.
  function ramc(date, lng) {
    const A = AE || (typeof window !== 'undefined' && window.Astronomy);
    const gast = A.SiderealTime(date); // horas
    return norm((gast + lng / 15) * 15);
  }
  // Ponto da eclíptica com ascensão reta RA (graus).
  const eclipticaDaRA = (ra, eps) => norm(Math.atan2(Math.sin(ra * rad), Math.cos(ra * rad) * Math.cos(eps * rad)) * deg);

  function meioDoCeu(r, eps) { return eclipticaDaRA(r, eps); }

  function ascendente(r, lat, eps) {
    const y = Math.cos(r * rad);
    const x = -(Math.sin(r * rad) * Math.cos(eps * rad) + Math.tan(lat * rad) * Math.sin(eps * rad));
    return norm(Math.atan2(y, x) * deg);
  }

  // Cúspide Placidus por divisão do semiarco (iterativo). f = 1/3 ou 2/3; acima = casas 11/12.
  function cuspide(r, lat, eps, f, acima) {
    let ra = acima ? r + f * 90 : r + 180 - f * 90;
    let lam = eclipticaDaRA(ra, eps);
    for (let i = 0; i < 60; i++) {
      const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad));
      const t = Math.tan(lat * rad) * Math.tan(dec);
      const ad = Math.asin(Math.max(-1, Math.min(1, t))) * deg; // diferença ascensional
      ra = acima ? r + f * (90 + ad) : r + 180 - f * (90 - ad);
      const novo = eclipticaDaRA(ra, eps);
      if (Math.abs(novo - lam) < 1e-7) { lam = novo; break; }
      lam = novo;
    }
    return lam;
  }

  /**
   * Casas Placidus. Retorna { asc, mc, desc, ic, cuspides: [12] } em longitude eclíptica (graus).
   * Acima de ~66° de latitude o Placidus não existe (círculo polar): cai para casas iguais a partir do Ascendente.
   */
  function casas(date, lat, lng) {
    const eps = obliquidade(date);
    const r = ramc(date, lng);
    const asc = ascendente(r, lat, eps), mc = meioDoCeu(r, eps);
    let c;
    if (Math.abs(lat) < 66) {
      const c11 = cuspide(r, lat, eps, 1 / 3, true), c12 = cuspide(r, lat, eps, 2 / 3, true);
      const c2 = cuspide(r, lat, eps, 2 / 3, false), c3 = cuspide(r, lat, eps, 1 / 3, false);
      c = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
    } else {
      c = Array.from({ length: 12 }, (_, i) => norm(asc + i * 30));
    }
    return { asc, mc, desc: norm(asc + 180), ic: norm(mc + 180), cuspides: c, sistema: Math.abs(lat) < 66 ? 'Placidus' : 'Iguais' };
  }

  // Em que casa (1–12) cai uma longitude, dadas as cúspides.
  function casaDe(lon, cuspides) {
    for (let i = 0; i < 12; i++) {
      const ini = cuspides[i], fim = cuspides[(i + 1) % 12];
      const tam = norm(fim - ini), d = norm(lon - ini);
      if (d < tam) return i + 1;
    }
    return 12;
  }

  // Nodo Norte médio da Lua (graus). O Sul é o oposto.
  function nodoNorte(date) {
    const T = julianCenturies(date);
    return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
  }

  const api = { casas, casaDe, nodoNorte, obliquidade, ramc, usar: (A) => { AE = A; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AstroCasas = api;
})(typeof window !== 'undefined' ? window : globalThis);
