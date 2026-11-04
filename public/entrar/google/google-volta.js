/* /entrar/google/#id_token=…&state=…: a volta do Google. Tira o token da barra, confere o state
   com o que ficou nesta aba e troca o token pela sessão (o nonce bruto vai ao Supabase, que o
   compara com o hash dentro do token). Depois, o mesmo caminho do código: depoisDoLogin(). */
(function () {
  'use strict';
  var H = TaioeHub, I = TaioeI18n, t = I.t;
  var p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  var g = TaioeGoogle.pendente();

  function falhou(chave, detalhe) {
    H.avisar('aviso', detalhe || t(chave), 'erro');
    H.mostrar('de-novo', true);
  }

  (async function () {
    if (p.get('error')) {
      falhou(p.get('error') === 'access_denied' ? 'google.cancelou' : 'google.falhou');
      return;
    }
    if (!g || !p.get('id_token') || p.get('state') !== g.estado) { falhou('google.falhou'); return; }
    H.avisar('aviso', t('confirmar.entrando'));
    try {
      var r = await TaioeSessao.cliente().auth.signInWithIdToken({
        provider: 'google', token: p.get('id_token'), nonce: g.nonce });
      if (r.error) {
        var m = String(r.error.message || '');
        if (/google_sem_autoridade/.test(m)) falhou('google.sem-autoridade');
        else if (/unverified|not verified/i.test(m)) falhou('google.nao-verificado');
        else falhou(null, H.mensagemDeErro(r.error));
        return;
      }
      H.avisar('aviso', t('confirmar.entrou', { email: r.data.user.email }), 'ok');
      await H.depoisDoLogin();
    } catch (e) {
      falhou(null, H.mensagemDeErro(e));
    }
  })();
})();
