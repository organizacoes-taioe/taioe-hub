/* As pendências do Gere (só o revisor geral): carregar e contar o que espera a resposta dele, por
   tipo. Usado por /admin/pendencias/, /admin/comentarios/ e /admin/notas/ (as filas) e por /admin/
   (o total em cada link). Cada tipo é uma página particular de revisão (biblia, biblia-comentarios,
   nao-ficcao, nao-ficcao-comentarios, traducoes, notas): o conteúdo vem de conta.paginas_privadas e
   as respostas de conta.respostas_privadas; resposta já aplicada pelo Claude (lida) sai da fila.
   Pedido do Gere, 24/10/2026: um link só, um tipo de cada vez, e no fim da fila o que ele já
   respondeu e o Claude ainda não aplicou. Os comentários dos usuários dos Cards estiveram aqui de
   24/10 a 04/11/2026; desde então ele os resolve pedindo direto ao Claude, na conversa. */
(function () {
  'use strict';

  // Três páginas (pedido do Gere, 04/11/2026): as pendências; os comentários dos Padres e dos
  // autores, que são muitos e de trabalho mais lento; e as notas gerais da Biblioteca, em lotes.
  var PAGINAS = {
    pendencias: { href: '/admin/pendencias/', titulo: 'Pendências' },
    comentarios: { href: '/admin/comentarios/', titulo: 'Comentários' },
    notas: { href: '/admin/notas/', titulo: 'Notas' }
  };
  var TIPOS = [
    { id: 'biblia', rotulo: 'Bíblia: tradução', pagina: 'pendencias' },
    { id: 'nao-ficcao', rotulo: 'Não-ficção: tradução', pagina: 'pendencias' },
    // As decisões mais delicadas das traduções nossas da Biblioteca (pedido do Gere, 26/10/2026).
    { id: 'traducoes', rotulo: 'Biblioteca: traduções', pagina: 'pendencias' },
    { id: 'biblia-comentarios', rotulo: 'Bíblia: comentários dos Padres', pagina: 'comentarios' },
    { id: 'nao-ficcao-comentarios', rotulo: 'Não-ficção: comentários', pagina: 'comentarios' },
    // As notas de contexto dos livros em português da Biblioteca, em lotes (pedido do Gere, 04/11/2026).
    { id: 'notas', rotulo: 'Biblioteca: notas', pagina: 'notas' }
  ];
  function tiposDa(pagina) { return TIPOS.filter(function (t) { return t.pagina === pagina; }); }
  function paginaDe(tipo) { var t = TIPOS.filter(function (x) { return x.id === tipo; })[0]; return t ? t.pagina : ''; }

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

  function carregar(sb, tipo) { return carregarPagina(sb, tipo); }

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
    var n = { faltam: 0, respondidas: 0 };
    itensDaPagina(c.dados).forEach(function (id) {
      var r = c.respostas[id];
      if (!r) n.faltam++;
      else if (!r.lida) n.respondidas++;
    });
    return n;
  }

  window.TaioeFila = { TIPOS: TIPOS, PAGINAS: PAGINAS, tiposDa: tiposDa, paginaDe: paginaDe, carregar: carregar, contar: contar };
})();
