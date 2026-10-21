/* /admin/estatisticas/: os números de uso da Taioé, só para o revisor geral (pedido do Gere,
   07/10/2026). Tudo vem de uma chamada, conta.estatisticas(), que recusa (PT403) qualquer outra
   conta. A CSP do hub não aceita estilo nem script no HTML: a página se monta com o DOM, e a
   altura das barras vai por element.style. */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();
  var NOME_CURSO = { 'es-pt': 'Espanhol (para quem fala português)', 'en-pt': 'Inglês (para quem fala português)',
    'es-en': 'Espanhol (para quem fala inglês)', 'en-es': 'Inglês (para quem fala espanhol)',
    'pt-es': 'Português (para quem fala espanhol)', 'pt-en': 'Português (para quem fala inglês)',
    'fr-pt': 'Francês (para quem fala português)', 'fr-es': 'Francês (para quem fala espanhol)',
    'fr-en': 'Francês (para quem fala inglês)', 'la-pt': 'Latim (para quem fala português)' };
  var NOME_APP = { hub: 'Página inicial e conta', cards: 'Cards', biblioteca: 'Biblioteca' };
  var NOME_LINGUA = { pt: 'português', es: 'espanhol', en: 'inglês' };

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function fmt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR'); }
  function dataCurta(d) { if (!d) return '—'; var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }

  function numeros(itens) {
    var g = el('div', 'numeros');
    itens.forEach(function (it) {
      var c = el('div', 'numero');
      c.appendChild(el('b', null, fmt(it[0])));
      c.appendChild(el('span', null, it[1]));
      g.appendChild(c);
    });
    return g;
  }

  /* Barras com rótulo nas pontas; «pontos» é [{rotulo, valor, dica}]. */
  function barras(titulo, pontos) {
    var g = el('div', 'grafico');
    g.appendChild(el('p', 'titulo', titulo));
    if (!pontos.length) { g.appendChild(el('p', 'vazio', 'Sem dados ainda.')); return g; }
    var max = Math.max.apply(null, pontos.map(function (p) { return p.valor; }).concat([1]));
    var b = el('div', 'barras');
    pontos.forEach(function (p) {
      var x = el('div', 'barra' + (p.valor ? '' : ' zero'));
      if (p.valor) x.style.height = Math.max(3, Math.round(100 * p.valor / max)) + '%';
      x.title = p.dica || (p.rotulo + ': ' + fmt(p.valor));
      b.appendChild(x);
    });
    g.appendChild(b);
    var eixo = el('div', 'eixo');
    eixo.appendChild(el('span', null, pontos[0].rotulo));
    eixo.appendChild(el('span', null, 'máx. ' + fmt(max)));
    eixo.appendChild(el('span', null, pontos[pontos.length - 1].rotulo));
    g.appendChild(eixo);
    return g;
  }

  /* Os últimos «dias» dias, com zero onde não há registro. */
  function diasCompletos(lista, dias, campo) {
    var porDia = {};
    (lista || []).forEach(function (x) { porDia[String(x.dia).slice(0, 10)] = x; });
    var saida = [], hoje = new Date();
    for (var i = dias - 1; i >= 0; i--) {
      var d = new Date(hoje); d.setDate(hoje.getDate() - i);
      var k = d.toISOString().slice(0, 10), x = porDia[k];
      saida.push({ rotulo: dataCurta(k), valor: x ? Number(x[campo || 'n']) : 0,
        dica: dataCurta(k) + ': ' + fmt(x ? x[campo || 'n'] : 0) });
    }
    return saida;
  }

  function tabela(colunas, linhas, vazio) {
    var w = el('div', 'tabela');
    if (!linhas.length) { w.appendChild(el('p', 'vazio', vazio || 'Ninguém ainda.')); return w; }
    var t = el('table'), th = el('tr');
    colunas.forEach(function (c) { th.appendChild(el('th', c.n ? 'n' : null, c.t)); });
    var thead = el('thead'); thead.appendChild(th); t.appendChild(thead);
    var tb = el('tbody');
    linhas.forEach(function (l, i) {
      var tr = el('tr');
      colunas.forEach(function (c) { tr.appendChild(el('td', c.cls || (c.n ? 'n' : null), c.f(l, i))); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t);
    return w;
  }

  function bloco(id, titulo) {
    var s = el('section', 'bloco'); s.id = id;
    s.appendChild(el('h2', null, titulo));
    var a = el('a', null, titulo); a.href = '#' + id;
    H.$('secoes').appendChild(a);
    H.$('blocos').appendChild(s);
    return s;
  }

  /* ── o retorno dos dominados (pedido do Gere, 17/10/2026) ──
     conta.retornos() devolve contagens [degrau, inferido, dias previstos, dias passados, n, certas],
     de todos e da própria conta. Os gráficos são SVG montado pelo DOM, na largura real do
     bloco (redesenhado ao mudar a largura), com a margem de 95% de Wilson em cada ponto. */
  var SVG = 'http://www.w3.org/2000/svg';
  /* o que redesenha os gráficos na largura de agora: a página monta escondida («Carregando…») */
  var redesenhar = function () {};
  function svg(tag, attrs, pai) {
    var e = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (pai) pai.appendChild(e);
    return e;
  }
  function wilson(ok, n) {
    if (!n) return [0, 1];
    var z = 1.96, p = ok / n, d = 1 + z * z / n;
    var c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - m), Math.min(1, c + m)];
  }
  function pct(x) { return Math.round(100 * x) + '%'; }
  function rotuloDias(d) {
    if (d < 1) return 'menos de 1 dia';
    if (d < 2) return '1 dia';
    if (d < 14) return Math.round(d) + ' dias';
    if (d < 60) return Math.round(d / 7) + ' sem.';
    if (d < 365) return Math.round(d / 30) + ' meses';
    return Math.round(d / 365 * 10) / 10 + ' anos';
  }
  function rotuloDegrau(d) {
    return ['3 dias', '1 semana', '2 semanas', '1 mês', '3 meses', '6 meses'][d];
  }

  /* Agrupa em faixas: «chave» devolve o índice da faixa de cada linha. */
  function agrupar(linhas, chave) {
    var g = {};
    linhas.forEach(function (l) {
      var k = chave(l);
      if (k === null) return;
      var x = g[k] || (g[k] = { k: k, n: 0, ok: 0 });
      x.n += l.n; x.ok += l.ok;
    });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return a.k - b.k; });
  }

  /* Um gráfico de pontos: x em escala log, y em % de acerto, de «piso» a 100%. «pontos» é
     [{x, n, ok, dica}]; «marcas» são os traços verticais de referência no eixo x. */
  function pontosLog(caixa, o) {
    var larg = Math.max(260, caixa.clientWidth || 600), alt = o.altura || 240;
    var m = { e: 40, d: 12, t: 12, b: 34 };
    var w = larg - m.e - m.d, h = alt - m.t - m.b;
    var lx0 = Math.log(o.xmin), lx1 = Math.log(o.xmax);
    var piso = o.piso;
    function X(x) { return m.e + w * (Math.log(Math.min(Math.max(x, o.xmin), o.xmax)) - lx0) / (lx1 - lx0); }
    function Y(p) { return m.t + h * (1 - (Math.max(p, piso) - piso) / (1 - piso)); }
    var s = svg('svg', { width: larg, height: alt, viewBox: '0 0 ' + larg + ' ' + alt, class: 'pontos', role: 'img',
      'aria-label': o.titulo });
    for (var p = piso; p <= 1.0001; p += 0.1) {
      svg('line', { x1: m.e, x2: m.e + w, y1: Y(p), y2: Y(p), class: 'grade' }, s);
      svg('text', { x: m.e - 6, y: Y(p) + 4, class: 'eixo-y' }, s).textContent = pct(p);
    }
    if (o.alvo) {
      svg('line', { x1: m.e, x2: m.e + w, y1: Y(o.alvo), y2: Y(o.alvo), class: 'alvo' }, s);
    }
    (o.marcas || []).forEach(function (mk) {
      svg('line', { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: m.t + h, class: mk.forte ? 'marca forte' : 'marca' }, s);
      svg('text', { x: X(mk.x), y: alt - m.b + 16, class: 'eixo-x' }, s).textContent = mk.rotulo;
    });
    o.pontos.forEach(function (pt) {
      var ic = wilson(pt.ok, pt.n), cx = X(pt.x), fraco = pt.n < 10;
      var g = svg('g', { class: 'ponto' + (fraco ? ' fraco' : '') }, s);
      svg('line', { x1: cx, x2: cx, y1: Y(ic[0]), y2: Y(ic[1]), class: 'margem' }, g);
      svg('circle', { cx: cx, cy: Y(pt.ok / pt.n), r: 5, class: 'miolo' }, g);
      svg('circle', { cx: cx, cy: Y(pt.ok / pt.n), r: 14, class: 'alvo-do-mouse' }, g);
      svg('title', {}, g).textContent = pt.dica + ': ' + pct(pt.ok / pt.n) + ' de acerto em ' + fmt(pt.n) +
        ' revisões (margem de ' + pct(ic[0]) + ' a ' + pct(ic[1]) + ')';
    });
    caixa.appendChild(s);
  }

  /* Faixas de dias passados: em cada uma o ponto fica no meio (média geométrica). */
  var FAIXAS_DIAS = [1, 2, 3, 4, 5, 6, 7, 9, 11, 14, 18, 23, 30, 40, 55, 75, 100, 135, 180, 250, 365, 1000];
  /* Espera ÷ degrau, em passos de √2: 0,5 · 0,71 · 1 · 1,41 · 2 · 2,83 */
  var FAIXAS_RAZAO = [0, 0.5, 0.71, 1, 1.41, 2, 2.83, 1000];

  function blocoRetornos(dados) {
    var b = bloco('retornos', 'Cards: o retorno dos dominados');
    if (!dados) {
      b.appendChild(el('p', 'vazio', 'Os retornos ainda não estão no banco deste ambiente.'));
      return;
    }
    var dias = dados.dias || [3, 7, 14, 30, 90, 180];
    var quem = 'meus';
    var observador = null;
    var controle = el('div', 'escolha');
    var corpo = el('div');
    b.appendChild(el('p', 'apagado pequeno', 'Cada revisão de card dominado, pelo tempo que o card de fato esperou ' +
      'desde a resposta anterior. Desde 17/10 a volta de cada card é sorteada entre metade e o dobro do degrau; ' +
      'antes, ele voltava no degrau ou depois, quando a fila deixava. As respostas de antes de 06/10 vieram dos logs ' +
      'do app antigo, sem o degrau: ele foi deduzido do tempo passado.'));
    [['meus', 'Sua conta'], ['todos', 'Todos (' + fmt(dados.pessoas) + (Number(dados.pessoas) === 1 ? ' pessoa)' : ' pessoas)')]].forEach(function (op) {
      var bt = el('button', 'secundario' + (op[0] === quem ? ' ativo' : ''), op[1]);
      bt.type = 'button';
      bt.setAttribute('aria-pressed', op[0] === quem ? 'true' : 'false');
      bt.addEventListener('click', function () {
        quem = op[0];
        Array.prototype.forEach.call(controle.children, function (x) {
          x.classList.toggle('ativo', x === bt); x.setAttribute('aria-pressed', x === bt ? 'true' : 'false');
        });
        montar();
      });
      controle.appendChild(bt);
    });
    b.appendChild(controle);
    b.appendChild(corpo);

    function montar() {
      corpo.textContent = '';
      var linhas = (dados[quem] || []).map(function (r) {
        return { degrau: r[0], inferido: r[1], previsto: r[2], dias: r[3], n: Number(r[4]), ok: Number(r[5]) };
      });
      var total = linhas.reduce(function (s, l) { return s + l.n; }, 0);
      var certas = linhas.reduce(function (s, l) { return s + l.ok; }, 0);
      var sorteadas = linhas.filter(function (l) { return !l.inferido && l.previsto !== dias[l.degrau]; })
        .reduce(function (s, l) { return s + l.n; }, 0);
      corpo.appendChild(numeros([[total, 'revisões de dominado'], [total ? Math.round(100 * certas / total) : null, '% de acerto'],
        [sorteadas, 'com a volta sorteada']]));
      if (!total) { corpo.appendChild(el('p', 'vazio', 'Nenhuma revisão de dominado ainda.')); return; }

      var g1 = el('div', 'grafico');
      g1.appendChild(el('p', 'titulo', 'Acerto pelo tempo que o card esperou (todos os degraus)'));
      var area1 = el('div', 'area');
      g1.appendChild(area1);
      corpo.appendChild(g1);
      var faixas = agrupar(linhas, function (l) {
        for (var i = FAIXAS_DIAS.length - 2; i >= 0; i--) if (l.dias >= FAIXAS_DIAS[i]) return i;
        return 0;
      });
      var pts = faixas.map(function (f) {
        var a = FAIXAS_DIAS[f.k], z = FAIXAS_DIAS[f.k + 1];
        var dica = z <= 14 ? a + ' a ' + z + ' dias' : z >= 1000 ? 'mais de ' + rotuloDias(a) : 'de ' + rotuloDias(a) + ' a ' + rotuloDias(z);
        return { x: Math.sqrt(a * z), n: f.n, ok: f.ok, dica: 'Esperou ' + dica };
      });
      var menor = Math.min.apply(null, pts.map(function (p) { return wilson(p.ok, p.n)[0]; }).concat([0.7]));
      var piso = Math.max(0, Math.floor(menor * 10) / 10);
      var desenho1 = function () {
        area1.textContent = '';
        pontosLog(area1, { titulo: 'Acerto pelo tempo de espera', xmin: 1, xmax: 400, piso: piso, alvo: 0.9, pontos: pts,
          marcas: dias.map(function (d, i) { return { x: d, rotulo: rotuloDegrau(i), forte: true }; }) });
      };
      desenho1();
      g1.appendChild(el('p', 'legenda', 'Ponto: o acerto da faixa; traço: a margem de 95%; ponto apagado: menos de ' +
        '10 revisões. As linhas verticais são os degraus; a tracejada, 90% de acerto, a meta mais comum na ' +
        'pesquisa de revisão espaçada.'));

      corpo.appendChild(el('h3', null, 'Em cada degrau: a espera de fato ÷ o degrau'));
      var multiplos = el('div', 'multiplos');
      corpo.appendChild(multiplos);
      var desenhos = [desenho1];
      dias.forEach(function (d, i) {
        var doDegrau = linhas.filter(function (l) { return l.degrau === i; });
        var n = doDegrau.reduce(function (s, l) { return s + l.n; }, 0);
        var g = el('div', 'grafico');
        g.appendChild(el('p', 'titulo', rotuloDegrau(i) + ' · ' + fmt(n) + ' revisões'));
        multiplos.appendChild(g);
        if (!n) { g.appendChild(el('p', 'vazio', 'Sem revisões ainda.')); return; }
        var area = el('div', 'area');
        g.appendChild(area);
        var fx = agrupar(doDegrau, function (l) {
          var r = (l.dias + 0.5) / d;
          for (var j = FAIXAS_RAZAO.length - 2; j >= 0; j--) if (r >= FAIXAS_RAZAO[j]) return j;
          return 0;
        });
        var pp = fx.map(function (f) {
          var a = Math.max(FAIXAS_RAZAO[f.k], 0.35), z = Math.min(FAIXAS_RAZAO[f.k + 1], 4);
          return { x: Math.sqrt(a * z), n: f.n, ok: f.ok,
            dica: 'Esperou ' + (f.k === 0 ? 'menos da metade' : f.k === FAIXAS_RAZAO.length - 2 ? 'mais de ' + FAIXAS_RAZAO[f.k] + '×' :
              'de ' + FAIXAS_RAZAO[f.k] + '× a ' + FAIXAS_RAZAO[f.k + 1] + '×') + ' o degrau' };
        });
        var desenho = function () {
          area.textContent = '';
          pontosLog(area, { titulo: 'Acerto no degrau de ' + rotuloDegrau(i), xmin: 0.35, xmax: 4, piso: piso, alvo: 0.9,
            altura: 170, pontos: pp,
            marcas: [{ x: 0.5, rotulo: '½×' }, { x: 1, rotulo: '1×', forte: true }, { x: 2, rotulo: '2×' }] });
        };
        desenho();
        desenhos.push(desenho);
      });

      corpo.appendChild(el('h3', null, 'Os números'));
      corpo.appendChild(tabela(
        [{ t: 'Degrau', f: function (x) { return rotuloDegrau(x.i); } },
         { t: 'Revisões', n: 1, f: function (x) { return fmt(x.n); } },
         { t: 'Acerto', n: 1, f: function (x) { return x.n ? pct(x.ok / x.n) : '—'; } },
         { t: 'Antes do degrau', n: 1, f: function (x) { return x.an ? pct(x.aok / x.an) + ' de ' + fmt(x.an) : '—'; } },
         { t: 'Depois (até 1,5×)', n: 1, f: function (x) { return x.dn ? pct(x.dok / x.dn) + ' de ' + fmt(x.dn) : '—'; } },
         { t: 'Muito depois', n: 1, f: function (x) { return x.mn ? pct(x.mok / x.mn) + ' de ' + fmt(x.mn) : '—'; } },
         { t: 'Deduzidas', n: 1, f: function (x) { return fmt(x.inf); } }],
        dias.map(function (d, i) {
          var x = { i: i, n: 0, ok: 0, an: 0, aok: 0, dn: 0, dok: 0, mn: 0, mok: 0, inf: 0 };
          linhas.forEach(function (l) {
            if (l.degrau !== i) return;
            var r = (l.dias + 0.5) / d;
            x.n += l.n; x.ok += l.ok;
            if (l.inferido) x.inf += l.n;
            if (r < 1) { x.an += l.n; x.aok += l.ok; } else if (r < 1.5) { x.dn += l.n; x.dok += l.ok; } else { x.mn += l.n; x.mok += l.ok; }
          });
          return x;
        }).filter(function (x) { return x.n; }), 'Nenhuma revisão ainda.'));

      var largura = corpo.clientWidth;
      redesenhar = function () {
        if (Math.abs(corpo.clientWidth - largura) < 8) return;
        largura = corpo.clientWidth;
        desenhos.forEach(function (f) { f(); });
      };
      if (observador) observador.disconnect();
      if (window.ResizeObserver) {
        observador = new ResizeObserver(function () { redesenhar(); });
        observador.observe(corpo);
      }
    }
    montar();
  }

  function desenhar(v, retornos) {
    H.$('secoes').textContent = ''; H.$('blocos').textContent = '';
    H.$('gerado').textContent = new Date(v.geradoEm).toLocaleString('pt-BR');

    var c = v.contas || {}, at = v.atividade || {};
    var s = bloco('geral', 'Visão geral');
    s.appendChild(numeros([[c.total, 'contas'], [c.novas7, 'novas em 7 dias'], [c.novas30, 'novas em 30 dias']]));
    s.appendChild(el('h3', null, 'Quem abriu cada parte do site'));
    s.appendChild(tabela(
      [{ t: 'Parte', f: function (x) { return NOME_APP[x.app] || x.app; } },
       { t: 'Hoje', n: 1, f: function (x) { return fmt(x.hoje); } },
       { t: '7 dias', n: 1, f: function (x) { return fmt(x.semana); } },
       { t: '30 dias', n: 1, f: function (x) { return fmt(x.mes); } }],
      Object.keys(at).map(function (k) { return Object.assign({ app: k }, at[k]); }), 'Nenhum acesso nos últimos 30 dias.'));
    var duas = el('div', 'duas');
    duas.appendChild(barras('Pessoas por dia (30 dias)', diasCompletos(v.ativosPorDia, 30)));
    duas.appendChild(barras('Contas novas por semana (12 semanas)', (c.porSemana || []).map(function (x) {
      return { rotulo: dataCurta(x.semana), valor: Number(x.n) };
    })));
    s.appendChild(el('h3', null, 'Ao longo do tempo'));
    s.appendChild(duas);
    var li = c.linguaInterface || {};
    s.appendChild(el('p', 'apagado pequeno', 'Língua da interface: ' + (Object.keys(li).map(function (k) {
      return (NOME_LINGUA[k] || k) + ' ' + fmt(li[k]);
    }).join(' · ') || '—') + '.'));

    blocoRetornos(retornos);

    var cursos = v.cards || {};
    Object.keys(cursos).sort().forEach(function (codigo) {
      var k = cursos[codigo];
      var b = bloco('cards-' + codigo, 'Cards: ' + (NOME_CURSO[codigo] || codigo));
      b.appendChild(numeros([[k.alunos, 'alunos (já responderam)'], [k.ativos7, 'ativos em 7 dias'], [k.ativos30, 'ativos em 30 dias'],
        [k.respostas, 'respostas'], [k.acerto, '% de acerto'], [k.cardsVistos, 'cards vistos (soma)'], [k.cardsDominados, 'cards dominados (soma)']]));
      var d2 = el('div', 'duas');
      d2.appendChild(barras('Respostas por dia (30 dias)', diasCompletos(k.respostasPorDia, 30)));
      d2.appendChild(barras('Respostas por hora do dia (30 dias)', (k.porHora || []).map(function (n, h) {
        return { rotulo: h + 'h', valor: Number(n), dica: h + 'h: ' + fmt(n) };
      })));
      b.appendChild(el('h3', null, 'Ritmo'));
      b.appendChild(d2);
      b.appendChild(el('h3', null, 'Quem mais estudou'));
      b.appendChild(tabela(
        [{ t: '#', n: 1, f: function (x, i) { return i + 1; } },
         { t: 'Nome', f: function (x) { return x.nome; } },
         { t: 'id', cls: 'id', f: function (x) { return x.id; } },
         { t: 'Vistos', n: 1, f: function (x) { return fmt(x.vistos); } },
         { t: 'Dominados', n: 1, f: function (x) { return fmt(x.dominados); } },
         { t: 'Respostas', n: 1, f: function (x) { return fmt(x.respostas); } },
         { t: 'Última', n: 1, f: function (x) { return dataCurta(x.ultima); } }],
        k.ranking || []));
    });

    var bi = v.biblioteca || {};
    var bb = bloco('biblioteca', 'Biblioteca');
    bb.appendChild(numeros([[bi.leitores, 'leitores com conta'], [bi.leitores7, 'leram em 7 dias'], [bi.leitores30, 'leram em 30 dias'],
      [bi.obrasAbertas, 'obras abertas'], [bi.leiturasConcluidas, 'leituras concluídas']]));
    bb.appendChild(el('p', 'apagado pequeno', 'Só conta quem lê com conta: a leitura sem login fica no navegador e não chega ao banco.'));
    bb.appendChild(el('h3', null, 'Obras mais lidas'));
    bb.appendChild(tabela(
      [{ t: '#', n: 1, f: function (x, i) { return i + 1; } },
       { t: 'Obra', f: function (x) { return x.titulo; } },
       { t: 'Leitores', n: 1, f: function (x) { return fmt(x.leitores); } },
       { t: 'Concluídas', n: 1, f: function (x) { return fmt(x.concluidas); } },
       { t: 'Nos últimos 30 dias', n: 1, f: function (x) { return fmt(x.ultimos30); } }],
      bi.maisLidas || [], 'Nenhuma leitura ainda.'));
    var d3 = el('div', 'duas');
    var esq = el('div'), dir = el('div');
    esq.appendChild(el('h3', null, 'Autores mais lidos'));
    esq.appendChild(tabela(
      [{ t: 'Autor', f: function (x) { return x.autor.replace(/-/g, ' '); } },
       { t: 'Leitores', n: 1, f: function (x) { return fmt(x.leitores); } },
       { t: 'Obras', n: 1, f: function (x) { return fmt(x.obras); } }],
      bi.porAutor || [], 'Nenhuma leitura ainda.'));
    dir.appendChild(el('h3', null, 'Quem mais leu'));
    dir.appendChild(tabela(
      [{ t: 'Nome', f: function (x) { return x.nome; } },
       { t: 'id', cls: 'id', f: function (x) { return x.id; } },
       { t: 'Concluídas', n: 1, f: function (x) { return fmt(x.concluidas); } },
       { t: 'Abertas', n: 1, f: function (x) { return fmt(x.obras); } }],
      bi.ranking || []));
    d3.appendChild(esq); d3.appendChild(dir);
    bb.appendChild(d3);

    var r = v.retorno || {};
    var br = bloco('retorno', 'Retorno dos usuários');
    br.appendChild(numeros([[r.comentarios, 'comentários'], [r.contestacoes, 'contestações'],
      [r.naoAvaliados, 'ainda não avaliados'], [r.esperandoOGere, 'esperando você']]));
    var a = el('a', null, 'Abrir a curadoria'); a.href = '/cards/curadoria/';
    var p = el('p', 'pequeno'); p.appendChild(a); br.appendChild(p);
  }

  async function carregar() {
    H.avisar('aviso', '');
    var res = await Promise.all([sb.schema('conta').rpc('estatisticas'), sb.schema('conta').rpc('retornos')]);
    var r = res[0];
    if (r.error) {
      H.mostrar('carregando', false);
      H.avisar('aviso', r.error.code === 'PT403' ? 'Esta página é só da administração da Taioé.' : H.mensagemDeErro(r.error), 'erro');
      return;
    }
    desenhar(r.data || {}, res[1].error ? null : res[1].data);
    H.mostrar('carregando', false);
    H.mostrar('conteudo', true);
    redesenhar();
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    await carregar();
  })();
  H.$('recarregar').addEventListener('click', carregar);
  window.addEventListener('resize', function () { redesenhar(); });
})();
