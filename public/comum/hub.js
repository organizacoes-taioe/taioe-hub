/* Funções comuns às páginas do hub (não é copiado para os apps). Depende do supabase-js, do
   taioe-sessao.js e do i18n.js. Todo texto vindo do banco entra com textContent, nunca innerHTML. */
(function () {
  'use strict';
  var CHAVE_VOLTAR = 'hub:voltar', I = TaioeI18n, t = I.t;

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

  // Mensagem, na língua da interface, para os erros do Auth e do banco que a pessoa pode encontrar.
  function mensagemDeErro(erro) {
    var m = String((erro && (erro.code || erro.message)) || '');
    var st = erro && erro.status;
    if (st === 429 || /rate limit|over_email_send_rate_limit|too many/i.test(m)) return t('erro.muitos');
    if (/captcha/i.test(m)) return t('erro.captcha');
    if (/otp_expired|expired|invalid|token/i.test(m)) return t('erro.codigo');
    if (/email_address_invalid|invalid.*email/i.test(m)) return t('erro.email');
    if (/fetch|network|failed to/i.test(m)) return t('erro.rede');
    return t('erro.geral');
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
      .select('nome, termos_versao, politica_versao, fora_da_calibragem, lingua_interface').maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  // Ao entrar, a língua do perfil vale mais que a deste navegador (e passa a ser a dele).
  function linguaDoPerfil(perfil) {
    if (perfil && perfil.lingua_interface && perfil.lingua_interface !== I.lingua()) I.definir(perfil.lingua_interface);
  }

  // Grava no perfil a língua escolhida no seletor. Sem sessão, ou ainda sem perfil, não faz nada.
  // Devolve o erro, ou null.
  async function gravarLingua(lingua) {
    try {
      var sessao = await sessaoAtual();
      if (!sessao) return null;
      var r = await TaioeSessao.cliente().schema('conta').from('perfis')
        .update({ lingua_interface: lingua }).eq('usuario_id', sessao.user.id);
      return r.error || null;
    } catch (e) { return e; }
  }

  // Depois de entrar (pelo código ou pelo link): sem perfil, ou com termos novos, vai ao
  // cadastro; senão registra o acesso e volta para onde a pessoa estava.
  async function depoisDoLogin() {
    var perfil = await lerPerfil(), vig = await documentosVigentes();
    linguaDoPerfil(perfil);
    if (!perfil || !vig.termos || !vig.politica
        || perfil.termos_versao !== vig.termos.id || perfil.politica_versao !== vig.politica.id) {
      location.replace('/entrar/cadastro/');
      return;
    }
    await TaioeSessao.cliente().schema('conta').rpc('registrar_acesso', { app: 'hub' });
    irAoDestino();
  }

  // "Apagar também os dados deste aparelho": só o que é da Taioé, nunca localStorage.clear().
  // 'taioe:' é a língua (taioe:lingua), comum aos apps; as chaves da sessão são do taioe-sessao.js.
  async function apagarDadosDoAparelho() {
    var prefixos = ['hub:', 'cards:', 'biblioteca:', 'taioe:'];
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

  var hub = window.TaioeHub = { $: $, mostrar: mostrar, avisar: avisar, guardarVoltar: guardarVoltar,
    irAoDestino: irAoDestino, mensagemDeErro: mensagemDeErro, documentosVigentes: documentosVigentes,
    lerPerfil: lerPerfil, depoisDoLogin: depoisDoLogin, apagarDadosDoAparelho: apagarDadosDoAparelho,
    sessaoAtual: sessaoAtual, linguaDoPerfil: linguaDoPerfil, gravarLingua: gravarLingua,
    aoGravarLingua: null };                                // a página pode pôr aqui fn(erro)

  // Trocou a língua no seletor estando logado: grava no perfil também.
  I.aoEscolher(function (lingua) {
    gravarLingua(lingua).then(function (erro) { if (hub.aoGravarLingua) hub.aoGravarLingua(erro); });
  });
})();
