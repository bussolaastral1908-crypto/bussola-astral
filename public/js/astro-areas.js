/**
 * Bússola Astral — notas por área da vida no ciclo (0–10), calculadas dos eventos reais.
 * Cada área olha para as casas que a regem (onde o planeta do céu passa) e para os pontos
 * natais ligados a ela (quem é tocado). Trânsito harmonioso soma, tenso subtrai; o peso vem
 * da força do trânsito (motor de eventos) e de quanto tempo ele dura dentro do ciclo.
 * Funciona no navegador e no Node (globalThis.AstroAreas).
 */
(function (root) {
  const DIA = 86400000;
  const AREAS = [
    { id: 'amor', nome: 'Amor e relacionamentos', casas: { 5: 1, 7: 1, 8: 0.4 }, alvos: { venus: 1, moon: 0.5, mars: 0.4 } },
    { id: 'trabalho', nome: 'Trabalho e carreira', casas: { 10: 1, 6: 0.8, 2: 0.3 }, alvos: { mc: 1, sun: 0.7, saturn: 0.6, mars: 0.3 } },
    { id: 'dinheiro', nome: 'Dinheiro e finanças', casas: { 2: 1, 8: 0.7 }, alvos: { venus: 0.6, jupiter: 0.7 } },
    { id: 'saude', nome: 'Saúde e bem-estar', casas: { 6: 1, 1: 0.8 }, alvos: { asc: 1, sun: 0.6, moon: 0.6, mars: 0.5 } },
    { id: 'espiritualidade', nome: 'Espiritualidade', casas: { 12: 1, 9: 0.8 }, alvos: { neptune: 1, node: 0.6, jupiter: 0.4, moon: 0.3 } },
  ];
  // Conjunção não tem sinal próprio: depende de quem chega.
  const CONJ = { jupiter: 0.8, venus: 0.6, sun: 0.4, mercury: 0, mars: -0.3, saturn: -0.5, uranus: -0.2, neptune: -0.2, pluto: -0.4 };
  // Escala da nota: calibrada em 121 mapas (out/2026). O saldo médio fica perto de zero e o
  // desvio em ~23, então K = 34 espalha as notas entre 2 e 9, com 5–6 = ciclo típico.
  const K = 34;

  const sinal = (ev) => (ev.tom === 'harmonia' ? 1 : ev.tom === 'tensão' ? -1 : CONJ[ev.tp] || 0);
  const sobrepoe = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / DIA;

  function meses(ini, fim) {
    const out = [];
    for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d < fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      out.push({ ini: Math.max(+d, +ini), fim: Math.min(+new Date(d.getFullYear(), d.getMonth() + 1, 1), +fim), mes: d.getMonth(), ano: d.getFullYear() });
    }
    return out.filter((m) => m.fim - m.ini >= 10 * DIA); // meses com menos de 10 dias no ciclo não concorrem
  }

  /** r = resultado de AstroEventos.calcular; temCasas = mapa com hora e cidade */
  function calcular(r, temCasas) {
    const M = meses(r.inicio, r.fim);
    return AREAS.map((A) => {
      let net = 0, mov = 0;
      const porMes = M.map(() => 0), fatores = [];
      const add = (valor, peso, t0, t1, fator) => {
        const c = valor * peso;
        net += c; mov += Math.abs(peso);
        M.forEach((m, i) => { porMes[i] += c * sobrepoe(t0, t1, m.ini, m.fim) / Math.max(1, (t1 - t0) / DIA); });
        if (fator && Math.abs(c) > 0.3) fatores.push({ ...fator, c });
      };
      for (const ev of r.transitos) {
        const rel = Math.max((temCasas && A.casas[ev.casaCeu]) || 0, A.alvos[ev.np] || 0, ((temCasas && A.casas[ev.casaNatal]) || 0) * 0.7);
        if (!rel) continue;
        const t0 = Math.max(+ev.inicio, +r.inicio), t1 = Math.min(+ev.fim, +r.fim);
        const w = ev.peso * Math.min(1, ev.diasNoCiclo / 45) * rel;
        add(sinal(ev), w, t0, Math.max(t1, t0 + DIA), { tipo: 'transito', ev });
      }
      if (temCasas) {
        for (const l of r.lunacoes) {
          const cs = A.casas[l.casa] || 0; if (!cs) continue;
          if (l.eclipse) add(-0.3, 3 * cs, +l.data - 7 * DIA, +l.data + 7 * DIA, { tipo: 'eclipse', l });
          else add(l.tipo === 'nova' ? 1 : 0.5, 1.2 * cs, +l.data, +l.data + 7 * DIA, null);
        }
        for (const x of r.retrogrados) {
          if (!['mercury', 'venus', 'mars'].includes(x.planeta)) continue;
          const cs = A.casas[x.casa] || 0; if (!cs) continue;
          add(-1, 2 * cs, Math.max(+x.inicio, +r.inicio), Math.min(+x.fim, +r.fim), { tipo: 'retro', x });
        }
        for (const x of r.ingressosCasa) {
          const cs = A.casas[x.casa] || 0; if (!cs || x.retro) continue;
          const v = { jupiter: 1, saturn: -0.6 }[x.planeta]; if (v === undefined) continue;
          add(v, 6 * cs, +x.data, +r.fim, { tipo: 'ingresso', x });
        }
      }
      const nota = Math.max(1, Math.min(10, Math.round(5.5 + 4.5 * Math.tanh(net / K))));
      let iMelhor = 0, iPior = 0;
      porMes.forEach((v, i) => { if (v > porMes[iMelhor]) iMelhor = i; if (v < porMes[iPior]) iPior = i; });
      fatores.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
      return {
        id: A.id, nome: A.nome, nota, net: Math.round(net * 10) / 10,
        movimento: mov > 40 ? 'intenso' : mov > 15 ? 'moderado' : 'calmo',
        melhor: porMes[iMelhor] > 0.5 ? M[iMelhor] : null, atencao: porMes[iPior] < -0.5 ? M[iPior] : null,
        fatores: fatores.slice(0, 4),
      };
    });
  }

  const api = { calcular, AREAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AstroAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
