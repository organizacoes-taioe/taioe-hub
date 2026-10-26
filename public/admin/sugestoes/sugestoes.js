/* /admin/sugestoes/ (só o revisor geral): os próximos livros da Biblioteca, uma lista por categoria,
   na ordem de prioridade que o Claude propõe (pedido do Gere, 26/10/2026). Em cima, fixa, a barra
   com a volta à Administração e a categoria, como em /admin/pendencias/.
   Cada livro tem «Pedir» e «Não quero», e um «Por quê?» opcional. A resposta grava sozinha em
   conta.respostas_privadas (pagina 'sugestoes'; pedir = 'escolher', com texto 'pedir@<hora do
   clique>', que guarda a ordem dos pedidos; não quero = 'excluir') e fica no lugar até recarregar,
   para ele escrever o porquê ou desfazer. Depois vai para o fim da categoria, em «Pedidos» (o que
   ele pediu, até entrar no ar, com a posição na fila única de /admin/pedidos/) ou em «Tirados da lista».
   Na revisão (rotinas/sugestoes.md), o Claude põe o pedido na fila de trabalho, tira o livro da
   lista, reordena o resto e marca a resposta como lida. A lista vem de conta.paginas_privadas
   (slug 'sugestoes', em dados/paginas/sugestoes.json do taioe-infra). */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();
  var PAGINA = 'sugestoes', CHAVE = 'hub:sugestoes-categoria', ESPERA = 900;   // ms depois da última tecla
  var dados = { categorias: [] }, respostas = {}, atual = null, raizes = {};

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
  function seguro(u) { return /^(\/(?!\/)|https:\/\/)/.test(u || '') ? u : ''; }
  function quando(t) {
    var d = new Date(t);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dia(t) { return t ? new Date(t + (/T/.test(t) ? '' : 'T12:00:00')).toLocaleDateString('pt-BR') : ''; }

  // A resposta que ainda vale para a página: as já lidas o Claude aplicou (o livro saiu da lista).
  function aberta(id) { var r = respostas[id]; return r && !r.lida ? r : null; }
  function horaDoPedido(r) { var m = /^pedir@(.+)$/.exec(r.texto || ''); return m ? m[1] : r.atualizado_em; }
  function categoria(id) { return dados.categorias.filter(function (c) { return c.id === id; })[0]; }

  // ------------------------------------------------------------ banco

  async function carregar() {
    var p = await sb.schema('conta').from('paginas_privadas').select('dados').eq('slug', PAGINA).maybeSingle();
    if (p.error) throw p.error;
    dados = (p.data && p.data.dados) || { categorias: [] };
    var r = await sb.schema('conta').from('respostas_privadas').select('item, decisao, texto, explicacao, atualizado_em, lida')
      .eq('pagina', PAGINA).eq('lida', false).limit(1000);
    if (r.error) throw r.error;
    respostas = {};
    (r.data || []).forEach(function (x) { respostas[x.item] = x; });
  }

  async function gravar(id, decisao, texto, explicacao) {
    var r = await sb.schema('conta').from('respostas_privadas')
      .upsert([{ pagina: PAGINA, item: id, decisao: decisao, texto: texto || null, explicacao: explicacao || null }], { onConflict: 'pagina,item' })
      .select('item, decisao, texto, explicacao, atualizado_em, lida');
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { respostas[x.item] = x; });
  }

  async function desfazer(id) {
    var r = await sb.schema('conta').from('respostas_privadas').delete().eq('pagina', PAGINA).eq('item', id).eq('lida', false);
    if (r.error) throw r.error;
    delete respostas[id];
  }

  // ------------------------------------------------------------ um livro

  function ficha(x) {
    return [x.autor, x.ano, x.lingua, x.tamanho].filter(Boolean).join(' · ');
  }

  // O cartão de um livro da lista: os dados, a linha de por que está ali e os botões. Depois do
  // clique, no lugar dos botões: o que foi gravado, «Desfazer» e o «Por quê?».
  function cartaoLivro(cat, x) {
    var c = el('article', 'cartao livro');
    c.setAttribute('data-id', x.id);
    var h = el('h3');
    h.appendChild(el('span', 'posicao'));
    comItalico(h.appendChild(el('span', 'titulo-livro')), x.titulo);
    c.appendChild(h);
    var f = ficha(x);
    if (f) c.appendChild(el('p', 'ficha', f));
    if (x.linha) c.appendChild(comItalico(el('p', 'linha-livro'), x.linha));
    if (x.aviso) c.appendChild(comItalico(el('p', 'aviso-livro'), x.aviso));
    if (seguro(x.link)) {
      var pl = el('p', 'link-livro pequeno'), a = el('a', null, x.rotuloLink || 'ver o texto');
      a.href = seguro(x.link); a.target = '_blank'; a.rel = 'noopener noreferrer';
      pl.appendChild(a); c.appendChild(pl);
    }

    var acoes = el('div', 'acoes');
    var pedir = el('button', null, 'Pedir'); pedir.type = 'button';
    var naoQuero = el('button', 'secundario', 'Não quero'); naoQuero.type = 'button';
    acoes.appendChild(pedir); acoes.appendChild(naoQuero);
    c.appendChild(acoes);
    var falha = el('p', 'falha-livro pequeno'); falha.hidden = true;

    var depois = el('div', 'depois'); depois.hidden = true;
    var linhaEstado = el('p', 'estado-livro');
    var marca = el('span', 'marca-resposta'), estado = el('span', 'estado pequeno');
    var volta = el('button', 'ligacao pequeno', 'Desfazer'); volta.type = 'button';
    linhaEstado.appendChild(marca); linhaEstado.appendChild(estado); linhaEstado.appendChild(volta);
    var expl = el('textarea', 'explicacao'); expl.rows = 2; expl.maxLength = 4000;
    expl.placeholder = 'Por quê? (opcional)'; expl.setAttribute('aria-label', 'Por quê?');
    depois.appendChild(linhaEstado); depois.appendChild(expl);
    c.appendChild(depois);
    c.appendChild(falha);
    // O erro aparece no próprio cartão: o aviso do topo pode estar fora da tela.
    function errou(texto, e) { falha.textContent = e ? texto + ': ' + H.mensagemDeErro(e) : ''; falha.hidden = !e; }

    var gravando = false, deNovo = false, relogio = null;

    function mostrar() {
      var r = aberta(x.id);
      c.classList.toggle('respondido', !!r);
      c.classList.toggle('recusado', !!r && r.decisao === 'excluir');
      acoes.hidden = !!r; depois.hidden = !r;
      if (!r) return;
      marca.textContent = r.decisao === 'excluir' ? 'Fora da lista' : 'Pedido';
      estado.textContent = ' · gravado em ' + quando(r.atualizado_em) + ' · ';
      if (document.activeElement !== expl) expl.value = r.explicacao || '';
    }

    async function responder(decisao) {
      if (gravando) return;
      gravando = true; pedir.disabled = naoQuero.disabled = true;
      try {
        await gravar(x.id, decisao, decisao === 'escolher' ? 'pedir@' + new Date().toISOString() : null, '');
        errou();
      } catch (e) { errou('Não gravou', e); }
      gravando = false; pedir.disabled = naoQuero.disabled = false;
      mostrar(); resumir();
    }
    pedir.addEventListener('click', function () { responder('escolher'); });
    naoQuero.addEventListener('click', function () { responder('excluir'); });

    // O porquê grava um pouco depois da última tecla; uma gravação por vez.
    async function salvarPorque() {
      clearTimeout(relogio); relogio = null;
      var r = aberta(x.id);
      if (!r) return;
      if (gravando) { deNovo = true; return; }
      gravando = true; estado.textContent = ' · gravando… · ';
      try { await gravar(x.id, r.decisao, r.texto, expl.value.trim()); errou(); }
      catch (e) { errou('Não gravou o porquê (tento de novo na próxima tecla)', e); }
      gravando = false;
      if (deNovo) { deNovo = false; salvarPorque(); return; }
      mostrar();
    }
    expl.addEventListener('input', function () { estado.textContent = ' · gravando… · '; clearTimeout(relogio); relogio = setTimeout(salvarPorque, ESPERA); });
    expl.addEventListener('blur', function () { if (relogio) salvarPorque(); });

    volta.addEventListener('click', async function () {
      if (gravando) return;
      gravando = true; volta.disabled = true;
      try { await desfazer(x.id); errou(); }
      catch (e) { errou('Não desfez', e); }
      gravando = false; volta.disabled = false;
      clearTimeout(relogio); relogio = null; expl.value = '';
      mostrar(); resumir();
    });

    mostrar();
    return c;
  }

  // ------------------------------------------------------------ uma categoria

  // Os livros da lista, sem os que ele já respondeu antes de abrir a página (esses vão para o fim).
  function naLista(cat) { return (cat.itens || []).filter(function (x) { return !aberta(x.id) || x._aqui; }); }
  function contar(cat) { return (cat.itens || []).filter(function (x) { return !aberta(x.id); }).length; }

  // A posição de cada livro ainda sem resposta; o respondido fica sem número.
  function renumerar(cat) {
    var raiz = raizes[cat.id];
    if (!raiz) return;
    var n = 0;
    Array.prototype.forEach.call(raiz.querySelectorAll('.lista .livro'), function (c) {
      c.querySelector('.posicao').textContent = c.classList.contains('respondido') ? '' : (++n) + '.';
    });
  }

  // O fim da categoria: o que ele pediu (os da fila de trabalho e os novos, na ordem dos pedidos) e
  // o que tirou da lista. Os novos ainda podem ser desfeitos.
  function fim(cat, raiz) {
    var novosPedidos = [], novosFora = [];
    (cat.itens || []).forEach(function (x) {
      var r = aberta(x.id);
      if (!r || x._aqui) return;
      (r.decisao === 'excluir' ? novosFora : novosPedidos).push({ x: x, r: r });
    });
    novosPedidos.sort(function (a, b) { return horaDoPedido(a.r) < horaDoPedido(b.r) ? -1 : 1; });

    var pedidos = cat.pedidos || [];
    if (pedidos.length || novosPedidos.length) {
      var det = el('details', 'respondidas pedidos');
      det.appendChild(el('summary', null, 'Pedidos (' + (pedidos.length + novosPedidos.length) + ')'));
      var pf = el('p', 'ir-fila pequeno'), af = el('a', null, 'Ver a fila de todos os pedidos e mudar a ordem');
      af.href = '/admin/pedidos/'; pf.appendChild(af); det.appendChild(pf);
      var pos = posicoesNaFila();
      var ul = el('ul', 'lista-fim');
      pedidos.forEach(function (p) {
        var li = el('li');
        comItalico(li.appendChild(el('span', 'titulo-livro')), p.titulo);
        if (p.autor) li.appendChild(document.createTextNode(', ' + p.autor));
        var s = [TaioePedidos.emAndamento(p) ? p.estado : pos[p.id] ? 'nº ' + pos[p.id] + ' na fila' : '', p.desde ? 'pedido em ' + dia(p.desde) : ''].filter(Boolean).join(' · ');
        if (s) li.appendChild(el('span', 'ficha', ' · ' + s));
        ul.appendChild(li);
      });
      novosPedidos.forEach(function (o) { ul.appendChild(itemNovo(cat, o, pos[o.x.id])); });
      det.appendChild(ul);
      raiz.appendChild(det);
    }

    var fora = cat.fora || [];
    if (fora.length || novosFora.length) {
      var d2 = el('details', 'respondidas fora');
      d2.appendChild(el('summary', null, 'Tirados da lista (' + (fora.length + novosFora.length) + ')'));
      var ul = el('ul', 'lista-fim');
      novosFora.forEach(function (o) { ul.appendChild(itemNovo(cat, o)); });
      fora.forEach(function (p) {
        var li = el('li');
        comItalico(li.appendChild(el('span', 'titulo-livro')), p.titulo);
        if (p.autor) li.appendChild(document.createTextNode(', ' + p.autor));
        if (p.motivo) li.appendChild(comItalico(el('span', 'ficha'), ' · ' + p.motivo));
        ul.appendChild(li);
      });
      d2.appendChild(ul);
      raiz.appendChild(d2);
    }
  }

  // A posição de cada pedido na fila única de /admin/pedidos/ (ordem.js): id → 1, 2, 3…
  function posicoesNaFila() {
    var pos = {};
    TaioePedidos.montar(dados, respostas).fila.forEach(function (p, i) { pos[p.id] = i + 1; });
    return pos;
  }

  // Um pedido (ou uma recusa) que o Claude ainda não viu: dá para desfazer, e o livro volta à lista.
  function itemNovo(cat, o, posicao) {
    var li = el('li', 'novo');
    comItalico(li.appendChild(el('span', 'titulo-livro')), o.x.titulo);
    if (o.x.autor) li.appendChild(document.createTextNode(', ' + o.x.autor));
    var data = o.r.decisao === 'excluir' ? o.r.atualizado_em : horaDoPedido(o.r);
    li.appendChild(el('span', 'ficha', (posicao ? ' · nº ' + posicao + ' na fila' : '') + ' · em ' + quando(data) + ' · o Claude ainda não viu · '));
    var b = el('button', 'ligacao pequeno', 'Desfazer'); b.type = 'button';
    b.addEventListener('click', async function () {
      b.disabled = true;
      try { await desfazer(o.x.id); H.avisar('aviso', ''); }
      catch (e) { b.disabled = false; H.avisar('aviso', 'Não desfez: ' + H.mensagemDeErro(e), 'erro'); return; }
      remontar(cat);
    });
    li.appendChild(b);
    if (o.r.explicacao) li.appendChild(el('span', 'porque-dado', o.r.explicacao));
    return li;
  }

  function montar(cat) {
    var raiz = el('div', 'categoria'); raiz.setAttribute('data-categoria', cat.id);
    var lista = el('div', 'lista');
    naLista(cat).forEach(function (x) { lista.appendChild(cartaoLivro(cat, x)); });
    if (!lista.firstChild) lista.appendChild(el('p', 'vazio', 'Nenhum livro nesta lista por enquanto.'));
    raiz.appendChild(lista);
    fim(cat, raiz);
    return raiz;
  }

  // Monta de novo (depois de desfazer um pedido que já estava no fim), no mesmo lugar.
  function remontar(cat) {
    var velha = raizes[cat.id], nova = montar(cat);
    nova.hidden = velha.hidden;
    velha.parentNode.replaceChild(nova, velha);
    raizes[cat.id] = nova;
    renumerar(cat); resumir();
  }

  // ------------------------------------------------------------ barra do topo

  function pedidosDe(cat) {
    return (cat.pedidos || []).length + (cat.itens || []).filter(function (x) { var r = aberta(x.id); return r && r.decisao === 'escolher'; }).length;
  }

  function resumir() {
    var sel = H.$('categoria');
    dados.categorias.forEach(function (cat, k) { sel.options[k].textContent = cat.rotulo + ' (' + contar(cat) + ')'; });
    var cat = categoria(atual);
    if (!cat) { H.$('contagem').textContent = ''; return; }
    renumerar(cat);
    var n = contar(cat), p = pedidosDe(cat);
    H.$('contagem').textContent = (n === 1 ? '1 na lista' : n + ' na lista') + (p ? ' · ' + (p === 1 ? '1 pedido' : p + ' pedidos') : '');
  }

  function mostrar(id) {
    var cat = categoria(id) || dados.categorias[0];
    if (!cat) return;
    atual = cat.id;
    try { localStorage.setItem(CHAVE, cat.id); } catch (e) {}
    if (location.hash !== '#' + cat.id) history.replaceState(null, '', '#' + cat.id);
    H.$('categoria').value = cat.id;
    document.title = 'Sugestões: ' + cat.rotulo + ' · Taioé';
    if (!raizes[cat.id]) {
      // Os livros que ele responder daqui em diante ficam no lugar até recarregar a página.
      (cat.itens || []).forEach(function (x) { x._aqui = !aberta(x.id); });
      raizes[cat.id] = montar(cat);
      H.$('categorias').appendChild(raizes[cat.id]);
    }
    Object.keys(raizes).forEach(function (k) { raizes[k].hidden = k !== cat.id; });
    resumir();
    window.scrollTo(0, 0);
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    var pode = await sb.schema('conta').rpc('tem_papel', { papel: 'revisor', escopo: '*' });
    if (pode.error || !pode.data) { H.mostrar('carregando', false); H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }
    try { await carregar(); }
    catch (e) { H.mostrar('carregando', false); H.avisar('aviso', H.mensagemDeErro(e), 'erro'); return; }
    H.mostrar('carregando', false);
    if (!dados.categorias.length) { H.avisar('aviso', 'A lista ainda não foi publicada.', 'erro'); return; }

    var sel = H.$('categoria');
    dados.categorias.forEach(function (cat) { var o = el('option', null, cat.rotulo); o.value = cat.id; sel.appendChild(o); });
    sel.addEventListener('change', function () { mostrar(sel.value); });
    window.addEventListener('hashchange', function () { var c = categoria(location.hash.slice(1)); if (c && c.id !== atual) mostrar(c.id); });
    H.mostrar('barra', true);

    var guardado = '';
    try { guardado = localStorage.getItem(CHAVE) || ''; } catch (e) {}
    mostrar([location.hash.slice(1), guardado].filter(categoria)[0]);
  })();
})();
