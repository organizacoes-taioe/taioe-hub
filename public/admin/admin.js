/* /admin/: os caminhos para as páginas internas da Taioé, as prévias e o que espera o Gere
   (pedido dele, 17/10/2026). O hub é público, então a lista não fica aqui: vem de
   conta.paginas_privadas (slug 'admin', em dados/paginas/admin.json do taioe-infra), que só o
   revisor geral lê; as outras contas recebem uma lista vazia. O banco aceita um só revisor geral
   (índice conta.papeis_um_revisor_geral), e a página mostra o email da conta que entrou. */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null && texto !== '') e.textContent = texto;
    return e;
  }
  // Só caminhos do próprio site ou https.
  function seguro(u) { return /^(\/(?!\/)|https:\/\/)/.test(u || '') ? u : ''; }

  // Quantos itens da curadoria esperam o Gere (comentários e contestações marcados para ele).
  async function contarCuradoria(alvo) {
    var tabelas = ['comentarios', 'contestacoes'], n = 0;
    for (var i = 0; i < tabelas.length; i++) {
      var r = await sb.schema('cards').from(tabelas[i]).select('id', { count: 'exact', head: true }).eq('para_gere', true);
      if (r.error) return;
      n += r.count || 0;
    }
    alvo.textContent = n ? (n === 1 ? '1 espera você' : n + ' esperam você') : 'nada esperando';
    alvo.hidden = false;
    if (n) alvo.classList.add('espera');
  }

  // Quantos itens de uma página de revisão da Bíblia Taioé ainda não têm resposta dele
  // (/admin/biblia/ e /admin/biblia-comentarios/; o slug é o valor de «contar»).
  async function contarBiblia(alvo, slug) {
    var r = await sb.schema('conta').from('paginas_privadas').select('dados').eq('slug', slug).maybeSingle();
    if (r.error || !r.data) return;
    var ids = [];
    ((r.data.dados || {}).capitulos || []).forEach(function (c) {
      (c.secoes || []).forEach(function (s) {
        (s.itens || []).forEach(function (i) { if (i.tipo !== 'casos') ids.push(i.id); (i.comentarios || []).forEach(function (m) { ids.push(m.id); }); });
      });
    });
    var feitos = {};
    // Em páginas de 1000: é o máximo que a API devolve de uma vez.
    for (var de = 0; ; de += 1000) {
      var rr = await sb.schema('conta').from('respostas_privadas').select('item').eq('pagina', slug).order('item').range(de, de + 999);
      if (rr.error) return;
      (rr.data || []).forEach(function (x) { feitos[x.item] = true; });
      if ((rr.data || []).length < 1000) break;
    }
    var n = ids.filter(function (i) { return !feitos[i]; }).length;
    alvo.textContent = n ? (n === 1 ? '1 espera você' : n + ' esperam você') : 'nada esperando';
    alvo.hidden = false;
    if (n) alvo.classList.add('espera');
  }

  function item(x) {
    var w = el('div', 'item'), href = seguro(x.href);
    var a = el(href ? 'a' : 'div', 'caminho');
    if (href) a.href = href;
    var nome = el('span', 'caminho-nome', x.titulo);
    if (x.previa) nome.appendChild(el('span', 'etiqueta', 'prévia'));
    if (x.contar === 'curadoria' || x.contar === 'biblia' || x.contar === 'biblia-comentarios') {
      var c = el('span', 'etiqueta'); c.hidden = true; nome.appendChild(c);
      if (x.contar === 'curadoria') contarCuradoria(c); else contarBiblia(c, x.contar);
    }
    a.appendChild(nome);
    if (x.texto) a.appendChild(el('span', 'caminho-texto', x.texto));
    w.appendChild(a);
    var extras = (x.extras || []).filter(function (e) { return seguro(e.href); });
    if (extras.length) {
      var p = el('p', 'extras');
      extras.forEach(function (e) {
        var l = el('a', null, e.texto); l.href = seguro(e.href);
        p.appendChild(l);
      });
      w.appendChild(p);
    }
    return w;
  }

  function grupo(g) {
    var s = el('section', 'grupo');
    s.appendChild(el('h2', null, g.titulo));
    if (g.itens && g.itens.length) {
      var nav = el('nav', 'caminhos'); nav.setAttribute('aria-label', g.titulo);
      g.itens.forEach(function (x) { nav.appendChild(item(x)); });
      s.appendChild(nav);
    }
    if (g.lista && g.lista.length) {
      var ul = el('ul');
      g.lista.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      s.appendChild(ul);
    }
    if (g.vazio) s.appendChild(el('p', 'vazio', g.vazio));
    return s;
  }

  async function carregar(sessao) {
    var r = await sb.schema('conta').from('paginas_privadas')
      .select('titulo, dados, atualizado_em').eq('slug', 'admin').maybeSingle();
    H.mostrar('carregando', false);
    if (r.error) { H.avisar('aviso', H.mensagemDeErro(r.error), 'erro'); return; }
    if (!r.data) { H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }
    var d = r.data.dados || {};
    document.title = r.data.titulo + ' · Taioé';
    H.$('titulo').textContent = r.data.titulo;
    H.$('intro').textContent = d.intro || '';
    H.$('email').textContent = sessao.user.email || '';
    H.$('atualizado').textContent = new Date(r.data.atualizado_em).toLocaleDateString('pt-BR');
    var raiz = H.$('grupos');
    (d.grupos || []).forEach(function (g) { raiz.appendChild(grupo(g)); });
    H.mostrar('conteudo', true);
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    await carregar(sessao);
  })();
})();
