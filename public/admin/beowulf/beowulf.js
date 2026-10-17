/* /admin/beowulf/: pinturas e ilustrações do Beowulf ao longo dos séculos, para planejar a capa
   de um livro (pedido do Gere, 16/10/2026). O hub é público, então o conteúdo não fica aqui: vem
   de conta.paginas_privadas (slug 'beowulf'), que só o revisor geral lê; as outras contas recebem
   uma lista vazia. As miniaturas vêm dos sites de origem (a CSP desta página aceita img-src https:). */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente();
  var obras = [], periodos = [];

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null && texto !== '') e.textContent = texto;
    return e;
  }
  function link(href, texto) {
    var a = el('a', null, texto);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }
  function seguro(u) { return /^https:\/\//.test(u || '') ? u : ''; }

  /* Do Wikimedia, a miniatura de 500 px em vez do original (que pode ter dezenas de MB);
     se a miniatura não existir (imagem menor que isso), cai no original. */
  function miniatura(u) {
    var m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/(commons|[a-z]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/.exec(u);
    if (!m || /\.(svg|tiff?|pdf|djvu)$/i.test(m[4])) return u;
    return 'https://upload.wikimedia.org/wikipedia/' + m[1] + '/thumb/' + m[2] + '/' + m[3] + '/' + m[4] + '/500px-' + m[4];
  }

  function selo(dp) {
    var v = String(dp || '').toLowerCase();
    var tipo = /^sim/.test(v) ? 'sim' : /^n[aã]o/.test(v) ? 'nao' : 'incerto';
    var txt = { sim: 'Domínio público', nao: 'Com direitos', incerto: 'Direitos incertos' }[tipo];
    return el('span', 'selo ' + tipo, txt);
  }

  function cartao(o) {
    var c = el('article', 'obra');
    var img = seguro(o.imagem), pag = seguro(o.link);
    var quadro = el('div', 'quadro');
    if (img) {
      var a = el('a'); a.href = pag || img; a.target = '_blank'; a.rel = 'noopener noreferrer';
      var i = el('img');
      i.loading = 'lazy'; i.decoding = 'async'; i.referrerPolicy = 'no-referrer';
      i.alt = o.titulo_pt || o.titulo || '';
      var mini = seguro(o.miniatura) || miniatura(img);
      i.addEventListener('error', function () {
        if (i.src !== img && mini !== img) { i.src = img; return; }
        quadro.classList.add('sem'); quadro.textContent = 'A imagem não carregou aqui; abra o link.';
      });
      i.src = mini;
      a.appendChild(i); quadro.appendChild(a);
    } else {
      quadro.classList.add('sem'); quadro.textContent = 'Sem miniatura; abra o link.';
    }
    c.appendChild(quadro);

    var t = el('div', 'texto');
    t.appendChild(el('h3', null, o.titulo_pt || o.titulo));
    if (o.titulo && o.titulo_pt && o.titulo !== o.titulo_pt) t.appendChild(el('p', 'original', o.titulo));
    var quem = el('p', 'quem');
    quem.appendChild(el('b', null, o.artista || 'Autor desconhecido'));
    if (o.ano) quem.appendChild(document.createTextNode(' · ' + o.ano));
    t.appendChild(quem);
    var meta = el('p', 'meta');
    if (o.tecnica) meta.appendChild(el('span', null, o.tecnica));
    meta.appendChild(selo(o.dominio_publico));
    t.appendChild(meta);
    if (o.cena) t.appendChild(el('p', 'cena', o.cena));
    if (o.onde) t.appendChild(el('p', 'onde', o.onde));
    if (o.obs) t.appendChild(el('p', 'obs', o.obs));
    var ls = el('p', 'links');
    if (pag) ls.appendChild(link(pag, 'Ver a obra'));
    if (img) ls.appendChild(link(img, 'Imagem original'));
    t.appendChild(ls);
    c.appendChild(t);
    return c;
  }

  function casa(o, q) {
    if (H.$('so-dp').checked && !/^sim/i.test(o.dominio_publico || '')) return false;
    if (H.$('so-img').checked && !seguro(o.imagem)) return false;
    if (!q) return true;
    return [o.titulo, o.titulo_pt, o.artista, o.ano, o.tecnica, o.cena, o.onde, o.obs]
      .join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0;
  }

  function desenhar() {
    var q = H.$('busca').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var blocos = H.$('blocos'), nav = H.$('secoes'), total = 0;
    blocos.textContent = ''; nav.textContent = '';
    periodos.forEach(function (p) {
      var lista = obras.filter(function (o) {
        var a = Number(o.ano_ordem) || 0;
        return a >= p.de && a <= p.ate && casa(o, q);
      }).sort(function (x, y) { return (Number(x.ano_ordem) || 0) - (Number(y.ano_ordem) || 0); });
      if (!lista.length) return;
      total += lista.length;
      var na = el('a', null, p.titulo + ' (' + lista.length + ')'); na.href = '#' + p.id; nav.appendChild(na);
      var b = el('section', 'bloco'); b.id = p.id;
      b.appendChild(el('h2', null, p.titulo));
      if (p.nota) b.appendChild(el('p', 'apagado pequeno', p.nota));
      var g = el('div', 'grade');
      lista.forEach(function (o) { g.appendChild(cartao(o)); });
      b.appendChild(g);
      blocos.appendChild(b);
    });
    H.$('contagem').textContent = total + (total === 1 ? ' obra' : ' obras');
    if (!total) blocos.appendChild(el('p', 'vazio', 'Nada com esses filtros.'));
  }

  function destaques(d) {
    if (!d || !d.length) return;
    var b = el('section', 'bloco destaques'); b.id = 'destaques';
    b.appendChild(el('h2', null, 'Para a capa: por onde começar'));
    var ul = el('ul');
    d.forEach(function (x) { ul.appendChild(el('li', null, x)); });
    b.appendChild(ul);
    H.$('blocos').parentNode.insertBefore(b, H.$('secoes'));
  }

  async function carregar() {
    var r = await sb.schema('conta').from('paginas_privadas')
      .select('titulo, dados, atualizado_em').eq('slug', 'beowulf').maybeSingle();
    H.mostrar('carregando', false);
    if (r.error) { H.avisar('aviso', H.mensagemDeErro(r.error), 'erro'); return; }
    if (!r.data) { H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }
    var d = r.data.dados || {};
    document.title = r.data.titulo + ' · Taioé';
    H.$('titulo').textContent = r.data.titulo;
    H.$('intro').textContent = d.intro || '';
    H.$('atualizado').textContent = new Date(r.data.atualizado_em).toLocaleDateString('pt-BR');
    obras = d.obras || [];
    periodos = d.periodos || [{ id: 'todas', titulo: 'Todas', de: -99999, ate: 99999 }];
    destaques(d.destaques);
    desenhar();
    H.mostrar('conteudo', true);
  }

  ['busca', 'so-dp', 'so-img'].forEach(function (id) { H.$(id).addEventListener('input', desenhar); });

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    await carregar();
  })();
})();
