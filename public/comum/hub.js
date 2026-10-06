/* Funções comuns às páginas do hub (não é copiado para os apps). Depende do supabase-js e
   do taioe-sessao.js. Todo texto vindo do banco entra com textContent, nunca innerHTML. */
(function () {
  'use strict';
  var CHAVE_VOLTAR = 'hub:voltar';

  function $(id) { return document.getElementById(id); }

  function mostrar(id, sim) { var e = $(id); if (e) e.hidden = !sim; }

  function avisar(id, texto, tipo) {
    var e = $(id);
    if (!e) return;
    e.className = 'aviso' + (tipo ? ' ' + tipo : '');
    e.textContent = texto || '';
  }

  function guardarVoltar(v) {
    try { localStorage.setItem(CHAVE_VOLTAR, TaioeSessao.destinoSeguro(v)); } catch (e) {}
  }

  function irAoDestino() {
    var v = '/';
    try { v = localStorage.getItem(CHAVE_VOLTAR) || '/'; localStorage.removeItem(CHAVE_VOLTAR); } catch (e) {}
    location.replace(TaioeSessao.destinoSeguro(v));
  }

  // Mensagem em português para os erros do Auth e do banco que a pessoa pode encontrar.
  function mensagemDeErro(erro) {
    var m = String((erro && (erro.code || erro.message)) || '');
    var st = erro && erro.status;
    if (st === 429 || /rate limit|over_email_send_rate_limit|too many/i.test(m))
      return 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
    if (/captcha/i.test(m)) return 'A verificação anti-robô falhou. Tente de novo.';
    if (/otp_expired|expired|invalid|token/i.test(m)) return 'Código errado ou vencido. Confira os 6 dígitos ou peça um novo.';
    if (/email_address_invalid|invalid.*email/i.test(m)) return 'Esse endereço de email não parece válido.';
    if (/fetch|network|failed to/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    return 'Algo deu errado. Tente de novo em instantes.';
  }

  // A versão vigente de cada documento: a mais recente já publicada.
  async function documentosVigentes() {
    var r = await TaioeSessao.cliente().schema('conta').from('documentos').select('id, publicado_em, url');
    if (r.error) throw r.error;
    var hoje = new Date().toISOString().slice(0, 10), vig = {};
    r.data.filter(function (d) { return d.publicado_em <= hoje; })
      .sort(function (a, b) { return a.publicado_em < b.publicado_em ? 1 : -1; })
      .forEach(function (d) {
        var tipo = d.id.split('-')[0];
        if (!vig[tipo]) vig[tipo] = d;
      });
    return vig;                                            // { termos: {...}, politica: {...} }
  }

  async function lerPerfil() {
    var r = await TaioeSessao.cliente().schema('conta').from('perfis')
      .select('nome, termos_versao, politica_versao, fora_da_calibragem').maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  // Depois de entrar (pelo código ou pelo link): sem perfil, ou com termos novos, vai ao
  // cadastro; senão registra o acesso e volta para onde a pessoa estava.
  async function depoisDoLogin() {
    var perfil = await lerPerfil(), vig = await documentosVigentes();
    if (!perfil || !vig.termos || !vig.politica
        || perfil.termos_versao !== vig.termos.id || perfil.politica_versao !== vig.politica.id) {
      location.replace('/entrar/cadastro/');
      return;
    }
    await TaioeSessao.cliente().schema('conta').rpc('registrar_acesso', { app: 'hub' });
    irAoDestino();
  }

  // "Apagar também os dados deste aparelho": só o que é da Taioé, nunca localStorage.clear().
  async function apagarDadosDoAparelho() {
    var prefixos = ['hub:', 'cards:', 'biblioteca:'];
    function nosso(n) { return prefixos.some(function (p) { return n && n.indexOf(p) === 0; }); }
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (nosso(k)) localStorage.removeItem(k);
      }
    } catch (e) {}
    try {
      if (indexedDB.databases) {
        var bases = await indexedDB.databases();
        bases.forEach(function (b) { if (nosso(b.name)) indexedDB.deleteDatabase(b.name); });
      }
    } catch (e) {}
    try {
      if (window.caches) {
        var nomes = await caches.keys();
        await Promise.all(nomes.filter(nosso).map(function (n) { return caches.delete(n); }));
      }
    } catch (e) {}
  }

  // Espera a sessão guardada ser lida pelo supabase-js. Sem sessão, devolve null.
  async function sessaoAtual() {
    if (!TaioeSessao.temSessaoSalva()) return null;
    var r = await TaioeSessao.cliente().auth.getSession();
    return r.data && r.data.session ? r.data.session : null;
  }

  window.TaioeHub = { $: $, mostrar: mostrar, avisar: avisar, guardarVoltar: guardarVoltar,
    irAoDestino: irAoDestino, mensagemDeErro: mensagemDeErro, documentosVigentes: documentosVigentes,
    lerPerfil: lerPerfil, depoisDoLogin: depoisDoLogin, apagarDadosDoAparelho: apagarDadosDoAparelho,
    sessaoAtual: sessaoAtual };
})();
