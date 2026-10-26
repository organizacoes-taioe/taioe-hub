/* A fila única dos pedidos de livros da Biblioteca (pedido do Gere, 26/10/2026): os «Pedidos» de todas
   as categorias de /admin/sugestoes/ numa ordem só, que ele muda em /admin/pedidos/. Usado também por
   /admin/sugestoes/ (a posição de cada pedido na fila) e por /admin/ (quantos estão na fila).
   A lista vem de conta.paginas_privadas (slug 'sugestoes'): os pedidos ficam em cada categoria, e
   «ordem» (no topo do JSON) diz a ordem da fila. Os em andamento ficam fora da fila, fixos em cima.
   Os pedidos que o Claude ainda não viu (resposta 'escolher' não lida) entram no fim, na ordem dos
   cliques. A ordem que ele muda grava em conta.respostas_privadas (pagina 'sugestoes', item
   'ordem-dos-pedidos', decisao 'alterar', texto = os ids separados por vírgula); na revisão
   (rotinas/sugestoes.md), o Claude a passa para «ordem» e marca a resposta como lida. */
(function () {
  'use strict';
  var PAGINA = 'sugestoes', ITEM_ORDEM = 'ordem-dos-pedidos';

  function emAndamento(p) { return /^em andamento/i.test(p.estado || ''); }
  function horaDoPedido(r) { var m = /^pedir@(.+)$/.exec(r.texto || ''); return m ? m[1] : r.atualizado_em; }

  async function carregar(sb) {
    var p = await sb.schema('conta').from('paginas_privadas').select('dados').eq('slug', PAGINA).maybeSingle();
    if (p.error) throw p.error;
    var r = await sb.schema('conta').from('respostas_privadas').select('item, decisao, texto, explicacao, atualizado_em, lida')
      .eq('pagina', PAGINA).eq('lida', false).limit(1000);
    if (r.error) throw r.error;
    var respostas = {};
    (r.data || []).forEach(function (x) { respostas[x.item] = x; });
    return { dados: (p.data && p.data.dados) || { categorias: [] }, respostas: respostas };
  }

  // { andamento: [...], fila: [...] }; cada um { id, titulo, autor, estado, desde, cat, novo, r }.
  function montar(dados, respostas) {
    var todos = [], k = 0;
    (dados.categorias || []).forEach(function (cat) {
      (cat.pedidos || []).forEach(function (p) {
        todos.push({ id: p.id, titulo: p.titulo, autor: p.autor, estado: p.estado, desde: p.desde || '', cat: cat, novo: false, k: k++ });
      });
      (cat.itens || []).forEach(function (x) {
        var r = respostas[x.id];
        if (!r || r.lida || r.decisao !== 'escolher') return;
        todos.push({ id: x.id, titulo: x.titulo, autor: x.autor, estado: '', desde: horaDoPedido(r), cat: cat, novo: true, r: r, k: k++ });
      });
    });
    var andamento = todos.filter(emAndamento);
    var resto = todos.filter(function (p) { return !emAndamento(p); });

    // A ordem publicada; os que ela não tem vão depois, pelo dia do pedido (e os novos pelo clique).
    var pos = {};
    (dados.ordem || []).forEach(function (id, i) { if (!(id in pos)) pos[id] = i; });
    function base(a, b) {
      var pa = a.id in pos ? pos[a.id] : Infinity, pb = b.id in pos ? pos[b.id] : Infinity;
      if (pa !== pb) return pa - pb;
      if (a.novo !== b.novo) return a.novo ? 1 : -1;
      if (a.desde !== b.desde) return a.desde < b.desde ? -1 : 1;
      return a.k - b.k;
    }
    resto.sort(base);

    // A ordem que ele mudou e o Claude ainda não aplicou vale por cima da publicada.
    var mudada = respostas[ITEM_ORDEM];
    if (mudada && !mudada.lida && mudada.texto) {
      var nova = {};
      mudada.texto.split(',').forEach(function (id, i) { id = id.trim(); if (id && !(id in nova)) nova[id] = i; });
      resto.sort(function (a, b) {
        var na = a.id in nova, nb = b.id in nova;
        if (na && nb) return nova[a.id] - nova[b.id];
        if (na !== nb) return na ? -1 : 1;
        return base(a, b);
      });
    }
    return { andamento: andamento, fila: resto };
  }

  async function gravarOrdem(sb, ids) {
    var r = await sb.schema('conta').from('respostas_privadas')
      .upsert([{ pagina: PAGINA, item: ITEM_ORDEM, decisao: 'alterar', texto: ids.join(','), explicacao: null }], { onConflict: 'pagina,item' })
      .select('item, decisao, texto, explicacao, atualizado_em, lida');
    if (r.error) throw r.error;
    return (r.data || [])[0];
  }

  window.TaioePedidos = { ITEM_ORDEM: ITEM_ORDEM, carregar: carregar, montar: montar, gravarOrdem: gravarOrdem, emAndamento: emAndamento };
})();
