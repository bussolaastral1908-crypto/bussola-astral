/**
 * Bússola Astral — aba "Meu Mapa" (Fase 1): ângulos, casas Placidus, planeta + signo + casa,
 * dignidades, Nodos, aspectos com orbe/força, elementos e modalidades.
 * Cálculos: astro-core.js (planetas) + astro-casas.js (casas/ângulos/nodos, conferido com o
 * Swiss Ephemeris). Os textos são regras astrológicas fixas — nada aqui é gerado por IA.
 */
(function () {
  const SIGNOS = ['Áries', 'Touro', 'Gêmeos', 'Câncer', 'Leão', 'Virgem', 'Libra', 'Escorpião', 'Sagitário', 'Capricórnio', 'Aquário', 'Peixes'];
  const GLIFO = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => g + '︎');
  const ELEMENTO = ['Fogo', 'Terra', 'Ar', 'Água'];
  const MODALIDADE = ['Cardinal', 'Fixo', 'Mutável'];
  const ORDEM = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const SIMBOLO = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', asc: 'AC', mc: 'MC' };
  const NOME = { sun: 'Sol', moon: 'Lua', mercury: 'Mercúrio', venus: 'Vênus', mars: 'Marte', jupiter: 'Júpiter', saturn: 'Saturno', uranus: 'Urano', neptune: 'Netuno', pluto: 'Plutão', asc: 'Ascendente', mc: 'Meio do Céu' };

  const TEMA = {
    sun: 'sua identidade, vitalidade e propósito', moon: 'suas emoções, necessidades e o que te acolhe',
    mercury: 'seu jeito de pensar, aprender e se comunicar', venus: 'como você ama, se relaciona e o que valoriza',
    mars: 'como você age, deseja e conquista', jupiter: 'onde você cresce, confia e encontra oportunidades',
    saturn: 'onde a vida pede responsabilidade, limite e maturidade', uranus: 'onde você busca liberdade e mudança',
    neptune: 'onde você sonha, se inspira e se dissolve', pluto: 'onde você se transforma e encontra poder',
  };
  const ESTILO = [
    'de forma direta, corajosa e impulsiva', 'de forma estável, sensorial e paciente', 'de forma curiosa, versátil e comunicativa',
    'de forma sensível, protetora e emotiva', 'de forma expressiva, generosa e confiante', 'de forma analítica, prática e cuidadosa',
    'de forma diplomática, harmoniosa e sociável', 'de forma intensa, profunda e reservada', 'de forma expansiva, otimista e aventureira',
    'de forma ambiciosa, disciplinada e realista', 'de forma original, independente e coletiva', 'de forma intuitiva, imaginativa e compassiva',
  ];
  const AREA = [null,
    'na sua identidade e no jeito de se apresentar ao mundo', 'no dinheiro, nos recursos e na autoestima', 'na comunicação, nos estudos e no convívio próximo',
    'no lar, na família e nas raízes', 'na criatividade, no romance, no lazer e nos filhos', 'na rotina, no trabalho do dia a dia e na saúde',
    'nos relacionamentos, casamento e parcerias', 'nas transformações, na intimidade e nos recursos compartilhados', 'nas viagens, nas crenças e nos estudos superiores',
    'na carreira, na reputação e no propósito público', 'nos amigos, nos grupos e nos projetos de futuro', 'no mundo interior, na espiritualidade e no descanso',
  ];
  const ANGULO_TXT = {
    asc: 'Sua máscara social, o primeiro impacto e o jeito de começar as coisas.',
    mc: 'Sua direção de vida pública: carreira, reputação e aonde você quer chegar.',
    desc: 'O tipo de pessoa que você atrai e busca nas parcerias.',
    ic: 'Suas raízes, família e o que te dá base emocional.',
  };
  // Dignidades essenciais (tradicionais; planetas lentos ficam sem).
  const DIGN = {
    sun: { dom: [4], exa: [0], exi: [10], que: [6] }, moon: { dom: [3], exa: [1], exi: [9], que: [7] },
    mercury: { dom: [2, 5], exa: [5], exi: [8, 11], que: [11] }, venus: { dom: [1, 6], exa: [11], exi: [7, 0], que: [5] },
    mars: { dom: [0, 7], exa: [9], exi: [6, 1], que: [3] }, jupiter: { dom: [8, 11], exa: [3], exi: [2, 5], que: [9] },
    saturn: { dom: [9, 10], exa: [6], exi: [3, 4], que: [0] },
  };
  const ASPECTOS = [
    { a: 0, nome: 'Conjunção', orbe: 8, tom: 'fusão' }, { a: 180, nome: 'Oposição', orbe: 8, tom: 'tensão' },
    { a: 120, nome: 'Trígono', orbe: 7, tom: 'harmonia' }, { a: 90, nome: 'Quadratura', orbe: 7, tom: 'tensão' },
    { a: 60, nome: 'Sextil', orbe: 5, tom: 'harmonia' },
  ];
  const TOM_TXT = { fusão: 'as energias se misturam e agem juntas', harmonia: 'as energias se apoiam e fluem com facilidade', tensão: 'as energias se desafiam e pedem ajuste — é fonte de crescimento' };

  const norm = (v) => ((v % 360) + 360) % 360;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const signo = (lon) => Math.floor(norm(lon) / 30);
  function grau(lon) {
    const d = norm(lon) % 30; let g = Math.floor(d), m = Math.round((d - g) * 60);
    if (m === 60) { g += 1; m = 0; }
    return `${g}°${String(m).padStart(2, '0')}'`;
  }
  const pos = (lon) => `${GLIFO[signo(lon)]} ${SIGNOS[signo(lon)]} ${grau(lon)}`;

  function dignidade(k, lon) {
    const d = DIGN[k]; if (!d) return '';
    const s = signo(lon);
    if (d.dom.includes(s)) return 'domicílio'; if (d.exa.includes(s)) return 'exaltação';
    if (d.exi.includes(s)) return 'exílio'; if (d.que.includes(s)) return 'queda';
    return '';
  }
  const DIGN_TXT = { 'domicílio': 'Em domicílio: age com força e naturalidade.', 'exaltação': 'Em exaltação: expressa o melhor de si.', 'exílio': 'Em exílio: precisa de mais esforço para se expressar.', 'queda': 'Em queda: amadurece pelo desafio.' };

  function aspectos(pontos) {
    const out = [];
    for (let i = 0; i < pontos.length; i++) for (let j = i + 1; j < pontos.length; j++) {
      const A = pontos[i], B = pontos[j];
      let d = Math.abs(A.lon - B.lon); if (d > 180) d = 360 - d;
      for (const asp of ASPECTOS) {
        const extra = (A.k === 'sun' || A.k === 'moon' || B.k === 'sun' || B.k === 'moon') ? 2 : 0;
        const orbe = Math.abs(d - asp.a);
        if (orbe <= asp.orbe + extra) {
          const forca = orbe <= 1 ? 'Muito forte' : orbe <= 3 ? 'Forte' : 'Relevante';
          // peso: orbe pequeno + pontos pessoais primeiro
          const pessoal = (x) => ['sun', 'moon', 'asc', 'mc', 'mercury', 'venus', 'mars'].includes(x) ? 0 : 1.5;
          out.push({ A, B, asp, orbe, forca, peso: orbe + pessoal(A.k) + pessoal(B.k) });
          break;
        }
      }
    }
    return out.sort((x, y) => x.peso - y.peso);
  }

  function retrogrado(k, data) {
    if (k === 'sun' || k === 'moon') return false;
    try {
      const a = getPlanetPositions(data)[k].longitude, b = getPlanetPositions(new Date(data.getTime() + 86400000))[k].longitude;
      let m = b - a; if (m > 180) m -= 360; if (m < -180) m += 360; return m < 0;
    } catch (e) { return false; }
  }

  // ── Roda do mapa (SVG) ──
  // Ascendente à esquerda e zodíaco no sentido anti-horário, como nos mapas profissionais.
  // Sem hora/cidade não há casas: a roda começa em 0° de Áries.
  const COR_EL = ['#F0803C', '#7AD88A', '#70C8F5', '#7080F8'];
  const COR_TOM = { harmonia: '#4ADE80', tensão: '#F87171' };
  const R1 = { z1: 292, z2: 250, glifo: 224, grau: 194, ncasa: 154, asp: 138 };
  // roda dupla: céu da data no anel de fora, mapa natal por dentro
  const R2 = { z1: 292, z2: 250, tglifo: 228, tgrau: 204, glifo: 172, grau: 147, ncasa: 124, asp: 110 };

  function espalhar(itens, min) {
    // afasta símbolos amontoados mantendo a ordem; d = ângulo exibido, lon = real
    const v = itens.map((x) => ({ ...x, d: x.lon })).sort((a, b) => a.lon - b.lon);
    if (v.length < 2) return v;
    for (let it = 0; it < 80; it++) {
      let mexeu = false;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        const gap = norm(b.d - a.d);
        if (gap < min) { const s = (min - gap) / 2; a.d -= s; b.d += s; mexeu = true; }
      }
      if (!mexeu) break;
    }
    return v;
  }

  function rodaSVG({ planetas, casas, aspectos, base, transito = null, cruz = [] }) {
    const R = transito ? R2 : R1;
    const ang = (lon) => (180 + lon - base) * Math.PI / 180;
    const pt = (r, lon) => [300 + r * Math.cos(ang(lon)), 300 - r * Math.sin(ang(lon))].map((n) => n.toFixed(1));
    const linha = (r1, r2, lon, cls) => { const [a, b] = pt(r1, lon), [c, d] = pt(r2, lon); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="${cls}"/>`; };
    let s = `<svg class="rd" viewBox="-52 -40 704 680" role="img" aria-label="Roda do seu mapa astral">`;
    // anel do zodíaco
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = pt(R.z1, i * 30), [x2, y2] = pt(R.z1, i * 30 + 30), [x3, y3] = pt(R.z2, i * 30 + 30), [x4, y4] = pt(R.z2, i * 30);
      s += `<path d="M${x1} ${y1}A${R.z1} ${R.z1} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${R.z2} ${R.z2} 0 0 1 ${x4} ${y4}Z" fill="${COR_EL[i % 4]}" fill-opacity=".09" class="rd-seg"/>`;
      const [gx, gy] = pt((R.z1 + R.z2) / 2, i * 30 + 15);
      s += `<text x="${gx}" y="${gy}" class="rd-signo" fill="${COR_EL[i % 4]}"><title>${SIGNOS[i]}</title>${GLIFO[i]}</text>`;
      s += linha(R.z1, R.z2, i * 30, 'rd-div');
    }
    for (let g = 0; g < 360; g += 5) s += linha(R.z2, R.z2 - (g % 10 ? 4 : 7), g, 'rd-tick');
    s += `<circle cx="300" cy="300" r="${R.z1}" class="rd-aro"/><circle cx="300" cy="300" r="${R.z2}" class="rd-aro"/><circle cx="300" cy="300" r="${R.asp}" class="rd-aro rd-miolo"/>`;
    // casas
    if (casas) {
      casas.cuspides.forEach((c, i) => {
        const eixo = i % 3 === 0;
        s += linha(R.asp, eixo ? R.z1 + (i === 0 || i === 9 ? 22 : 8) : R.z2, c, eixo ? 'rd-eixo' : 'rd-casa');
        const meio = c + norm(casas.cuspides[(i + 1) % 12] - c) / 2;
        const [nx, ny] = pt(R.ncasa, meio);
        s += `<text x="${nx}" y="${ny}" class="rd-ncasa">${i + 1}</text>`;
      });
      [['ASC', casas.asc, 'asc'], ['MC', casas.mc, 'mc']].forEach(([t, lon, k]) => {
        const [x, y] = pt(R.z1 + 30, lon);
        s += `<g class="rd-p" data-k="${k}" tabindex="0" role="button" aria-label="${NOME[k]}"><text x="${x}" y="${y}" class="rd-eixo-t">${t}</text></g>`;
      });
    }
    if (transito) s += `<circle cx="300" cy="300" r="${(R.tgrau + R.glifo) / 2 + 6}" class="rd-aro rd-aro-t"/>`;
    // aspectos (conjunções não viram linha: os pontos já estão juntos)
    if (!transito) aspectos.forEach((x, i) => {
      if (x.asp.tom === 'fusão') return;
      const [a, b] = pt(R.asp, x.A.lon), [c, d] = pt(R.asp, x.B.lon);
      const w = Math.max(0.8, 2.6 - x.orbe * 0.28).toFixed(2);
      s += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="rd-asp" data-a="${i}" data-p="${x.A.k} ${x.B.k}" stroke="${COR_TOM[x.asp.tom]}" stroke-width="${w}"/>`;
    });
    // planetas
    const mk = transito ? (R.tgrau + R.glifo) / 2 + 6 : R.z2;
    espalhar(planetas, 10).forEach((p) => {
      const [gx, gy] = pt(R.glifo, p.d), [tx, ty] = pt(R.grau, p.d), [dx, dy] = pt(R.asp, p.lon);
      const g = Math.floor(norm(p.lon) % 30);
      s += `<g class="rd-p" data-k="${p.k}" tabindex="0" role="button" aria-label="${NOME[p.k] || 'Nodo Norte'} em ${SIGNOS[signo(p.lon)]} ${g} graus">` +
        linha(mk, mk - (transito ? 6 : 12), p.lon, 'rd-mark') +
        (Math.abs(p.d - p.lon) > 1.5 ? (() => { const [ax, ay] = pt(mk - (transito ? 6 : 12), p.lon), [bx, by] = pt(R.glifo + 14, p.d); return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="rd-guia"/>`; })() : '') +
        `<circle cx="${gx}" cy="${gy}" r="17" class="rd-alvo"/><text x="${gx}" y="${gy}" class="rd-glifo">${p.sym}</text>` +
        `<text x="${tx}" y="${ty}" class="rd-grau">${g}°${p.rx ? '℞' : ''}</text><circle cx="${dx}" cy="${dy}" r="3" class="rd-ponto"/></g>`;
    });
    if (transito) {
      // linhas tracejadas: planeta do céu → ponto natal que ele ativa
      cruz.forEach((x, i) => {
        const [a, b] = pt(R.asp, x.tlon), [c, d] = pt(R.asp, x.nlon);
        s += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="rd-asp rd-cruz" data-c="${i}" data-p="t-${x.tk} ${x.nk}" stroke="${x.tom === 'fusão' ? '#FFD27A' : COR_TOM[x.tom]}" stroke-width="${Math.max(1, 2.6 - x.orbe).toFixed(2)}"/>`;
      });
      espalhar(transito, 9).forEach((p) => {
        const [gx, gy] = pt(R.tglifo, p.d), [tx, ty] = pt(R.tgrau, p.d), [dx, dy] = pt(R.asp, p.lon);
        const g = Math.floor(norm(p.lon) % 30);
        s += `<g class="rd-p rd-t" data-k="t-${p.k}" tabindex="0" role="button" aria-label="${NOME[p.k]} no céu, em ${SIGNOS[signo(p.lon)]} ${g} graus">` +
          linha(R.z2, R.z2 + 0.01 - 9, p.lon, 'rd-mark rd-mark-t') +
          `<circle cx="${gx}" cy="${gy}" r="15" class="rd-alvo"/><text x="${gx}" y="${gy}" class="rd-glifo rd-glifo-t">${p.sym}</text>` +
          `<text x="${tx}" y="${ty}" class="rd-grau rd-grau-t">${g}°${p.rx ? '℞' : ''}</text><circle cx="${dx}" cy="${dy}" r="2.6" class="rd-ponto rd-ponto-t"/></g>`;
      });
    }
    return s + '</svg>';
  }

  window.AstroMapa = { rodaSVG, espalhar, SIGNOS, GLIFO, SIMBOLO, NOME, TEMA, ESTILO, AREA, ANGULO_TXT, COR_TOM, signo, grau, esc, retrogrado };

  window.renderMapaCompleto = function (el, chart, perfil) {
    const temLocal = !!(chart.cityData && chart.cityData.iana && chart.hasTime && window.AstroCasas);
    const h = temLocal ? AstroCasas.casas(chart.birthDate, chart.cityData.lat, chart.cityData.lng) : null;
    const P = chart.positions;
    const casa = (lon) => (h ? AstroCasas.casaDe(lon, h.cuspides) : null);
    const nodo = AstroCasas ? AstroCasas.nodoNorte(chart.birthDate) : null;

    // trio principal
    const trio = [['☉', 'Sol', P.sun.longitude], ['☽', 'Lua', P.moon.longitude]];
    if (h) trio.push(['AC', 'Ascendente', h.asc]);
    let html = `<div class="mp-trio">${trio.map(([g, n, l]) => `<div class="mp-trio-item"><span class="mp-sym">${g}</span><small>${n}</small><b>${GLIFO[signo(l)]} ${SIGNOS[signo(l)]}</b><span class="mp-grau">${grau(l)}</span></div>`).join('')}</div>`;

    if (!h) {
      html += `<div class="mp-aviso"><b>Ascendente, Meio do Céu e casas não calculados.</b> ${!chart.hasTime ? 'Falta a <b>hora de nascimento</b>.' : 'Não conseguimos localizar a <b>cidade de nascimento</b>.'} Sem isso não dá para calcular esses pontos com precisão — e preferimos não chutar. <button class="link-btn" type="button" id="mp-editar">Completar dados</button></div>`;
    } else {
      html += `<h2 class="mp-h">Ângulos do mapa <small>${h.sistema === 'Placidus' ? 'Casas: Placidus' : 'Casas iguais (latitude polar)'}</small></h2><div class="mp-angulos">` +
        [['asc', 'Ascendente', h.asc], ['mc', 'Meio do Céu', h.mc], ['desc', 'Descendente', h.desc], ['ic', 'Fundo do Céu', h.ic]]
          .map(([k, n, l]) => `<div class="mp-angulo"><small>${n}</small><b>${pos(l)}</b><p>${ANGULO_TXT[k]}</p></div>`).join('') + '</div>';
    }

    // roda
    const pontos = ORDEM.map((k) => ({ k, lon: P[k].longitude }));
    if (h) pontos.push({ k: 'asc', lon: h.asc }, { k: 'mc', lon: h.mc });
    const asp = aspectos(pontos);
    const rx = Object.fromEntries(ORDEM.map((k) => [k, retrogrado(k, chart.birthDate)]));
    const naRoda = ORDEM.map((k) => ({ k, lon: P[k].longitude, sym: SIMBOLO[k], rx: rx[k] }));
    if (nodo !== null) naRoda.push({ k: 'node', lon: nodo, sym: '☊' });
    const leitura = (k) => {
      if (k === 'asc' || k === 'mc') { const l = k === 'asc' ? h.asc : h.mc; return { t: `${NOME[k]} em ${SIGNOS[signo(l)]}`, sub: grau(l), p: ANGULO_TXT[k] }; }
      if (k === 'node') return { t: `☊ Nodo Norte em ${SIGNOS[signo(nodo)]}${h ? ` · Casa ${casa(nodo)}` : ''}`, sub: grau(nodo), p: `O caminho de crescimento: a direção a desenvolver ${ESTILO[signo(nodo)].replace('de forma ', 'com uma postura ')}${h ? `, ${AREA[casa(nodo)]}` : ''}. O Nodo Sul, em ${SIGNOS[signo(nodo + 180)]}, é o terreno conhecido de onde você parte.` };
      const lon = P[k].longitude, sg = signo(lon), c = casa(lon), dg = dignidade(k, lon);
      return { t: `${SIMBOLO[k]} ${NOME[k]} em ${SIGNOS[sg]}${c ? ` · Casa ${c}` : ''}`, sub: `${grau(lon)}${rx[k] ? ' · retrógrado' : ''}${dg ? ` · ${dg}` : ''}`, p: `${NOME[k]} fala de ${TEMA[k]}. Em ${SIGNOS[sg]}, isso se expressa ${ESTILO[sg]}${c ? `, e aparece principalmente ${AREA[c]}` : ''}.${dg ? ` ${DIGN_TXT[dg]}` : ''}` };
    };
    const leituraAsp = (x) => ({ t: `${SIMBOLO[x.A.k]} ${NOME[x.A.k]} · ${x.asp.nome} · ${SIMBOLO[x.B.k]} ${NOME[x.B.k]}`, sub: `${x.forca} · orbe ${x.orbe.toFixed(1)}°`, p: `${TOM_TXT[x.asp.tom].charAt(0).toUpperCase() + TOM_TXT[x.asp.tom].slice(1)}: ${NOME[x.A.k]} (${TEMA[x.A.k] || ANGULO_TXT[x.A.k]?.toLowerCase() || ''}) com ${NOME[x.B.k]} (${TEMA[x.B.k] || ANGULO_TXT[x.B.k]?.toLowerCase() || ''}).`, tom: x.asp.tom });
    html += `<h2 class="mp-h">Sua roda do mapa <small>toque num planeta ou numa linha</small></h2><div class="rd-wrap"><div class="rd-box">${rodaSVG({ planetas: naRoda, casas: h, aspectos: asp, base: h ? h.asc : 0 })}</div>` +
      `<div class="rd-lado"><div class="rd-info" id="rd-info" aria-live="polite"></div><div class="rd-leg"><span><i style="background:${COR_TOM.harmonia}"></i>Harmonia (trígono, sextil)</span><span><i style="background:${COR_TOM['tensão']}"></i>Tensão (quadratura, oposição)</span><span><i class="rd-leg-conj"></i>Conjunção: planetas lado a lado</span>${h ? '<span><i class="rd-leg-eixo"></i>ASC e MC: eixos do mapa</span>' : ''}</div></div></div>`;

    // planetas
    const linhas = ORDEM.map((k) => {
      const lon = P[k].longitude, c = casa(lon), dg = dignidade(k, lon);
      return `<tr><td><span class="mp-psym">${SIMBOLO[k]}</span>${NOME[k]}</td><td>${pos(lon)}${rx[k] ? ' <span class="mp-rx" title="retrógrado no nascimento">℞</span>' : ''}</td>${h ? `<td class="mp-num">Casa ${c}</td>` : ''}<td>${dg ? `<span class="mp-dig mp-dig-${dg.replace('í', 'i')}" title="${DIGN_TXT[dg]}">${dg}</span>` : ''}</td></tr>`;
    });
    if (nodo !== null) {
      linhas.push(`<tr><td><span class="mp-psym">☊</span>Nodo Norte</td><td>${pos(nodo)}</td>${h ? `<td class="mp-num">Casa ${casa(nodo)}</td>` : ''}<td></td></tr>`);
      linhas.push(`<tr><td><span class="mp-psym">☋</span>Nodo Sul</td><td>${pos(nodo + 180)}</td>${h ? `<td class="mp-num">Casa ${casa(nodo + 180)}</td>` : ''}<td></td></tr>`);
    }
    html += `<h2 class="mp-h">Planetas no seu mapa</h2><div class="mp-tabela"><table><thead><tr><th>Planeta</th><th>Signo e grau</th>${h ? '<th>Casa</th>' : ''}<th>Força</th></tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;

    // planeta + signo + casa
    html += `<h2 class="mp-h">O que cada planeta diz sobre você</h2><div class="mp-leituras">` + ORDEM.map((k) => {
      const lon = P[k].longitude, s = signo(lon), c = casa(lon), dg = dignidade(k, lon);
      return `<article class="mp-leitura"><h3><span class="mp-psym">${SIMBOLO[k]}</span>${NOME[k]} em ${SIGNOS[s]}${c ? ` na Casa ${c}` : ''}</h3><p>${NOME[k]} fala de ${TEMA[k]}. Em ${SIGNOS[s]}, isso se expressa ${ESTILO[s]}${c ? `, e aparece principalmente ${AREA[c]}` : ''}.${dg ? ` ${DIGN_TXT[dg]}` : ''}</p></article>`;
    }).join('') + (nodo !== null ? `<article class="mp-leitura"><h3><span class="mp-psym">☊</span>Nodo Norte em ${SIGNOS[signo(nodo)]}${h ? ` na Casa ${casa(nodo)}` : ''}</h3><p>Os Nodos apontam o caminho de crescimento: o Nodo Norte mostra a direção a desenvolver — ${ESTILO[signo(nodo)].replace('de forma ', 'uma postura ')}${h ? `, ${AREA[casa(nodo)]}` : ''} — e o Nodo Sul, em ${SIGNOS[signo(nodo + 180)]}, o terreno conhecido de onde você parte.</p></article>` : '') + '</div>';

    // aspectos
    const linhaAsp = (x) => `<li class="mp-asp"><span class="mp-asp-p">${SIMBOLO[x.A.k]} ${NOME[x.A.k]}</span><span class="mp-asp-t mp-tom-${x.asp.tom === 'fusão' ? 'fusao' : x.asp.tom}">${x.asp.nome}</span><span class="mp-asp-p">${SIMBOLO[x.B.k]} ${NOME[x.B.k]}</span><span class="mp-forca mp-f-${x.forca === 'Muito forte' ? 3 : x.forca === 'Forte' ? 2 : 1}">${x.forca} · orbe ${x.orbe.toFixed(1)}°</span><p>${TOM_TXT[x.asp.tom].charAt(0).toUpperCase() + TOM_TXT[x.asp.tom].slice(1)}: ${NOME[x.A.k]} (${TEMA[x.A.k] || ANGULO_TXT[x.A.k]?.toLowerCase() || ''}) com ${NOME[x.B.k]}.</p></li>`;
    html += `<h2 class="mp-h">Aspectos principais <small>${asp.length} no total — mostrando os mais fortes</small></h2><ul class="mp-asps">${asp.slice(0, 8).map(linhaAsp).join('')}</ul>` +
      (asp.length > 8 ? `<details class="mp-mais"><summary>Ver todos os ${asp.length} aspectos</summary><ul class="mp-asps">${asp.slice(8).map(linhaAsp).join('')}</ul></details>` : '');

    // elementos e modalidades (10 planetas + Ascendente; Sol, Lua e Ascendente valem 2)
    const elc = [0, 0, 0, 0], md = [0, 0, 0];
    const conta = (lon, peso) => { const s = signo(lon); elc[s % 4] += peso; md[s % 3] += peso; };
    ORDEM.forEach((k) => conta(P[k].longitude, k === 'sun' || k === 'moon' ? 2 : 1));
    if (h) conta(h.asc, 2);
    const tot = elc.reduce((a, b) => a + b, 0);
    const barras = (vals, nomes, cls) => vals.map((v, i) => `<div class="mp-bar"><span>${nomes[i]}</span><i class="${cls}${i}" style="--v:${Math.round((v / tot) * 100)}%"></i><b>${Math.round((v / tot) * 100)}%</b></div>`).join('');
    const domEl = ELEMENTO[elc.indexOf(Math.max(...elc))], domMd = MODALIDADE[md.indexOf(Math.max(...md))];
    const pc = Array(12).fill(0); if (h) ORDEM.forEach((k) => pc[casa(P[k].longitude) - 1]++);
    const pcMax = Math.max(1, ...pc);
    const colunas = h ? `<div><b class="mp-sub">Planetas por casa</b><div class="mp-pc">${pc.map((n, i) => `<div title="Casa ${i + 1}: ${n} planeta${n === 1 ? '' : 's'}"><i style="--v:${(n / pcMax) * 100}%"></i><small>${i + 1}</small></div>`).join('')}</div></div>` : '';
    html += `<h2 class="mp-h">Elementos e modalidades</h2><div class="mp-elmd${h ? ' tres' : ''}"><div><b class="mp-sub">Elementos</b>${barras(elc, ELEMENTO, 'mp-el')}</div><div><b class="mp-sub">Modalidades</b>${barras(md, MODALIDADE, 'mp-md')}</div>${colunas}</div><p class="mp-nota">Predomínio de <b>${domEl}</b> e do modo <b>${domMd}</b>. É uma síntese do mapa (Sol, Lua e Ascendente contam em dobro), não uma medida exata.</p>`;

    // casas
    if (h) html += `<h2 class="mp-h">As 12 casas</h2><div class="mp-casas">${h.cuspides.map((c, i) => `<div class="mp-casa"><b>Casa ${i + 1}</b><span>${pos(c)}</span><small>${AREA[i + 1].replace(/^n[ao]s? /, '')}</small></div>`).join('')}</div>`;

    el.innerHTML = html;
    const info = el.querySelector('#rd-info'), svg = el.querySelector('.rd');
    const mostra = (L, sel) => {
      info.innerHTML = L ? `<h3>${esc(L.t)}</h3><span class="rd-sub${L.tom ? ` mp-tom-${L.tom === 'tensão' ? 'tensao' : L.tom}` : ''}">${esc(L.sub)}</span><p>${esc(L.p)}</p>`
        : `<h3>Seu mapa em um desenho</h3><p>O anel de fora são os 12 signos; ${h ? 'as linhas que saem do centro dividem as 12 casas, com o Ascendente à esquerda' : 'sem hora e cidade de nascimento não dá para desenhar as casas'}. As linhas coloridas no meio são os aspectos: as conversas entre os seus planetas.</p><p class="rd-dica">Toque em qualquer planeta ou linha para ler.</p>`;
      svg.classList.toggle('sel', !!sel);
      svg.querySelectorAll('.on').forEach((n) => n.classList.remove('on'));
      if (sel) sel.forEach((n) => n && n.classList.add('on'));
    };
    mostra(null);
    const escolhe = (t) => {
      const g = t.closest('[data-k]'), a = t.closest('[data-a]');
      if (g) { const k = g.dataset.k; mostra(leitura(k), [g, ...svg.querySelectorAll(`.rd-asp`)].filter((n) => n === g || n.dataset.p.split(' ').includes(k))); }
      else if (a) { const x = asp[+a.dataset.a]; mostra(leituraAsp(x), [a, svg.querySelector(`[data-k="${x.A.k}"]`), svg.querySelector(`[data-k="${x.B.k}"]`)]); }
      else mostra(null);
    };
    svg.addEventListener('click', (e) => escolhe(e.target));
    svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolhe(e.target); } });
    const ed = document.getElementById('mp-editar'); if (ed) ed.addEventListener('click', () => document.getElementById('pf-editar')?.click());
  };
})();
