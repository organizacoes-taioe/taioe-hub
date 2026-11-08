/* /entrar/confirmar/#t=…: destino do botão do email (o sinal da função acesso, decisão 19).
   Também aceita o #token_hash=…&type=email dos emails do próprio Supabase.
   Não verifica ao carregar: os antivírus de email abrem os links sozinhos e queimariam o
   token de uso único. Só o clique em «Entrar neste aparelho» confirma. */
(function () {
  'use strict';
  var H = TaioeHub, I = TaioeI18n, t = I.t;
  var frag = new URLSearchParams(location.hash.slice(1));
  var sinal = frag.get('t'), tokenHash = frag.get('token_hash');
  // tira o token da barra de endereço, do histórico e de qualquer cópia do link
  history.replaceState(null, '', location.pathname);

  if (!sinal && !tokenHash) { H.mostrar('sem-token', true); return; }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (sessao) {
      I.marcar('outra-sessao', 'confirmar.outra-sessao', { email: sessao.user.email }, true);
      H.mostrar('outra-sessao', true);
    }
    H.mostrar('pronto', true);
    H.$('entrar').focus();
  })();

  H.$('entrar').addEventListener('click', async function () {
    var botao = this;
    botao.disabled = true;
    H.avisar('aviso', t('confirmar.entrando'));
    try {
      var dados;
      if (sinal) {
        var resp = await TaioeAcesso.link(sinal);
        if (!resp || !resp.ok) {
          H.avisar('aviso', resp && /sem_codigo|expirado/.test(resp.motivo) ? t('confirmar.usado') : TaioeAcesso.mensagem(resp), 'erro');
          return;
        }
        dados = await TaioeAcesso.entrar(resp);
      } else {
        var r = await TaioeSessao.cliente().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
        if (r.error) {
          H.avisar('aviso', t('confirmar.usado'), 'erro');
          return;
        }
        dados = r.data;
      }
      H.avisar('aviso', t('confirmar.entrou', { email: dados.user.email }), 'ok');
      await H.depoisDoLogin();
    } catch (e) {
      H.avisar('aviso', H.mensagemDeErro(e), 'erro');
      botao.disabled = false;
    }
  });
})();
