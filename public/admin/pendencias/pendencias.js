/* /admin/pendencias/ (só o revisor geral): tudo o que espera a resposta do Gere, num link só (pedido
   dele, 24/10/2026). No topo, fixa, a barra com a volta à Administração, o tipo de pendência
   (comentários dos usuários, Bíblia, Não-ficção…), quantas faltam e «Próxima». Cada tipo é uma
   fila: primeiro o que ainda não tem resposta, na ordem dos capítulos; no fim, fechado, o que ele
   já respondeu e o Claude ainda não aplicou; o que o Claude já aplicou some. A resposta dada fica
   no lugar, para ele poder escrever o porquê; ao recarregar, vai para o fim.
   Herdou o script de /admin/biblia/ (17 a 23/10), que servia também à revisão dos comentários dos
   Padres e à Não-ficção: cada resposta grava sozinha, no clique ou logo depois de ele parar de
   digitar; sem «aprovar todos» e sem textos explicativos (19/10). Uma decisão por cartão (24/10).
   Os comentários dos usuários dos Cards (antes só em /cards/curadoria/): o Claude responde os casos
   em que está seguro e manda para cá os duvidosos, com o que decidir e a sugestão; a resposta dele
   vai para cards.conversa, que o Claude lê na rodada seguinte (rotinas/pendencias.md). */
(function () {
  'use strict';
  var H = TaioeHub, F = TaioeFila, sb = TaioeSessao.cliente();
  var CHAVE = 'hub:pendencias-tipo';
  var estados = {};        // tipo → { tipo, c (o carregado), raiz, cartoes: [], pronto }
  var atual = null;

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
  function rotuloDe(tipo) { return F.TIPOS.filter(function (t) { return t.id === tipo; })[0].rotulo; }

  // ------------------------------------------------------------ gravar (páginas de revisão)

  async function gravar(est, lista) {
    var r = await sb.schema('conta').from('respostas_privadas')
      .upsert(lista.map(function (x) {
        return { pagina: est.tipo, item: x.item, decisao: x.decisao, texto: x.texto || null, explicacao: x.explicacao || null };
      }), { onConflict: 'pagina,item' })
      .select('item, decisao, texto, explicacao, atualizado_em, lida');
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { est.c.respostas[x.item] = x; });
    est.cartoes.forEach(function (c) { c.atualizar(); });
    resumir();
  }
  var ESPERA = 900;   // ms depois da última tecla

  // ------------------------------------------------------------ um cartão de resposta

  /* opcoes: [{ valor, rotulo, texto (prefill do campo), campo: true|false, select: [...] }]
     Cada cartão tem as opções em botões de rádio, um campo de texto (quando a opção pede) e a
     explicação. Grava ao escolher uma opção e, nos campos, um pouco depois da última tecla. */
  function formulario(est, itemId, opcoes) {
    var explicarSoMudanca = /-comentarios$/.test(est.tipo);   // nos comentários, o «por quê?» só quando ele não aprova
    var respostas = est.c.respostas;
    var f = el('form', 'resposta');
    var nome = 'r-' + est.tipo + '-' + itemId.replace(/[^a-z0-9]/g, '-');
    var radios = el('div', 'opcoes');
    var campo = el('textarea', 'campo'); campo.rows = 4; campo.hidden = true;
    campo.setAttribute('aria-label', 'Novo texto');
    var sel = el('select', 'mover'); sel.hidden = true; sel.setAttribute('aria-label', 'Tema de destino');
    var expl = el('textarea', 'explicacao'); expl.rows = 2;
    expl.placeholder = 'Por quê? (opcional)';
    expl.setAttribute('aria-label', 'Explicação');
    var estado = el('p', 'estado pequeno');
    var editando = false, gravando = false, deNovo = false, relogio = null;

    opcoes.forEach(function (o, i) {
      var l = el('label', 'opcao');
      var r = el('input'); r.type = 'radio'; r.name = nome; r.value = String(i);
      l.appendChild(r);
      var t = el('span', 'opcao-texto'); comItalico(t, o.rotulo); l.appendChild(t);
      if (o.recomendada) l.appendChild(el('span', 'etiqueta', 'recomendada'));
      if (o.nota) l.appendChild(comItalico(el('span', 'opcao-nota'), o.nota));
      r.addEventListener('change', function () { mudou(); salvar(); });
      radios.appendChild(l);
    });
    function escolhida() {
      var r = f.querySelector('input[name="' + nome + '"]:checked');
      return r ? opcoes[Number(r.value)] : null;
    }
    function mudou() {
      var o = escolhida();
      if (explicarSoMudanca) expl.hidden = !(o && o.valor !== 'aprovar') && !expl.value;
      campo.hidden = !(o && o.campo);
      sel.hidden = !(o && o.select);
      if (o && o.campo && !campo.value) campo.value = o.texto || '';
      if (o && o.campo) campo.placeholder = o.placeholder || '';
      if (o && o.select) {
        sel.textContent = '';
        o.select.forEach(function (s) { var op = el('option', null, s.rotulo); op.value = s.valor; sel.appendChild(op); });
      }
    }
    f.appendChild(radios); f.appendChild(campo); f.appendChild(sel); f.appendChild(expl);
    if (explicarSoMudanca) expl.hidden = true;
    var pe = el('div', 'pe'); pe.appendChild(estado); f.appendChild(pe);
    f.addEventListener('submit', function (e) { e.preventDefault(); });

    function digitou() {
      editando = true;
      estado.textContent = 'Gravando…';
      clearTimeout(relogio);
      relogio = setTimeout(salvar, ESPERA);
    }
    [campo, expl].forEach(function (t) {
      t.addEventListener('input', digitou);
      t.addEventListener('blur', function () { if (relogio) salvar(); });
    });
    sel.addEventListener('change', salvar);

    // Uma gravação por vez; o que mudar enquanto grava sai logo depois.
    async function salvar() {
      clearTimeout(relogio); relogio = null;
      if (gravando) { deNovo = true; return; }
      var o = escolhida();
      if (!o) { editando = false; estado.textContent = expl.value.trim() ? 'Escolha uma das opções para gravar.' : 'Ainda sem resposta.'; return; }
      var texto = o.select ? 'mover:' + sel.value : (o.campo ? campo.value.trim() : (o.valorTexto || ''));
      if (o.campo && !texto) { editando = false; estado.textContent = 'Escreva o texto para gravar.'; return; }
      gravando = true; estado.textContent = 'Gravando…';
      var erro = null;
      try { await gravar(est, [{ item: itemId, decisao: o.valor, texto: texto, explicacao: expl.value.trim() }]); }
      catch (err) { erro = err; }
      gravando = false;
      if (deNovo) { deNovo = false; salvar(); return; }
      editando = false;
      if (erro) estado.textContent = 'Não gravou: ' + H.mensagemDeErro(erro) + ' (tento de novo na próxima mudança)';
      else if (respostas[itemId]) mostrarEstado(respostas[itemId]);
    }
    function mostrarEstado(r) {
      estado.textContent = 'Gravado em ' + quando(r.atualizado_em) + (r.lida ? ' · já aplicado pelo Claude' : ' · o Claude ainda não aplicou');
    }

    function atualizar() {
      var r = respostas[itemId];
      f.classList.toggle('respondido', !!r);
      if (f.parentNode) f.parentNode.classList.toggle('respondido', !!r);
      if (editando || gravando) return;   // não apagar o que ele está digitando
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
      if (explicarSoMudanca) expl.hidden = !(o && o.valor !== 'aprovar') && !expl.value;
      mostrarEstado(r);
    }
    est.cartoes.push({ id: itemId, atualizar: atualizar });
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

  function autoria(x) {
    var aut = el('p', 'autoria');
    aut.appendChild(el('b', null, x.autor));
    if (x.sobre) aut.appendChild(document.createTextNode(', ' + x.sobre));
    aut.appendChild(el('br'));
    aut.appendChild(el('i', null, x.obra));
    if (x.passagem) aut.appendChild(document.createTextNode(', ' + x.passagem));
    if (seguro(x.link)) { aut.appendChild(document.createTextNode(' · ')); aut.appendChild(link(x.link, 'original')); }
    return aut;
  }

  function itemNota(est, x) {
    var c = el('article', 'cartao nota');
    c.appendChild(el('p', 'cartao-ref', x.ref + (x.letra ? ' · nota ' + x.letra : '')));
    if (x.versiculo) c.appendChild(comItalico(el('p', 'versiculo'), x.versiculo));
    c.appendChild(paragrafos('cartao-texto', x.texto));
    if (x.origem) c.appendChild(el('p', 'apagado pequeno', x.origem));
    c.appendChild(formulario(est, x.id, opcoesPadrao(x.texto, 'Alterar o texto da nota')));
    return c;
  }

  function itemEscolha(est, x) {
    var c = el('article', 'cartao escolha');
    c.appendChild(comItalico(el('h3'), x.titulo));
    if (x.ref) c.appendChild(el('p', 'cartao-ref', x.ref));
    if (x.contexto) c.appendChild(paragrafos('cartao-texto', x.contexto));
    var ops = (x.opcoes || []).map(function (o) {
      return { valor: 'escolher', valorTexto: o.id, rotulo: o.texto, nota: o.nota, recomendada: o.recomendada };
    });
    ops.push({ valor: 'alterar', rotulo: 'Outra solução', campo: true, texto: '', placeholder: 'Escreva a solução que você prefere' });
    c.appendChild(formulario(est, x.id, ops));
    return c;
  }

  // Item antigo, de avaliação geral (desde 24/10 não se fazem mais: uma decisão por cartão).
  function itemAvaliacao(est, x) {
    var c = el('article', 'cartao avaliacao');
    if (x.titulo) c.appendChild(comItalico(el('h3'), x.titulo));
    if (x.texto) c.appendChild(paragrafos('cartao-texto', x.texto));
    c.appendChild(formulario(est, x.id, [
      { valor: 'aprovar', rotulo: x.rotuloAprovar || 'De acordo' },
      { valor: 'comentar', rotulo: 'Quero outra coisa', campo: true, texto: '', placeholder: 'O que você quer' }
    ]));
    return c;
  }

  // Páginas dos comentários: o título e o resumo de um tema, e cada comentário.
  function itemTemaTexto(est, x, rotulo) {
    var c = el('article', 'cartao tema-texto');
    c.appendChild(el('p', 'cartao-ref', rotulo));
    c.appendChild(comItalico(el('p', 'cartao-texto'), x.texto));
    c.appendChild(formulario(est, x.id, [
      { valor: 'aprovar', rotulo: 'Aprovar' },
      { valor: 'alterar', rotulo: 'Editar', campo: true, texto: x.texto }
    ]));
    return c;
  }

  function itemComentario(est, x) {
    var a = el('article', 'cartao comentario');
    a.appendChild(paragrafos('cartao-texto', x.texto));
    a.appendChild(autoria(x));
    a.appendChild(formulario(est, x.id, [
      { valor: 'aprovar', rotulo: 'Aprovar' },
      { valor: 'alterar', rotulo: 'Cortar', campo: true, texto: x.texto },
      { valor: 'excluir', rotulo: 'Excluir' }
    ]));
    return a;
  }

  // Um corte dele que o Claude achou que muda o sentido: o corte, o aviso e a sugestão. O site já
  // mostra a sugestão; ele aprova, fica com o corte dele, edita ou exclui.
  function itemAvisoCorte(est, x) {
    var a = el('article', 'cartao comentario aviso-corte');
    var aut = autoria(x); a.appendChild(aut);
    a.appendChild(el('p', 'cartao-ref', 'Seu corte'));
    a.appendChild(paragrafos('cartao-texto corte', x.corte));
    var av = el('div', 'aviso-texto');
    av.appendChild(el('p', 'cartao-ref', 'Aviso'));
    av.appendChild(paragrafos('cartao-texto', x.aviso));
    a.appendChild(av);
    a.appendChild(el('p', 'cartao-ref', 'Sugestão'));
    a.appendChild(paragrafos('cartao-texto', x.sugestao));
    a.appendChild(formulario(est, x.id, [
      { valor: 'aprovar', rotulo: 'Aprovar a sugestão' },
      { valor: 'escolher', valorTexto: 'corte', rotulo: 'Manter o meu corte' },
      { valor: 'alterar', rotulo: 'Editar', campo: true, texto: x.sugestao },
      { valor: 'excluir', rotulo: 'Excluir o comentário' }
    ]));
    return a;
  }

  // Os versículos de um estudo de palavra, cada um como ficaria em cada opção. Só leitura.
  function itemCasos(x) {
    var w = el('div', 'casos');
    (x.casos || []).forEach(function (k) {
      var c = el('article', 'cartao caso');
      var cab = el('p', 'cartao-ref', k.ref);
      if (k.sentido) cab.appendChild(el('span', 'sentido', ' · ' + k.sentido));
      c.appendChild(cab);
      if (k.hebraico) c.appendChild(el('p', 'hebraico', k.hebraico));
      var dl = el('dl', 'versoes');
      function linha(rotulo, t) {
        if (!t) return;
        dl.appendChild(el('dt', null, rotulo));
        dl.appendChild(comItalico(el('dd'), t));
      }
      linha('Hoje', k.atual);
      (x.opcoes || []).forEach(function (o) { linha(o.rotulo, k[o.id]); });
      c.appendChild(dl);
      w.appendChild(c);
    });
    return w;
  }

  function cartao(est, x) {
    var c;
    if (x.tipo === 'nota') c = itemNota(est, x);
    else if (x.tipo === 'escolha') c = itemEscolha(est, x);
    else if (x.tipo === 'tema-titulo') c = itemTemaTexto(est, x, 'Nome do tema');
    else if (x.tipo === 'tema-resumo') c = itemTemaTexto(est, x, 'Texto do tema');
    else if (x.tipo === 'comentario') c = itemComentario(est, x);
    else if (x.tipo === 'comentario-aviso') c = itemAvisoCorte(est, x);
    else c = itemAvaliacao(est, x);
    c.classList.add('pendencia');
    return c;
  }

  // ------------------------------------------------------------ uma página de revisão

  function cabecalhoCap(cap, destino) {
    var w = el('section', 'capitulo');
    w.appendChild(el('h2', 'titulo-cap', cap.rotulo));
    var p = el('p', 'pequeno');
    if (seguro(cap.url)) p.appendChild(link(cap.url, cap.rotuloUrl || 'Abrir o capítulo'));
    if (cap.estado) p.appendChild(document.createTextNode(' · ' + cap.estado));
    if (p.firstChild) w.appendChild(p);
    destino.appendChild(w);
    return w;
  }
  function cabecalhoSec(s, capEl) {
    var w = el('section', 'secao');
    w.appendChild(comItalico(el('h3', 'titulo-secao'), s.titulo));
    if (s.sub || seguro(s.url)) {
      var sub = el('p', 'sub-secao pequeno', s.sub || '');
      if (seguro(s.url)) { if (s.sub) sub.appendChild(document.createTextNode(' · ')); sub.appendChild(link(s.url, 'ver no site')); }
      w.appendChild(sub);
    }
    if (s.texto) w.appendChild(paragrafos('secao-texto', s.texto));
    capEl.appendChild(w);
    return w;
  }

  // Cada capítulo e cada seção aparecem no bloco da fila (sem resposta) e/ou no do fim (já
  // respondidos, esperando o Claude); o que o Claude já aplicou não aparece.
  function montarPagina(est, fila, fim) {
    var respostas = est.c.respostas;
    function destino(x) {
      if (x.tipo === 'casos') return null;
      var r = respostas[x.id];
      return !r ? 'fila' : (r.lida ? 'fora' : 'fim');
    }
    ((est.c.dados || {}).capitulos || []).forEach(function (cap) {
      var blocos = {}, raiz = { fila: fila, fim: fim }, tem = {};
      (cap.secoes || []).forEach(function (s) { (s.itens || []).forEach(function (x) { tem[destino(x)] = true; }); });
      // Seção só de leitura (os casos de um estudo): vai com o resto do capítulo.
      var kLeitura = tem.fila ? 'fila' : tem.fim ? 'fim' : null;
      (cap.secoes || []).forEach(function (s) {
        var por = { fila: [], fim: [] }, leitura = [];
        (s.itens || []).forEach(function (x) {
          var d = destino(x);
          if (!d) leitura.push(x); else if (d !== 'fora') por[d].push(x);
        });
        ['fila', 'fim'].forEach(function (k) {
          var soLeitura = !por.fila.length && !por.fim.length && leitura.length && k === kLeitura;
          if (!por[k].length && !soLeitura) return;
          var capEl = blocos[k] || (blocos[k] = cabecalhoCap(cap, raiz[k]));
          var secEl = cabecalhoSec(s, capEl);
          leitura.forEach(function (x) { secEl.appendChild(itemCasos(x)); });
          por[k].forEach(function (x) { secEl.appendChild(cartao(est, x)); });
        });
      });
    });
  }

  // ------------------------------------------------------------ comentários dos usuários

  var NOME_ETAPA = { 'ida-escrita': 'ida, escrita', 'ida-escolha': 'ida, múltipla escolha', 'inversa-escrita': 'volta, escrita', 'inversa-escolha': 'volta, múltipla escolha' };

  function cartaoUsuario(est, i) {
    var c = el('article', 'cartao usuario pendencia');
    var cab = el('p', 'cartao-ref', (i.tipo === 'comentario' ? 'Comentário' : 'Contestação') + ' · ' + i.curso + ' · ' +
      new Date(i.feito_em).toLocaleDateString('pt-BR'));
    c.appendChild(cab);
    var p = F.lerPergunta(i.pergunta ? i.pergunta.texto : '');
    c.appendChild(el('p', 'card-do-item', p.card || ('Card ' + i.card_id)));
    if (i.tipo === 'comentario') {
      c.appendChild(el('p', 'rotulo', 'O usuário escreveu'));
      c.appendChild(paragrafos('cartao-texto citado', i.texto));
    } else {
      c.appendChild(el('p', 'rotulo', 'A resposta contestada' + (i.etapa ? ' (' + (NOME_ETAPA[i.etapa] || i.etapa) + ')' : '')));
      var q = el('div', 'cartao-texto citado');
      q.appendChild(el('p', null, i.resposta));
      if (i.esperado) q.appendChild(el('p', 'apagado', 'O card esperava: ' + i.esperado));
      c.appendChild(q);
    }
    var decidir = p.decidir || (!i.pergunta ? i.decisao : '');
    if (decidir) {
      c.appendChild(el('p', 'rotulo', 'Você precisa decidir'));
      c.appendChild(paragrafos('cartao-texto decidir', decidir));
    }
    if (p.sugestao) {
      c.appendChild(el('p', 'rotulo', 'Minha sugestão'));
      c.appendChild(paragrafos('cartao-texto', p.sugestao));
    }
    c.appendChild(respostaUsuario(est, i, !!p.sugestao));
    return c;
  }

  // «Seguir a sugestão» grava na hora; «Outra coisa» abre o campo e grava no «Enviar». Cada envio
  // é uma mensagem nova na conversa do item (a conversa não se edita); vale a última.
  var SEGUIR = 'Sigo a sugestão.';
  function respostaUsuario(est, i, temSugestao) {
    var f = el('form', 'resposta');
    var nome = 'u-' + i.id;
    var opcoes = el('div', 'opcoes');
    function opcao(valor, rotulo) {
      var l = el('label', 'opcao');
      var r = el('input'); r.type = 'radio'; r.name = nome; r.value = valor;
      l.appendChild(r); l.appendChild(el('span', 'opcao-texto', rotulo));
      opcoes.appendChild(l);
      return r;
    }
    var rSeguir = temSugestao ? opcao('seguir', 'Seguir a sugestão') : null;
    var rOutra = opcao('outra', temSugestao ? 'Outra coisa' : 'Responder');
    var campo = el('textarea', 'campo'); campo.rows = 3; campo.maxLength = 4000; campo.hidden = true;
    campo.placeholder = 'O que você quer'; campo.setAttribute('aria-label', 'Sua resposta');
    var enviar = el('button', 'enviar', 'Enviar'); enviar.type = 'submit'; enviar.hidden = true;
    var estado = el('p', 'estado pequeno');
    f.appendChild(opcoes); f.appendChild(campo); f.appendChild(enviar);
    var pe = el('div', 'pe'); pe.appendChild(estado); f.appendChild(pe);

    async function mandar(texto) {
      estado.textContent = 'Gravando…';
      enviar.disabled = true;
      var r = await sb.schema('cards').from('conversa').insert({
        item_tipo: i.tipo, item_id: i.id, tipo: i.pergunta ? 'resposta' : 'nota', texto: texto,
        responde_a: i.pergunta ? i.pergunta.id : null
      }).select().single();
      enviar.disabled = false;
      if (r.error) { estado.textContent = 'Não gravou: ' + H.mensagemDeErro(r.error) + ' (tente de novo)'; return; }
      est.c.conversa.push(r.data);
      F.situar(i, est.c.conversa);
      atualizar();
      resumir();
    }
    function mostrarCampo() { campo.hidden = enviar.hidden = !rOutra.checked; }
    if (rSeguir) rSeguir.addEventListener('change', function () { mostrarCampo(); mandar(SEGUIR); });
    rOutra.addEventListener('change', function () { mostrarCampo(); if (!campo.hidden) campo.focus(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = campo.value.trim();
      if (!t) { estado.textContent = 'Escreva a resposta para enviar.'; return; }
      mandar(t);
    });

    function atualizar() {
      var r = i.respostaGere;
      f.classList.toggle('respondido', !!r);
      if (f.parentNode) f.parentNode.classList.toggle('respondido', !!r);
      if (!r) { estado.textContent = 'Ainda sem resposta.'; return; }
      if (r.texto === SEGUIR && rSeguir) rSeguir.checked = true;
      else { rOutra.checked = true; if (!campo.value) campo.value = r.texto; }
      mostrarCampo();
      estado.textContent = 'Gravado em ' + quando(r.criado_em) + ' · o Claude ainda não aplicou';
    }
    est.cartoes.push({ id: i.id, atualizar: atualizar });
    return f;
  }

  function montarComentarios(est, fila, fim) {
    est.c.itens.forEach(function (i) { (i.respostaGere ? fim : fila).appendChild(cartaoUsuario(est, i)); });
  }

  // ------------------------------------------------------------ a fila de um tipo

  function montar(est) {
    var raiz = el('div', 'tipo'); raiz.setAttribute('data-tipo', est.tipo);
    var fila = el('div', 'fila'), fim = el('div', 'fila-fim');
    if (est.tipo === 'comentarios') montarComentarios(est, fila, fim);
    else montarPagina(est, fila, fim);
    raiz.appendChild(fila);
    if (!fila.firstChild) fila.appendChild(el('p', 'vazio', 'Nada esperando você aqui.'));
    if (fim.firstChild) {
      var n = F.contar(est.c).respondidas;
      var det = el('details', 'respondidas');
      det.appendChild(el('summary', null, (n === 1 ? '1 já respondida' : n + ' já respondidas') + ', esperando o Claude aplicar'));
      det.appendChild(fim);
      raiz.appendChild(det);
    }
    if (est.tipo === 'comentarios') {
      var p = el('p', 'apagado pequeno historico');
      p.appendChild(document.createTextNode('Todos os comentários e contestações, e a conversa geral com o Claude: '));
      p.appendChild(link('/cards/curadoria/', 'curadoria dos Cards'));
      raiz.appendChild(p);
    }
    est.cartoes.forEach(function (c) { c.atualizar(); });
    return raiz;
  }

  // ------------------------------------------------------------ barra do topo

  function rotuloOpcao(t) {
    var n = estados[t.id] && estados[t.id].c ? F.contar(estados[t.id].c) : null;
    return t.rotulo + (n ? ' (' + n.faltam + ')' : estados[t.id] && estados[t.id].erro ? ' (erro)' : ' (…)');
  }

  function resumir() {
    var sel = H.$('tipo');
    F.TIPOS.forEach(function (t, k) { sel.options[k].textContent = rotuloOpcao(t); });
    var est = estados[atual], n = est && est.c ? F.contar(est.c) : null;
    H.$('faltam').textContent = !n ? '' : n.faltam ? (n.faltam === 1 ? 'Falta 1' : 'Faltam ' + n.faltam) : 'Tudo respondido';
    H.$('proxima').disabled = !n || !n.faltam;
  }

  // A próxima pendência sem resposta abaixo do topo da tela (ou, se não houver, a primeira).
  function proxima() {
    var est = estados[atual];
    if (!est || !est.raiz) return;
    var barra = H.$('barra').getBoundingClientRect().bottom;
    var todas = Array.prototype.filter.call(est.raiz.querySelectorAll('.fila .pendencia'), function (c) { return !c.classList.contains('respondido'); });
    if (!todas.length) return;
    var alvo = todas.filter(function (c) { return c.getBoundingClientRect().top > barra + 12; })[0] || todas[0];
    // A primeira pendência de uma seção (ou de um capítulo) aparece com o título dela.
    var topo = alvo, pai = alvo.parentNode;
    if (pai.classList.contains('secao') && pai.querySelector('.pendencia') === alvo) {
      topo = pai;
      if (pai.parentNode.classList.contains('capitulo') && pai.parentNode.querySelector('.secao') === pai) topo = pai.parentNode;
    }
    window.scrollTo({ top: topo.getBoundingClientRect().top + window.scrollY - barra - 10, behavior: 'smooth' });
    var r = alvo.querySelector('input[type="radio"]');
    if (r) r.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ trocar de tipo

  function carregarTipo(tipo) {
    var est = estados[tipo];
    if (!est.pronto) {
      est.pronto = F.carregar(sb, tipo).then(function (c) { est.c = c; }, function (e) { est.erro = e; })
        .then(function () { resumir(); });
    }
    return est.pronto;
  }

  async function mostrar(tipo) {
    atual = tipo;
    try { localStorage.setItem(CHAVE, tipo); } catch (e) {}
    if (location.hash !== '#' + tipo) history.replaceState(null, '', '#' + tipo);
    H.$('tipo').value = tipo;
    document.title = 'Pendências: ' + rotuloDe(tipo) + ' · Taioé';
    Array.prototype.forEach.call(H.$('tipos').children, function (r) { r.hidden = r.getAttribute('data-tipo') !== tipo; });
    var est = estados[tipo];
    H.avisar('aviso', '');
    if (!est.raiz) {
      H.mostrar('carregando', true);
      await carregarTipo(tipo);
      if (atual !== tipo) return;
      H.mostrar('carregando', false);
      if (est.erro) { H.avisar('aviso', H.mensagemDeErro(est.erro), 'erro'); est.pronto = null; est.erro = null; resumir(); return; }
      est.raiz = montar(est);
      H.$('tipos').appendChild(est.raiz);
    }
    resumir();
    window.scrollTo(0, 0);
  }

  function tipoValido(t) { return F.TIPOS.some(function (x) { return x.id === t; }) ? t : ''; }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    var pode = await sb.schema('conta').rpc('tem_papel', { papel: 'revisor', escopo: '*' });
    if (pode.error || !pode.data) { H.mostrar('carregando', false); H.avisar('aviso', 'Esta página é só da administração da Taioé.', 'erro'); return; }

    var sel = H.$('tipo');
    F.TIPOS.forEach(function (t) {
      estados[t.id] = { tipo: t.id, cartoes: [] };
      var o = el('option', null, t.rotulo); o.value = t.id; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { mostrar(sel.value); });
    H.$('proxima').addEventListener('click', proxima);
    window.addEventListener('hashchange', function () { var t = tipoValido(location.hash.slice(1)); if (t && t !== atual) mostrar(t); });
    H.mostrar('barra', true);

    // Todos os tipos carregam juntos (para as contagens do seletor). Abre no tipo do endereço; sem
    // ele, no último usado, se ainda tiver pendências; senão, no primeiro que tiver.
    var todos = Promise.all(F.TIPOS.map(function (t) { return carregarTipo(t.id); }));
    var pedido = tipoValido(location.hash.slice(1)) || tipoValido(new URLSearchParams(location.search).get('tipo'));
    if (pedido) { mostrar(pedido); return; }
    await todos;
    var guardado = '';
    try { guardado = tipoValido(localStorage.getItem(CHAVE)); } catch (e) {}
    function faltam(t) { var e = estados[t]; return e.c ? F.contar(e.c).faltam : 0; }
    var com = F.TIPOS.filter(function (t) { return faltam(t.id); })[0];
    mostrar(guardado && faltam(guardado) ? guardado : com ? com.id : guardado || F.TIPOS[0].id);
  })();
})();
