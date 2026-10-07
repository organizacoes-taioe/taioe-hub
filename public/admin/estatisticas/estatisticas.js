/* /admin/estatisticas/: os números de uso da Taioé, só para o revisor geral (pedido do Gere,
   07/10/2026). Tudo vem de uma chamada, conta.estatisticas(), que recusa (PT403) qualquer outra
   conta. A CSP do hub não aceita estilo nem script no HTML: a página se monta com o DOM, e a
   altura das barras vai por element.style. */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();
  var NOME_CURSO = { 'es-pt': 'Espanhol (para quem fala português)', 'en-pt': 'Inglês (para quem fala português)',
    'es-en': 'Espanhol (para quem fala inglês)', 'en-es': 'Inglês (para quem fala espanhol)',
    'pt-es': 'Português (para quem fala espanhol)', 'pt-en': 'Português (para quem fala inglês)' };
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

  function desenhar(v) {
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
    var r = await sb.schema('conta').rpc('estatisticas');
    if (r.error) {
      H.mostrar('carregando', false);
      H.avisar('aviso', r.error.code === 'PT403' ? 'Esta página é só da administração da Taioé.' : H.mensagemDeErro(r.error), 'erro');
      return;
    }
    desenhar(r.data || {});
    H.mostrar('carregando', false);
    H.mostrar('conteudo', true);
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    await carregar();
  })();
  H.$('recarregar').addEventListener('click', carregar);
})();
