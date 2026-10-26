/* «Continuar com o Google» (anexos/login-google.md, caminho C): a ida ao Google é uma navegação
   comum, sem script do Google no site. Pede só «openid email» e recebe o ID token no # da
   /entrar/google/, que o troca pela sessão do Supabase (signInWithIdToken).
   O Google só aceita endereços de volta cadastrados um a um: por isso o Client ID vai por host,
   e num host sem Client ID (as prévias de outras branches) o botão nem aparece.
   O Client ID é público, como a chave publicável; o secret nunca passa por aqui. */
(function () {
  'use strict';
  var CLIENTES = {
    'taioe.com.br': '',                                      // cliente «taioe-hub produção»
    'google-taioe-hub.taioeadministrativo.workers.dev': '',  // cliente «taioe-hub teste»
    'localhost:8777': ''                                     // idem, com o Supabase local
  };
  var CHAVE = 'hub:google';                                  // sessionStorage: só esta aba

  function clientId() { return CLIENTES[location.host] || null; }

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function aleatorio(n) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
  async function sha256hex(texto) {
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
    return Array.prototype.map.call(h, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /* O Google recebe o hash do nonce; o Supabase, o nonce bruto, que só existe nesta aba: um token
     de outra aba ou de outra pessoa não serve. O state barra a volta que não começou aqui. */
  async function ir() {
    var nonce = aleatorio(32), estado = aleatorio(16);
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ nonce: nonce, estado: estado })); }
    catch (e) { throw new Error('sessionStorage'); }
    var u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({
      client_id: clientId(), redirect_uri: location.origin + '/entrar/google/',
      response_type: 'id_token', scope: 'openid email',
      nonce: await sha256hex(nonce), state: estado, prompt: 'select_account'
    }).toString();
    location.assign(u.toString());
  }

  // lê e apaga: cada ida ao Google vale uma volta só
  function pendente() {
    var g = null;
    try { g = JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); sessionStorage.removeItem(CHAVE); } catch (e) {}
    return g && g.nonce && g.estado ? g : null;
  }

  window.TaioeGoogle = { clientId: clientId, ir: ir, pendente: pendente };
})();
