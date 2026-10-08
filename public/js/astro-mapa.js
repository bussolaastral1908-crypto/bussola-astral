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

    // planetas
    const linhas = ORDEM.map((k) => {
      const lon = P[k].longitude, c = casa(lon), dg = dignidade(k, lon), rx = retrogrado(k, chart.birthDate);
      return `<tr><td><span class="mp-psym">${SIMBOLO[k]}</span>${NOME[k]}</td><td>${pos(lon)}${rx ? ' <span class="mp-rx" title="retrógrado no nascimento">℞</span>' : ''}</td>${h ? `<td class="mp-num">Casa ${c}</td>` : ''}<td>${dg ? `<span class="mp-dig mp-dig-${dg.replace('í', 'i')}" title="${DIGN_TXT[dg]}">${dg}</span>` : ''}</td></tr>`;
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
    const pontos = ORDEM.map((k) => ({ k, lon: P[k].longitude }));
    if (h) pontos.push({ k: 'asc', lon: h.asc }, { k: 'mc', lon: h.mc });
    const asp = aspectos(pontos);
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
    html += `<h2 class="mp-h">Elementos e modalidades</h2><div class="mp-elmd"><div>${barras(elc, ELEMENTO, 'mp-el')}</div><div>${barras(md, MODALIDADE, 'mp-md')}</div></div><p class="mp-nota">Predomínio de <b>${domEl}</b> e do modo <b>${domMd}</b>. É uma síntese do mapa (Sol, Lua e Ascendente contam em dobro), não uma medida exata.</p>`;

    // casas
    if (h) html += `<h2 class="mp-h">As 12 casas</h2><div class="mp-casas">${h.cuspides.map((c, i) => `<div class="mp-casa"><b>Casa ${i + 1}</b><span>${pos(c)}</span><small>${AREA[i + 1].replace(/^n[ao]s? /, '')}</small></div>`).join('')}</div>`;

    el.innerHTML = html;
    const ed = document.getElementById('mp-editar'); if (ed) ed.addEventListener('click', () => document.getElementById('pf-editar')?.click());
  };
})();
