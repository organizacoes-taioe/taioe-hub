/* As pendências do Gere (só o revisor geral): carregar e contar o que espera a resposta dele, por
   tipo. Usado por /admin/pendencias/ (a fila) e por /admin/ (o total no link).
   - Comentários dos usuários dos Cards: os itens que o Claude marcou para ele (para_gere), com a
     pergunta do Claude na conversa (cards.conversa). Responder = mensagem dele depois da pergunta.
   - As páginas particulares de revisão (biblia, biblia-comentarios, nao-ficcao,
     nao-ficcao-comentarios, traducoes): o conteúdo vem de conta.paginas_privadas e as respostas de
     conta.respostas_privadas. Resposta já aplicada pelo Claude (lida) sai da fila.
   Pedido do Gere, 24/10/2026: um link só, um tipo de cada vez, e no fim da fila o que ele já
   respondeu e o Claude ainda não aplicou. */
(function () {
  'use strict';

  var TIPOS = [
    { id: 'comentarios', rotulo: 'Comentários dos usuários' },
    { id: 'biblia', rotulo: 'Bíblia: tradução' },
    { id: 'biblia-comentarios', rotulo: 'Bíblia: comentários dos Padres' },
    { id: 'nao-ficcao', rotulo: 'Não-ficção: tradução' },
    { id: 'nao-ficcao-comentarios', rotulo: 'Não-ficção: comentários' },
    // As decisões mais delicadas das traduções nossas da Biblioteca (pedido do Gere, 26/10/2026).
    { id: 'traducoes', rotulo: 'Biblioteca: traduções' }
  ];

  // As respostas de uma página, em lotes de 1000 (o máximo que a API devolve de uma vez).
  async function respostasDe(sb, pagina) {
    var respostas = {};
    for (var de = 0; ; de += 1000) {
      var r = await sb.schema('conta').from('respostas_privadas').select('item, decisao, texto, explicacao, atualizado_em, lida')
        .eq('pagina', pagina).order('item').range(de, de + 999);
      if (r.error) throw r.error;
      (r.data || []).forEach(function (x) { respostas[x.item] = x; });
      if ((r.data || []).length < 1000) break;
    }
    return respostas;
  }

  async function carregarPagina(sb, tipo) {
    var r = await sb.schema('conta').from('paginas_privadas').select('titulo, dados, atualizado_em').eq('slug', tipo).maybeSingle();
    if (r.error) throw r.error;
    return { tipo: tipo, dados: (r.data && r.data.dados) || { capitulos: [] }, respostas: await respostasDe(sb, tipo) };
  }

  // A pergunta do Claude no formato combinado: «Card …», «Decidir: …» e «Sugestão: …», em blocos
  // separados por linha em branco. Fora do formato, o texto inteiro vai em «decidir».
  function lerPergunta(texto) {
    var p = { card: '', decidir: '', sugestao: '' };
    String(texto || '').split(/\n\s*\n/).forEach(function (b) {
      b = b.trim();
      var m = /^(Decidir|Sugestão):\s*([\s\S]*)$/.exec(b);
      if (m && m[1] === 'Decidir') p.decidir = (p.decidir ? p.decidir + '\n\n' : '') + m[2];
      else if (m) p.sugestao = (p.sugestao ? p.sugestao + '\n\n' : '') + m[2];
      else if (!p.decidir && !p.sugestao && !p.card && /^Card\b/.test(b)) p.card = b;
      else if (p.sugestao) p.sugestao += '\n\n' + b;
      else p.decidir = (p.decidir ? p.decidir + '\n\n' : '') + b;
    });
    return p;
  }

  async function carregarComentarios(sb) {
    var a = await sb.schema('cards').from('comentarios').select('*').eq('para_gere', true).order('feito_em');
    var b = await sb.schema('cards').from('contestacoes').select('*').eq('para_gere', true).order('feito_em');
    if (a.error || b.error) throw (a.error || b.error);
    var itens = a.data.map(function (x) { x.tipo = 'comentario'; return x; })
      .concat(b.data.map(function (x) { x.tipo = 'contestacao'; return x; }))
      .sort(function (x, y) { return x.feito_em < y.feito_em ? -1 : 1; });
    var conversa = [];
    if (itens.length) {
      var v = await sb.schema('cards').from('conversa').select('*')
        .in('item_id', itens.map(function (i) { return i.id; })).order('criado_em').limit(5000);
      if (v.error) throw v.error;
      conversa = v.data;
    }
    itens.forEach(function (i) { situar(i, conversa); });
    return { tipo: 'comentarios', itens: itens, conversa: conversa };
  }

  // A última pergunta do Claude sobre o item e a última mensagem do Gere depois dela (respostaGere;
  // «resposta» é a coluna da contestação, a resposta que o usuário deu no card).
  function situar(i, conversa) {
    var msgs = conversa.filter(function (m) { return m.item_id === i.id; });
    var pergunta = msgs.filter(function (m) { return m.autor === 'claude' && m.tipo === 'pergunta'; }).pop() || null;
    var desde = Date.parse((pergunta ? pergunta.criado_em : i.avaliado_em) || 0) || 0;
    i.pergunta = pergunta;
    i.respostaGere = msgs.filter(function (m) {
      return m.autor === 'gere' && ((pergunta && m.responde_a === pergunta.id) || Date.parse(m.criado_em) > desde);
    }).pop() || null;
  }

  function carregar(sb, tipo) {
    return tipo === 'comentarios' ? carregarComentarios(sb) : carregarPagina(sb, tipo);
  }

  // Os itens que pedem resposta numa página (os casos de um estudo são só leitura).
  function itensDaPagina(dados) {
    var ids = [];
    ((dados || {}).capitulos || []).forEach(function (c) {
      (c.secoes || []).forEach(function (s) {
        (s.itens || []).forEach(function (i) { if (i.tipo !== 'casos') ids.push(i.id); });
      });
    });
    return ids;
  }

  // { faltam: sem resposta, respondidas: respondidas e ainda não aplicadas }
  function contar(c) {
    if (!c) return null;
    if (c.tipo === 'comentarios') {
      var f = c.itens.filter(function (i) { return !i.respostaGere; }).length;
      return { faltam: f, respondidas: c.itens.length - f };
    }
    var n = { faltam: 0, respondidas: 0 };
    itensDaPagina(c.dados).forEach(function (id) {
      var r = c.respostas[id];
      if (!r) n.faltam++;
      else if (!r.lida) n.respondidas++;
    });
    return n;
  }

  window.TaioeFila = { TIPOS: TIPOS, carregar: carregar, contar: contar, situar: situar, lerPergunta: lerPergunta };
})();
