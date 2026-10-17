/* /admin/biblia/: a revisão de cada capítulo da Bíblia Taioé (pedido do Gere, 17/10/2026). Ele
   avalia uma a uma as escolhas de tradução, as notas, a divisão e os comentários: aprova, altera
   ou exclui, e explica a mudança, para o Claude melhorar os capítulos seguintes.
   O hub é público: o conteúdo vem de conta.paginas_privadas (slug 'biblia', gerado pelo
   taioe-biblia em dados/paginas/biblia.json do taioe-infra), e as respostas vão para
   conta.respostas_privadas, que só o revisor geral lê e grava. O Claude as lê pelo workflow
   Respostas do taioe-infra. */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();
  var PAGINA = 'biblia';
  var respostas = {};      // item → { decisao, texto, explicacao, atualizado_em, lida }
  var cartoes = [];        // { id, secao, atualizar() }

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null && texto !== '') e.textContent = texto;
    return e;
  }
  // Texto com *itálico*, sem innerHTML.
  function comItalico(e, s) {
    String(s || '').split(/(\*[^*]+\*)/).forEach(function (p) {
      if (/^\*[^*]+\*$/.test(p)) e.appendChild(el('em', null, p.slice(1, -1)));
      else if (p) e.appendChild(document.createTextNode(p));
    });
    return e;
  }
  function paragrafos(cls, s) {
    var d = el('div', cls);
    String(s || '').split(/\n\s*\n/).forEach(function (p) { if (p.trim()) d.appendChild(comItalico(el('p'), p.trim())); });
    return d;
  }
  function seguro(u) { return /^(\/(?!\/)|https:\/\/)/.test(u || '') ? u : ''; }
  function link(href, texto) {
    var a = el('a', null, texto); a.href = href;
    if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function quando(t) {
    var d = new Date(t);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  var NOMES = { aprovar: 'Aprovado', alterar: 'Alterado', excluir: 'Excluir', escolher: 'Escolhido', comentar: 'Comentado' };

  // ------------------------------------------------------------ gravar

  async function gravar(lista) {
    var r = await sb.schema('conta').from('respostas_privadas')
      .upsert(lista.map(function (x) {
        return { pagina: PAGINA, item: x.item, decisao: x.decisao, texto: x.texto || null, explicacao: x.explicacao || null };
      }), { onConflict: 'pagina,item' })
      .select('item, decisao, texto, explicacao, atualizado_em, lida');
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { respostas[x.item] = x; });
    cartoes.forEach(function (c) { c.atualizar(); });
    resumir();
  }

  // ------------------------------------------------------------ um cartão de resposta

  /* opcoes: [{ valor, rotulo, texto (prefill do campo), campo: true|false, select: [...] }]
     Cada cartão tem as opções em botões de rádio, um campo de texto (quando a opção pede), a
     explicação e o botão Gravar. */
  function formulario(itemId, opcoes, secao) {
    var f = el('form', 'resposta');
    var nome = 'r-' + itemId.replace(/[^a-z0-9]/g, '-');
    var radios = el('div', 'opcoes');
    var campo = el('textarea', 'campo'); campo.rows = 4; campo.hidden = true;
    campo.setAttribute('aria-label', 'Novo texto');
    var sel = el('select', 'mover'); sel.hidden = true; sel.setAttribute('aria-label', 'Tema de destino');
    var expl = el('textarea', 'explicacao'); expl.rows = 2;
    expl.placeholder = 'Por quê? (opcional; ajuda a melhorar os próximos capítulos)';
    expl.setAttribute('aria-label', 'Explicação');
    var estado = el('p', 'estado pequeno');
    var botao = el('button', 'botao', 'Gravar'); botao.type = 'submit';

    opcoes.forEach(function (o, i) {
      var l = el('label', 'opcao');
      var r = el('input'); r.type = 'radio'; r.name = nome; r.value = String(i);
      l.appendChild(r);
      var t = el('span', 'opcao-texto'); comItalico(t, o.rotulo); l.appendChild(t);
      if (o.recomendada) l.appendChild(el('span', 'etiqueta', 'recomendada'));
      if (o.nota) l.appendChild(comItalico(el('span', 'opcao-nota'), o.nota));
      r.addEventListener('change', mudou);
      radios.appendChild(l);
    });
    function escolhida() {
      var r = f.querySelector('input[name="' + nome + '"]:checked');
      return r ? opcoes[Number(r.value)] : null;
    }
    function mudou() {
      var o = escolhida();
      campo.hidden = !(o && o.campo);
      sel.hidden = !(o && o.select);
      if (o && o.campo && !campo.value) campo.value = o.texto || '';
      if (o && o.campo) campo.placeholder = o.placeholder || '';
      if (o && o.select) {
        sel.innerHTML = '';
        o.select.forEach(function (s) { var op = el('option', null, s.rotulo); op.value = s.valor; sel.appendChild(op); });
      }
    }
    f.appendChild(radios); f.appendChild(campo); f.appendChild(sel); f.appendChild(expl);
    var pe = el('div', 'pe'); pe.appendChild(botao); pe.appendChild(estado); f.appendChild(pe);

    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var o = escolhida();
      if (!o) { estado.textContent = 'Escolha uma das opções.'; return; }
      var texto = o.select ? 'mover:' + sel.value : (o.campo ? campo.value.trim() : (o.valorTexto || ''));
      if (o.campo && !texto) { estado.textContent = 'Escreva o texto.'; campo.focus(); return; }
      botao.disabled = true; estado.textContent = 'Gravando…';
      try { await gravar([{ item: itemId, decisao: o.valor, texto: texto, explicacao: expl.value.trim() }]); }
      catch (err) { estado.textContent = 'Não gravou: ' + H.mensagemDeErro(err); }
      botao.disabled = false;
    });

    function atualizar() {
      var r = respostas[itemId];
      f.classList.toggle('respondido', !!r);
      if (!r) { estado.textContent = 'Ainda sem resposta.'; return; }
      var i = -1, mover = /^mover:/.test(r.texto || '');
      opcoes.forEach(function (o, k) {
        if (i < 0 && o.valor === r.decisao && (o.valorTexto === undefined || o.valorTexto === r.texto) &&
            (o.valor !== 'alterar' || !!o.select === mover)) i = k;
      });
      if (i < 0) opcoes.forEach(function (o, k) { if (i < 0 && o.valor === r.decisao) i = k; });
      if (i >= 0) { f.querySelector('input[name="' + nome + '"][value="' + i + '"]').checked = true; mudou(); }
      var o = opcoes[i];
      if (o && o.campo) campo.value = r.texto || '';
      if (o && o.select) sel.value = String(r.texto || '').replace(/^mover:/, '');
      expl.value = r.explicacao || '';
      estado.textContent = 'Gravado em ' + quando(r.atualizado_em) + (r.lida ? ' · já aplicado pelo Claude' : ' · o Claude ainda não aplicou');
    }
    cartoes.push({ id: itemId, secao: secao, atualizar: atualizar });
    return f;
  }

  // ------------------------------------------------------------ tipos de item

  function opcoesPadrao(texto, rotuloAlterar) {
    return [
      { valor: 'aprovar', rotulo: 'Aprovar' },
      { valor: 'alterar', rotulo: rotuloAlterar || 'Alterar o texto', campo: true, texto: texto },
      { valor: 'excluir', rotulo: 'Excluir' }
    ];
  }

  function itemNota(x, secao) {
    var c = el('article', 'cartao nota');
    var cab = el('p', 'cartao-ref'); cab.textContent = x.ref + (x.letra ? ' · nota ' + x.letra : '');
    c.appendChild(cab);
    if (x.versiculo) c.appendChild(comItalico(el('p', 'versiculo'), x.versiculo));
    c.appendChild(paragrafos('cartao-texto', x.texto));
    if (x.origem) c.appendChild(el('p', 'apagado pequeno', x.origem));
    c.appendChild(formulario(x.id, opcoesPadrao(x.texto, 'Alterar o texto da nota'), secao));
    return c;
  }

  function itemEscolha(x, secao) {
    var c = el('article', 'cartao escolha');
    c.appendChild(el('h3', null, x.titulo));
    if (x.ref) c.appendChild(el('p', 'cartao-ref', x.ref));
    if (x.contexto) c.appendChild(paragrafos('cartao-texto', x.contexto));
    var ops = (x.opcoes || []).map(function (o) {
      return { valor: 'escolher', valorTexto: o.id, rotulo: o.texto, nota: o.nota, recomendada: o.recomendada };
    });
    ops.push({ valor: 'alterar', rotulo: 'Outra solução', campo: true, texto: '', placeholder: 'Escreva a solução que você prefere' });
    c.appendChild(formulario(x.id, ops, secao));
    return c;
  }

  function itemAvaliacao(x, secao) {
    var c = el('article', 'cartao avaliacao');
    if (x.titulo) c.appendChild(el('h3', null, x.titulo));
    if (x.texto) c.appendChild(paragrafos('cartao-texto', x.texto));
    c.appendChild(formulario(x.id, [
      { valor: 'aprovar', rotulo: x.rotuloAprovar || 'De acordo' },
      { valor: 'comentar', rotulo: 'Quero outra coisa', campo: true, texto: '', placeholder: 'O que você quer' }
    ], secao));
    return c;
  }

  function itemTema(x, secao, temas) {
    var c = el('section', 'cartao tema');
    var cab = el('div', 'tema-cab');
    cab.appendChild(el('h3', null, x.titulo));
    if (x.ref) cab.appendChild(el('p', 'cartao-ref', x.ref));
    if (x.resumo) cab.appendChild(comItalico(el('p', 'cartao-texto'), x.resumo));
    if (x.url) { var p = el('p', 'pequeno'); p.appendChild(link(x.url, 'Ver na página do tema')); cab.appendChild(p); }
    c.appendChild(cab);
    var ft = formulario(x.id, [
      { valor: 'aprovar', rotulo: 'Aprovar o tema (título, resumo e organização)' },
      { valor: 'alterar', rotulo: 'Mudar o título ou o resumo', campo: true, texto: x.titulo + '\n' + (x.resumo || '') },
      { valor: 'excluir', rotulo: 'Excluir o tema (e os comentários dele)' }
    ], secao);
    ft.classList.add('resposta-tema');
    c.appendChild(ft);
    var outros = temas.filter(function (t) { return t.id !== x.id; }).map(function (t) { return { valor: t.id.split(':').pop(), rotulo: t.titulo }; });
    var lista = el('div', 'comentarios');
    (x.comentarios || []).forEach(function (m) {
      var a = el('article', 'cartao comentario');
      a.appendChild(paragrafos('cartao-texto', m.texto));
      var aut = el('p', 'autoria');
      aut.appendChild(el('b', null, m.autor));
      if (m.sobre) aut.appendChild(document.createTextNode(', ' + m.sobre));
      aut.appendChild(el('br'));
      aut.appendChild(el('i', null, m.obra));
      if (m.passagem) aut.appendChild(document.createTextNode(', ' + m.passagem));
      if (seguro(m.link)) { aut.appendChild(document.createTextNode(' · ')); aut.appendChild(link(m.link, 'original')); }
      a.appendChild(aut);
      if (m.original) {
        var det = el('details', 'original');
        det.appendChild(el('summary', null, 'Ver o original'));
        det.appendChild(paragrafos('original-texto', m.original));
        a.appendChild(det);
      }
      var ops = opcoesPadrao(m.texto, 'Alterar a tradução');
      if (outros.length) ops.splice(2, 0, { valor: 'alterar', rotulo: 'Mover para outro tema', select: outros });
      a.appendChild(formulario(m.id, ops, secao));
      lista.appendChild(a);
    });
    c.appendChild(lista);
    return c;
  }

  // ------------------------------------------------------------ seções

  function secao(cap, s) {
    var sid = cap.id + '--' + s.id;
    var w = el('section', 'secao'); w.id = sid;
    var h = el('h2', null, s.titulo); w.appendChild(h);
    var cont = el('p', 'contagem pequeno'); w.appendChild(cont);
    if (s.texto) w.appendChild(paragrafos('secao-texto', s.texto));
    var itens = s.itens || [];
    itens.forEach(function (x) {
      if (x.tipo === 'nota') w.appendChild(itemNota(x, sid));
      else if (x.tipo === 'escolha') w.appendChild(itemEscolha(x, sid));
      else if (x.tipo === 'tema') w.appendChild(itemTema(x, sid, itens));
      else w.appendChild(itemAvaliacao(x, sid));
    });
    var b = el('button', 'botao secundario', 'Aprovar todos os que ficaram sem resposta nesta seção');
    b.type = 'button';
    b.addEventListener('click', async function () {
      var faltam = cartoes.filter(function (c) { return c.secao === sid && !respostas[c.id]; });
      if (!faltam.length) { b.textContent = 'Nada sem resposta nesta seção'; return; }
      var escolhas = faltam.filter(function (c) { return /:escolha:/.test(c.id); }).length;
      if (escolhas) { alert('Há ' + escolhas + ' escolha(s) de tradução sem resposta: essas precisam de uma opção.'); return; }
      if (!confirm('Aprovar ' + faltam.length + ' item(ns) sem resposta em «' + s.titulo + '»?')) return;
      b.disabled = true;
      try { await gravar(faltam.map(function (c) { return { item: c.id, decisao: 'aprovar' }; })); }
      catch (err) { alert('Não gravou: ' + H.mensagemDeErro(err)); }
      b.disabled = false;
    });
    var pe = el('p', 'pe-secao'); pe.appendChild(b); w.appendChild(pe);
    var contador = { atualizar: function () {
      var meus = cartoes.filter(function (c) { return c.secao === sid; });
      var feitos = meus.filter(function (c) { return respostas[c.id]; }).length;
      cont.textContent = feitos + ' de ' + meus.length + ' respondidos';
      cont.classList.toggle('completo', feitos === meus.length);
    } };
    cartoes.push({ id: null, secao: null, atualizar: contador.atualizar });
    return w;
  }

  function resumir() {
    var todos = cartoes.filter(function (c) { return c.id; });
    var feitos = todos.filter(function (c) { return respostas[c.id]; }).length;
    var naoLidos = Object.keys(respostas).filter(function (k) { return !respostas[k].lida; }).length;
    H.$('resumo-geral').textContent = (todos.length - feitos ? 'Faltam ' + (todos.length - feitos) + ' de ' + todos.length + ' itens.' : 'Todos os ' + todos.length + ' itens têm resposta.') +
      (naoLidos ? ' ' + naoLidos + ' resposta(s) esperam o Claude aplicar.' : '');
  }

  async function carregar() {
    var r = await sb.schema('conta').from('paginas_privadas').select('titulo, dados, atualizado_em').eq('slug', PAGINA).maybeSingle();
    H.mostrar('carregando', false);
    if (r.error) { H.avisar('aviso', H.mensagemDeErro(r.error), 'erro'); return; }
    if (!r.data) { H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }
    var rr = await sb.schema('conta').from('respostas_privadas').select('item, decisao, texto, explicacao, atualizado_em, lida').eq('pagina', PAGINA);
    if (rr.error) { H.avisar('aviso', H.mensagemDeErro(rr.error), 'erro'); return; }
    (rr.data || []).forEach(function (x) { respostas[x.item] = x; });

    var d = r.data.dados || {};
    document.title = r.data.titulo + ' · Taioé';
    H.$('titulo').textContent = r.data.titulo;
    H.$('intro').textContent = d.intro || '';
    H.$('atualizado').textContent = new Date(r.data.atualizado_em).toLocaleDateString('pt-BR');
    var raiz = H.$('capitulos'), indice = H.$('indice');
    (d.capitulos || []).forEach(function (cap) {
      var w = el('section', 'capitulo');
      var h = el('h2', 'titulo-cap', cap.rotulo); w.appendChild(h);
      var p = el('p', 'pequeno');
      if (seguro(cap.url)) p.appendChild(link(cap.url, 'Abrir o capítulo'));
      if (cap.estado) p.appendChild(document.createTextNode(' · ' + cap.estado));
      w.appendChild(p);
      var nav = el('p', 'indice-cap');
      (cap.secoes || []).forEach(function (s) {
        var a = el('a', null, s.titulo); a.href = '#' + cap.id + '--' + s.id; nav.appendChild(a);
        w.appendChild(secao(cap, s));
      });
      indice.appendChild(nav);
      raiz.appendChild(w);
    });
    cartoes.forEach(function (c) { c.atualizar(); });
    resumir();
    H.mostrar('conteudo', true);
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    await carregar();
  })();
})();
