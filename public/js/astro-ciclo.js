/**
 * Bússola Astral — "Próximos 6 meses": o ciclo de trânsitos sobre o mapa natal.
 * Usa o motor de eventos (astro-eventos.js) e a roda (astro-mapa.js). Tudo é calculado;
 * os textos só interpretam os fatos (planeta, aspecto, ponto natal, casa, datas).
 */
(function () {
  const DIA = 86400000;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const fd = (d) => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
  const fdc = (d, ano) => `${d.getDate()} ${MES[d.getMonth()]}${ano && d.getFullYear() !== ano ? ' ' + d.getFullYear() : ''}`;
  const TRANSITANTES = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const ASP = [[0, 'Conjunção', 'fusão'], [180, 'Oposição', 'tensão'], [90, 'Quadratura', 'tensão'], [120, 'Trígono', 'harmonia'], [60, 'Sextil', 'harmonia']];

  const ACAO = {
    sun: 'ilumina, dá foco e energia', mercury: 'movimenta ideias, conversas e decisões', venus: 'suaviza, atrai e fala de afeto e prazer',
    mars: 'acelera, dá coragem e pode trazer atrito', jupiter: 'expande, abre portas e traz crescimento', saturn: 'testa, estrutura e pede maturidade',
    uranus: 'desperta, liberta e traz mudanças inesperadas', neptune: 'inspira, sensibiliza e às vezes confunde', pluto: 'transforma em profundidade e mexe com poder e controle',
  };
  const TOM_VERBO = { harmonia: 'favorece', tensão: 'desafia', fusão: 'intensifica' };
  const TOM_FIM = { harmonia: 'uma porta aberta para aproveitar', tensão: 'pede ajuste e escolhas conscientes', fusão: 'esse tema fica em primeiro plano' };
  const TEMA_ALVO = { asc: 'a forma como você se apresenta e começa as coisas', mc: 'sua carreira e a direção da sua vida', node: 'o caminho de crescimento que você veio desenvolver' };
  const ALVO = { asc: 'Ascendente', mc: 'Meio do Céu', node: 'Nodo Norte' };
  const FEM = new Set(['moon', 'venus']);
  const RX_NOME = { mercury: 'Mercúrio', venus: 'Vênus', mars: 'Marte', jupiter: 'Júpiter', saturn: 'Saturno', uranus: 'Urano', neptune: 'Netuno', pluto: 'Plutão' };

  function ctx() {
    const M = window.AstroMapa;
    const alvo = (k) => ALVO[k] || `${M.NOME[k]} natal`;
    const temaAlvo = (k) => TEMA_ALVO[k] || M.TEMA[k];
    const relacao = (nome, k) => {
      const art = FEM.has(k) ? 'a sua' : 'o seu';
      if (nome === 'Oposição') return `Em oposição ${FEM.has(k) ? 'à sua' : 'ao seu'} ${alvo(k)}`;
      return `Em ${nome.toLowerCase()} com ${art} ${alvo(k)}`;
    };
    return { M, alvo, temaAlvo, relacao };
  }

  function selo(ev) {
    if (ev.peso >= 15) return ['Ciclo importante', 'ouro'];
    return ev.tom === 'harmonia' ? ['Oportunidade', 'verde'] : ev.tom === 'tensão' ? ['Desafio', 'verm'] : ['Ativação', 'ambar'];
  }

  function periodoTxt(ev, ini, fim) {
    const ano = ini.getFullYear();
    const dentro = ev.picos.filter((p) => p >= ini && p <= fim), antes = ev.picos.filter((p) => p < ini), depois = ev.picos.filter((p) => p > fim);
    let exato;
    if (dentro.length) exato = `Exato em ${dentro.map((p) => fdc(p, ano)).join(' · ')}`;
    else if (antes.length && !depois.length) exato = `Último contato exato em ${fdc(antes[antes.length - 1], ano)} — agora se despedindo`;
    else if (depois.length) exato = `Contato exato em ${fdc(depois[0], ano)}`;
    else exato = `Passa perto, sem contato exato (${ev.maisPerto ? ev.maisPerto.orbe.toFixed(1) + '°' : ''})`;
    const per = `${ev.inicio < ini ? 'Em andamento desde ' + fdc(ev.inicio, ano) : 'De ' + fdc(ev.inicio, ano)} até ${fdc(ev.fim, ano)}`;
    return { per, exato };
  }

  function leituraEvento(C, ev) {
    const { M } = C;
    const tema = typeof TRANSIT_THEMES !== 'undefined' && TRANSIT_THEMES[ev.tp] ? TRANSIT_THEMES[ev.tp][ev.tom === 'harmonia' ? 'positive' : ev.tom === 'tensão' ? 'negative' : 'neutral'] : null;
    const casa = ev.casaCeu ? ` Isso acontece principalmente ${M.AREA[ev.casaCeu]} (Casa ${ev.casaCeu}).` : '';
    return {
      chamada: tema ? tema.title : '',
      texto: `${M.NOME[ev.tp]} ${ACAO[ev.tp]}. Aqui, ${TOM_VERBO[ev.tom]} ${FEM.has(ev.np) ? 'a sua' : 'o seu'} ${C.alvo(ev.np)} (${C.temaAlvo(ev.np)}) — ${TOM_FIM[ev.tom]}.${casa}`,
    };
  }

  // planetas do céu numa data + linhas de aspecto ativas com o mapa natal (mesmos orbes do motor)
  function ceuNaData(natal, data, eventos) {
    const E = window.AstroEventos;
    const tr = TRANSITANTES.map((k) => {
      const l = E.lon(k, data), l2 = E.lon(k, new Date(data.getTime() + DIA));
      let m = l2 - l; if (m > 180) m -= 360; if (m < -180) m += 360;
      return { k, lon: l, sym: window.AstroMapa.SIMBOLO[k], rx: k !== 'sun' && m < 0 };
    });
    const cruz = [];
    for (const t of tr) for (const [nk, nl] of Object.entries(natal)) {
      let d = Math.abs(((t.lon - nl) % 360 + 360) % 360); if (d > 180) d = 360 - d;
      for (const [a, nome, tom] of ASP) {
        const orbe = Math.abs(d - a);
        if (orbe <= E.ORBE[t.k]) {
          const ev = eventos.find((e) => e.tp === t.k && e.np === nk && e.asp === a && e.inicio <= data && e.fim >= data);
          cruz.push({ tk: t.k, nk, tlon: t.lon, nlon: nl, a, nome, tom, orbe, ev, peso: ev ? ev.peso : 0 });
          break;
        }
      }
    }
    cruz.sort((x, y) => y.peso - x.peso);
    return { tr, cruz: cruz.slice(0, 10) };
  }

  window.renderCiclo = function (el, chart, premium) {
    const C = ctx(), { M } = C, E = window.AstroEventos;
    el.innerHTML = '<div class="cy-carregando"><div class="skel" style="height:260px"></div><p>Calculando o seu ciclo: posições do céu dia a dia nos próximos 6 meses…</p></div>';
    setTimeout(() => {
      const temLocal = !!(chart.cityData && chart.cityData.iana && chart.hasTime && window.AstroCasas);
      const h = temLocal ? AstroCasas.casas(chart.birthDate, chart.cityData.lat, chart.cityData.lng) : null;
      const natal = {};
      ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].forEach((k) => { natal[k] = chart.positions[k].longitude; });
      natal.node = AstroCasas.nodoNorte(chart.birthDate);
      if (h) { natal.asc = h.asc; natal.mc = h.mc; }
      const r = E.calcular({ natal, cuspides: h ? h.cuspides : null, inicio: new Date(), dias: 183 });
      desenhar(el, C, chart, h, natal, r, premium);
    }, 30);
  };

  function cardEvento(C, ev, r, i, bloqueado) {
    const { M } = C, [st, cls] = selo(ev), { per, exato } = periodoTxt(ev, r.inicio, r.fim);
    const ref = ev.picos.find((p) => p >= r.inicio) || new Date(Math.max(r.inicio, Math.min(ev.fim, r.fim)));
    const sg = M.signo(window.AstroEventos.lon(ev.tp, ref));
    const L = leituraEvento(C, ev);
    return `<article class="cy-card${bloqueado ? ' cy-lock' : ''}" data-ev="${i}" tabindex="0" role="button">
      <div class="cy-ic cy-ic-${cls}">${M.SIMBOLO[ev.tp]}</div>
      <div class="cy-corpo"><div class="cy-tit"><h3>${M.NOME[ev.tp]} em ${M.SIGNOS[sg]}</h3><span class="cy-selo cy-selo-${cls}">${st}</span></div>
      <p class="cy-rel">${C.relacao(ev.nome, ev.np)}</p>
      <p class="cy-datas">${per} · <b>${exato}</b></p>
      ${bloqueado ? '<p class="cy-txt">🔒 Leitura completa no Premium</p>' : `${L.chamada ? `<p class="cy-chamada">${L.chamada}</p>` : ''}<p class="cy-txt">${L.texto}</p>`}</div></article>`;
  }

  function linhaDoTempo(C, r, eventos, sel) {
    const { M } = C, ini = +r.inicio, fim = +r.fim, tot = fim - ini;
    const x = (t) => Math.max(0, Math.min(100, ((t - ini) / tot) * 100));
    const meses = [];
    for (let d = new Date(r.inicio.getFullYear(), r.inicio.getMonth() + 1, 1); d < r.fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    const tick = meses.map((d) => `<span class="cy-mes" style="left:${x(+d)}%">${MES[d.getMonth()]}${d.getMonth() === 0 ? ' ' + d.getFullYear() : ''}</span>`).join('');
    const rows = eventos.map((ev, i) => {
      const [, cls] = selo(ev);
      const dots = ev.picos.filter((p) => p >= ini && p <= fim).map((p) => `<i class="cy-dot" style="left:${x(+p)}%" title="exato em ${fd(p)}"></i>`).join('');
      return `<div class="cy-row" data-ev="${i}"><span class="cy-lbl">${M.SIMBOLO[ev.tp]} ${M.NOME[ev.tp]} ${ev.nome.toLowerCase()} ${C.alvo(ev.np)}</span><div class="cy-trilho"><b class="cy-bar cy-bar-${cls}" style="left:${x(+ev.inicio)}%;width:${Math.max(1, x(+ev.fim) - x(+ev.inicio))}%"></b>${dots}</div></div>`;
    });
    const rx = r.retrogrados.filter((x2) => ['mercury', 'venus', 'mars', 'jupiter', 'saturn'].includes(x2.planeta)).map((x2) =>
      `<div class="cy-row"><span class="cy-lbl">${M.SIMBOLO[x2.planeta]} ${RX_NOME[x2.planeta]} retrógrado</span><div class="cy-trilho"><b class="cy-bar cy-bar-rx" style="left:${x(+x2.inicio)}%;width:${Math.max(1, x(+x2.fim) - x(+x2.inicio))}%"></b></div></div>`);
    const marcos = r.lunacoes.filter((l) => l.eclipse || l.toca.length).map((l) =>
      `<i class="cy-marco${l.eclipse ? ' cy-marco-ec' : ''}" style="left:${x(+l.data)}%" title="${l.eclipse ? 'Eclipse ' + l.eclipse.tipo : 'Lua ' + l.tipo} em ${fd(l.data)}"></i>`).join('');
    return `<div class="cy-tl" style="--sel-n:${(x(sel) / 100).toFixed(4)}"><div class="cy-row cy-row-mes"><span class="cy-lbl"></span><div class="cy-trilho cy-trilho-mes">${tick}</div></div>${rows.join('')}${rx.join('')}
      <div class="cy-row"><span class="cy-lbl">◐ Eclipses e luas fortes</span><div class="cy-trilho">${marcos}</div></div><div class="cy-agora"></div></div>`;
  }

  function datasDoCiclo(C, r, top) {
    const { M } = C, ano = r.inicio.getFullYear(), itens = [];
    const casaTxt = (c) => (c ? ` · Casa ${c}` : '');
    top.forEach((ev) => ev.picos.filter((p) => p >= r.inicio && p <= r.fim).forEach((p) => {
      const [st, cls] = selo(ev);
      itens.push({ t: p, tit: `${M.NOME[ev.tp]} ${ev.nome.toLowerCase()} ${C.alvo(ev.np)} — exato`, tag: [ev.tom === 'harmonia' ? 'Positiva' : ev.tom === 'tensão' ? 'Atenção' : 'Intensa', cls], txt: `${C.relacao(ev.nome, ev.np)}: ${C.temaAlvo(ev.np)}.` });
    }));
    r.lunacoes.forEach((l) => {
      const sg = M.signo(l.lon), area = l.casa ? M.AREA[l.casa] : '';
      const toca = l.toca.length ? ` Ativa ${l.toca.map((k) => (FEM.has(k) ? 'sua ' : 'seu ') + C.alvo(k)).join(' e ')}.` : '';
      if (l.eclipse) itens.push({ t: l.data, tit: `Eclipse ${l.eclipse.tipo === 'solar' ? 'solar' : 'lunar'} em ${M.SIGNOS[sg]} ${Math.floor(l.lon % 30)}°${casaTxt(l.casa)}`, tag: ['Transformação', 'roxo'], txt: `Eclipses aceleram viradas de ciclo${area ? ', aqui ' + area : ''}.${toca}` });
      else itens.push({ t: l.data, tit: `Lua ${l.tipo === 'nova' ? 'Nova' : 'Cheia'} em ${M.SIGNOS[sg]}${casaTxt(l.casa)}`, tag: [l.tipo === 'nova' ? 'Início' : 'Colheita', 'lua'], txt: `${l.tipo === 'nova' ? 'Bom momento para começar e plantar intenções' : 'Momento de colher, concluir e enxergar com clareza'}${area ? ' ' + area : ''}.${toca}` });
    });
    r.retrogrados.forEach((x) => {
      if (!x.inicioAntes && x.inicio >= r.inicio) itens.push({ t: x.inicio, tit: `${RX_NOME[x.planeta]} fica retrógrado em ${M.SIGNOS[M.signo(x.lonInicio)]}${casaTxt(x.casa)}`, tag: ['Revisão', 'ambar'], txt: `Fase de rever, refazer e reconsiderar${x.casa ? ' ' + M.AREA[x.casa] : ''}.` });
      if (!x.fimDepois && x.fim <= r.fim) itens.push({ t: x.fim, tit: `${RX_NOME[x.planeta]} volta a andar direto${casaTxt(x.casaFim)}`, tag: ['Retomada', 'verde'], txt: 'O que estava travado ou em revisão volta a andar.' });
    });
    r.ingressosCasa.forEach((x) => itens.push({ t: x.data, tit: `${M.NOME[x.planeta]} ${x.retro ? 'volta para' : 'entra na'} sua Casa ${x.casa}`, tag: ['Nova fase', 'ouro'], txt: `${M.NOME[x.planeta]} ${ACAO[x.planeta]} — agora ${M.AREA[x.casa]}.` }));
    r.ingressosSigno.filter((x) => !r.ingressosCasa.some((c) => c.planeta === x.planeta && Math.abs(c.data - x.data) < DIA)).forEach((x) =>
      itens.push({ t: x.data, tit: `${M.NOME[x.planeta]} ${x.retro ? 'volta para' : 'entra em'} ${M.SIGNOS[x.signo]}`, tag: ['Céu', 'lua'], txt: `Muda o clima ${x.planeta === 'mars' ? 'de ação e energia' : 'de fundo'} para todo mundo; no seu mapa, vale olhar ${x.planeta === 'mars' ? 'onde você está gastando energia' : 'os temas desse planeta'}.` }));
    itens.sort((a, b) => a.t - b.t);
    const grupos = new Map();
    itens.forEach((it) => { const k = `${it.t.getFullYear()}-${it.t.getMonth()}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(it); });
    let n = 0;
    return [...grupos.values()].map((g) => {
      const d = g[0].t;
      return `<details class="cy-mesbloco"${n++ < 2 ? ' open' : ''}><summary>${MES_LONGO[d.getMonth()]} ${d.getFullYear()} <small>${g.length} ${g.length === 1 ? 'data' : 'datas'}</small></summary><ul>${g.map((it) =>
        `<li><span class="cy-dia">${it.t.getDate()}<small>${MES[it.t.getMonth()]}</small></span><div><b>${it.tit}</b><p>${it.txt}</p></div><span class="cy-selo cy-selo-${it.tag[1]}">${it.tag[0]}</span></li>`).join('')}</ul></details>`;
    }).join('');
  }


  // ── Áreas da vida (notas de astro-areas.js; texto pela IA a partir dos fatores) ──
  const AREA_GLIFO = { amor: '♀', trabalho: '♄', dinheiro: '♃', saude: '☉', espiritualidade: '♆' };
  const faixa = (n) => (n >= 7 ? ['Favorável', 'verde'] : n >= 4 ? ['Equilibrado', 'ambar'] : ['Pede ajuste', 'verm']);
  const FAIXA_TXT = {
    'Favorável': 'Fase de fluidez: as coisas tendem a andar com menos esforço.',
    'Equilibrado': 'Fase de altos e baixos: há apoio e há desafio, e o resultado depende das suas escolhas.',
    'Pede ajuste': 'Fase de ajuste: o céu pede revisão, paciência e escolhas conscientes antes de avançar.',
  };
  const mesTxt = (m) => (m ? `${MES_LONGO[m.mes].toLowerCase()}${m.ano !== new Date().getFullYear() ? ' ' + m.ano : ''}` : '');

  function fatorTxt(C, f, ano) {
    const { M } = C;
    if (f.tipo === 'transito') return `${M.NOME[f.ev.tp]} ${C.relacao(f.ev.nome, f.ev.np).replace(/^Em /, 'em ')} (${fdc(f.ev.inicio, ano)} a ${fdc(f.ev.fim, ano)})`;
    if (f.tipo === 'eclipse') return `Eclipse ${f.l.eclipse.tipo} na sua Casa ${f.l.casa} (${fdc(f.l.data, ano)})`;
    if (f.tipo === 'retro') return `${RX_NOME[f.x.planeta]} retrógrado na sua Casa ${f.x.casa} (${fdc(f.x.inicio, ano)} a ${fdc(f.x.fim, ano)})`;
    if (f.tipo === 'ingresso') return `${M.NOME[f.x.planeta]} entra na sua Casa ${f.x.casa} (${fdc(f.x.data, ano)})`;
    return '';
  }

  function areasDoCiclo(C, r, h) {
    const ano = r.inicio.getFullYear();
    return window.AstroAreas.calcular(r, !!h).map((a) => {
      const [fx, cls] = faixa(a.nota);
      const fatores = a.fatores.map((f) => ({ txt: fatorTxt(C, f, ano), pos: f.c > 0 }));
      const top = fatores.find((f) => f.pos === (a.net >= 0)) || fatores[0];
      return { ...a, faixa: fx, cls, fatores, texto: `${FAIXA_TXT[fx]}${top ? ` O que mais pesa: ${top.txt}.` : ''}` };
    });
  }

  function cardArea(a, bloqueado) {
    return `<article class="cy-area" data-area="${a.id}">
      <div class="cy-area-top"><span class="cy-ic cy-ic-${a.cls === 'verm' ? 'verm' : a.cls === 'verde' ? 'verde' : 'ambar'}">${AREA_GLIFO[a.id]}</span><div><h3>${a.nome}</h3><span class="cy-selo cy-selo-${a.cls}">${a.faixa}</span></div>
      <b class="cy-nota">${bloqueado ? '?' : a.nota}<small>/10</small></b></div>
      <div class="cy-nota-bar"><i style="width:${bloqueado ? 0 : a.nota * 10}%" class="cy-nb-${a.cls}"></i></div>
      ${bloqueado ? '<p class="cy-txt">🔒 Nota e leitura no Premium</p>' : `<p class="cy-area-tit" data-tit></p><p class="cy-txt" data-txt>${a.texto}</p>
      <p class="cy-fases">${a.melhor ? `<span>Mais favorável: <b>${mesTxt(a.melhor)}</b></span>` : ''}${a.atencao ? `<span>Pede atenção: <b>${mesTxt(a.atencao)}</b></span>` : ''}<span>Movimento: <b>${a.movimento}</b></span></p>
      ${a.fatores.length ? `<details class="cy-porque"><summary>Por que essa nota</summary><ul>${a.fatores.map((f) => `<li class="${f.pos ? 'pos' : 'neg'}">${f.pos ? '+' : '−'} ${f.txt}</li>`).join('')}</ul></details>` : ''}`}
    </article>`;
  }

  async function textosIA(el, areas, r) {
    if (!window.BAConta || !BAConta.getToken()) return;
    const ciclo = `${MES[r.inicio.getMonth()]} ${r.inicio.getFullYear()} – ${MES[r.fim.getMonth()]} ${r.fim.getFullYear()}`;
    try {
      const resp = await fetch('/api/ciclo-areas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + BAConta.getToken() },
        body: JSON.stringify({ ciclo, areas: areas.map((a) => ({ id: a.id, nome: a.nome, nota: a.nota, faixa: a.faixa, melhor: mesTxt(a.melhor), atencao: mesTxt(a.atencao), fatores: a.fatores.map((f) => (f.pos ? '(favorece) ' : '(desafia) ') + f.txt) })) }),
      });
      if (!resp.ok) return;
      const j = await resp.json();
      for (const [id, t] of Object.entries(j.areas || {})) {
        const card = el.querySelector(`.cy-area[data-area="${id}"]`); if (!card) continue;
        const tit = card.querySelector('[data-tit]'), tx = card.querySelector('[data-txt]');
        if (tit && t.titulo) tit.textContent = t.titulo;
        if (tx && t.texto) tx.textContent = t.texto;
      }
    } catch (e) { /* fica o texto calculado */ }
  }

  function desenhar(el, C, chart, h, natal, r, premium) {
    const { M } = C;
    // os trânsitos que contam: planetas de Marte para fora (os rápidos aparecem nas datas)
    const grandes = r.transitos.filter((e) => ['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].includes(e.tp) && e.peso >= 4);
    const top = grandes.slice(0, 8);
    const eclipses = r.lunacoes.filter((l) => l.eclipse).length, rxM = r.retrogrados.filter((x) => x.planeta === 'mercury' && x.fim >= r.inicio).length;
    const resumo = `<div class="cy-resumo"><div><small>Seu ciclo</small><b>${fd(r.inicio)} → ${fd(r.fim)}</b></div><div><small>Grandes trânsitos</small><b>${top.length}</b></div><div><small>Eclipses</small><b>${eclipses}</b></div><div><small>Mercúrio retrógrado</small><b>${rxM}×</b></div></div>`;

    if (!premium) {
      el.innerHTML = resumo + `<h2 class="mp-h">Os grandes trânsitos do seu ciclo</h2><div class="cy-cards">${top.slice(0, 1).map((ev, i) => cardEvento(C, ev, r, i, false)).join('')}${top.slice(1, 6).map((ev, i) => cardEvento(C, ev, r, i + 1, true)).join('')}</div>
        <h2 class="mp-h">Áreas da vida no seu ciclo</h2><div class="cy-areas">${areasDoCiclo(C, r, h).map((a) => cardArea(a, true)).join('')}</div>
        <div class="cy-gate"><h3>Veja o ciclo completo</h3><p>A roda com o céu de cada dia sobre o seu mapa, a linha do tempo com início, pico e fim de cada trânsito, e todas as datas do semestre — eclipses, luas e retrógrados nas suas casas.</p><button class="btn btn-gold btn-sm btn-unlock" type="button">Liberar por R$ 9,90</button><small>Pagamento único · acesso por 6 meses</small></div>`;
      return;
    }

    const areasCalc = areasDoCiclo(C, r, h);
    let sel = Date.now();
    el.innerHTML = resumo +
      `<h2 class="mp-h">O céu sobre o seu mapa <small>arraste para ver qualquer dia do ciclo</small></h2>
      <div class="rd-wrap"><div class="rd-box" id="cy-roda"></div><div class="rd-lado">
        <div class="cy-data"><label for="cy-dia">Data: <b id="cy-dia-txt"></b></label><input type="range" id="cy-dia" min="0" max="183" step="1" value="0"><div class="cy-data-bts"><button type="button" class="link-btn" id="cy-hoje">Hoje</button></div></div>
        <div class="rd-info" id="cy-info" aria-live="polite"></div>
        <div class="cy-ativos" id="cy-ativos"></div>
      </div></div>
      <h2 class="mp-h">Os grandes trânsitos do seu ciclo <small>ordenados por relevância para o seu mapa</small></h2><div class="cy-cards">${top.map((ev, i) => cardEvento(C, ev, r, i, false)).join('')}</div>
      <h2 class="mp-h">Áreas da vida no seu ciclo <small>fluidez de 1 a 10, calculada pelos trânsitos de cada área</small></h2><div class="cy-areas" id="cy-areas">${areasCalc.map((a) => cardArea(a, false)).join('')}</div>
      <h2 class="mp-h">Linha do tempo <small>barra = período ativo · ponto = dia exato</small></h2><div class="cy-tl-box" id="cy-tl"></div>
      <h2 class="mp-h">Datas do seu ciclo <small>eclipses, luas, retrógrados e mudanças de casa</small></h2><div class="cy-datas-lista">${datasDoCiclo(C, r, top)}</div>`;

    const nat = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].map((k) => ({ k, lon: natal[k], sym: M.SIMBOLO[k] }));
    nat.push({ k: 'node', lon: natal.node, sym: '☊' });
    let atual = null;

    const infoPadrao = () => `<h3>${fd(new Date(sel))}</h3><p>Por dentro, o seu mapa de nascimento. No anel de fora, em lilás, onde os planetas estão neste dia. As linhas tracejadas mostram quem do céu está ativando quem do seu mapa.</p><p class="rd-dica">Toque num planeta ou numa linha para ler.</p>`;
    const infoEvento = (x) => {
      const ev = x.ev;
      if (!ev) return `<h3>${M.NOME[x.tk]} · ${x.nome} · ${C.alvo(x.nk)}</h3><span class="rd-sub">contato rápido · orbe ${x.orbe.toFixed(1)}°</span><p>${M.NOME[x.tk]} ${ACAO[x.tk]}. ${C.relacao(x.nome, x.nk)}: ${C.temaAlvo(x.nk)}. Efeito de poucos dias.</p>`;
      const { per, exato } = periodoTxt(ev, r.inicio, r.fim), L = leituraEvento(C, ev);
      return `<h3>${M.NOME[ev.tp]} · ${ev.nome} · ${C.alvo(ev.np)}</h3><span class="rd-sub mp-tom-${ev.tom === 'tensão' ? 'tensao' : ev.tom === 'fusão' ? 'fusao' : ev.tom}">${per}</span><p><b>${exato}.</b></p>${L.chamada ? `<p class="cy-chamada">${L.chamada}</p>` : ''}<p>${L.texto}</p>`;
    };

    function render() {
      const d = new Date(sel), { tr, cruz } = ceuNaData(natal, d, r.transitos);
      atual = cruz;
      document.getElementById('cy-roda').innerHTML = M.rodaSVG({ planetas: nat, casas: h, aspectos: [], base: h ? h.asc : 0, transito: tr, cruz });
      document.getElementById('cy-dia-txt').textContent = fd(d);
      document.getElementById('cy-info').innerHTML = infoPadrao();
      document.getElementById('cy-ativos').innerHTML = cruz.length ? `<b class="mp-sub">Ativos nesta data</b>${cruz.map((x, i) => `<button type="button" class="cy-chip cy-chip-${x.tom === 'tensão' ? 'tensao' : x.tom === 'fusão' ? 'fusao' : x.tom}" data-c="${i}">${M.SIMBOLO[x.tk]} ${x.nome} ${C.alvo(x.nk)}</button>`).join('')}` : '<p class="mp-nota">Nenhum contato forte neste dia.</p>';
      document.getElementById('cy-tl').innerHTML = linhaDoTempo(C, r, top, sel);
      ligarRoda();
    }

    function ligarRoda() {
      const svg = document.querySelector('#cy-roda .rd'), info = document.getElementById('cy-info');
      const marca = (nos) => { svg.classList.toggle('sel', !!nos); svg.querySelectorAll('.on').forEach((n) => n.classList.remove('on')); if (nos) nos.forEach((n) => n && n.classList.add('on')); };
      const escolhe = (t) => {
        const g = t.closest('[data-k]'), c = t.closest('[data-c]');
        if (c) { const x = atual[+c.dataset.c]; info.innerHTML = infoEvento(x); marca([svg.querySelector(`line[data-c="${c.dataset.c}"]`), svg.querySelector(`[data-k="t-${x.tk}"]`), svg.querySelector(`[data-k="${x.nk}"]`)]); }
        else if (g) {
          const k = g.dataset.k, tk = k.startsWith('t-') ? k.slice(2) : null;
          const lig = atual.filter((x) => (tk ? x.tk === tk : x.nk === k));
          const p = tk ? null : k;
          const l = tk ? window.AstroEventos.lon(tk, new Date(sel)) : natal[k];
          const casa = h ? AstroCasas.casaDe(l, h.cuspides) : null;
          info.innerHTML = `<h3>${tk ? `${M.SIMBOLO[tk]} ${M.NOME[tk]} no céu` : `${k === 'node' ? '☊' : M.SIMBOLO[k]} ${C.alvo(k)}`}</h3><span class="rd-sub">${M.SIGNOS[M.signo(l)]} ${M.grau(l)}${casa ? ` · ${tk ? 'passando pela sua' : 'na'} Casa ${casa}` : ''}</span>` +
            `<p>${tk ? `${M.NOME[tk]} ${ACAO[tk]}${casa ? `, agora ${M.AREA[casa]}` : ''}.` : `${C.temaAlvo(p).charAt(0).toUpperCase() + C.temaAlvo(p).slice(1)}.`}</p>` +
            (lig.length ? `<p><b>${tk ? 'Ativando no seu mapa' : 'Quem do céu ativa este ponto'}:</b> ${lig.map((x) => tk ? `${x.nome.toLowerCase()} ${C.alvo(x.nk)}` : `${M.NOME[x.tk]} (${x.nome.toLowerCase()})`).join(', ')}.</p>` : '');
          marca([g, ...lig.map((x) => svg.querySelector(`line[data-c="${atual.indexOf(x)}"]`))]);
        } else { info.innerHTML = infoPadrao(); marca(null); }
      };
      svg.addEventListener('click', (e) => escolhe(e.target));
      svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolhe(e.target); } });
      document.getElementById('cy-ativos').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) escolhe(svg.querySelector(`line[data-c="${b.dataset.c}"]`) || b); };
    }

    const range = document.getElementById('cy-dia');
    let pend = null;
    range.addEventListener('input', () => { sel = +r.inicio + (+range.value) * DIA + 12 * 3600000; if (+range.value === 0) sel = Date.now(); cancelAnimationFrame(pend); pend = requestAnimationFrame(render); });
    document.getElementById('cy-hoje').addEventListener('click', () => { range.value = 0; sel = Date.now(); render(); });
    // tocar num trânsito (card ou linha do tempo) leva a roda ao dia exato dele
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.cy-card[data-ev], .cy-row[data-ev]'); if (!c) return;
      const ev = top[+c.dataset.ev]; if (!ev) return;
      const alvo = ev.picos.find((p) => p >= r.inicio && p <= r.fim) || new Date(Math.max(+r.inicio, Math.min(+ev.fim, +r.fim)));
      range.value = Math.max(0, Math.min(183, Math.round((alvo - r.inicio) / DIA)));
      sel = +alvo; render();
      const i = atual.findIndex((x) => x.ev === ev);
      if (i >= 0) { const ln = document.querySelector(`#cy-roda line[data-c="${i}"]`); ln && ln.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      document.getElementById('cy-roda').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.cy-card[data-ev]')) { e.preventDefault(); e.target.click(); } });
    render();
    textosIA(el, areasCalc, r);
  }
})();
