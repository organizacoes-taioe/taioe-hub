/* taioe-sessao.js, contrato v1. Não mudar CHAVE. Sempre com o supabase-js 2.117.2 ao lado.
   O original fica no taioe-hub (/comum/); os apps têm cópias idênticas, byte a byte, e o
   sha256 está no README do hub. O ambiente é escolhido pelo endereço:
     taioe.com.br  → produção;  *.workers.dev → teste;  localhost → Supabase local. */
(function () {
  'use strict';
  var VERSAO = 1, CHAVE = 'taioe-auth';
  var AMBIENTES = {
    producao: { url: 'https://vdggxhrpncyhmtskwqsj.supabase.co',
                chave: 'sb_publishable_fz02rpwi9NI2XaBqNfh2eA_83JbEUdo',
                turnstile: '0x4AAAAAAFOy8KXkEsjRrcWq' },
    teste:    { url: 'https://rsgrefuzbmzjnvjldnkw.supabase.co',
                chave: 'sb_publishable_4IxUxh_F7z1iCih-AIlpdw_0wxWmvza',
                turnstile: '0x4AAAAAAFOzBW_ejv-WjGVZ' },
    local:    { url: 'http://127.0.0.1:54321',
                chave: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
                turnstile: '1x00000000000000000000AA' }  // chave de teste oficial: sempre passa
  };
  function ambiente() {
    var h = location.hostname;
    if (h === 'taioe.com.br') return AMBIENTES.producao;
    if (/\.workers\.dev$/.test(h)) return AMBIENTES.teste;
    if (h === 'localhost' || h === '127.0.0.1') return AMBIENTES.local;
    return null;                                            // qualquer outro host: sem login
  }
  var sb = null, callbacksSaida = [], usuarioAoCarregar = usuarioSalvo();

  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function temSessaoSalva() { return !!ler(CHAVE); }        // síncrono e offline
  function usuarioSalvo() {
    try { var s = JSON.parse(ler(CHAVE)); return s && s.user ? s.user.id : null; } catch (e) { return null; }
  }
  function cliente() {
    var a = ambiente();
    if (!a) throw new Error('taioe-sessao: host sem ambiente');
    if (!sb) sb = window.supabase.createClient(a.url, a.chave, { auth: {
      storageKey: CHAVE, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
    return sb;
  }
  function sitekeyTurnstile() { var a = ambiente(); return a ? a.turnstile : null; }

  // O "voltar" só aceita caminho da própria origem, nunca /entrar/ e nunca algo que o navegador
  // leia como outro site: new URL('/.//x.com', origem).pathname dá '//x.com'.
  function destinoSeguro(v) {
    try {
      var u = new URL(v || '/', location.origin);
      if (u.origin !== location.origin) return '/';
      if (/^\/[\/\\]/.test(u.pathname)) return '/';
      if (u.pathname.indexOf('/entrar/') === 0) return '/';
      return u.pathname + u.search;
    } catch (e) { return '/'; }
  }
  function irParaEntrar() {
    location.replace('/entrar/?voltar=' + encodeURIComponent(location.pathname + location.search));
  }

  function avisarSaida() { callbacksSaida.forEach(function (fn) { try { fn(); } catch (e) {} }); callbacksSaida = []; }
  function aoSair(fn) {                                     // SIGNED_OUT de qualquer aba de qualquer app
    callbacksSaida.push(fn);
    if (callbacksSaida.length > 1) return;
    cliente().auth.onAuthStateChange(function (ev, sessao) {
      if (ev === 'SIGNED_OUT') avisarSaida();
      // Outra conta entrou noutra aba: recarrega, para não gravar o estudo de X na conta de Y.
      if ((ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') && sessao && usuarioAoCarregar
          && sessao.user.id !== usuarioAoCarregar) location.reload();
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== CHAVE) return;
      if (!e.newValue) { avisarSaida(); return; }
      var outro = usuarioSalvo();
      if (usuarioAoCarregar && outro && outro !== usuarioAoCarregar) location.reload();
    });
  }
  function limparSessaoLocal() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k === CHAVE || k.indexOf(CHAVE + '-') === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  // Devolve true se saiu. Com todos = true e sem rede, NÃO apaga nada e devolve false:
  // quem perdeu o celular precisa saber que a saída global não aconteceu.
  async function sair(todos) {
    var r;
    try { r = await cliente().auth.signOut({ scope: todos ? 'global' : 'local' }); } catch (e) { r = { error: e }; }
    if (todos && r && r.error) return false;
    limparSessaoLocal();                                    // sem rede o signOut local pode não apagar
    avisarSaida();                                          // a própria aba não recebe o evento storage
    return true;
  }

  window.TaioeSessao = { VERSAO: VERSAO, cliente: cliente, sitekeyTurnstile: sitekeyTurnstile,
    temSessaoSalva: temSessaoSalva, usuarioSalvo: usuarioSalvo, destinoSeguro: destinoSeguro,
    irParaEntrar: irParaEntrar, aoSair: aoSair, sair: sair };
})();
