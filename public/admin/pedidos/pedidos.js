/* /admin/pedidos/ (só o revisor geral): a fila única dos livros que o Gere pediu em /admin/sugestoes/,
   de todas as categorias (pedido dele, 26/10/2026). Em cima, fixos, os em andamento; embaixo, a fila,
   que ele reordena com ↑, ↓ e «Para o topo». Cada clique grava a fila inteira (ordem.js); o Claude
   faz sempre o primeiro. */
(function () {
  'use strict';
  var H = TaioeHub, P = TaioePedidos, sb = TaioeSessao.cliente();
  var fila = [], gravando = false, deNovo = false;

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null && texto !== '') e.textContent = texto;
    return e;
  }
  function comItalico(e, s) {
    String(s || '').split(/(\*[^*]+\*)/).forEach(function (p) {
      if (/^\*[^*]+\*$/.test(p)) e.appendChild(el('em', null, p.slice(1, -1)));
      else if (p) e.appendChild(document.createTextNode(p));
    });
    return e;
  }
  function quando(t) {
    var d = new Date(t);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dia(t) { return t ? new Date(t + (/T/.test(t) ? '' : 'T12:00:00')).toLocaleDateString('pt-BR') : ''; }

  function cabeca(p, alvo) {
    comItalico(alvo.appendChild(el('span', 'titulo-livro')), p.titulo);
    if (p.autor) alvo.appendChild(document.createTextNode(', ' + p.autor));
  }
  function ficha(p) {
    var partes = [p.cat.rotulo];
    if (p.novo) partes.push('pedido em ' + quando(p.desde), 'o Claude ainda não viu');
    else if (p.desde) partes.push('pedido em ' + dia(p.desde));
    return partes.join(' · ');
  }

  function andamento(lista) {
    var ul = H.$('lista-andamento');
    ul.textContent = '';
    lista.forEach(function (p) {
      var li = el('li');
      cabeca(p, li);
      li.appendChild(el('span', 'ficha', ' · ' + [p.estado, p.cat.rotulo].filter(Boolean).join(' · ')));
      ul.appendChild(li);
    });
    H.mostrar('andamento', lista.length > 0);
  }

  function contar() {
    var n = fila.length;
    H.$('contagem').textContent = n === 1 ? '1 na fila' : n + ' na fila';
  }

  // Desenha a fila; «foco» = [id, ação] do botão que estava com o foco, para o teclado seguir o livro.
  function desenhar(foco) {
    var ol = H.$('fila');
    ol.textContent = '';
    if (!fila.length) ol.appendChild(el('li', 'vazio', 'Nenhum pedido na fila. Peça livros em Sugestões.'));
    fila.forEach(function (p, i) {
      var li = el('li', 'cartao pedido' + (p.novo ? ' novo' : ''));
      li.setAttribute('data-id', p.id);
      var h = el('h3');
      h.appendChild(el('span', 'posicao', (i + 1) + '.'));
      var t = h.appendChild(el('span'));
      cabeca(p, t);
      li.appendChild(h);
      li.appendChild(el('p', 'ficha', (i === 0 ? 'o próximo · ' : '') + ficha(p)));
      var acoes = el('div', 'mover');
      [['topo', 'Para o topo', 'Mover para o topo'], ['subir', '↑', 'Subir uma posição'], ['descer', '↓', 'Descer uma posição']].forEach(function (a) {
        var b = el('button', 'secundario', a[1]); b.type = 'button';
        b.setAttribute('aria-label', a[2] + ': ' + p.titulo.replace(/\*/g, ''));
        b.setAttribute('data-acao', a[0]);
        b.disabled = a[0] === 'descer' ? i === fila.length - 1 : i === 0;
        b.addEventListener('click', function () { mover(i, a[0]); });
        acoes.appendChild(b);
        if (foco && foco[0] === p.id && foco[1] === a[0]) setTimeout(function () { (b.disabled ? li.querySelector('button:not([disabled])') : b).focus(); }, 0);
      });
      li.appendChild(acoes);
      ol.appendChild(li);
    });
    contar();
  }

  function mover(i, acao) {
    var j = acao === 'topo' ? 0 : acao === 'subir' ? i - 1 : i + 1;
    if (j < 0 || j >= fila.length || j === i) return;
    var p = fila.splice(i, 1)[0];
    fila.splice(j, 0, p);
    desenhar([p.id, acao]);
    var li = H.$('fila').querySelector('[data-id="' + p.id + '"]');
    if (li) { li.classList.add('movido'); setTimeout(function () { li.classList.remove('movido'); }, 700); }
    salvar();
  }

  // Uma gravação por vez; a última ordem sempre chega ao banco.
  async function salvar() {
    var estado = H.$('estado-ordem');
    if (gravando) { deNovo = true; return; }
    gravando = true; estado.textContent = 'gravando…'; estado.classList.remove('erro');
    try {
      var r = await P.gravarOrdem(sb, fila.map(function (p) { return p.id; }));
      estado.textContent = 'Ordem gravada em ' + quando(r ? r.atualizado_em : new Date()) + '. O Claude segue esta ordem.';
    } catch (e) {
      estado.textContent = 'Não gravou: ' + H.mensagemDeErro(e) + '. Tente mover de novo.';
      estado.classList.add('erro');
    }
    gravando = false;
    if (deNovo) { deNovo = false; salvar(); }
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    var pode = await sb.schema('conta').rpc('tem_papel', { papel: 'revisor', escopo: '*' });
    if (pode.error || !pode.data) { H.mostrar('carregando', false); H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }
    var c;
    try { c = await P.carregar(sb); }
    catch (e) { H.mostrar('carregando', false); H.avisar('aviso', H.mensagemDeErro(e), 'erro'); return; }
    H.mostrar('carregando', false);
    if (!(c.dados.categorias || []).length) { H.avisar('aviso', 'A lista ainda não foi publicada.', 'erro'); return; }
    var m = P.montar(c.dados, c.respostas);
    fila = m.fila;
    var mudada = c.respostas[P.ITEM_ORDEM];
    if (mudada) H.$('estado-ordem').textContent = 'Ordem mudada por você em ' + quando(mudada.atualizado_em) + '. O Claude segue esta ordem.';
    andamento(m.andamento);
    desenhar();
    H.mostrar('barra', true);
    H.mostrar('conteudo', true);
  })();
})();
